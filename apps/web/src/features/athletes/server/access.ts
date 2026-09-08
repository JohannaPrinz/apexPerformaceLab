import 'server-only';

import type { PrismaClientInstance } from '@apex/database';
import { scoped, withTenant } from '@apex/database/tenant';
import type { TenantContext } from '@apex/types';

/**
 * Who may see an athlete.
 *
 * ## What changed, and why it had to
 *
 * Every coach of a workspace used to see every athlete in it. That made
 * "releasing an athlete to a colleague" a gesture with nothing behind it — there
 * was no state in which the colleague could not already see them.
 *
 * So an athlete now belongs to the coach who records them, and everyone else
 * sees them only where that coach said so. Ownership was already in the record
 * (`Athlete.createdByCoach`); this adds the exceptions.
 *
 * ## Why owners and admins are not filtered
 *
 * They administer the workspace: they invite and remove coaches, and they answer
 * for what it holds. A workspace whose owner could not see half of its own
 * athletes could not be administered — and hiding records from the person
 * accountable for them protects nobody.
 *
 * ## Why a grant is not enough on its own
 *
 * `confirmedAt` gates it. An athlete's record is theirs before it is the
 * workspace's, so a release is an *offer* until somebody records that the
 * athlete agreed. An unconfirmed row grants nothing, and the interface says so.
 *
 * ## Why this is a `where` fragment and not a check after the fact
 *
 * A filter that runs in the query cannot be forgotten by a caller, cannot be
 * bypassed by a second read, and never returns a row it then has to hide. The
 * tenant scope works the same way, for the same reason.
 */

type AccessDb = Pick<PrismaClientInstance, 'athleteAccess' | 'coach' | 'membership'>;

/** Roles that administer the workspace and therefore see all of it. */
const ADMINISTRATIVE = new Set(['owner', 'admin']);

export interface Viewer {
  readonly organizationId: string;
  /** The signed-in coach, or `null` where the user has no coach profile. */
  readonly coachId: string | null;
  readonly role: string;
}

/**
 * The `where` fragment that limits a query to the athletes this viewer may see.
 *
 * Returns `{}` for an administrator — nothing to add, because nothing is
 * hidden. For a coach it is "mine, or released to me and confirmed".
 */
export function visibleToViewer(viewer: Viewer): Record<string, unknown> {
  if (ADMINISTRATIVE.has(viewer.role)) return {};

  // No coach profile means no athletes: a workspace member who is not a coach
  // has no professional relationship to anybody in it.
  if (viewer.coachId === null) return { id: { in: [] as string[] } };

  return {
    OR: [
      { createdByCoachId: viewer.coachId },
      { accesses: { some: { coachId: viewer.coachId, confirmedAt: { not: null } } } },
    ],
  };
}

/** The viewer behind a tenant context, with their coach profile resolved. */
export async function viewerOf(
  db: AccessDb,
  tenant: Pick<TenantContext, 'organizationId' | 'userId' | 'role'>,
): Promise<Viewer> {
  const coach = await db.coach.findFirst({
    where: { userId: tenant.userId },
    select: { id: true },
  });

  return { organizationId: tenant.organizationId, coachId: coach?.id ?? null, role: tenant.role };
}

export type ShareRefusal =
  /** The athlete is not this workspace's, or not this viewer's to release. */
  | 'ATHLETE_NOT_FOUND'
  /** The colleague is not a coach of this workspace. */
  | 'COACH_NOT_IN_WORKSPACE'
  /** A coach cannot be given access to the athlete they already own. */
  | 'ALREADY_OWNER';

/**
 * Offers a colleague access to an athlete.
 *
 * Both ends are checked against **this workspace** rather than trusted from the
 * request: the athlete must be visible to the person releasing them, and the
 * colleague must be a coach of the same workspace. Neither id crosses a
 * workspace boundary, because neither lookup leaves one.
 *
 * Idempotent: releasing twice leaves one offer, and re-releasing something
 * already confirmed does not quietly reset the confirmation.
 */
export async function shareAthlete(
  db: AccessDb & Pick<PrismaClientInstance, 'athlete'>,
  tenant: Pick<TenantContext, 'organizationId' | 'userId' | 'role'>,
  athleteId: string,
  coachId: string,
): Promise<{ ok: true } | { ok: false; refusal: ShareRefusal }> {
  const viewer = await viewerOf(db, tenant);

  const athlete = await db.athlete.findFirst({
    where: scoped(tenant, { id: athleteId, ...visibleToViewer(viewer) }),
    select: { id: true, createdByCoachId: true },
  });

  if (!athlete) return { ok: false, refusal: 'ATHLETE_NOT_FOUND' };
  if (athlete.createdByCoachId === coachId) return { ok: false, refusal: 'ALREADY_OWNER' };
  if (viewer.coachId === null) return { ok: false, refusal: 'ATHLETE_NOT_FOUND' };

  // The colleague must be a coach **of this workspace**: a coach id alone says
  // nothing about which workspace they work in.
  const member = await db.membership.findFirst({
    where: {
      organizationId: tenant.organizationId,
      user: { coachProfile: { id: coachId } },
    },
    select: { id: true },
  });

  if (!member) return { ok: false, refusal: 'COACH_NOT_IN_WORKSPACE' };

  const existing = await db.athleteAccess.findFirst({
    where: scoped(tenant, { athleteId, coachId }),
    select: { id: true },
  });

  if (existing === null) {
    await db.athleteAccess.create({
      data: withTenant(tenant, {
        athleteId,
        coachId,
        grantedByCoachId: viewer.coachId,
      }),
    });
  }

  return { ok: true };
}

/**
 * Records that the athlete agreed, which is what makes the offer effective.
 *
 * Kept as a separate act with its own audit fields rather than folded into the
 * release: who confirmed and when is the whole point of asking.
 */
export async function confirmAthleteShare(
  db: AccessDb & Pick<PrismaClientInstance, 'athlete'>,
  tenant: Pick<TenantContext, 'organizationId' | 'userId' | 'role'>,
  athleteId: string,
  coachId: string,
): Promise<boolean> {
  const viewer = await viewerOf(db, tenant);
  if (viewer.coachId === null) return false;

  const athlete = await db.athlete.findFirst({
    where: scoped(tenant, { id: athleteId, ...visibleToViewer(viewer) }),
    select: { id: true },
  });

  if (!athlete) return false;

  const { count } = await db.athleteAccess.updateMany({
    where: scoped(tenant, { athleteId, coachId, confirmedAt: null }),
    data: { confirmedAt: new Date(), confirmedByCoachId: viewer.coachId },
  });

  return count > 0;
}

/** Withdraws a release. Deletes the row: a permission, not a history. */
export async function revokeAthleteShare(
  db: AccessDb & Pick<PrismaClientInstance, 'athlete'>,
  tenant: Pick<TenantContext, 'organizationId' | 'userId' | 'role'>,
  athleteId: string,
  coachId: string,
): Promise<boolean> {
  const viewer = await viewerOf(db, tenant);

  const athlete = await db.athlete.findFirst({
    where: scoped(tenant, { id: athleteId, ...visibleToViewer(viewer) }),
    select: { id: true },
  });

  if (!athlete) return false;

  const { count } = await db.athleteAccess.deleteMany({
    where: scoped(tenant, { athleteId, coachId }),
  });

  return count > 0;
}

export interface AthleteShare {
  readonly coachId: string;
  readonly coachName: string;
  readonly confirmedAt: Date | null;
}

/** Who this athlete has been released to, and whether it took effect. */
export async function sharesOfAthlete(
  db: AccessDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  athleteId: string,
): Promise<readonly AthleteShare[]> {
  const rows = await db.athleteAccess.findMany({
    where: scoped(tenant, { athleteId }),
    select: {
      coachId: true,
      confirmedAt: true,
      coach: { select: { displayName: true, user: { select: { name: true } } } },
    },
    orderBy: [{ createdAt: 'asc' }],
  });

  return rows.map((row) => ({
    coachId: row.coachId,
    coachName:
      row.coach.displayName?.trim() !== ''
        ? (row.coach.displayName ?? '')
        : (row.coach.user?.name ?? 'Coach'),
    confirmedAt: row.confirmedAt,
  }));
}

/** The releases of several athletes at once, keyed by athlete. */
export async function sharesForAthletes(
  db: AccessDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  athleteIds: readonly string[],
): Promise<Record<string, AthleteShare[]>> {
  if (athleteIds.length === 0) return {};

  const rows = await db.athleteAccess.findMany({
    where: scoped(tenant, { athleteId: { in: [...athleteIds] } }),
    select: {
      athleteId: true,
      coachId: true,
      confirmedAt: true,
      coach: { select: { displayName: true, user: { select: { name: true } } } },
    },
    orderBy: [{ createdAt: 'asc' }],
  });

  const byAthlete: Record<string, AthleteShare[]> = {};
  for (const row of rows) {
    const named = row.coach.displayName?.trim() ?? '';
    (byAthlete[row.athleteId] ??= []).push({
      coachId: row.coachId,
      coachName: named === '' ? (row.coach.user?.name ?? 'Coach') : named,
      confirmedAt: row.confirmedAt,
    });
  }

  return byAthlete;
}

/** The colleagues an athlete may be released to: coaches of this workspace. */
export async function shareableCoaches(
  db: AccessDb,
  tenant: Pick<TenantContext, 'organizationId' | 'userId' | 'role'>,
  /**
   * Who is asking, where the caller already knows.
   *
   * Only ever used to leave the asker out of their own list. Passing it in
   * spares a second read of the same coach row on a screen that has already
   * resolved the viewer — and it changes nothing about who is listed, because
   * the list itself is a workspace read that stands on `tenant`.
   */
  known?: Viewer,
): Promise<readonly { id: string; name: string }[]> {
  const viewer = known ?? (await viewerOf(db, tenant));

  const members = await db.membership.findMany({
    where: { organizationId: tenant.organizationId },
    select: {
      user: { select: { name: true, coachProfile: { select: { id: true, displayName: true } } } },
    },
  });

  return members
    .flatMap((member) => {
      const coach = member.user?.coachProfile;
      if (!coach || coach.id === viewer.coachId) return [];

      const named = coach.displayName?.trim() ?? '';

      return [{ id: coach.id, name: named === '' ? (member.user?.name ?? 'Coach') : named }];
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'de'));
}
