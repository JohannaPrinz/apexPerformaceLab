/**
 * Turning a phone photo into something every browser can open (§18).
 *
 * ## Why HEIC needs anything at all
 *
 * An iPhone photographs in HEIC. Safari can read it; Chrome and Firefox cannot,
 * and neither can most of what a coach opens a downloaded file with. Storing
 * the original would put a file in the record that half its readers cannot see
 * — and would cost more space than the JPEG it becomes.
 *
 * So HEIC is an **input format, never a stored one**. It is decoded in the
 * browser, written out as JPEG, and the original is not uploaded alongside.
 *
 * ## Why this file has no decoder in it
 *
 * The same split as the video pipeline: everything here is recognition and
 * naming, which needs no codec and can therefore be tested in Node. The one
 * thing that needs a browser — decoding — is an injected function.
 *
 * The rule this exists to guarantee is that **the original is never handed on**.
 * `preparePhotoWith` returns either a JPEG the decoder produced or a refusal;
 * there is no branch that falls through to the file it was given.
 */

/** What a photo may be after preparation. Never HEIC. */
export const STORED_PHOTO_TYPE = 'image/jpeg';

/** How hard the JPEG is squeezed. High enough that nobody sees the difference. */
export const JPEG_QUALITY = 0.85;

/** Why a photo could not be prepared. */
export type PhotoFailure =
  /** No way to read HEIC in this browser, and no decoder to fall back on. */
  | 'HEIC_UNSUPPORTED'
  /** A decoder ran and could not make sense of the file. */
  | 'DECODE_FAILED';

export type PhotoResult =
  | { readonly ok: true; readonly file: File; readonly converted: boolean }
  | { readonly ok: false; readonly reason: PhotoFailure };

/**
 * Whether this is a picture that has to be converted before it is stored.
 *
 * The type is the first answer and the extension the second, because iOS does
 * not always fill in a MIME type when a file is chosen — an empty `type` with
 * a `.heic` name is a common and entirely ordinary case.
 */
export function isHeic(file: { readonly name: string; readonly type: string }): boolean {
  const type = file.type.split(';')[0]?.trim().toLowerCase() ?? '';

  if (type === 'image/heic' || type === 'image/heif') return true;
  if (type !== '') return false;

  return /\.(heic|heif)$/i.test(file.name);
}

/** The name a converted photo carries. The extension follows the new format. */
export function jpegName(originalName: string): string {
  const base = originalName.replace(/\.[^./\\]+$/, '') || 'foto';

  return `${base}.jpg`;
}

/**
 * Prepares one picture for upload.
 *
 * Anything that is not HEIC comes back untouched — a JPEG stays a JPEG, a PNG
 * stays a PNG, and neither is re-encoded for the sake of it.
 *
 * @param decode Produces JPEG bytes from a HEIC file, or `null` where it
 *   cannot. Injected, so this function needs no browser.
 */
export async function preparePhotoWith(
  file: File,
  decode: (file: File) => Promise<Blob | null>,
): Promise<PhotoResult> {
  if (!isHeic(file)) return { ok: true, file, converted: false };

  let jpeg: Blob | null;
  try {
    jpeg = await decode(file);
  } catch {
    return { ok: false, reason: 'DECODE_FAILED' };
  }

  // No decoder, or a decoder that produced nothing: both end the attempt. The
  // HEIC is not uploaded instead — that is the whole point of this path.
  if (jpeg === null || jpeg.size === 0) return { ok: false, reason: 'DECODE_FAILED' };

  return {
    ok: true,
    converted: true,
    file: new File([jpeg], jpegName(file.name), { type: STORED_PHOTO_TYPE }),
  };
}
