import { angleBetween, corrected, median, type Landmark } from './angles';
import { landmarkIndex, type MovementProfile, type MovementSide, seriesKeyOf } from './profile';
import {
  DEFAULT_REP_OPTIONS,
  initialRepState,
  pushFrame,
  type AngleRange,
  type RepState,
} from './reps';

/**
 * Measuring a movement, whichever movement it is.
 *
 * ## What this file does not know
 *
 * That squats exist. Every anatomical decision — which landmarks form which
 * angle, which signal counts repetitions, what the ends of the arc are called —
 * arrives in the profile. What is left here is arithmetic and bookkeeping, and
 * that is the whole point: adding a movement must not require touching the
 * thing that measures it.
 *
 * ## What it refuses to do
 *
 * Judge. It reports angles, ranges, counts and durations. Whether any of them
 * is good is not a question this can answer, and a platform that ships no
 * reference ranges has no basis on which to try.
 *
 * ## Why it is a fold
 *
 * The same function serves a recorded video and a live camera, so nothing here
 * touches a clock: every frame carries its own timestamp and the result depends
 * only on the frames. That is also what makes the whole thing testable without a
 * camera, a video, or a person.
 */

/** One frame handed to the engine: what the model saw, and when. */
export interface PoseFrame {
  readonly timestampMs: number;
  /** `null` where the model found no person at all. */
  readonly landmarks: readonly Landmark[] | null;
  /**
   * Frame width divided by height, **after** rotation.
   *
   * Carried per frame because it is the one thing a rotated recording changes:
   * a portrait video reported as landscape distorts every diagonal angle, which
   * is precisely where a squat lives.
   */
  readonly aspectRatio: number;
}

export interface EngineOptions {
  /** Below this the pose is not trusted to carry an angle. */
  readonly minVisibility: number;
  /** How many frames the smoothing median looks back over. */
  readonly smoothingFrames: number;
  /** Fewer usable frames than this and no result is produced. */
  readonly minUsableFrames: number;
  /** The share of frames that must be usable before a result is produced. */
  readonly minUsableShare: number;
}

export const DEFAULT_ENGINE_OPTIONS: EngineOptions = {
  minVisibility: 0.5,
  // Five frames at 30 fps is a sixth of a second — enough to absorb a single
  // badly placed landmark, short enough not to round off the bottom of a squat.
  smoothingFrames: 5,
  // A second of usable video at 30 fps. Below that there is not enough to see
  // one repetition, let alone measure it.
  minUsableFrames: 30,
  minUsableShare: 0.4,
};

export type MovementRefusal =
  /** The model found nobody in any frame. */
  | 'NO_POSE'
  /** Somebody was there, but too rarely to measure. */
  | 'POSE_TOO_INTERMITTENT'
  /** Not enough frames at all — a clip too short, or sampled too coarsely. */
  | 'TOO_FEW_FRAMES'
  /** Readable throughout, but no complete repetition happened. */
  | 'NO_REPETITIONS';

export interface FrameTally {
  readonly total: number;
  readonly usable: number;
  readonly withoutPose: number;
}

/** One point of the curve a coach sees, for the track that drives the count. */
export interface SignalPoint {
  readonly timestampMs: number;
  /** The smoothed driving signal — `null` for a frame with no usable pose. */
  readonly primary: number | null;
}

/**
 * Everything the analysis knew about **one** frame, as it read it.
 *
 * The record an annotated export is drawn from. It exists so a later rendering
 * pass can put the analysis's own numbers onto the analysis's own frames
 * **without asking the model a second time** — re-detecting a frame was measured
 * to disagree with the sequential pass by 8–16°, and an export whose caption
 * contradicts the table beside it explains nothing.
 *
 * Handed out one at a time. The engine keeps only the most recent one, because
 * whether a whole recording's worth is worth holding in memory is the caller's
 * decision, not the domain's — `MovementResult` still carries no pose data at
 * all, and nothing here is ever persisted.
 */
export interface AnnotatedFrame {
  readonly timestampMs: number;
  /** What the model saw, or `null` where it found nobody. */
  readonly landmarks: readonly Landmark[] | null;
  /**
   * `track_side` → degrees, exactly the smoothed values the result is built
   * from. Not recomputed anywhere: this **is** the measurement.
   */
  readonly angles: Readonly<Record<string, number>>;
  /** The driving signal, or `null` where the frame had no usable pose. */
  readonly signal: number | null;
  /** The repetition under way, 1-based. `null` between repetitions. */
  readonly repInProgress: number | null;
  /** How many repetitions were complete by this frame. */
  readonly completedReps: number;
}

/** A moment worth showing as a still image. */
export interface KeyMoment {
  /** The position key it corresponds to, e.g. `extended`. */
  readonly position: string;
  readonly timestampMs: number;
}

export interface MovementRep {
  readonly index: number;
  readonly startedAtMs: number;
  readonly endedAtMs: number;
  readonly durationMs: number;
}

/** What was measured for one track on one side. */
export interface TrackMeasurement {
  readonly track: string;
  readonly side: MovementSide;
  /** Position key → the angle there, as the median across repetitions. */
  readonly positions: Readonly<Record<string, number>>;
  /** The arc travelled, as the median across repetitions. */
  readonly range: number;
  /** The weakest landmark confidence this rests on, averaged over the frames. */
  readonly confidence: number;
}

export interface MovementResult {
  readonly profileKey: string;
  readonly reps: readonly MovementRep[];
  readonly repetitions: number;
  readonly meanRepDurationMs: number;
  readonly medianRepDurationMs: number;
  /** `track_side` → what was measured. Only the tracks that were analysed. */
  readonly tracks: Readonly<Record<string, TrackMeasurement>>;
  /** Which side the model saw more confidently over the whole recording. */
  readonly clearerSide: MovementSide;
  readonly frames: FrameTally;
  readonly signal: readonly SignalPoint[];
  readonly keyMoments: readonly KeyMoment[];
}

export type MovementOutcome =
  | { readonly ok: true; readonly result: MovementResult; readonly frames: FrameTally }
  | { readonly ok: false; readonly refusal: MovementRefusal; readonly frames: FrameTally };

/** The pose at one extreme of one repetition. */
interface ExtremeFrame {
  readonly value: number;
  readonly timestampMs: number;
  readonly landmarks: readonly Landmark[];
}

export interface EngineState {
  readonly profileKey: string;
  readonly reps: RepState;
  readonly frames: FrameTally;
  readonly signal: readonly SignalPoint[];
  readonly history: Readonly<Record<string, readonly number[]>>;
  readonly confidence: Readonly<Record<string, { sum: number; count: number }>>;
  readonly sideConfidence: Readonly<Record<MovementSide, number>>;
  /**
   * The pose at each extreme of the repetition in progress, per position.
   *
   * Kept so the still image can be drawn from **the same pose that produced the
   * number**. Re-detecting the frame afterwards was measured to disagree with
   * the analysis by 8–16° on the identical frame — sequential tracking and
   * single-frame detection are different measurements, and a picture whose
   * label contradicts the table explains nothing.
   *
   * Transient, and bounded by the repetition count: nothing here is persisted,
   * and `MovementResult` deliberately carries no landmarks at all.
   */
  readonly pendingFrames: Readonly<Record<string, ExtremeFrame>>;
  /** The same, closed off when a repetition completes. */
  readonly repFrames: readonly Readonly<Record<string, ExtremeFrame>>[];
  /**
   * The frame just folded in, annotated.
   *
   * One frame, not a growing list: holding a whole recording's landmarks is a
   * memory decision, and it belongs to whoever drives the loop. `null` before
   * the first frame.
   */
  readonly lastFrame: AnnotatedFrame | null;
}

export function initialEngineState(profile: MovementProfile): EngineState {
  return {
    profileKey: profile.key,
    reps: initialRepState,
    frames: { total: 0, usable: 0, withoutPose: 0 },
    signal: [],
    history: {},
    confidence: {},
    sideConfidence: { left: 0, right: 0 },
    pendingFrames: {},
    repFrames: [],
    lastFrame: null,
  };
}

/** The angle of one track on one side, or `null` where the pose is unusable. */
function angleFor(
  landmarks: readonly Landmark[],
  aspectRatio: number,
  minVisibility: number,
  vertex: number,
  from: number,
  to: number,
): { degrees: number; confidence: number } | null {
  const points = [landmarks[vertex], landmarks[from], landmarks[to]];
  if (points.some((point) => point === undefined)) return null;

  const confidence = Math.min(...points.map((point) => point?.visibility ?? 0));
  if (confidence < minVisibility) return null;

  const degrees = angleBetween(
    corrected(landmarks[vertex]!, aspectRatio),
    corrected(landmarks[from]!, aspectRatio),
    corrected(landmarks[to]!, aspectRatio),
  );

  return Number.isFinite(degrees) ? { degrees, confidence } : null;
}

/** Keeps the last `size` values of one series. */
function remember(
  history: Readonly<Record<string, readonly number[]>>,
  key: string,
  value: number,
  size: number,
): Record<string, readonly number[]> {
  const previous = history[key] ?? [];

  return { ...history, [key]: [...previous.slice(-(size - 1)), value] };
}

/**
 * Folds one frame in.
 *
 * `tracks` is the coach's selection — a track they deselected is never measured,
 * so it cannot later appear as missing or as a target violation.
 */
export function pushPoseFrame(
  state: EngineState,
  frame: PoseFrame,
  profile: MovementProfile,
  tracks: readonly string[],
  options: EngineOptions = DEFAULT_ENGINE_OPTIONS,
): EngineState {
  const size = Math.max(1, options.smoothingFrames);
  const measured: Record<string, number> = {};
  const confidences: Record<string, number> = {};
  let history = state.history;

  if (frame.landmarks !== null) {
    for (const track of profile.tracks) {
      if (!tracks.includes(track.key)) continue;

      for (const side of profile.sides) {
        const found = angleFor(
          frame.landmarks,
          frame.aspectRatio,
          options.minVisibility,
          landmarkIndex(track.vertex, side),
          landmarkIndex(track.from, side),
          landmarkIndex(track.to, side),
        );

        if (found === null) continue;

        const key = seriesKeyOf(track.key, side);
        history = remember(history, key, found.degrees, size);
        // A median, because the estimate jitters by a degree or two between
        // frames and a single badly placed landmark would otherwise land in the
        // result.
        measured[key] = median(history[key] ?? [found.degrees]);
        confidences[key] = found.confidence;
      }
    }
  }

  const readable = Object.keys(measured).length > 0;

  /**
   * The track the positions are read off.
   *
   * The counting track where there is one — the positions of a squat are ends
   * of the knee's arc. A profile that counts nothing still has positions worth
   * a still image, so it falls back to the first track the coach kept; without
   * that, a mobility hold would produce no picture at all.
   */
  const signalTrack =
    profile.counting.kind === 'hysteresis' && tracks.includes(profile.counting.track)
      ? profile.counting.track
      : (profile.tracks.find((track) => tracks.includes(track.key))?.key ?? null);

  /** The value that track showed, on the side seen more clearly this frame. */
  let signalValue: number | null = null;

  if (signalTrack !== null) {
    const candidates = profile.sides
      .map((side) => ({ side, key: seriesKeyOf(signalTrack, side) }))
      .filter((entry) => measured[entry.key] !== undefined);

    // The side the model saw more confidently in *this* frame: an athlete who
    // turns mid-set changes which leg the camera can see, and the count must not
    // break because of it. Averaging the two would mix a measurement with a
    // guess.
    const clearest = candidates.reduce<{ side: MovementSide; key: string } | null>(
      (best, entry) =>
        best === null || (confidences[entry.key] ?? 0) > (confidences[best.key] ?? 0)
          ? entry
          : best,
      null,
    );

    if (clearest) signalValue = measured[clearest.key] ?? null;
  }

  /**
   * The signal repetitions are counted from.
   *
   * Only where the profile counts and the coach kept the track it counts from —
   * a count from a track nobody measured would be invented.
   */
  const primary =
    profile.counting.kind === 'hysteresis' && tracks.includes(profile.counting.track)
      ? signalValue
      : null;

  // The pose at each named extreme of the repetition in progress. Compared on
  // the driving signal, because that is the one the positions are defined
  // against — see `keyFramesOf`.
  const pending: Record<string, ExtremeFrame> = { ...state.pendingFrames };

  if (signalValue !== null && frame.landmarks !== null) {
    for (const position of profile.positions) {
      const current = pending[position.key];
      const better =
        current === undefined ||
        (position.end === 'max' ? signalValue > current.value : signalValue < current.value);

      if (better) {
        pending[position.key] = {
          value: signalValue,
          timestampMs: frame.timestampMs,
          landmarks: frame.landmarks,
        };
      }
    }
  }

  const nextConfidence: Record<string, { sum: number; count: number }> = { ...state.confidence };
  for (const [key, value] of Object.entries(confidences)) {
    const current = nextConfidence[key] ?? { sum: 0, count: 0 };
    nextConfidence[key] = { sum: current.sum + value, count: current.count + 1 };
  }

  const sideTotals = { ...state.sideConfidence };
  for (const side of profile.sides) {
    const suffix = `_${side}`;
    for (const [key, value] of Object.entries(confidences)) {
      if (key.endsWith(suffix)) sideTotals[side] += value;
    }
  }

  const reps = pushFrame(
    state.reps,
    { timestampMs: frame.timestampMs, primary, angles: measured },
    profile.counting.kind === 'hysteresis'
      ? {
          descendBelow: profile.counting.descendBelow,
          ascendAbove: profile.counting.ascendAbove,
          minRepMs: profile.counting.minRepMs,
        }
      : DEFAULT_REP_OPTIONS,
  );

  // A repetition just closed: its extremes are final, so they move out of the
  // pending slot and the next repetition starts from nothing.
  const closed = reps.reps.length > state.reps.reps.length;

  return {
    profileKey: state.profileKey,
    reps,
    pendingFrames: closed ? {} : pending,
    repFrames: closed ? [...state.repFrames, pending] : state.repFrames,
    // Built from the same locals the result is built from, in the same pass.
    // A second function deriving this from the frame again is exactly how the
    // still image came to disagree with its own caption once already.
    lastFrame: {
      timestampMs: frame.timestampMs,
      landmarks: frame.landmarks,
      angles: measured,
      signal: signalValue,
      // A descent under way is the repetition after the last completed one. The
      // engine counts a repetition when it ends, so this is the only moment the
      // number is knowable while it is still running.
      repInProgress: reps.descentStartedMs === null ? null : reps.reps.length + 1,
      completedReps: reps.reps.length,
    },
    frames: {
      total: state.frames.total + 1,
      usable: state.frames.usable + (readable ? 1 : 0),
      withoutPose: state.frames.withoutPose + (readable ? 0 : 1),
    },
    signal: [...state.signal, { timestampMs: frame.timestampMs, primary }],
    history,
    confidence: nextConfidence,
    sideConfidence: sideTotals,
  };
}

/** One decimal. A pose estimate does not support a second one. */
const round = (value: number) => Math.round(value * 10) / 10;

/** Turns the accumulated state into a result, or says why it cannot. */
export function finish(
  state: EngineState,
  profile: MovementProfile,
  tracks: readonly string[],
  options: EngineOptions = DEFAULT_ENGINE_OPTIONS,
): MovementOutcome {
  const { frames } = state;

  if (frames.usable === 0) return { ok: false, refusal: 'NO_POSE', frames };
  if (frames.usable < options.minUsableFrames) {
    return { ok: false, refusal: 'TOO_FEW_FRAMES', frames };
  }
  if (frames.usable / Math.max(1, frames.total) < options.minUsableShare) {
    return { ok: false, refusal: 'POSE_TOO_INTERMITTENT', frames };
  }

  const counted = profile.counting.kind === 'hysteresis';
  if (counted && state.reps.reps.length === 0) {
    return { ok: false, refusal: 'NO_REPETITIONS', frames };
  }

  const reps: MovementRep[] = state.reps.reps.map((rep) => ({
    index: rep.index,
    startedAtMs: rep.startedAtMs,
    endedAtMs: rep.endedAtMs,
    durationMs: rep.durationMs,
  }));

  const durations = reps.map((rep) => rep.durationMs);

  const measurements: Record<string, TrackMeasurement> = {};

  for (const track of profile.tracks) {
    if (!tracks.includes(track.key)) continue;

    for (const side of profile.sides) {
      const key = seriesKeyOf(track.key, side);

      const perRep = state.reps.reps
        .map((rep) => rep.ranges[key])
        .filter((entry): entry is AngleRange => entry !== undefined);

      if (perRep.length === 0) continue;

      const positions: Record<string, number> = {};
      for (const position of profile.positions) {
        const values = perRep.map((entry) => (position.end === 'max' ? entry.max : entry.min));
        positions[position.key] = round(median(values));
      }

      const confidence = state.confidence[key];

      measurements[key] = {
        track: track.key,
        side,
        positions,
        range: round(median(perRep.map((entry) => entry.range))),
        confidence: confidence ? round(confidence.sum / Math.max(1, confidence.count)) : 0,
      };
    }
  }

  const clearerSide: MovementSide =
    state.sideConfidence.left >= state.sideConfidence.right ? 'left' : 'right';

  return {
    ok: true,
    frames,
    result: {
      profileKey: profile.key,
      reps,
      repetitions: reps.length,
      meanRepDurationMs:
        reps.length === 0
          ? 0
          : Math.round(durations.reduce((sum, value) => sum + value, 0) / reps.length),
      medianRepDurationMs: reps.length === 0 ? 0 : Math.round(median(durations)),
      tracks: measurements,
      clearerSide,
      frames,
      signal: state.signal,
      // Derived from the same choice the stills are drawn from, so the two
      // never point at different moments.
      keyMoments: keyFramesOf(state, profile).map((frame) => ({
        position: frame.position,
        timestampMs: frame.timestampMs,
      })),
    },
  };
}

/** A still worth showing, with the pose that produced the numbers beside it. */
export interface KeyFrame {
  readonly position: string;
  readonly timestampMs: number;
  readonly landmarks: readonly Landmark[];
}

/**
 * The frames a still image should be drawn from — one per named position.
 *
 * ## Why the representative repetition and not the most extreme one
 *
 * The table reports the **median across repetitions**. The deepest repetition of
 * eleven is, by definition, deeper than that median — so a still taken there
 * shows a number the table does not contain, and a coach comparing the two finds
 * a discrepancy with no explanation. The repetition whose extreme is closest to
 * the median is the one the table is actually describing.
 *
 * ## Why the landmarks come from here
 *
 * They are the poses the analysis itself measured, carried through the fold.
 * Re-detecting these frames afterwards was measured to disagree by 8–16° — the
 * picture would then contradict its own caption.
 *
 * Returned separately from `MovementResult` on purpose: the result crosses into
 * storage code and must carry no pose data, which a test pins.
 */
export function keyFramesOf(state: EngineState, profile: MovementProfile): readonly KeyFrame[] {
  const frames: KeyFrame[] = [];
  const seen = new Set<number>();

  for (const position of profile.positions) {
    const candidates = state.repFrames
      .map((rep) => rep[position.key])
      .filter((entry): entry is ExtremeFrame => entry !== undefined);

    // No completed repetition — a profile that counts nothing, or a recording
    // cut short. The pending slot still holds the extreme seen so far.
    const pool =
      candidates.length > 0
        ? candidates
        : (() => {
            const pending = state.pendingFrames[position.key];

            return pending === undefined ? [] : [pending];
          })();

    if (pool.length === 0) continue;

    const middle = median(pool.map((entry) => entry.value));
    const chosen = pool.reduce((best, entry) =>
      Math.abs(entry.value - middle) < Math.abs(best.value - middle) ? entry : best,
    );

    // Two identical stills would suggest an arc that was never travelled.
    if (seen.has(chosen.timestampMs)) continue;

    seen.add(chosen.timestampMs);
    frames.push({
      position: position.key,
      timestampMs: chosen.timestampMs,
      landmarks: chosen.landmarks,
    });
  }

  return frames;
}

/**
 * The moments a still image is worth taking at — one per named position.
 *
 * Taken from the smoothed driving signal rather than from the repetition list,
 * because the extremes of the movement lie **outside** the counting thresholds:
 * the athlete stands at 175° and the repetition only starts being counted at
 * 120°. A still taken at the threshold would show a half-squat labelled "Stand".
 */
export function keyMomentsOf(
  signal: readonly SignalPoint[],
  profile: MovementProfile,
): readonly KeyMoment[] {
  const readable = signal.filter(
    (point): point is SignalPoint & { primary: number } =>
      point.primary !== null && Number.isFinite(point.primary),
  );

  if (readable.length === 0) return [];

  const moments: KeyMoment[] = [];
  const seen = new Set<number>();

  for (const position of profile.positions) {
    const found = readable.reduce((best, point) =>
      position.end === 'max'
        ? point.primary > best.primary
          ? point
          : best
        : point.primary < best.primary
          ? point
          : best,
    );

    // Two identical stills would suggest an arc that was never travelled.
    if (seen.has(found.timestampMs)) continue;

    seen.add(found.timestampMs);
    moments.push({ position: position.key, timestampMs: found.timestampMs });
  }

  return moments;
}

/** Analyses a whole sequence at once — the shape a test wants. */
export function analyseMovement(
  frames: readonly PoseFrame[],
  profile: MovementProfile,
  tracks: readonly string[],
  options: EngineOptions = DEFAULT_ENGINE_OPTIONS,
): MovementOutcome {
  return finish(
    frames.reduce(
      (state, frame) => pushPoseFrame(state, frame, profile, tracks, options),
      initialEngineState(profile),
    ),
    profile,
    tracks,
    options,
  );
}
