/**
 * Counting repetitions, and measuring what happened during each one.
 *
 * ## Two thresholds, not one
 *
 * A single threshold counts a repetition every time the signal crosses it —
 * and the pose estimate crosses any single value several times per second
 * while the athlete stands still at that depth. Two thresholds with a gap
 * between them (hysteresis) means the signal has to travel the whole way down
 * and the whole way back before anything is counted.
 *
 * ## Why a frame carries more than one angle
 *
 * Repetitions are counted from **one** signal — the knee, for a squat — because
 * a state machine fed two signals has to decide what to do when they disagree,
 * and there is no honest answer to that. But the arc a joint travelled is
 * wanted for several joints at once, and those arcs only mean anything *within*
 * a repetition: the hip range of "the whole video" includes walking to the bar.
 * So every frame carries the driving signal and every tracked angle, and each
 * completed repetition reports the range of each.
 *
 * ## What it refuses to count
 *
 * A transition faster than a person can squat, and a repetition whose frames
 * were never confidently seen. Both are the model twitching, not the athlete
 * moving, and a count that includes them is worse than a count that is late.
 *
 * ## What it does not do
 *
 * It does not say whether a repetition was good. Depth is reported as the
 * lowest angle reached and range as the arc travelled, because those are what
 * was measured; whether either is appropriate for this athlete is not something
 * an angle knows.
 */

export interface RepOptions {
  /** Below this the athlete counts as down. */
  readonly descendBelow: number;
  /** Above this they count as up again. The gap to `descendBelow` is what
   *  stops a signal hovering at one value from counting repeatedly. */
  readonly ascendAbove: number;
  /** A full repetition faster than this is treated as noise. */
  readonly minRepMs: number;
}

export const DEFAULT_REP_OPTIONS: RepOptions = {
  // A squat that reaches 120° has clearly descended without demanding a depth
  // nobody asked for; 155° is standing without demanding a locked knee.
  descendBelow: 120,
  ascendAbove: 155,
  minRepMs: 600,
};

/**
 * One frame of the movement.
 *
 * `primary` is the signal repetitions are counted from; `angles` is everything
 * whose range is worth reporting, keyed by joint, and normally contains the
 * primary signal as one of its entries. A key missing from `angles`, or present
 * with `null`, is a joint this frame could not see — never a zero.
 */
export interface AngleFrame {
  readonly timestampMs: number;
  readonly primary: number | null;
  readonly angles: Readonly<Record<string, number | null>>;
}

/** The arc one joint travelled through, in degrees. */
export interface AngleRange {
  readonly min: number;
  readonly max: number;
  /** `max - min`. Stored rather than derived so a consumer cannot forget it. */
  readonly range: number;
  /** How many frames this range rests on. One frame is not a range. */
  readonly frames: number;
}

export interface CompletedRep {
  readonly index: number;
  /** When the descent crossed the threshold, and when the ascent left it. */
  readonly startedAtMs: number;
  readonly endedAtMs: number;
  readonly durationMs: number;
  /** The lowest value the driving signal reached. Measured, not judged. */
  readonly lowestPrimary: number;
  /** Joint key → the arc it travelled during this repetition. */
  readonly ranges: Readonly<Record<string, AngleRange>>;
}

export interface RepState {
  /** `unknown` until the signal has been above `ascendAbove` once. */
  readonly phase: 'unknown' | 'up' | 'down';
  readonly reps: readonly CompletedRep[];
  /** When the current descent began. */
  readonly descentStartedMs: number | null;
  readonly lowestThisRep: number | null;
  /** The ranges accumulating for the repetition in progress. */
  readonly rangesThisRep: Readonly<Record<string, AngleRange>>;
  /**
   * The most upright angle each joint reached while standing, since the last
   * repetition ended.
   *
   * Without this a "range of motion" would run from the counting threshold to
   * the bottom and back — an arc of the thresholds, not of the athlete. Only
   * the **maximum** is taken from the standing phase: a coach shifting their
   * weight between sets must not lower the top of the next arc.
   */
  readonly standingAngles: Readonly<Record<string, number>>;
  /** Frames dropped because the pose was not confidently seen. */
  readonly skippedFrames: number;
  /** Frames folded in, whether or not the pose was readable. */
  readonly totalFrames: number;
}

export const initialRepState: RepState = {
  phase: 'unknown',
  reps: [],
  descentStartedMs: null,
  lowestThisRep: null,
  rangesThisRep: {},
  standingAngles: {},
  skippedFrames: 0,
  totalFrames: 0,
};

/** Folds one frame of angles into the running ranges. */
function extend(
  ranges: Readonly<Record<string, AngleRange>>,
  angles: Readonly<Record<string, number | null>>,
): Record<string, AngleRange> {
  const next: Record<string, AngleRange> = { ...ranges };

  for (const [joint, angle] of Object.entries(angles)) {
    // A joint the frame could not see contributes nothing. Substituting the
    // last known value would widen a range with movement nobody observed.
    if (angle === null || !Number.isFinite(angle)) continue;

    const current = next[joint];

    if (current === undefined) {
      next[joint] = { min: angle, max: angle, range: 0, frames: 1 };
      continue;
    }

    const min = Math.min(current.min, angle);
    const max = Math.max(current.max, angle);

    next[joint] = { min, max, range: max - min, frames: current.frames + 1 };
  }

  return next;
}

/** Keeps the most upright angle seen per joint. */
function raise(
  standing: Readonly<Record<string, number>>,
  angles: Readonly<Record<string, number | null>>,
): Record<string, number> {
  const next: Record<string, number> = { ...standing };

  for (const [joint, angle] of Object.entries(angles)) {
    if (angle === null || !Number.isFinite(angle)) continue;
    next[joint] = Math.max(next[joint] ?? angle, angle);
  }

  return next;
}

/** Turns the standing reference into the seed of a repetition's ranges. */
function seed(standing: Readonly<Record<string, number>>): Record<string, AngleRange> {
  return Object.fromEntries(
    Object.entries(standing).map(([joint, angle]) => [
      joint,
      { min: angle, max: angle, range: 0, frames: 1 },
    ]),
  );
}

/**
 * Folds one frame into the state.
 *
 * Pure and clock-free: the timestamp travels with the frame, so a whole session
 * can be replayed in a test without waiting for it — and a recorded video can be
 * replayed faster than real time, which is the entire point of analysing one.
 */
export function pushFrame(
  state: RepState,
  frame: AngleFrame,
  options: RepOptions = DEFAULT_REP_OPTIONS,
): RepState {
  const counted = { ...state, totalFrames: state.totalFrames + 1 };
  const angle = frame.primary;

  // A frame without a usable driving signal is counted and otherwise ignored.
  // Carrying the last known angle forward would invent movement that was never
  // seen — and the other joints are not folded in either, because a frame the
  // model could not read is not partial evidence, it is none.
  if (angle === null || !Number.isFinite(angle)) {
    return { ...counted, skippedFrames: state.skippedFrames + 1 };
  }

  if (counted.phase === 'unknown') {
    return angle >= options.ascendAbove
      ? { ...counted, phase: 'up', standingAngles: raise({}, frame.angles) }
      : counted;
  }

  if (counted.phase === 'up') {
    if (angle > options.descendBelow) {
      return { ...counted, standingAngles: raise(counted.standingAngles, frame.angles) };
    }

    return {
      ...counted,
      phase: 'down',
      descentStartedMs: frame.timestampMs,
      lowestThisRep: angle,
      rangesThisRep: extend(seed(counted.standingAngles), frame.angles),
    };
  }

  // Descending or at the bottom: keep the lowest driving angle and widen every
  // tracked range.
  const lowest = Math.min(counted.lowestThisRep ?? angle, angle);
  const ranges = extend(counted.rangesThisRep, frame.angles);

  if (angle < options.ascendAbove) {
    return { ...counted, lowestThisRep: lowest, rangesThisRep: ranges };
  }

  const startedAtMs = counted.descentStartedMs ?? frame.timestampMs;
  const durationMs = frame.timestampMs - startedAtMs;

  // Too fast to be a repetition. Back to standing without counting it, and
  // without pretending the descent happened.
  if (durationMs < options.minRepMs) {
    return {
      ...counted,
      phase: 'up',
      descentStartedMs: null,
      lowestThisRep: null,
      rangesThisRep: {},
      standingAngles: raise({}, frame.angles),
    };
  }

  return {
    ...counted,
    phase: 'up',
    reps: [
      ...counted.reps,
      {
        index: counted.reps.length + 1,
        startedAtMs,
        endedAtMs: frame.timestampMs,
        durationMs,
        lowestPrimary: lowest,
        ranges,
      },
    ],
    descentStartedMs: null,
    lowestThisRep: null,
    rangesThisRep: {},
    standingAngles: raise({}, frame.angles),
  };
}

/**
 * The single-signal entry point.
 *
 * Kept because the live camera counts from one angle and has no second joint to
 * report — and because it is the narrower promise: no ranges in, no ranges out.
 */
export function pushAngle(
  state: RepState,
  angle: number | null,
  timestampMs: number,
  options: RepOptions = DEFAULT_REP_OPTIONS,
): RepState {
  return pushFrame(state, { timestampMs, primary: angle, angles: {} }, options);
}

/** The spread of repetition durations, or `null` below two repetitions. */
export function repDurationSpreadMs(state: RepState): number | null {
  if (state.reps.length < 2) return null;

  const durations = state.reps.map((rep) => rep.durationMs);

  return Math.max(...durations) - Math.min(...durations);
}
