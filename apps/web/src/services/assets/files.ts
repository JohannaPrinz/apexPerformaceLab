import 'server-only';

import { randomBytes } from 'node:crypto';

import type { AssetKind, PrismaClientInstance } from '@apex/database';
import { scoped, withTenant } from '@apex/database/tenant';
import { athleteMediaKey } from '@apex/domain';
import type { TenantContext } from '@apex/types';

import { objectInfo, putObject, removeObject } from '@/integrations/object-store';
import { MAX_ASSET_BYTES, MAX_UPLOAD_BYTES } from '@/lib/uploads';

/**
 * One athlete's files, and the shelves they sit on (§18).
 *
 * ## Why the athlete is a parameter and not a session
 *
 * Both surfaces reach these functions — the coach on an athlete's record, the
 * athlete in their portal — and the two are authorised in completely different
 * ways: a coach may reach every athlete of their workspace, an athlete exactly
 * one, resolved from their account. Putting either rule in here would force the
 * other to bend around it.
 *
 * So the **caller decides whose files these are**, and every function scopes to
 * the workspace *and* that athlete. A door that passes the wrong id cannot get
 * a right answer out of these; a door that passes the right one cannot get a
 * wrong one.
 *
 * ## Why deletion is not here
 *
 * It lives in `deletion.ts`, because "may this go?" is a question about
 * findings, analyses and frozen documents rather than about filing. This module
 * never removes an Asset row.
 */

// Re-exported so this module reads as one place to look, while the values live
// in `@/lib/uploads`, which the browser may import — the file shelf compresses
// towards them, so both sides must be reading the same numbers (§18).
export { MAX_ASSET_BYTES, MAX_UPLOAD_BYTES };

/** What a folder is called, at most. Long enough for a date and a topic. */
const MAX_FOLDER_NAME = 80;

/** What a folder is for, at most: a sentence or two on a tile, not a document. */
export const MAX_FOLDER_DESCRIPTION = 280;

/** An optional description as stored: trimmed, capped, and `null` rather than empty. */
function storedDescription(description: string | null): string | null {
  const trimmed = (description ?? '').trim().slice(0, MAX_FOLDER_DESCRIPTION);

  return trimmed === '' ? null : trimmed;
}

/**
 * The file types this area accepts.
 *
 * **The same list the bucket itself allows**, deliberately — not a broader
 * pattern. A wider rule here would let a file through the application and into
 * a store that then refuses it, and the person would be told "der Speicher hat
 * die Datei nicht angenommen" for something the application could have said
 * plainly a second earlier. That is exactly what happened with WebM.
 *
 * §18 names images, PDFs and videos; nothing there asks for arbitrary files,
 * and a private bucket that hands bytes back to a browser is the wrong place to
 * discover what else people might send. The serving route already sandboxes
 * what it returns — this is the second half of the same care.
 *
 * Keep it in step with `allowed_mime_types` on the bucket. `image/heic` is on
 * neither list: an iPhone photo therefore still refuses, which is a gap worth
 * closing on both sides at once rather than half here.
 */
const ACCEPTED = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
  'video/mp4',
  'video/quicktime',
  'video/webm',
]);

/**
 * A MIME type without its parameters.
 *
 * A browser recorder reports what it produced as `video/webm;codecs=vp9`, and
 * the codec is a detail of that one encode rather than a fact about the file's
 * kind. Stored bare, so the type on the row means the same thing whoever wrote
 * it — and so the extension lookup below finds it.
 */
const baseType = (mimeType: string): string => (mimeType.split(';')[0] ?? '').trim().toLowerCase();

/** The extension a stored object carries, derived from the type, never the name. */
function extensionFor(mimeType: string): string {
  const known: Readonly<Record<string, string>> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'image/heic': 'heic',
    'application/pdf': 'pdf',
    'video/mp4': 'mp4',
    'video/quicktime': 'mov',
    'video/webm': 'webm',
  };

  // Anything accepted but unlisted keeps a neutral extension rather than one
  // guessed from the file name — the type on the row is what readers use.
  return known[mimeType] ?? (mimeType.startsWith('video/') ? 'vid' : 'bin');
}

type FilesDb = Pick<PrismaClientInstance, 'asset' | 'assetFolder'>;

// ── Folders ────────────────────────────────────────────────────────────────

export interface AssetFolderSummary {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly createdAt: Date;
  /** Null where the athlete created it, as everywhere else (§18). */
  readonly createdByCoachId: string | null;
  /**
   * The coach who created it, by name — `null` where the athlete did.
   *
   * Read with the folder rather than looked up by the tile: the shelf names who
   * filed what, and a second read per tile would be a query per folder.
   */
  readonly createdByName: string | null;
}

/** Alphabetical: a shelf list is read by looking for a name. */
export async function listFolders(
  db: FilesDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  athleteId: string,
): Promise<AssetFolderSummary[]> {
  const rows = await db.assetFolder.findMany({
    where: scoped(tenant, { athleteId }),
    select: {
      id: true,
      name: true,
      description: true,
      createdAt: true,
      createdByCoachId: true,
      createdByCoach: { select: { displayName: true, user: { select: { name: true } } } },
    },
    orderBy: [{ name: 'asc' }],
  });

  return rows.map(({ createdByCoach, ...folder }) => ({
    ...folder,
    description: folder.description ?? null,
    createdByName:
      folder.createdByCoachId === null
        ? null
        : (createdByCoach?.displayName ?? createdByCoach?.user?.name ?? 'Coach'),
  }));
}

export type FolderRefusal = 'EMPTY_NAME' | 'NAME_TAKEN' | 'NOT_FOUND';

export type FolderResult<T> =
  | { readonly ok: true; readonly value: T }
  | { readonly ok: false; readonly refusal: FolderRefusal };

/** Prisma's `P2002`, without importing from the generated client. */
function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}

/**
 * Creates a shelf.
 *
 * The duplicate name is caught from the constraint rather than checked first:
 * a check and an insert are two moments, and two people filing "Formcheck" at
 * once would both pass the check.
 */
export async function createFolder(
  db: FilesDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  athleteId: string,
  name: string,
  createdByCoachId: string | null,
  description: string | null = null,
): Promise<FolderResult<{ id: string }>> {
  const trimmed = name.trim().slice(0, MAX_FOLDER_NAME);
  if (trimmed === '') return { ok: false, refusal: 'EMPTY_NAME' };

  try {
    const folder = await db.assetFolder.create({
      data: withTenant(tenant, {
        athleteId,
        name: trimmed,
        description: storedDescription(description),
        createdByCoachId,
      }),
      select: { id: true },
    });

    return { ok: true, value: folder };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, refusal: 'NAME_TAKEN' };
    throw error;
  }
}

/**
 * Renames one shelf, and rewrites its description where one is given.
 *
 * `description` left out means "unchanged", so a caller that only renames
 * cannot wipe what somebody wrote; an empty one clears it. The athlete is in the
 * filter, so a foreign id finds none.
 */
export async function renameFolder(
  db: FilesDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  athleteId: string,
  folderId: string,
  name: string,
  description?: string | null,
): Promise<FolderResult<null>> {
  const trimmed = name.trim().slice(0, MAX_FOLDER_NAME);
  if (trimmed === '') return { ok: false, refusal: 'EMPTY_NAME' };

  try {
    const { count } = await db.assetFolder.updateMany({
      where: scoped(tenant, { id: folderId, athleteId }),
      data: {
        name: trimmed,
        ...(description === undefined ? {} : { description: storedDescription(description) }),
      },
    });

    return count > 0 ? { ok: true, value: null } : { ok: false, refusal: 'NOT_FOUND' };
  } catch (error) {
    if (isUniqueViolation(error)) return { ok: false, refusal: 'NAME_TAKEN' };
    throw error;
  }
}

/**
 * Removes a shelf and leaves what stood on it.
 *
 * `Asset.folderId` is `SetNull`, so the database already does this — the files
 * become loose rather than disappearing (§18). Nothing here touches storage,
 * because nothing here deletes a file.
 */
export async function deleteFolder(
  db: FilesDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  athleteId: string,
  folderId: string,
): Promise<boolean> {
  const { count } = await db.assetFolder.deleteMany({
    where: scoped(tenant, { id: folderId, athleteId }),
  });

  return count > 0;
}

// ── Files ──────────────────────────────────────────────────────────────────

export interface AssetSummary {
  readonly id: string;
  readonly kind: AssetKind;
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly createdAt: Date;
  readonly folderId: string | null;
  /** Null where the athlete uploaded it (§18). */
  readonly uploadedByCoachId: string | null;
  /** Where the bytes are. The serving route decides who may have them. */
  readonly storageKey: string;
}

/** Everything on one athlete's record, newest first. */
export async function listAthleteAssets(
  db: FilesDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  athleteId: string,
): Promise<AssetSummary[]> {
  return db.asset.findMany({
    where: scoped(tenant, { athleteId, archivedAt: null }),
    select: {
      id: true,
      kind: true,
      fileName: true,
      mimeType: true,
      sizeBytes: true,
      createdAt: true,
      folderId: true,
      uploadedByCoachId: true,
      storageKey: true,
    },
    orderBy: [{ createdAt: 'desc' }],
  });
}

export type UploadRefusal = 'TOO_LARGE' | 'UNSUPPORTED_TYPE' | 'EMPTY' | 'STORAGE_FAILED';

export interface UploadInput {
  readonly athleteId: string;
  /** The name the person sees. Data, never part of a path. */
  readonly fileName: string;
  readonly mimeType: string;
  readonly bytes: Buffer;
  readonly folderId?: string | null;
  /** The coach who uploaded it, or `null` where the athlete did (§18). */
  readonly uploadedByCoachId: string | null;
}

export type UploadResult =
  | { readonly ok: true; readonly assetId: string }
  | { readonly ok: false; readonly refusal: UploadRefusal };

/**
 * Stores one file.
 *
 * ## What is checked before anything is written
 *
 * The size and the type, in that order, and **nothing is uploaded if either
 * fails** — a rejected file must leave no object behind, which is the whole
 * point of refusing rather than truncating (§18).
 *
 * ## Why the object goes first, and what happens if the row does not follow
 *
 * A row pointing at bytes that are not there shows a file nobody can open. So
 * the object is written first — and if the row then fails, the object is
 * removed again, because the opposite leftover is worse: an object with no row
 * is invisible in the product and counts against 1 GB for ever.
 *
 * ## Why the key is built, not taken
 *
 * `athleteMediaKey` composes it from the athlete, a random id and an extension
 * derived from the MIME type. The uploaded name never touches the path; it is
 * kept on the row, where it can be shown and cannot address anything.
 */
export async function uploadAsset(
  db: FilesDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  input: UploadInput,
): Promise<UploadResult> {
  if (input.bytes.byteLength === 0) return { ok: false, refusal: 'EMPTY' };
  if (input.bytes.byteLength > MAX_UPLOAD_BYTES) return { ok: false, refusal: 'TOO_LARGE' };

  const mimeType = baseType(input.mimeType);
  if (!ACCEPTED.has(mimeType)) return { ok: false, refusal: 'UNSUPPORTED_TYPE' };

  const kind: AssetKind = mimeType.startsWith('video/') ? 'VIDEO' : 'DOCUMENT';
  const key = athleteMediaKey(
    input.athleteId,
    randomBytes(9).toString('base64url'),
    extensionFor(mimeType),
  );

  if (!(await putObject(key, input.bytes, mimeType))) {
    return { ok: false, refusal: 'STORAGE_FAILED' };
  }

  try {
    const asset = await db.asset.create({
      data: withTenant(tenant, {
        kind,
        fileName: input.fileName.slice(0, 200),
        mimeType,
        sizeBytes: input.bytes.byteLength,
        storageKey: key,
        athleteId: input.athleteId,
        uploadedByCoachId: input.uploadedByCoachId,
        ...(input.folderId == null ? {} : { folderId: input.folderId }),
      }),
      select: { id: true },
    });

    return { ok: true, assetId: asset.id };
  } catch (error) {
    // Nothing points at the object now, so it must not be left behind.
    await removeObject(key);
    throw error;
  }
}

// ── A stored video as an analysis source ─────────────────────────────────

/** Why a stored file cannot be analysed. */
export type AnalysisSourceRefusal = 'NOT_FOUND' | 'NOT_A_VIDEO' | 'MISSING_IN_STORAGE';

export interface AnalysisSource {
  readonly assetId: string;
  readonly fileName: string;
  readonly mimeType: string;
  readonly storageKey: string;
  readonly sizeBytes: number;
}

/**
 * Resolves one asset into something the analysis can be pointed at (§18).
 *
 * ## What is checked, and why here
 *
 * The workspace, the athlete, that it is a **video**, that it is not archived,
 * and that the object is actually in the store. All five in one place, because
 * the caller — a procedure or a serving route — must not be able to satisfy
 * four of them and forget the fifth.
 *
 * Photos and documents are refused rather than filtered: a screen that offered
 * a PDF to a pose model would be a screen somebody eventually clicked.
 *
 * **The storage key is an output, never an input.** A caller names an *asset*;
 * where its bytes live is decided from the record.
 */
export async function analysisSourceFor(
  db: FilesDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  athleteId: string,
  assetId: string,
): Promise<{ ok: true; source: AnalysisSource } | { ok: false; refusal: AnalysisSourceRefusal }> {
  const asset = await db.asset.findFirst({
    where: scoped(tenant, { id: assetId, athleteId, archivedAt: null }),
    select: { id: true, kind: true, fileName: true, mimeType: true, storageKey: true },
  });

  if (!asset) return { ok: false, refusal: 'NOT_FOUND' };
  if (asset.kind !== 'VIDEO') return { ok: false, refusal: 'NOT_A_VIDEO' };

  // The row can outlive the object — a failed upload, a manual tidy-up. Asking
  // now means the analysis screen says so instead of opening on nothing.
  const stored = await objectInfo(asset.storageKey);
  if (stored === null) return { ok: false, refusal: 'MISSING_IN_STORAGE' };

  return {
    ok: true,
    source: {
      assetId: asset.id,
      fileName: asset.fileName,
      mimeType: asset.mimeType,
      storageKey: asset.storageKey,
      sizeBytes: stored.sizeBytes,
    },
  };
}

// ── The resumable road ────────────────────────────────────────────

/**
 * Checks a file over 6 MB and decides where its bytes will live.
 *
 * The same checks the ordinary upload makes — type and size — run here too, and
 * they run **before** anything is authorised rather than after the bytes have
 * arrived. The key is built the same way as well, from the athlete and a random
 * id, so a resumable upload can no more choose its path than an ordinary one.
 */
export function prepareResumableUpload(input: {
  readonly athleteId: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
}): { ok: true; storageKey: string; mimeType: string } | { ok: false; refusal: UploadRefusal } {
  if (input.sizeBytes <= 0) return { ok: false, refusal: 'EMPTY' };
  if (input.sizeBytes > MAX_ASSET_BYTES) return { ok: false, refusal: 'TOO_LARGE' };

  const mimeType = baseType(input.mimeType);
  if (!ACCEPTED.has(mimeType)) return { ok: false, refusal: 'UNSUPPORTED_TYPE' };

  return {
    ok: true,
    mimeType,
    storageKey: athleteMediaKey(
      input.athleteId,
      randomBytes(9).toString('base64url'),
      extensionFor(mimeType),
    ),
  };
}

export type RegisterRefusal = 'NOT_UPLOADED' | 'TOO_LARGE';

/**
 * Files the Asset row for a resumable upload that has finished.
 *
 * ## Storage first, row second — proven rather than assumed
 *
 * The bytes went to the store through the proxy, so this application never saw
 * them land. Before a row is written the object is **looked for**, and its real
 * size is read from the store rather than taken from the caller. A registration
 * for an upload that never happened finds nothing and writes nothing; a
 * registration that understated its size records the true one.
 *
 * That is the same ordering the deletion path uses, for the same reason: a row
 * with no bytes shows a file nobody can open, and bytes with no row are
 * invisible and count against the plan for ever (§18).
 */
export async function registerUploadedAsset(
  db: FilesDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  input: {
    readonly athleteId: string;
    readonly storageKey: string;
    readonly mimeType: string;
    readonly fileName: string;
    readonly folderId: string | null;
    readonly uploadedByCoachId: string | null;
  },
): Promise<{ ok: true; assetId: string } | { ok: false; refusal: RegisterRefusal }> {
  const stored = await objectInfo(input.storageKey);
  if (stored === null) return { ok: false, refusal: 'NOT_UPLOADED' };

  // The store has its own ceiling; anything past it should never have arrived,
  // and if it somehow did it is not made into a record.
  if (stored.sizeBytes > MAX_ASSET_BYTES) return { ok: false, refusal: 'TOO_LARGE' };

  const mimeType = baseType(input.mimeType);
  const asset = await db.asset.create({
    data: withTenant(tenant, {
      kind: mimeType.startsWith('video/') ? 'VIDEO' : 'DOCUMENT',
      fileName: input.fileName.slice(0, 200),
      mimeType,
      sizeBytes: stored.sizeBytes,
      storageKey: input.storageKey,
      athleteId: input.athleteId,
      uploadedByCoachId: input.uploadedByCoachId,
      ...(input.folderId == null ? {} : { folderId: input.folderId }),
    }),
    select: { id: true },
  });

  return { ok: true, assetId: asset.id };
}

/**
 * What is needed to hand one file back, or `null` where it is not this
 * athlete’s.
 */
export async function assetForDownload(
  db: FilesDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  athleteId: string,
  assetId: string,
): Promise<{ storageKey: string; fileName: string; mimeType: string } | null> {
  return db.asset.findFirst({
    where: scoped(tenant, { id: assetId, athleteId }),
    select: { storageKey: true, fileName: true, mimeType: true },
  });
}
