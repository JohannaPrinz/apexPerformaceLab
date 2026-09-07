import 'server-only';

import type { PrismaClientInstance } from '@apex/database';
import { scoped } from '@apex/database/tenant';
import { analysisStillFolder } from '@apex/domain';
import type { TenantContext } from '@apex/types';

import { listObjects, removeObject } from '@/integrations/object-store';

import { notHeldByAnalysis } from './analysis-lease';

/**
 * Whether a file may be permanently deleted, and the deletion itself (§18).
 *
 * ## Why this is one place
 *
 * Two surfaces will delete files — the coach on an athlete's record, the
 * athlete in their portal — and a third will do it wholesale when an assessment
 * goes. Three copies of "may this go?" would disagree the first time one of the
 * rules changed, and the copy that got it wrong would be the one that destroyed
 * evidence. So the question is asked here and the answer is a value.
 *
 * ## What deletion is for
 *
 * The MVP runs on 1 GB. Files that are no longer needed are meant to go, and to
 * go **for good** — a record nobody may ever clear is a plan that fills up
 * (§18). This module therefore looks for reasons to refuse, and where it finds
 * none it deletes rather than archives.
 *
 * ## Three reasons to refuse, and only three
 *
 * 1. **An analysis is working on it.** Taking the source away mid-way breaks
 *    something a coach is doing right now. Asked two ways: the lease on the
 *    file itself, taken when an analysis picked it up (`analysis-lease.ts`),
 *    and — for the older local-file path, which takes no lease — working stills
 *    lying about under the test it belongs to.
 * 2. **A finding still rests on it.** An Asset linked as evidence for an
 *    Insight (§14) may go only where that evidence survives in a smaller
 *    permanent form — a published report over the same test, or the measured
 *    values themselves. Being *filed* against an assessment is not evidence;
 *    the deliberate link is.
 * 3. **It is not there.** Nothing to decide about.
 *
 * Notably **not** a reason: annotations on a video. They are remarks at
 * timestamps of one recording and have no standing without it, so they go with
 * it — the database already cascades them, and that is the intended behaviour
 * rather than an accident (§18).
 *
 * Also not a reason: a published report. Its pictures were copied into
 * `reports/<reportId>/` at publication and are not Assets at all, so nothing
 * here can reach them. That is why the freeze exists.
 */

/** What may be done with one file. */
export type AssetDeletion =
  | { readonly status: 'DELETE_ALLOWED' }
  /**
   * A video analysis is working on this file, or on the test it belongs to.
   *
   * `moduleId` is `null` where the lease names the file itself — a stored video
   * being analysed need belong to no test at all.
   */
  | { readonly status: 'DELETE_BLOCKED_ACTIVE_ANALYSIS'; readonly moduleId: string | null }
  /** Findings rest on it and nothing permanent has taken its place. */
  | {
      readonly status: 'DELETE_BLOCKED_MISSING_INSIGHT_EVIDENCE';
      readonly insightIds: readonly string[];
    }
  | { readonly status: 'NOT_FOUND' };

type DeletionDb = Pick<
  PrismaClientInstance,
  'asset' | 'insightAsset' | 'reportModule' | '$transaction'
>;

/** What the decision needs to know about the file itself. */
interface AssetFacts {
  readonly id: string;
  readonly storageKey: string;
  readonly assessmentModuleId: string | null;
  readonly analysisStatus: 'RUNNING' | 'FINISHED' | 'FAILED' | null;
  readonly analysisExpiresAt: Date | null;
}

async function factsOf(
  db: DeletionDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  assetId: string,
): Promise<AssetFacts | null> {
  return db.asset.findFirst({
    where: scoped(tenant, { id: assetId }),
    select: {
      id: true,
      storageKey: true,
      assessmentModuleId: true,
      analysisStatus: true,
      analysisExpiresAt: true,
    },
  });
}

/**
 * Whether a lease is holding this file right now.
 *
 * Read from the row the decision already loaded, so the *verdict* costs no
 * extra query. The deletion itself does not trust this — it re-asks the same
 * question inside the statement that removes the row, which is what makes the
 * two atomic.
 */
function heldByLease(asset: AssetFacts, now: Date): boolean {
  return (
    asset.analysisStatus === 'RUNNING' &&
    asset.analysisExpiresAt !== null &&
    asset.analysisExpiresAt.getTime() > now.getTime()
  );
}

/**
 * Whether an analysis screen is currently working on this file's test.
 *
 * Read from the working area rather than from a status column, because that is
 * where "an analysis is in progress" is actually recorded for the **local-file**
 * path: stills accumulate under `analysis-temp/<org>/<moduleId>/` while a coach
 * works, and publication or a discard clears them (§18).
 *
 * Coarse by nature — it names a test, not a file — and incidental, because it
 * depends on a still having been taken. That is why an analysis of a *stored*
 * video takes a lease instead; see `analysis-lease.ts`. Both are asked, and
 * either one refuses.
 */
async function analysisInProgress(
  organizationId: string,
  assessmentModuleId: string,
): Promise<boolean> {
  const stills = await listObjects(analysisStillFolder(organizationId, assessmentModuleId), 1);

  return stills.length > 0;
}

/**
 * Which findings would lose their evidence, of those that cite this file.
 *
 * An Insight is covered where either of the two permanent forms §18 names
 * already exists for it:
 *
 * - **a published report over the same test** — the frozen document keeps the
 *   findings and the stills that were chosen for it, independently of any
 *   original (§16);
 * - **measured values cited by the insight** — numbers outlive the recording
 *   they were read from.
 *
 * Returns the ids of the insights for which neither holds. An empty list means
 * the original is no longer carrying anything on its own.
 */
async function insightsLosingEvidence(
  db: DeletionDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  assetId: string,
): Promise<readonly string[]> {
  const links = await db.insightAsset.findMany({
    where: { assetId },
    select: {
      insight: {
        select: {
          id: true,
          assessmentModuleId: true,
          _count: { select: { measurementEvidence: true } },
        },
      },
    },
  });

  if (links.length === 0) return [];

  const moduleIds = [...new Set(links.map((link) => link.insight.assessmentModuleId))];

  const published = await db.reportModule.findMany({
    where: scoped(tenant, {
      assessmentModuleId: { in: moduleIds },
      included: true,
      report: { status: 'PUBLISHED' as const },
    }),
    select: { assessmentModuleId: true },
  });

  const frozen = new Set(published.map((row) => row.assessmentModuleId));

  return links
    .filter(
      (link) =>
        link.insight._count.measurementEvidence === 0 &&
        !frozen.has(link.insight.assessmentModuleId),
    )
    .map((link) => link.insight.id);
}

/**
 * The decision, without performing it.
 *
 * Separate from `deleteAsset` so a screen can ask before it offers a button,
 * and so the rule can be tested without a store.
 */
export async function assetDeletion(
  db: DeletionDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  assetId: string,
): Promise<AssetDeletion> {
  const asset = await factsOf(db, tenant, assetId);
  if (!asset) return { status: 'NOT_FOUND' };

  return verdictFor(db, tenant, asset);
}

/** The decision for a file already read. Shared by the single and bulk paths. */
async function verdictFor(
  db: DeletionDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  asset: AssetFacts,
): Promise<AssetDeletion> {
  /**
   * Held by an analysis of **this file**.
   *
   * Asked first because it is the precise question: the lease names the asset,
   * was taken on purpose, and covers a stored video that belongs to no test at
   * all — which the stills check below cannot see. An expired lease is not a
   * hold; see `notHeldByAnalysis`.
   */
  if (heldByLease(asset, new Date())) {
    return {
      status: 'DELETE_BLOCKED_ACTIVE_ANALYSIS',
      moduleId: asset.assessmentModuleId,
    };
  }

  // And the older signal, for an analysis of a local file that claims nothing.
  // A file that belongs to no test cannot be the source of one, so the question
  // is only asked where there is a test to ask it about.
  if (
    asset.assessmentModuleId !== null &&
    (await analysisInProgress(tenant.organizationId, asset.assessmentModuleId))
  ) {
    return { status: 'DELETE_BLOCKED_ACTIVE_ANALYSIS', moduleId: asset.assessmentModuleId };
  }

  const losing = await insightsLosingEvidence(db, tenant, asset.id);
  if (losing.length > 0) {
    return { status: 'DELETE_BLOCKED_MISSING_INSIGHT_EVIDENCE', insightIds: losing };
  }

  return { status: 'DELETE_ALLOWED' };
}

/** What happened when a deletion was attempted. */
export type AssetDeleted =
  | { readonly status: 'DELETED' }
  /** The object could not be removed, so the row was left alone. */
  | { readonly status: 'STORAGE_FAILED' }
  | AssetDeletion;

/**
 * Deletes one file, without a running analysis being able to slip in.
 *
 * ## Why the row goes first here, inside a transaction
 *
 * Two rules have to hold at once, and only this order gives both.
 *
 * **The check and the delete must be one moment.** An analysis that starts
 * between "may I?" and "deleted" would take a video out from under itself, so
 * the condition sits in the `WHERE` of the delete: `deleteMany` with
 * `notHeldByAnalysis` matches nothing if a lease was taken a millisecond
 * earlier, and Postgres decides that, not this code.
 *
 * **A row must never disappear while its bytes remain.** An object with no row
 * is invisible to everyone and counts against 1 GB for ever, which is the one
 * unrecoverable outcome (§18). So the object is removed *after* the row inside
 * the transaction, and a failed removal throws — the transaction rolls back and
 * the row is restored.
 *
 * The cost is a lock held across one HTTP call to the store. That is a second
 * or so on one row, and it buys the only ordering in which neither rule can be
 * broken.
 *
 * Deleting the row cascades what belongs to the file: its annotations, its
 * evidence links, and any Share pointing at it. All three are meaningless
 * without the file itself.
 */
export async function deleteAsset(
  db: DeletionDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  assetId: string,
): Promise<AssetDeleted> {
  const asset = await factsOf(db, tenant, assetId);
  if (!asset) return { status: 'NOT_FOUND' };

  const verdict = await verdictFor(db, tenant, asset);
  if (verdict.status !== 'DELETE_ALLOWED') return verdict;

  try {
    return await db.$transaction(async (tx) => {
      // Scoped, like every other write — and carrying the analysis condition,
      // so a lease taken since the verdict above still wins.
      const { count } = await tx.asset.deleteMany({
        where: scoped(tenant, { id: asset.id, ...notHeldByAnalysis(new Date()) }),
      });

      if (count === 0) {
        /**
         * Something changed between the verdict and this statement, and there
         * are exactly two things it can have been: a lease was taken, or the
         * row is already gone because somebody else deleted it. Telling a coach
         * "this is being analysed" about a file that no longer exists would be
         * a lie, so the rare zero-count path costs one more read to find out
         * which happened.
         */
        const still = await tx.asset.findFirst({
          where: scoped(tenant, { id: asset.id }),
          select: { id: true },
        });

        return still
          ? ({
              status: 'DELETE_BLOCKED_ACTIVE_ANALYSIS',
              moduleId: asset.assessmentModuleId,
            } as const)
          : ({ status: 'NOT_FOUND' } as const);
      }

      // The bytes, now that the row is provisionally gone. A failure here rolls
      // the delete back rather than leaving an object nothing points at.
      if (!(await removeObject(asset.storageKey))) throw new StorageRemovalFailed();

      return { status: 'DELETED' } as const;
    });
  } catch (error) {
    if (error instanceof StorageRemovalFailed) return { status: 'STORAGE_FAILED' };
    throw error;
  }
}

/** Rolls the deletion back when the store would not let the object go. */
class StorageRemovalFailed extends Error {
  constructor() {
    super('STORAGE_REMOVAL_FAILED');
    this.name = 'StorageRemovalFailed';
  }
}

/** Why one file was left behind. Never "no reason". */
export type AssetKeptReason =
  'DELETE_BLOCKED_ACTIVE_ANALYSIS' | 'DELETE_BLOCKED_MISSING_INSIGHT_EVIDENCE' | 'STORAGE_FAILED';

export interface AssessmentAssetsReleased {
  readonly deleted: readonly string[];
  /** What stayed, and why — so a caller can say so rather than fail silently. */
  readonly kept: readonly { readonly assetId: string; readonly reason: AssetKeptReason }[];
}

/**
 * Frees the files of one assessment.
 *
 * For when an assessment is deleted for good: every file filed against it is
 * put through the same decision, and what may go, goes — from storage as well
 * as from the database, because a row removed on its own would leave the bytes
 * behind (§18).
 *
 * **Frozen report media are not reachable from here**, and that is the design
 * rather than an omission: they are not Assets. Publication copied them into
 * `reports/<reportId>/` precisely so that a published document stops depending
 * on the upload it came from (§16), so nothing this function does can touch
 * them.
 *
 * Temporary analysis stills are likewise untouched — they are not Assets either
 * and keep their own 14-day sweep.
 *
 * Whatever must stay is **reported, not skipped**: a caller that meant to
 * delete an assessment needs to know a video is still held by an analysis.
 */
export async function releaseAssetsOfAssessment(
  db: DeletionDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  assessmentId: string,
): Promise<AssessmentAssetsReleased> {
  const assets = await db.asset.findMany({
    where: scoped(tenant, {
      OR: [{ assessmentId }, { assessmentModule: { assessmentId } }],
    }),
    select: {
      id: true,
      storageKey: true,
      assessmentModuleId: true,
      analysisStatus: true,
      analysisExpiresAt: true,
    },
  });

  const deleted: string[] = [];
  const kept: { assetId: string; reason: AssetKeptReason }[] = [];

  for (const asset of assets) {
    // Through the same door as a single deletion, so the atomic check and the
    // rollback on a failed removal apply here too rather than being written
    // twice and drifting.
    const outcome = await deleteAsset(db, tenant, asset.id);

    // Gone between the list and the deletion — somebody else removed it. There
    // is nothing left behind, so there is nothing to report either.
    if (outcome.status === 'NOT_FOUND') continue;

    if (outcome.status !== 'DELETED') {
      kept.push({
        assetId: asset.id,
        reason:
          outcome.status === 'DELETE_BLOCKED_ACTIVE_ANALYSIS'
            ? 'DELETE_BLOCKED_ACTIVE_ANALYSIS'
            : outcome.status === 'DELETE_BLOCKED_MISSING_INSIGHT_EVIDENCE'
              ? 'DELETE_BLOCKED_MISSING_INSIGHT_EVIDENCE'
              : 'STORAGE_FAILED',
      });
      continue;
    }

    deleted.push(asset.id);
  }

  return { deleted, kept };
}
