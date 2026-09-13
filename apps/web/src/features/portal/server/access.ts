import 'server-only';

import type { PrismaClientInstance } from '@apex/database';
import { scoped } from '@apex/database/tenant';
import type { TenantContext } from '@apex/types';

/**
 * Taking a portal account away again (§21).
 *
 * ## What this is not
 *
 * It is **not** `revokeActivations` in `./activation.ts`. That withdraws an
 * offer nobody has accepted yet — a link still in a mailbox. This ends an
 * account somebody is signing in with. The two share a word in German and
 * nothing else, which is exactly why they are separate functions with separate
 * refusals and separate wording on screen.
 *
 * It is **not** deactivating the athlete either. `archivedAt` is untouched here,
 * and so is everything it governs: a deactivated athlete keeps read-only portal
 * access by design, and this is the control that takes the access itself away.
 *
 * And it deletes no coaching data at all. The Athlete row, the cases, the
 * assessments, the measurements, the reports, the files and every tracking
 * entry stay exactly as they were — §22, and the reason `ArchiveButton` is
 * never a delete either. What goes is one login.
 *
 * ## Why the `User` row goes with it
 *
 * Because §21 requires that a coach can hand out a **new** access afterwards
 * through the ordinary activation flow, and `redeemActivation` creates a user
 * with the athlete's address. `User.email` is unique platform-wide, so a login
 * row left behind would hold that address hostage and every later activation
 * would refuse with `EMAIL_TAKEN`. Keeping the row would therefore break the
 * requirement that gives this feature its point.
 *
 * Nothing of the athlete lives on that row. It carries a name and an address,
 * both copied from the Athlete at activation; authorship is a `Coach` (§26.22)
 * and a self-reported entry is marked by the `recordedBy` **enum**, not by a
 * foreign key. The schema says as much on `Athlete.userId`: deleting the
 * account unlinks it and *the record stays with the coach*.
 *
 * ## Why it is not always deleted
 *
 * One exception, and it is a safety catch rather than a feature: a `User` that
 * also has a coach profile, or a membership in another workspace, is somebody
 * else's access too. Deleting it here would revoke something this coach never
 * had any say over. So the row is removed only when nothing at all is left
 * hanging off it — which is every ordinary portal account, since activation
 * creates the user, the credential and the membership together and gives it no
 * coach profile.
 *
 * ## Session invalidation
 *
 * Two things end the athlete's sessions, and both are the existing auth model
 * rather than a mechanism of our own:
 *
 * 1. **The rows go.** `Session` is deleted for the user — the same table Better
 *    Auth reads a token from — and `Account` follows the `User` by cascade, so
 *    the password authenticates nothing.
 * 2. **Authorization is re-derived per request.** `organizationProcedure` reads
 *    the membership and `athleteProcedure` reads `Athlete.userId` on every call.
 *    Neither is cached beyond the request, so the portal closes the moment this
 *    commits — including for a tab that was already open. Better Auth's cookie
 *    cache (5 minutes, `packages/auth/src/server.ts`) can still hand back the
 *    *session*, but it cannot hand back a membership or an athlete link that is
 *    no longer in the database.
 */

/** Why a portal access could not be taken away. Two different sentences. */
export type RevokeAccessRefusal = 'NOT_FOUND' | 'NO_ACCESS';

export type RevokedAccess =
  | {
      readonly ok: true;
      /** The address the withdrawn account signed in with, for the confirmation. */
      readonly email: string | null;
    }
  | { readonly ok: false; readonly reason: RevokeAccessRefusal };

/**
 * Ends one athlete's portal access, and nothing else.
 *
 * Every write carries its own guard, the way `redeemActivation` does: the
 * unlink names the `userId` it expects to find, so two coaches pressing the
 * button at the same moment produce one revocation and one refusal rather than
 * a half-finished state.
 */
export async function revokePortalAccess(
  db: PrismaClientInstance,
  tenant: Pick<TenantContext, 'organizationId'>,
  athleteId: string,
): Promise<RevokedAccess> {
  const athlete = await db.athlete.findFirst({
    where: scoped(tenant, { id: athleteId }),
    select: { id: true, userId: true, user: { select: { email: true } } },
  });

  // An athlete of another workspace is simply not found — `scoped()` put the
  // workspace into the filter, so there is nothing here to compare afterwards.
  if (!athlete) return { ok: false, reason: 'NOT_FOUND' };
  if (athlete.userId === null) return { ok: false, reason: 'NO_ACCESS' };

  const userId = athlete.userId;

  try {
    await db.$transaction(async (tx) => {
      const unlinked = await tx.athlete.updateMany({
        // The `userId` in the filter is the race guard: it matches only the
        // account that was read a moment ago.
        where: { id: athlete.id, organizationId: tenant.organizationId, userId },
        data: { userId: null },
      });

      if (unlinked.count === 0) throw new RevokeRace('NO_ACCESS');

      // The workspace tie. Without it `organizationProcedure` refuses, which is
      // the rung every portal read and write passes through.
      await tx.membership.deleteMany({
        where: { userId, organizationId: tenant.organizationId },
      });

      // Every device. `revokeSessionsOnPasswordReset` in `packages/auth` takes
      // the same line for the same reason: a withdrawal that left one tab
      // signed in would be a half-measure.
      await tx.session.deleteMany({ where: { userId } });

      // Only when the login exists for nothing else — see the note above. The
      // conditions are in the `where` rather than in a check beforehand, so the
      // database decides and a coach profile written in between cannot be lost.
      await tx.user.deleteMany({
        where: {
          id: userId,
          athlete: { is: null },
          coachProfile: { is: null },
          memberships: { none: {} },
        },
      });
    });
  } catch (error) {
    if (error instanceof RevokeRace) return { ok: false, reason: error.reason };
    throw error;
  }

  return { ok: true, email: athlete.user?.email ?? null };
}

/** Rolls the transaction back and names why, without inventing an error type. */
class RevokeRace extends Error {
  constructor(readonly reason: RevokeAccessRefusal) {
    super(reason);
    this.name = 'RevokeRace';
  }
}
