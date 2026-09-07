import 'server-only';

import type { PrismaClientInstance } from '@apex/database';
import { scoped } from '@apex/database/tenant';
import type { TenantContext } from '@apex/types';

/**
 * Holding one stored video while a video analysis runs on it (§18).
 *
 * ## Why the database and not a file in the store
 *
 * A marker in the temporary area was the first attempt and is the wrong
 * instrument. It cannot be read in the same statement as the deletion, so the
 * check and the delete are two moments — and an analysis that starts between
 * them takes a video that is already gone. A pair of columns can sit inside the
 * `WHERE` of the delete itself, which is the only way the two become one
 * decision.
 *
 * (It also could not be written at all: the bucket accepts pictures, PDFs and
 * videos, and a text marker was refused. A lock that silently fails to lock is
 * worse than none.)
 *
 * ## Why a lease and not a flag
 *
 * A tab closed mid-analysis cannot clear a flag, and a lock nobody can clear
 * blocks a deletion for ever. So the hold **expires**: it is extended by a
 * heartbeat while the screen is open, and once it runs out anybody may treat it
 * as stale — the deletion path does, and so does the sweep.
 */

/** How long one hold lasts without a heartbeat. */
export const ANALYSIS_LEASE_MS = 24 * 60 * 60 * 1000;

type LeaseDb = Pick<PrismaClientInstance, 'asset'>;

/**
 * The filter that says "no analysis is holding this".
 *
 * Used both to *take* a hold and to allow a deletion, so the two can never
 * disagree about what "held" means. Three ways to be free: never analysed,
 * analysed and finished, or held by a lease that has run out.
 */
export function notHeldByAnalysis(now: Date) {
  return {
    OR: [
      { analysisStatus: null },
      { analysisStatus: { not: 'RUNNING' as const } },
      { analysisExpiresAt: { lte: now } },
    ],
  };
}

/**
 * Takes the hold, or reports that somebody else has it.
 *
 * One `updateMany` and no read beforehand: a read followed by a write is two
 * moments, and two analyses starting at once would both pass the read. The
 * condition is in the statement, so exactly one of them updates a row.
 */
export async function startAnalysisLease(
  db: LeaseDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  assetId: string,
  now: Date = new Date(),
): Promise<boolean> {
  const { count } = await db.asset.updateMany({
    where: scoped(tenant, { id: assetId, ...notHeldByAnalysis(now) }),
    data: {
      analysisStatus: 'RUNNING',
      analysisExpiresAt: new Date(now.getTime() + ANALYSIS_LEASE_MS),
    },
  });

  return count > 0;
}

/**
 * Pushes the hold out while the screen is still open.
 *
 * Only extends a hold that is genuinely running — a heartbeat cannot resurrect
 * a lease somebody else has already cleared, or one that expired and was swept.
 */
export async function heartbeatAnalysisLease(
  db: LeaseDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  assetId: string,
  now: Date = new Date(),
): Promise<boolean> {
  const { count } = await db.asset.updateMany({
    where: scoped(tenant, {
      id: assetId,
      analysisStatus: 'RUNNING' as const,
      analysisExpiresAt: { gt: now },
    }),
    data: { analysisExpiresAt: new Date(now.getTime() + ANALYSIS_LEASE_MS) },
  });

  return count > 0;
}

/**
 * Ends the analysis and lets the video go.
 *
 * The outcome is kept — an analysis that failed is worth knowing about — but
 * neither outcome protects the file any more. The lease is cleared rather than
 * left in the past, so the column says "not held" rather than "held, expired".
 */
export async function endAnalysisLease(
  db: LeaseDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  assetId: string,
  outcome: 'FINISHED' | 'FAILED',
): Promise<void> {
  await db.asset.updateMany({
    where: scoped(tenant, { id: assetId }),
    data: { analysisStatus: outcome, analysisExpiresAt: null },
  });
}

/**
 * Clears holds whose lease has run out.
 *
 * Not required for correctness — a stale lease already fails
 * {@link notHeldByAnalysis} and blocks nothing — but a column that says
 * `RUNNING` about an analysis nobody is running is a lie the next reader has to
 * decode. Recorded as `FAILED`, because that is what an analysis that stopped
 * answering is.
 *
 * Runs across every workspace: it is a caretaker task, not a tenant one, and it
 * is reached only from the scheduled sweep.
 */
export async function sweepExpiredAnalysisLeases(
  db: LeaseDb,
  now: Date = new Date(),
): Promise<number> {
  const { count } = await db.asset.updateMany({
    where: { analysisStatus: 'RUNNING' as const, analysisExpiresAt: { lte: now } },
    data: { analysisStatus: 'FAILED', analysisExpiresAt: null },
  });

  return count;
}
