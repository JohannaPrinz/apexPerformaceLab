import {
  DEFAULT_ENGINE_OPTIONS,
  finish,
  initialEngineState,
  keyFramesOf,
  pushPoseFrame,
  type AnnotatedFrame,
  type EngineOptions,
  type EngineState,
  type Landmark,
  type KeyFrame,
  type MovementOutcome,
  type MovementProfile,
} from '@apex/domain';

/**
 * Walking a recorded video past the model, one sampled frame at a time.
 *
 * ## Why this file knows nothing about MediaPipe or about video elements
 *
 * It drives a `FrameReader`, and the only two implementations are the real one
 * (a `<video>` plus a pose landmarker) and the one the tests use. That is not
 * ceremony: the questions worth testing here — does it stop when asked, does it
 * survive a frame the model choked on, does it report progress that adds up —
 * are exactly the questions a browser makes hardest to ask.
 *
 * ## Sampling, and why it is the first lever
 *
 * A minute of 30 fps video is 1800 inferences. At 25 ms each that is 45 seconds;
 * at 80 ms — a mid-range tablet — it is two and a half minutes. Halving the
 * sample rate halves that, and a squat sampled at 15 fps is still 30 samples per
 * repetition, which is far more than the movement needs. So `sampleFps` is the
 * knob to reach for before anything is taken away from the feature.
 *
 * ## Why no Web Worker
 *
 * Not because the main thread is free, but because it is only *busy*, never
 * *blocked*: the loop hands control back to the event loop whenever it has held
 * it for longer than `YIELD_EVERY_MS`, so no single task runs long enough to
 * freeze the page. The yield is **explicit** rather than left to the reader
 * awaiting a seek: awaiting an already-settled promise is a microtask and lets
 * nothing else run, so a reader that answered immediately would starve every
 * timer and every click on the page. A test pins that.
 *
 * `detectForVideo` also takes an `HTMLVideoElement`, which cannot cross a worker
 * boundary — moving it would mean an `OffscreenCanvas`, an `ImageBitmap` per
 * frame and a second WASM runtime. Worth doing only if a real device shows a
 * single inference long enough to drop frames of the interface, which is why
 * `AnalysisProgress` reports inference time separately from the frame count.
 */

/** What the recording is, once the browser has rotated it. */
export interface VideoClip {
  readonly durationMs: number;
  /** Displayed dimensions — already rotated, which is why they are read late. */
  readonly width: number;
  readonly height: number;
}

/** The aspect ratio the angle correction needs. Never assumed; always measured. */
export function aspectRatioOf(clip: VideoClip): number {
  return clip.height === 0 ? 1 : clip.width / clip.height;
}

export interface FrameReader {
  readonly clip: VideoClip;
  /**
   * Positions the recording at `timeMs` and returns what the model found —
   * `null` where it found nobody.
   */
  readAt(timeMs: number): Promise<readonly Landmark[] | null>;
}

export interface AnalysisProgress {
  readonly processedFrames: number;
  readonly totalFrames: number;
  /** Where in the recording, in milliseconds. */
  readonly positionMs: number;
  /** Rolling mean of one inference, in milliseconds. */
  readonly inferenceMs: number;
  /** The longest single inference so far — the stutter a coach would notice. */
  readonly worstInferenceMs: number;
  /** How long the analysis has been running. */
  readonly elapsedMs: number;
}

export interface PipelineOptions {
  /** Frames analysed per second of recording. */
  readonly sampleFps: number;
  readonly engine: EngineOptions;
  readonly signal?: AbortSignal;
  readonly onProgress?: (progress: AnalysisProgress) => void;
  /**
   * The pose of the frame just read, for a live preview.
   *
   * Handed over **transiently**: this callback keeps nothing, and keeping
   * anything is `collectFrames`' job below — a separate switch, so a live
   * preview never quietly turns into a recording. `null` where the model found
   * nobody, so an overlay can clear itself rather than freeze on the last good
   * pose.
   */
  readonly onFrame?: (landmarks: readonly Landmark[] | null, timestampMs: number) => void;
  /**
   * Whether to keep every frame's annotation for a later rendering pass.
   *
   * Off by default, so the sentence above stays true: this file keeps no pose
   * data unless somebody asks for it, and asking is a visible decision at the
   * call site. On, the run carries one `AnnotatedFrame` per processed frame —
   * roughly 33 landmarks per frame, which is a few megabytes for a two-minute
   * clip at 15 fps and nothing at all for the twenty-second ones this is for.
   *
   * It exists for one purpose: an annotated export must draw the **analysis's
   * own** landmarks and angles. Measuring them again would produce a video whose
   * numbers disagree with the table beside it.
   */
  readonly collectFrames?: boolean;
  /** Injected so a test does not depend on a real clock. */
  readonly now?: () => number;
  /** Injected so a test can prove the loop actually gives the page a turn. */
  readonly yieldControl?: () => Promise<void>;
}

export const DEFAULT_SAMPLE_FPS = 15;

/**
 * How long the loop may hold the main thread before giving it back.
 *
 * 50 ms is the usual threshold for an interaction still feeling immediate. Below
 * it the yields cost more than they buy — a timer callback is clamped to about a
 * millisecond, and a frame-by-frame yield over a long video adds up.
 */
const YIELD_EVERY_MS = 50;

/**
 * Hands the main thread back so the page can paint and answer a click.
 *
 * `setTimeout` rather than a resolved promise: a microtask runs before the
 * browser gets a turn, which is exactly the freeze this avoids.
 */
function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

export type AnalysisRun =
  /**
   * `keyFrames` and `annotations` sit beside the outcome, never inside it: the
   * outcome crosses into storage code and must carry no pose data, while the
   * stills and the annotated export need exactly that. A test pins both halves.
   */
  | {
      readonly kind: 'done';
      readonly outcome: MovementOutcome;
      readonly progress: AnalysisProgress;
      readonly keyFrames: readonly KeyFrame[];
      /** Every frame, annotated — empty unless `collectFrames` was asked for. */
      readonly annotations: readonly AnnotatedFrame[];
    }
  /** Stopped part way. Whatever the frames supported is still in `outcome`. */
  | {
      readonly kind: 'cancelled';
      readonly outcome: MovementOutcome;
      readonly progress: AnalysisProgress;
      readonly keyFrames: readonly KeyFrame[];
      readonly annotations: readonly AnnotatedFrame[];
    }
  | { readonly kind: 'failed'; readonly message: string };

/** How many frames a clip yields at a given sample rate. */
export function frameCountOf(clip: VideoClip, sampleFps: number): number {
  return Math.max(1, Math.floor((clip.durationMs / 1000) * sampleFps));
}

/**
 * Runs the whole recording through the model.
 *
 * Never throws for a frame the model could not read: a single failed inference
 * is folded in as "no pose", because one bad frame in a thousand is not a reason
 * to lose the other nine hundred and ninety-nine. It does give up if the reader
 * itself is broken — a video that cannot be positioned at all is not an analysis
 * with gaps, it is no analysis.
 */
export async function analyseClip(
  reader: FrameReader,
  profile: MovementProfile,
  tracks: readonly string[],
  options: Partial<PipelineOptions> = {},
): Promise<AnalysisRun> {
  const sampleFps = options.sampleFps ?? DEFAULT_SAMPLE_FPS;
  const engine = options.engine ?? DEFAULT_ENGINE_OPTIONS;
  const now = options.now ?? (() => Date.now());
  const yieldControl = options.yieldControl ?? yieldToEventLoop;

  const { clip } = reader;
  if (clip.durationMs <= 0) return { kind: 'failed', message: 'Das Video hat keine Länge.' };

  const totalFrames = frameCountOf(clip, sampleFps);
  const aspectRatio = aspectRatioOf(clip);
  const stepMs = 1000 / sampleFps;
  const startedAt = now();

  let state: EngineState = initialEngineState(profile);
  let inferenceMean = 0;
  let worst = 0;
  let processed = 0;
  let positionMs = 0;
  /** Consecutive reader failures. A handful is noise; a run of them is broken. */
  let consecutiveFailures = 0;
  let heldSince = startedAt;
  const annotations: AnnotatedFrame[] = [];

  const progressOf = (): AnalysisProgress => ({
    processedFrames: processed,
    totalFrames,
    positionMs,
    inferenceMs: Math.round(inferenceMean * 10) / 10,
    worstInferenceMs: Math.round(worst),
    elapsedMs: now() - startedAt,
  });

  for (let index = 0; index < totalFrames; index += 1) {
    if (options.signal?.aborted === true) {
      return {
        kind: 'cancelled',
        outcome: finish(state, profile, tracks, engine),
        progress: progressOf(),
        keyFrames: keyFramesOf(state, profile),
        annotations,
      };
    }

    positionMs = Math.min(index * stepMs, clip.durationMs);

    const before = now();
    let landmarks: readonly Landmark[] | null = null;

    try {
      landmarks = await reader.readAt(positionMs);
      consecutiveFailures = 0;
    } catch {
      // One frame the reader could not deliver. Counted as a frame without a
      // pose, which is what it is — not silently skipped, or the tally would
      // claim a recording was cleaner than it was.
      consecutiveFailures += 1;

      if (consecutiveFailures >= 10) {
        return { kind: 'failed', message: 'Das Video konnte nicht gelesen werden.' };
      }
    }

    const took = now() - before;
    inferenceMean = inferenceMean === 0 ? took : inferenceMean * 0.9 + took * 0.1;
    worst = Math.max(worst, took);

    state = pushPoseFrame(
      state,
      { timestampMs: positionMs, landmarks, aspectRatio },
      profile,
      tracks,
      engine,
    );
    processed += 1;

    if (options.collectFrames === true && state.lastFrame !== null) {
      annotations.push(state.lastFrame);
    }

    options.onFrame?.(landmarks, positionMs);

    options.onProgress?.(progressOf());

    // Give the page a turn before the next inference, whenever this loop has
    // held the thread long enough to be felt.
    if (now() - heldSince >= YIELD_EVERY_MS) {
      await yieldControl();
      heldSince = now();
    }
  }

  return {
    kind: 'done',
    outcome: finish(state, profile, tracks, engine),
    progress: progressOf(),
    keyFrames: keyFramesOf(state, profile),
    annotations,
  };
}
