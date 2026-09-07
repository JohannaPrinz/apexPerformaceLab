/**
 * How a file travels to the store, and how big it may be (§18).
 *
 * Pure arithmetic, and deliberately importable by the browser: the file shelf
 * has to know which road a file takes *before* it starts, and a decision the
 * server made alone would mean compressing a video for a minute and only then
 * being told it cannot be sent.
 */

/**
 * The ceiling for an ordinary upload.
 *
 * Its bytes travel inside one request, and a request has a limit — this one is
 * set by `serverActions.bodySizeLimit` in `next.config.ts`. Above it the file
 * goes the resumable way instead.
 */
export const MAX_UPLOAD_BYTES = 6 * 1024 * 1024;

/**
 * The ceiling full stop, and it is the store's own.
 *
 * `apex-backend` is configured with `file_size_limit: 50000000`; §18 names the
 * same number. Nothing above it is attempted, because nothing above it could
 * succeed.
 */
export const MAX_ASSET_BYTES = 50 * 1024 * 1024;

/** The same figures, for sentences people read. */
export const MAX_UPLOAD_MB = Math.round(MAX_UPLOAD_BYTES / 1024 / 1024);
export const MAX_ASSET_MB = Math.round(MAX_ASSET_BYTES / 1024 / 1024);

/** Which road a finished file takes. */
export type UploadRoute =
  /** Through a server action, in one request. */
  | 'STANDARD'
  /** Resumable, in chunks, through the authorised proxy. */
  | 'RESUMABLE'
  /** Not at all. */
  | 'TOO_LARGE';

/**
 * The rule, and the boundaries are exact.
 *
 * - **at most** `MAX_UPLOAD_BYTES` — ordinary. Six megabytes on the nose is
 *   ordinary; the limit is inclusive because that is what the transport
 *   actually accepts.
 * - **above** that and **at most** `MAX_ASSET_BYTES` — resumable. Fifty
 *   megabytes on the nose is still allowed, for the same reason.
 * - above that — refused before a byte moves.
 *
 * Applied to the **finished** file: a video has already been compressed and a
 * HEIC has already become a JPEG by the time this is asked. An original never
 * reaches this decision, let alone the road beyond it.
 */
export function chooseUploadRoute(sizeBytes: number): UploadRoute {
  if (sizeBytes <= MAX_UPLOAD_BYTES) return 'STANDARD';
  if (sizeBytes <= MAX_ASSET_BYTES) return 'RESUMABLE';

  return 'TOO_LARGE';
}

/**
 * The chunk a resumable upload sends at a time.
 *
 * Six megabytes because that is what Supabase's resumable endpoint requires of
 * every chunk but the last. Not a number to tune casually.
 */
export const RESUMABLE_CHUNK_BYTES = 6 * 1024 * 1024;

/** Where the browser talks to the proxy that holds the credentials. */
export const RESUMABLE_ENDPOINT = '/api/uploads/resumable';

/** The header carrying the server-issued permission to write one object. */
export const UPLOAD_TICKET_HEADER = 'x-apex-upload-ticket';
