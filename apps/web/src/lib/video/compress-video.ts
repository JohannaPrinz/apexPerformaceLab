import {
  type CompressionLimits,
  type CompressionResult,
  type CompressionTier,
  type EncodeAttempt,
  fitWithin,
  runCompressionPlan,
} from './compression-plan';

/**
 * Squeezing a video in the browser, before a byte reaches the server (§18).
 *
 * ## Which technique, and why not the obvious one
 *
 * **`MediaRecorder` over a canvas**, not WebCodecs. WebCodecs encodes frames
 * and stops there: it produces no container, so turning its output into a file
 * needs an MP4 muxer, which is a dependency this project does not have and
 * would have to take on for this alone. `MediaRecorder` is the browser's own
 * encode-and-mux path, it exists everywhere this application runs, and it
 * reports what it actually produced.
 *
 * The cost is honest and worth stating: `MediaRecorder` records in real time,
 * so a one-minute clip takes about a minute per attempt. For the form-check
 * videos §18 is about that is acceptable, and the progress bar is real rather
 * than invented. If that ceases to be acceptable, WebCodecs plus a muxer is the
 * upgrade, and `runCompressionPlan` will not have to change — only the function
 * passed to it.
 *
 * ## How audio disappears
 *
 * By construction, not by configuration. The stream comes from a canvas, and a
 * canvas has no audio track. There is nothing to strip and nothing to forget.
 *
 * ## What is never done
 *
 * The original is never handed on. Every path out of this file is either a file
 * this code encoded or a named refusal — see `runCompressionPlan`.
 */

/**
 * The recording types to ask for, best first.
 *
 * H.264 in MP4 leads because §18 prefers it and because it plays everywhere
 * without thought. In practice Safari answers yes to it and Chrome sometimes
 * does; Chrome and Firefox otherwise land on VP9 or VP8 in WebM, which the
 * asset upload already accepts as `video/*`.
 *
 * Whatever is chosen, the blob is labelled with what the recorder says it
 * produced — never with what was asked for.
 */
const CANDIDATE_TYPES = [
  'video/mp4;codecs=avc1.42E01E',
  'video/mp4;codecs=h264',
  'video/mp4',
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
] as const;

/** The first recording type this browser will actually produce, or `null`. */
export function supportedRecordingType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;

  return (
    CANDIDATE_TYPES.find((type) => {
      try {
        return MediaRecorder.isTypeSupported(type);
      } catch {
        return false;
      }
    }) ?? null
  );
}

/** Whether this browser can compress at all — asked before anything is read. */
export function canCompressVideo(): boolean {
  return (
    typeof MediaRecorder !== 'undefined' &&
    typeof HTMLCanvasElement !== 'undefined' &&
    typeof HTMLCanvasElement.prototype.captureStream === 'function' &&
    supportedRecordingType() !== null
  );
}

/** How far along one attempt is, and which attempt it is. */
export interface CompressionProgress {
  /** From 1. Three at most — see `TIERS`. */
  readonly attempt: number;
  readonly attempts: number;
  /** 0 to 1 through the current pass, from playback position. */
  readonly ratio: number;
}

/** Reads the file into a `<video>` and waits for it to know its own shape. */
async function loadVideo(file: File): Promise<HTMLVideoElement> {
  const element = document.createElement('video');
  element.preload = 'auto';
  element.muted = true;
  element.playsInline = true;
  element.src = URL.createObjectURL(file);

  await new Promise<void>((resolve, reject) => {
    element.onloadedmetadata = () => {
      resolve();
    };
    element.onerror = () => {
      reject(new Error('DECODE_FAILED'));
    };
  });

  return element;
}

/**
 * One pass: play the source into a canvas and record the canvas.
 *
 * Drawing is driven by `requestVideoFrameCallback` where the browser has it, so
 * the canvas is painted once per decoded frame rather than once per screen
 * refresh — fewer duplicated frames, and a smaller file for the same bitrate.
 */
async function encodeOnce(
  source: HTMLVideoElement,
  tier: CompressionTier,
  bitsPerSecond: number,
  mimeType: string,
  onFrame: (ratio: number) => void,
): Promise<EncodeAttempt> {
  const { width, height } = fitWithin(
    source.videoWidth,
    source.videoHeight,
    tier.maxWidth,
    tier.maxHeight,
  );

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext('2d');
  if (context === null) return { ok: false, reason: 'NO_ENCODER' };

  // The canvas carries no audio track, which is how the requirement to drop
  // sound is met — there is nothing to remove.
  const stream = canvas.captureStream(tier.frameRate);

  let recorder: MediaRecorder;
  try {
    recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: bitsPerSecond });
  } catch {
    return { ok: false, reason: 'NO_ENCODER' };
  }

  const chunks: Blob[] = [];
  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };

  const finished = new Promise<void>((resolve, reject) => {
    recorder.onstop = () => {
      resolve();
    };
    recorder.onerror = () => {
      reject(new Error('ENCODE_FAILED'));
    };
  });

  const duration = Number.isFinite(source.duration) ? source.duration : null;

  const draw = () => {
    context.drawImage(source, 0, 0, width, height);
    if (duration !== null && duration > 0) onFrame(Math.min(1, source.currentTime / duration));
  };

  try {
    source.currentTime = 0;
    recorder.start(1000);

    const withFrameCallback = source as HTMLVideoElement & {
      requestVideoFrameCallback?: (callback: () => void) => number;
    };

    await new Promise<void>((resolve, reject) => {
      const step = () => {
        if (source.ended || source.paused) return;
        draw();

        if (typeof withFrameCallback.requestVideoFrameCallback === 'function') {
          withFrameCallback.requestVideoFrameCallback(step);
        } else {
          requestAnimationFrame(step);
        }
      };

      source.onended = () => {
        // One last frame, so the final moment is not cut off.
        draw();
        resolve();
      };
      source.onerror = () => {
        reject(new Error('DECODE_FAILED'));
      };

      source.play().then(step, () => {
        reject(new Error('DECODE_FAILED'));
      });
    });

    recorder.stop();
    await finished;
  } catch (error) {
    try {
      if (recorder.state !== 'inactive') recorder.stop();
    } catch {
      // Stopping a recorder that already failed is not itself a failure.
    }

    return {
      ok: false,
      reason:
        error instanceof Error && error.message === 'DECODE_FAILED'
          ? 'DECODE_FAILED'
          : 'ENCODE_FAILED',
    };
  }

  // What came out, not what was asked for.
  const produced = recorder.mimeType === '' ? mimeType : recorder.mimeType;
  const blob = new Blob(chunks, { type: produced });

  if (blob.size === 0) return { ok: false, reason: 'ENCODE_FAILED' };

  return {
    ok: true,
    video: {
      blob,
      mimeType: produced,
      sizeBytes: blob.size,
      width,
      height,
      frameRate: tier.frameRate,
      durationMs: duration === null ? null : Math.round(duration * 1000),
    },
  };
}

/**
 * Compresses one video, or says why it could not.
 *
 * Never returns the file it was given. A browser without an encoder, a file
 * that will not decode, an encoder that fails, or a result still over the hard
 * limit all come back as a refusal — §18 forbids the original as a fallback,
 * and there is no code path here that could offer one.
 */
export async function compressVideo(
  file: File,
  options: CompressionLimits & {
    readonly onProgress?: (progress: CompressionProgress) => void;
  } = {},
): Promise<CompressionResult> {
  const mimeType = supportedRecordingType();
  if (mimeType === null || !canCompressVideo()) return { ok: false, reason: 'NO_ENCODER' };

  let source: HTMLVideoElement;
  try {
    source = await loadVideo(file);
  } catch {
    return { ok: false, reason: 'DECODE_FAILED' };
  }

  const duration = Number.isFinite(source.duration) && source.duration > 0 ? source.duration : null;

  try {
    return await runCompressionPlan(
      { name: file.name, size: file.size, durationSeconds: duration },
      (tier, bitsPerSecond, index) =>
        encodeOnce(source, tier, bitsPerSecond, mimeType, (ratio) => {
          options.onProgress?.({ attempt: index + 1, attempts: 3, ratio });
        }),
      options,
    );
  } finally {
    URL.revokeObjectURL(source.src);
    source.removeAttribute('src');
    source.load();
  }
}
