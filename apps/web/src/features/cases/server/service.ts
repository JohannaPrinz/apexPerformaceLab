import 'server-only';

// Subpath, not the package barrel: the barrel constructs the Prisma client on
// load. See the same note in the athletes service.
import type { PrismaClientInstance } from '@apex/database';
import { scoped, withTenant } from '@apex/database/tenant';
import type { TenantContext } from '@apex/types';

import type { CreateCaseInput, ListCasesInput } from '../schemas';

/**
 * Performance case data access — the only module in this slice that touches the
 * database.
 *
 * Every query goes through `scoped()` and every write through `withTenant()`,
 * for the reasons set out in the athletes service. Cases carry an
 * `athleteId` as well, and that reference is **also** verified against the
 * tenant: an athlete id from another workspace must not become the parent of a
 * case in this one.
 */

type CaseDb = Pick<PrismaClientInstance, 'performanceCase' | 'athlete'>;

const caseSelect = {
  id: true,
  title: true,
  description: true,
  type: true,
  status: true,
  startedAt: true,
  endedAt: true,
  athleteId: true,
  createdByCoachId: true,
  createdAt: true,
} as const;

export interface CaseRecord {
  id: string;
  title: string;
  description: string | null;
  type: 'SINGLE_ASSESSMENT' | 'ONGOING';
  status: 'OPEN' | 'CLOSED' | 'ARCHIVED';
  startedAt: Date;
  endedAt: Date | null;
  athleteId: string;
  createdByCoachId: string;
  createdAt: Date;
}

/**
 * The cases of one athlete, newest first.
 *
 * Not paginated: a case is a container for a whole coaching journey, so an
 * athlete has a handful, not hundreds. Cursor pagination here would be
 * machinery without a load to carry — it belongs on assessments and
 * measurements, which do grow without bound.
 */
export async function listCasesForAthlete(
  db: CaseDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  { athleteId, status }: ListCasesInput,
): Promise<CaseRecord[]> {
  return db.performanceCase.findMany({
    where: scoped(tenant, { athleteId, ...(status ? { status } : {}) }),
    select: caseSelect,
    orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
  });
}

export async function getCase(
  db: CaseDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  caseId: string,
): Promise<CaseRecord | null> {
  return db.performanceCase.findFirst({
    where: scoped(tenant, { id: caseId }),
    select: caseSelect,
  });
}

/**
 * Creates a case for an athlete.
 *
 * Returns `null` when the athlete does not exist **in this workspace** — the
 * parent is checked rather than trusted. Without that check a caller could
 * hang a case off another tenant's athlete: the case row itself would be
 * correctly scoped, and the leak would be the *relationship*, which no column
 * constraint catches.
 */
export async function createCase(
  db: CaseDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  createdByCoachId: string,
  { athleteId, title, description, type }: CreateCaseInput,
): Promise<CaseRecord | null> {
  const athlete = await db.athlete.findFirst({
    where: scoped(tenant, { id: athleteId }),
    select: { id: true },
  });

  if (!athlete) return null;

  return db.performanceCase.create({
    data: withTenant(tenant, {
      athleteId,
      title,
      description: description ?? null,
      type,
      createdByCoachId,
    }),
    select: caseSelect,
  });
}

/**
 * Opens the case an assessment should belong to, creating one if needed (§8).
 *
 * The Case is mandatory in the model but **never a manual step**. A coach who
 * starts an assessment for an athlete with no open case gets one created
 * automatically, of type `SINGLE_ASSESSMENT` — which is why that type exists.
 *
 * The alternative, allowing an assessment without a case, would mean two query
 * paths and two authorization paths for every question about an athlete's work.
 * One implicit row is cheaper than that fork, permanently.
 *
 * Used by the assessments slice. It lives here because it is a case concern,
 * not an assessment one.
 */
export async function ensureOpenCase(
  db: CaseDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  createdByCoachId: string,
  athleteId: string,
  fallbackTitle: string,
): Promise<CaseRecord | null> {
  const open = await db.performanceCase.findFirst({
    // `as const` so the literal keeps its enum type through the generic — a
    // widened `string` is not a `CaseStatus`.
    where: scoped(tenant, { athleteId, status: 'OPEN' as const }),
    select: caseSelect,
    orderBy: [{ startedAt: 'desc' }, { id: 'desc' }],
  });

  if (open) return open;

  return createCase(db, tenant, createdByCoachId, {
    athleteId,
    title: fallbackTitle,
    type: 'SINGLE_ASSESSMENT',
  });
}

/**
 * Moves a case through `OPEN → CLOSED → ARCHIVED`.
 *
 * `endedAt` follows the status rather than being set by hand: a case that
 * leaves `OPEN` has ended, and reopening clears it. Two fields that must agree
 * are better derived than remembered.
 */
export async function setCaseStatus(
  db: CaseDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  caseId: string,
  status: CaseRecord['status'],
): Promise<CaseRecord | null> {
  const { count } = await db.performanceCase.updateMany({
    where: scoped(tenant, { id: caseId }),
    data: { status, endedAt: status === 'OPEN' ? null : new Date() },
  });

  return count === 0 ? null : getCase(db, tenant, caseId);
}
