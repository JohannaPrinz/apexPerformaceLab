import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import { env } from '@/env';

/**
 * The object store, behind six verbs.
 *
 * ## Why the directory is named for the capability, not the vendor
 *
 * The README here asks for one directory per provider, and the reason it gives
 * is that a swap must stay one file: feature code imports `sendEmail()`, never
 * the SDK. That reason has now proved itself — this file changed from S3 to
 * Supabase Storage and nothing outside it moved. So the vendor stays in here.
 *
 * ## Why the service role key
 *
 * The bucket is private and every read is decided by the app first: a coach's
 * session, or the cookie an athlete got with their link. Handing the browser an
 * anon key and a storage policy would move that decision out of the code that
 * already makes it correctly, and would put two answers where there should be
 * one.
 *
 * ## Why "not configured" is a normal answer
 *
 * A workspace without storage must still record an assessment, publish an
 * analysis and share it — it simply has no pictures. Nothing here throws on
 * missing configuration; callers ask `objectStoreReady()` and leave the feature
 * out where it is false. A store that exploded at import time would take the
 * whole analysis screen with it.
 */

/** Whether a bucket is configured at all. */
export function objectStoreReady(): boolean {
  return (
    typeof env.SUPABASE_URL === 'string' &&
    env.SUPABASE_URL !== '' &&
    typeof env.SUPABASE_SERVICE_ROLE_KEY === 'string' &&
    env.SUPABASE_SERVICE_ROLE_KEY !== ''
  );
}

/**
 * One client, built on first use.
 *
 * Lazily, because building it reads configuration that may not be there, and
 * module-level work that can fail is work that fails during a route import.
 */
let client: SupabaseClient | null = null;

function store(): { bucket: ReturnType<SupabaseClient['storage']['from']> } | null {
  if (!objectStoreReady()) return null;

  client ??= createClient(String(env.SUPABASE_URL), String(env.SUPABASE_SERVICE_ROLE_KEY), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  return { bucket: client.storage.from(env.SUPABASE_STORAGE_BUCKET) };
}

/** Writes one file. `false` where there is no store to write to. */
export async function putObject(
  key: string,
  body: Uint8Array,
  contentType: string,
): Promise<boolean> {
  const target = store();
  if (target === null) return false;

  const { error } = await target.bucket.upload(key, body, {
    contentType,
    // Re-running an analysis writes the same positions again; an upload that
    // refused would leave the screen showing yesterday's frame.
    upsert: true,
  });

  return error === null;
}

/** One file's bytes, or `null` where it is missing or there is no store. */
export async function getObject(
  key: string,
): Promise<{ body: Uint8Array; contentType: string } | null> {
  const target = store();
  if (target === null) return null;

  const { data, error } = await target.bucket.download(key);
  if (error !== null || data === null) {
    // A missing file and an unreachable bucket answer the same way on purpose:
    // the caller turns either into a 404, and a store that distinguished them
    // would let a probe learn which keys exist.
    return null;
  }

  return {
    body: new Uint8Array(await data.arrayBuffer()),
    contentType: data.type === '' ? 'application/octet-stream' : data.type,
  };
}

export interface StoredObject {
  readonly key: string;
  /** When it was written. What the sweep decides on. */
  readonly createdAt: Date | null;
}

/**
 * The files directly inside one folder.
 *
 * Supabase lists one level at a time and returns folders as entries with no
 * `id`, which is how they are told apart here.
 */
export async function listObjects(folder: string, limit = 100): Promise<readonly StoredObject[]> {
  const target = store();
  if (target === null) return [];

  const { data, error } = await target.bucket.list(folder, { limit });
  if (error !== null || data === null) return [];

  return data
    .filter((entry) => entry.id !== null)
    .map((entry) => ({
      key: `${folder}/${entry.name}`,
      createdAt: entry.created_at === null ? null : new Date(entry.created_at),
    }));
}

/** The folders directly inside one folder. What the sweep walks. */
export async function listFolders(folder: string, limit = 500): Promise<readonly string[]> {
  const target = store();
  if (target === null) return [];

  const { data, error } = await target.bucket.list(folder, { limit });
  if (error !== null || data === null) return [];

  return data.filter((entry) => entry.id === null).map((entry) => `${folder}/${entry.name}`);
}

/**
 * Copies one file.
 *
 * What publishing does, rather than moving: the source is deleted afterwards,
 * separately, so a failure between the two leaves the temporary copy behind —
 * which the sweep removes — instead of losing the picture.
 */
export async function copyObject(fromKey: string, toKey: string): Promise<boolean> {
  const target = store();
  if (target === null) return false;

  const { error } = await target.bucket.copy(fromKey, toKey);

  return error === null;
}

/**
 * Removes files, without saying whether it worked.
 *
 * Never throws: clearing up runs after the work that mattered has already
 * succeeded, and a failed delete must not undo a published analysis. What it
 * leaves behind is temporary by construction and expires on its own.
 *
 * **Not for deleting an Asset** — there the outcome decides whether a database
 * row may follow, so use `removeObject` below.
 */
export async function deleteObjects(keys: readonly string[]): Promise<void> {
  const target = store();
  if (target === null || keys.length === 0) return;

  // Supabase takes a list; slicing keeps a very long one from becoming one
  // request nobody can retry.
  for (let index = 0; index < keys.length; index += 100) {
    await target.bucket.remove([...keys.slice(index, index + 100)]);
  }
}

/**
 * Removes one file **and says whether it went**.
 *
 * The reporting sibling of `deleteObjects`, and the difference is the whole
 * point. Clearing up temporary stills may fail quietly because nothing depends
 * on the answer. Deleting an Asset does: the database row may only follow once
 * the object is actually gone, otherwise the file survives with nothing left
 * pointing at it and counts against the plan for ever (§18).
 *
 * A key that is already absent counts as removed — the outcome the caller needs
 * is "no object left behind", and that is satisfied either way. An unconfigured
 * store is **not** success: nothing was checked, so nothing may be assumed.
 */
export async function removeObject(key: string): Promise<boolean> {
  const target = store();
  if (target === null) return false;

  const { error } = await target.bucket.remove([key]);

  return error === null;
}

/**
 * What the store actually holds under one key, or `null`.
 *
 * The proof a resumable upload finished. A chunked upload does not report back
 * to this application at all — the browser talks to the proxy and the proxy to
 * the store — so before an Asset row is written, the object is looked for and
 * its **real** size is read. A client that skipped the upload and asked to
 * register anyway finds nothing here, and a client that lied about the size
 * does not get its number recorded (§18).
 */
export async function objectInfo(
  key: string,
): Promise<{ readonly sizeBytes: number; readonly mimeType: string | null } | null> {
  const target = store();
  if (target === null) return null;

  const slash = key.lastIndexOf('/');
  const folder = slash === -1 ? '' : key.slice(0, slash);
  const name = key.slice(slash + 1);

  const { data, error } = await target.bucket.list(folder, { limit: 100, search: name });
  if (error !== null || data === null) return null;

  const found = data.find((entry) => entry.name === name && entry.id !== null);
  if (found === undefined) return null;

  const metadata = found.metadata as { size?: number; mimetype?: string } | null;

  return {
    sizeBytes: typeof metadata?.size === 'number' ? metadata.size : 0,
    mimeType: typeof metadata?.mimetype === 'string' ? metadata.mimetype : null,
  };
}
