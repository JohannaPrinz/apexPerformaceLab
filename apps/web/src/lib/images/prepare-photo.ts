import {
  JPEG_QUALITY,
  isHeic,
  type PhotoResult,
  preparePhotoWith,
  STORED_PHOTO_TYPE,
} from './photo-plan';

/**
 * Decoding HEIC in the browser (§18).
 *
 * ## Two ways, in this order
 *
 * 1. **The browser's own.** Safari reads HEIC natively, so `createImageBitmap`
 *    simply works there and no library is needed or loaded. That is the case
 *    that matters most — an athlete photographing on an iPhone and uploading
 *    from it.
 * 2. **`heic2any`, loaded on demand.** Chrome and Firefox cannot decode HEIC at
 *    all, and a coach opening an iPhone photo on a laptop is the ordinary
 *    second case. The library is 2.7 MB, so it is behind a dynamic `import()`:
 *    a person who never uploads a HEIC never downloads it.
 *
 * If neither works the upload ends with a sentence. **The HEIC is never stored**
 * — it is an input format, not a kept one.
 */

/**
 * The browser's own decoder, where it has one.
 *
 * `createImageBitmap` throws on a format it cannot read, which is exactly the
 * signal needed: a `null` here means "ask the library", not "give up".
 */
async function decodeNatively(file: File): Promise<Blob | null> {
  if (typeof createImageBitmap !== 'function') return null;

  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return null;
  }

  try {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;

    const context = canvas.getContext('2d');
    if (context === null) return null;

    context.drawImage(bitmap, 0, 0);

    return await new Promise<Blob | null>((resolve) => {
      canvas.toBlob(resolve, STORED_PHOTO_TYPE, JPEG_QUALITY);
    });
  } finally {
    bitmap.close();
  }
}

/**
 * The library, fetched only when the browser could not do it itself.
 *
 * A failed import is treated as "no decoder" rather than thrown: a blocked
 * chunk, an offline browser and an unsupported format all end the same way for
 * the person waiting, and none of them may end with the original being sent.
 */
async function decodeWithLibrary(file: File): Promise<Blob | null> {
  try {
    const { default: heic2any } = await import('heic2any');

    const converted = await heic2any({
      blob: file,
      toType: STORED_PHOTO_TYPE,
      quality: JPEG_QUALITY,
    });

    // The library answers with one blob, or several for a multi-image file.
    const blob = Array.isArray(converted) ? converted[0] : converted;

    return blob ?? null;
  } catch {
    return null;
  }
}

/** Native first, library second. `null` where neither could read it. */
async function decodeHeic(file: File): Promise<Blob | null> {
  return (await decodeNatively(file)) ?? (await decodeWithLibrary(file));
}

/**
 * Prepares one picture for upload: HEIC becomes JPEG, everything else is left
 * exactly as it is.
 */
export async function preparePhoto(file: File): Promise<PhotoResult> {
  return preparePhotoWith(file, decodeHeic);
}

export { isHeic };
