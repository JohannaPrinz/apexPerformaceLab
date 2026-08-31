import 'server-only';

import { randomBytes } from 'node:crypto';

import {
  analysisStillFolder,
  ANALYSIS_PREFIX,
  ANALYSIS_TEMP_DAYS,
  analysisWorkspaceFolder,
  MAX_STILLS_PER_MODULE,
  parseAnalysisStillKey,
  reportMediaKey,
  type ReportMedia,
} from '@apex/domain';
import type { TenantContext } from '@apex/types';

import { copyObject, deleteObjects, listFolders, listObjects } from '@/integrations/object-store';

/**
 * The two lifetimes of a still, and the move between them.
 *
 * ## Copy, publish, then delete — in that order
 *
 * Publishing writes the pictures into the report's own folder **before** the
 * document that names them is frozen, and deletes the temporary ones only
 * afterwards. Any other order has a failure mode that loses something: freezing
 * first would produce a document pointing at pictures that were never written,
 * and deleting first would lose the original if the copy failed.
 *
 * A failure between copy and delete leaves a temporary object behind. That is
 * the harmless direction, and the bucket's lifecycle rule sweeps it up.
 *
 * ## Why nothing here is recorded in the database
 *
 * A temporary still is found by listing the folder it lives in; a published one
 * is named by the document that owns it. Neither needs a row, and giving them
 * one would put a still in the athlete's permanent media, which is exactly what
 * these are not.
 */

/**
 * The stills an analysis screen left for one test, newest listing order.
 *
 * Empty where no bucket is configured — which is why a workspace without one
 * still opens every analysis it has, simply without pictures.
 */
export async function listAnalysisStills(
  tenant: Pick<TenantContext, 'organizationId'>,
  moduleId: string,
): Promise<readonly string[]> {
  const found = await listObjects(
    analysisStillFolder(tenant.organizationId, moduleId),
    MAX_STILLS_PER_MODULE * 4,
  );

  // Anything the key grammar does not recognise is ignored rather than shown:
  // the folder is ours, but a key we cannot read is a key we cannot caption.
  return found.map((entry) => entry.key).filter((key) => parseAnalysisStillKey(key) !== null);
}

/**
 * Copies the stills a document uses into the document's own folder.
 *
 * Only what the draft actually chose, and only what the key grammar recognises.
 * A copy that fails is left out of the result rather than aborting the
 * publication: an analysis whose text and numbers are ready must not be held
 * hostage by one picture, and a document that names a picture it does not have
 * would be worse than one with fewer pictures.
 */
export async function freezeReportMedia(
  reportId: string,
  modules: readonly {
    readonly moduleId: string;
    readonly images: readonly { key: string; label: string }[];
  }[],
): Promise<ReadonlyMap<string, readonly ReportMedia[]>> {
  const frozen = new Map<string, readonly ReportMedia[]>();

  for (const entry of modules) {
    const copied: ReportMedia[] = [];

    for (const image of entry.images.slice(0, MAX_STILLS_PER_MODULE)) {
      if (parseAnalysisStillKey(image.key) === null) continue;

      const id = randomBytes(9).toString('base64url');
      const target = reportMediaKey(reportId, id);

      if (await copyObject(image.key, target)) {
        copied.push({ id, key: target, label: image.label, moduleId: entry.moduleId });
      }
    }

    if (copied.length > 0) frozen.set(entry.moduleId, copied);
  }

  return frozen;
}

/**
 * Removes everything an analysis screen left behind for these tests.
 *
 * Called after the document is frozen, never before. Never throws — see
 * `deleteObjects`: cleanup must not undo work that already succeeded.
 */
export async function discardAnalysisStills(
  tenant: Pick<TenantContext, 'organizationId'>,
  moduleIds: readonly string[],
): Promise<void> {
  for (const moduleId of moduleIds) {
    const keys = await listAnalysisStills(tenant, moduleId);
    await deleteObjects(keys);
  }
}

/**
 * Removes the working files of analyses nobody came back to.
 *
 * ## Why this exists rather than a bucket rule
 *
 * The temporary area is swept on a schedule; Supabase Storage has no lifetime
 * rule of its own, so the sweep is code. It walks one workspace's temporary
 * folder, and removes files older than `ANALYSIS_TEMP_DAYS`.
 *
 * ## Why age and not "published"
 *
 * Publishing already clears the files of the analysis it published. What is
 * left here is the other case — a coach who analysed a video and never wrote the
 * report — and there is nothing in the record that says so. Age is the honest
 * signal: nobody came back for two weeks.
 *
 * Returns how many files it removed, so a caller can say what happened.
 */
export async function sweepAnalysisStills(
  tenant: Pick<TenantContext, 'organizationId'>,
  now: Date = new Date(),
): Promise<number> {
  const cutoff = now.getTime() - ANALYSIS_TEMP_DAYS * 24 * 60 * 60 * 1000;
  const stale: string[] = [];

  for (const folder of await listFolders(analysisWorkspaceFolder(tenant.organizationId))) {
    for (const entry of await listObjects(folder, MAX_STILLS_PER_MODULE * 4)) {
      // A file whose age the store does not report is left alone: deleting on a
      // guess is how working material disappears from under somebody.
      if (entry.createdAt !== null && entry.createdAt.getTime() < cutoff) stale.push(entry.key);
    }
  }

  await deleteObjects(stale);

  return stale.length;
}

/**
 * The same sweep, across every workspace that has left anything behind.
 *
 * ## Why it walks the store and not the database
 *
 * The temporary area is laid out by workspace, so its own first level *is* the
 * list of workspaces with working files. Reading them from the database instead
 * would miss exactly the case that matters most: a workspace that has since been
 * deleted still has files, and nothing would ever come back for them.
 */
export async function sweepAllAnalysisStills(now: Date = new Date()): Promise<number> {
  const cutoff = now.getTime() - ANALYSIS_TEMP_DAYS * 24 * 60 * 60 * 1000;
  const stale: string[] = [];

  for (const workspace of await listFolders(ANALYSIS_PREFIX)) {
    for (const test of await listFolders(workspace)) {
      for (const entry of await listObjects(test, MAX_STILLS_PER_MODULE * 4)) {
        // A file whose age the store does not report is left alone: deleting on
        // a guess is how working material disappears from under somebody.
        if (entry.createdAt !== null && entry.createdAt.getTime() < cutoff) stale.push(entry.key);
      }
    }
  }

  await deleteObjects(stale);

  return stale.length;
}
