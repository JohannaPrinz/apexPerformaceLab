/**
 * How hard to squeeze a video, and when to give up (§18).
 *
 * ## Why this is separate from the encoder
 *
 * Everything here is arithmetic and decisions: which size to aim for, how many
 * attempts to make, when a result is small enough and when to refuse. None of
 * it needs a codec, so all of it can be tested in Node — and the part that does
 * need a browser is reduced to one injected function that encodes at a given
 * setting.
 *
 * That split is the point. The rule "**the original is never uploaded**" is the
 * one this file exists to guarantee, and a rule tangled up with `MediaRecorder`
 * would be a rule nobody could test.
 *
 * ## The one thing that can never be returned
 *
 * The input. `runCompressionPlan` only ever hands back something the encoder
 * produced, or a refusal. There is no branch that falls through to the file it
 * was given, and `original-never-returned` in the tests is the assertion that
 * says so out loud.
 */

/** The size §18 aims for. Above it, another attempt is made. */
export const TARGET_BYTES = 30 * 1024 * 1024;

/** The size §18 will not exceed under any circumstances. */
export const HARD_LIMIT_BYTES = 50 * 1024 * 1024;

/**
 * What one attempt is allowed to produce.
 *
 * The bitrate is not fixed here: a fixed one is wrong for both a four-second
 * clip and a four-minute one. It is derived from the target and the duration —
 * see `bitrateFor` — and each step scales that down.
 */
export interface CompressionTier {
  readonly maxWidth: number;
  readonly maxHeight: number;
  readonly frameRate: number;
  /** How much of the derived bitrate this attempt uses. */
  readonly bitrateFactor: number;
}

/**
 * Three attempts: the profile §18 asks for, then less bitrate, then less of
 * both.
 *
 * Three rather than a search, because every attempt costs a full pass over the
 * video in the browser. Somebody waiting on a phone is better served by a
 * refusal after three tries than by a binary search they cannot see the end of.
 */
export const TIERS: readonly CompressionTier[] = [
  { maxWidth: 1280, maxHeight: 720, frameRate: 30, bitrateFactor: 1 },
  { maxWidth: 1280, maxHeight: 720, frameRate: 30, bitrateFactor: 0.6 },
  { maxWidth: 854, maxHeight: 480, frameRate: 24, bitrateFactor: 0.4 },
];

/** Bounds on the derived bitrate: below the first it is mush, above it pointless. */
const MIN_BITRATE = 300_000;
const MAX_BITRATE = 4_000_000;

/**
 * The bitrate that would land a video of this length on the target size.
 *
 * Nine tenths of the arithmetic figure, because a container costs a little and
 * an encoder overshoots a little. A duration that could not be read falls back
 * to a middling rate rather than refusing — an unreadable duration is common
 * on phone recordings and says nothing about whether the file can be squeezed.
 */
export function bitrateFor(targetBytes: number, durationSeconds: number | null): number {
  if (durationSeconds === null || durationSeconds <= 0) return 1_500_000;

  const derived = ((targetBytes * 8) / durationSeconds) * 0.9;

  return Math.round(Math.min(MAX_BITRATE, Math.max(MIN_BITRATE, derived)));
}

/**
 * The largest box of at most `maxWidth × maxHeight` with the source's shape.
 *
 * Even numbers on both sides: every codec in practice wants them, and an odd
 * width is the kind of thing that fails on one device and nowhere else.
 * Never enlarges — a 480p clip stays 480p rather than being blown up into a
 * bigger file that shows no more.
 */
export function fitWithin(
  width: number,
  height: number,
  maxWidth: number,
  maxHeight: number,
): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: maxWidth, height: maxHeight };

  const scale = Math.min(1, maxWidth / width, maxHeight / height);
  const even = (value: number) => Math.max(2, Math.round((value * scale) / 2) * 2);

  return { width: even(width), height: even(height) };
}

/** Why no file came back. Each is a different sentence to the person waiting. */
export type CompressionFailure =
  /** The browser offers no video encoder this code can drive. */
  | 'NO_ENCODER'
  /** The file could not be read as a video at all. */
  | 'DECODE_FAILED'
  /** Encoding started and did not finish. */
  | 'ENCODE_FAILED'
  /** It compressed, and is still over the hard limit. */
  | 'STILL_TOO_LARGE';

/** One finished attempt, as the encoder reports it. */
export interface EncodedVideo {
  readonly blob: Blob;
  /** What was **actually** produced — never a claim about what was wanted. */
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly width: number;
  readonly height: number;
  readonly frameRate: number | null;
  readonly durationMs: number | null;
}

export type EncodeAttempt =
  | { readonly ok: true; readonly video: EncodedVideo }
  | { readonly ok: false; readonly reason: Exclude<CompressionFailure, 'STILL_TOO_LARGE'> };

export interface CompressedVideo extends EncodedVideo {
  readonly file: File;
  readonly originalSizeBytes: number;
  /** Which attempt produced it, from 1. Shown so a coach can see it worked hard. */
  readonly attempt: number;
}

export type CompressionResult =
  | { readonly ok: true; readonly video: CompressedVideo }
  | { readonly ok: false; readonly reason: CompressionFailure };

export interface CompressionLimits {
  /** Good enough to stop trying. */
  readonly targetBytes?: number;
  /** Never exceeded. Above it the upload is abandoned. */
  readonly hardLimitBytes?: number;
}

/**
 * The name a compressed file carries.
 *
 * The extension follows the type that was **produced**, never the type that was
 * wanted: calling a WebM file `.mp4` would be a lie the first player to open it
 * would catch (§18).
 */
export function compressedName(originalName: string, mimeType: string): string {
  const base = originalName.replace(/\.[^./\\]+$/, '') || 'video';
  const extension = mimeType.startsWith('video/mp4') ? 'mp4' : 'webm';

  return `${base}.${extension}`;
}

/**
 * Runs the attempts and decides what to do with them.
 *
 * @param encode Given a tier and a bitrate, produces a video or names why it
 *   could not. Injected, so this function needs no browser.
 */
export async function runCompressionPlan(
  original: {
    readonly name: string;
    readonly size: number;
    readonly durationSeconds: number | null;
  },
  encode: (tier: CompressionTier, bitsPerSecond: number, index: number) => Promise<EncodeAttempt>,
  limits: CompressionLimits = {},
): Promise<CompressionResult> {
  const target = limits.targetBytes ?? TARGET_BYTES;
  const hardLimit = limits.hardLimitBytes ?? HARD_LIMIT_BYTES;
  const base = bitrateFor(target, original.durationSeconds);

  let best: { video: EncodedVideo; attempt: number } | null = null;

  for (const [index, tier] of TIERS.entries()) {
    const attempt = await encode(tier, Math.round(base * tier.bitrateFactor), index);

    // A missing encoder or an unreadable file will not become readable on the
    // next pass. Only the *size* is worth another attempt.
    if (!attempt.ok) return { ok: false, reason: attempt.reason };

    if (best === null || attempt.video.sizeBytes < best.video.sizeBytes) {
      best = { video: attempt.video, attempt: index + 1 };
    }

    if (attempt.video.sizeBytes <= target) break;
  }

  // Unreachable with a non-empty `TIERS`; a guard rather than an assertion, so
  // an emptied list refuses instead of returning something unexpected.
  if (best === null) return { ok: false, reason: 'ENCODE_FAILED' };

  if (best.video.sizeBytes > hardLimit) return { ok: false, reason: 'STILL_TOO_LARGE' };

  return {
    ok: true,
    video: {
      ...best.video,
      file: new File([best.video.blob], compressedName(original.name, best.video.mimeType), {
        type: best.video.mimeType,
      }),
      originalSizeBytes: original.size,
      attempt: best.attempt,
    },
  };
}
