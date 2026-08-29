import type {
  AngleTargetConfig,
  AnnotatedFrame,
  MovementProfile,
  MovementSide,
} from '@apex/domain';

import { overlayFor, paintOverlay, paintSummary } from './overlay';

/**
 * The annotated recording, made in this tab and handed to the coach as a file.
 *
 * ## Why this is not a big architecture
 *
 * A canvas, the video element the analysis already decoded, and `MediaRecorder`
 * — all three are in the browser. The clip plays once at normal speed while each
 * painted frame is captured. No encoder to ship, no worker, no server, no
 * upload, and nothing stored: the result is a `Blob` the caller turns into a
 * download and then revokes.
 *
 * Playing rather than seeking is what keeps it small. Seeking to 300 exact
 * positions would take minutes and buy nothing — the annotations are sampled at
 * `sampleFps`, so the honest thing to draw on any given moment is the most
 * recent annotation at or before it, which is exactly what playback gives.
 *
 * ## The rule this file exists to keep
 *
 * **Every number on the exported video comes from the analysis pass.** The
 * landmarks, the angles, the repetition count — all read out of
 * `AnnotatedFrame`, which the engine produced while it was measuring. The model
 * is not asked again. It could not be asked again and still agree: a
 * single-frame detection was measured to differ from the sequential pass by
 * 8–16° on the identical frame.
 *
 * ## What is deliberately absent
 *
 * No audio — the recording's own sound is not part of what was analysed, and a
 * gym is full of other people's conversations. No storage, no link: the file
 * goes to the coach's disk and nowhere else.
 */

/** Longest edge of the export. Matches the stills, for the same reasons. */
const MAX_EDGE = 900;

/** How long the closing card is held, in milliseconds. */
export const SUMMARY_HOLD_MS = 2500;

/** Codecs tried in order. The first the browser admits is used. */
const CANDIDATE_TYPES = [
  'video/webm;codecs=vp9',
  'video/webm;codecs=vp8',
  'video/webm',
  'video/mp4',
] as const;

export interface ExportSupport {
  readonly supported: boolean;
  /** Named, so a disabled button can say why rather than just refusing. */
  readonly reason: string | null;
  readonly mimeType: string | null;
}

/**
 * Whether this browser can produce the file at all.
 *
 * Checked rather than assumed: `MediaRecorder` and `captureStream` are both
 * absent or partial in some browsers, and a button that fails after a coach
 * waited through a recording is worse than one that never offered.
 */
export function annotatedExportSupport(): ExportSupport {
  if (typeof window === 'undefined') {
    return { supported: false, reason: 'Nur im Browser verfügbar.', mimeType: null };
  }

  if (typeof window.MediaRecorder === 'undefined') {
    return {
      supported: false,
      reason: 'Dieser Browser kann keine Videos aufzeichnen.',
      mimeType: null,
    };
  }

  const canvas = document.createElement('canvas');
  if (typeof canvas.captureStream !== 'function') {
    return {
      supported: false,
      reason: 'Dieser Browser kann den Zeichenbereich nicht aufzeichnen.',
      mimeType: null,
    };
  }

  const mimeType =
    CANDIDATE_TYPES.find((type) => window.MediaRecorder.isTypeSupported(type)) ?? null;

  return mimeType === null
    ? { supported: false, reason: 'Kein unterstütztes Videoformat gefunden.', mimeType: null }
    : { supported: true, reason: null, mimeType };
}

export interface AnnotatedExport {
  readonly blob: Blob;
  readonly mimeType: string;
  /** `.webm` or `.mp4`, from what the browser actually produced. */
  readonly extension: string;
}

export interface RecordOptions {
  readonly video: HTMLVideoElement;
  /** Every frame the analysis read, in order. */
  readonly annotations: readonly AnnotatedFrame[];
  readonly profile: MovementProfile;
  readonly tracks: readonly string[];
  readonly targets: readonly AngleTargetConfig[];
  readonly side: MovementSide;
  /** The closing card, already worded by the caller from the analysis result. */
  readonly summary: readonly string[];
  readonly signal?: AbortSignal;
  /** 0 to 1. */
  readonly onProgress?: (fraction: number) => void;
}

/**
 * The annotation that stands at a moment.
 *
 * The most recent one at or before it — never the nearest, and never
 * interpolated. Between two samples the analysis knew what the earlier one
 * said, so that is what the picture may claim.
 */
export function annotationAt(
  annotations: readonly AnnotatedFrame[],
  timeMs: number,
): AnnotatedFrame | null {
  if (annotations.length === 0) return null;

  let low = 0;
  let high = annotations.length - 1;
  let found: AnnotatedFrame | null = null;

  while (low <= high) {
    const middle = (low + high) >> 1;
    const entry = annotations[middle]!;

    if (entry.timestampMs <= timeMs) {
      found = entry;
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }

  return found;
}

/** The canvas the export is painted on, sized like the stills. */
function canvasFor(video: HTMLVideoElement): {
  canvas: HTMLCanvasElement;
  width: number;
  height: number;
} {
  const ratio = video.videoWidth / Math.max(1, video.videoHeight);
  const width = ratio >= 1 ? MAX_EDGE : Math.round(MAX_EDGE * ratio);
  const height = ratio >= 1 ? Math.round(MAX_EDGE / ratio) : MAX_EDGE;

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;

  return { canvas, width, height };
}

/**
 * Plays the clip once, painting each frame, and returns the recording.
 *
 * Rejects rather than resolving half a video: a truncated export that looked
 * finished would be handed to an athlete.
 */
export async function recordAnnotatedClip(options: RecordOptions): Promise<AnnotatedExport> {
  const support = annotatedExportSupport();
  if (!support.supported || support.mimeType === null) {
    throw new Error(support.reason ?? 'Export nicht möglich.');
  }

  const { video, annotations, profile, tracks, targets, side, summary } = options;
  const { canvas, width, height } = canvasFor(video);

  const context = canvas.getContext('2d');
  if (context === null) throw new Error('Der Zeichenbereich konnte nicht geöffnet werden.');

  const stream = canvas.captureStream();
  const recorder = new MediaRecorder(stream, { mimeType: support.mimeType });
  const chunks: Blob[] = [];

  recorder.ondataavailable = (event) => {
    if (event.data.size > 0) chunks.push(event.data);
  };

  // Restored afterwards: this is the element the coach watches, and leaving it
  // parked at the end at half speed would look like a bug.
  const restore = { time: video.currentTime, rate: video.playbackRate, muted: video.muted };

  let frameHandle = 0;
  const stopPainting = () => {
    if (frameHandle !== 0) cancelAnimationFrame(frameHandle);
    frameHandle = 0;
  };

  const finished = new Promise<Blob>((resolve, reject) => {
    recorder.onstop = () => resolve(new Blob(chunks, { type: support.mimeType ?? undefined }));
    recorder.onerror = () => reject(new Error('Die Aufzeichnung ist fehlgeschlagen.'));
  });

  const cleanUp = () => {
    stopPainting();
    video.pause();
    video.currentTime = restore.time;
    video.playbackRate = restore.rate;
    video.muted = restore.muted;
    for (const track of stream.getTracks()) track.stop();
  };

  try {
    video.pause();
    video.muted = true;
    video.playbackRate = 1;
    video.currentTime = 0;

    await new Promise<void>((resolve) => {
      const done = () => {
        video.removeEventListener('seeked', done);
        resolve();
      };
      video.addEventListener('seeked', done);
      // A clip already at zero fires no `seeked`, so it is not waited for.
      if (video.currentTime === 0) done();
    });

    recorder.start();

    const duration = Math.max(1, video.duration * 1000);
    let ended = false;

    const paintFrame = () => {
      const timeMs = video.currentTime * 1000;

      context.drawImage(video, 0, 0, width, height);

      const frame = annotationAt(annotations, timeMs);
      if (frame !== null) {
        paintOverlay(
          context,
          overlayFor(frame, profile, tracks, targets, side),
          frame,
          width,
          height,
        );
      }

      options.onProgress?.(Math.min(1, timeMs / duration));
    };

    await new Promise<void>((resolve, reject) => {
      const onAbort = () => {
        reject(new Error('Abgebrochen.'));
      };

      options.signal?.addEventListener('abort', onAbort, { once: true });

      const onEnded = () => {
        ended = true;
        resolve();
      };

      video.addEventListener('ended', onEnded, { once: true });

      const loop = () => {
        if (options.signal?.aborted === true) return;
        if (ended) return;

        paintFrame();
        frameHandle = requestAnimationFrame(loop);
      };

      void video.play().then(
        () => {
          frameHandle = requestAnimationFrame(loop);
        },
        (error: unknown) => {
          reject(
            error instanceof Error ? error : new Error('Das Video konnte nicht abgespielt werden.'),
          );
        },
      );
    });

    stopPainting();

    // The closing card, repainted every frame so the stream keeps producing —
    // a canvas that stops changing stops feeding the recorder, and the card
    // would last no time at all.
    if (summary.length > 0) {
      await new Promise<void>((resolve) => {
        const until = performance.now() + SUMMARY_HOLD_MS;

        const hold = () => {
          paintSummary(context, summary, width, height);

          if (performance.now() >= until) {
            resolve();

            return;
          }

          frameHandle = requestAnimationFrame(hold);
        };

        hold();
      });

      stopPainting();
    }

    recorder.stop();
    options.onProgress?.(1);

    const blob = await finished;

    return {
      blob,
      mimeType: support.mimeType,
      extension: support.mimeType.startsWith('video/mp4') ? 'mp4' : 'webm',
    };
  } finally {
    if (recorder.state !== 'inactive') recorder.stop();
    cleanUp();
  }
}
