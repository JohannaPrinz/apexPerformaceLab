/**
 * Turning a keyframe into something small enough to send.
 *
 * ## Why it is re-encoded rather than sent as it is
 *
 * The strip draws its stills at the video's own resolution so a coach can look
 * closely — a 4K phone recording produces a PNG data URL of several megabytes,
 * and a server action carries a body limit measured in one. Re-encoding to a
 * bounded JPEG is the difference between an upload that works on a phone and one
 * that fails with nothing useful to say.
 *
 * A thousand pixels on the longest edge is generous enough that the drawn angles
 * stay legible in a document and on a retina screen, and the quality is where
 * JPEG stops being visibly lossy on a photograph with thin overlay lines.
 *
 * JPEG rather than WebP: every browser this targets encodes it from a canvas,
 * and a still is a photograph with a few overlay lines — exactly what JPEG is
 * for. WebP would save a little at the cost of a format check on every path
 * that reads one back.
 */

export const STILL_MAX_EDGE = 1000;
const STILL_QUALITY = 0.8;

/**
 * A keyframe's data URL, re-encoded as bounded JPEG bytes in base64.
 *
 * Rejects rather than guesses: a picture that cannot be decoded is not silently
 * replaced by a blank one, because a blank still in an athlete's document would
 * be worse than no still.
 */
export async function encodeStill(dataUrl: string): Promise<string> {
  const image = await loadImage(dataUrl);

  // The longest edge, not the width: a phone films portrait, and bounding the
  // width alone left a 4K portrait frame four times larger than a landscape one.
  const longest = Math.max(image.width, image.height);
  const scale = longest > STILL_MAX_EDGE ? STILL_MAX_EDGE / longest : 1;
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));

  const context = canvas.getContext('2d');
  if (context === null) throw new Error('Das Standbild konnte nicht umgewandelt werden.');

  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  const encoded = canvas.toDataURL('image/jpeg', STILL_QUALITY);
  const comma = encoded.indexOf(',');

  if (comma === -1) throw new Error('Das Standbild konnte nicht umgewandelt werden.');

  return encoded.slice(comma + 1);
}

function loadImage(source: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      resolve(image);
    };
    image.onerror = () => {
      reject(new Error('Das Standbild konnte nicht gelesen werden.'));
    };
    image.src = source;
  });
}
