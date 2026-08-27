/**
 * Counting squat repetitions from one angle signal.
 *
 * ## Two thresholds, not one
 *
 * A single threshold counts a repetition every time the signal crosses it —
 * and the pose estimate crosses any single value several times per second
 * while the athlete stands still at that depth. Two thresholds with a gap
 * between them (hysteresis) means the signal has to travel the whole way down
 * and the whole way back before anything is counted.
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
 * lowest angle reached, because that is what was measured; whether that depth
 * is appropriate for this athlete is not something an angle knows.
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

export interface CompletedRep {
  readonly index: number;
  /** The lowest angle reached, in degrees. Measured, not judged. */
  readonly lowestAngle: number;
  readonly durationMs: number;
}

export interface RepState {
  /** `unknown` until the signal has been above `ascendAbove` once. */
  readonly phase: 'unknown' | 'up' | 'down';
  readonly reps: readonly CompletedRep[];
  /** When the current descent began. */
  readonly descentStartedMs: number | null;
  readonly lowestThisRep: number | null;
  /** Frames dropped because the pose was not confidently seen. */
  readonly skippedFrames: number;
}

export const initialRepState: RepState = {
  phase: 'unknown',
  reps: [],
  descentStartedMs: null,
  lowestThisRep: null,
  skippedFrames: 0,
};

/**
 * Folds one frame into the state.
 *
 * Pure and clock-free: the timestamp is passed in, so a whole session can be
 * replayed in a test without waiting for it.
 */
export function pushAngle(
  state: RepState,
  angle: number | null,
  timestampMs: number,
  options: RepOptions = DEFAULT_REP_OPTIONS,
): RepState {
  // A frame without a usable angle is counted and otherwise ignored. Carrying
  // the last known angle forward would invent movement that was never seen.
  if (angle === null || !Number.isFinite(angle)) {
    return { ...state, skippedFrames: state.skippedFrames + 1 };
  }

  if (state.phase === 'unknown') {
    return angle >= options.ascendAbove ? { ...state, phase: 'up' } : state;
  }

  if (state.phase === 'up') {
    if (angle > options.descendBelow) return state;

    return {
      ...state,
      phase: 'down',
      descentStartedMs: timestampMs,
      lowestThisRep: angle,
    };
  }

  // Descending or at the bottom: keep the lowest angle seen.
  const lowest = Math.min(state.lowestThisRep ?? angle, angle);

  if (angle < options.ascendAbove) return { ...state, lowestThisRep: lowest };

  const durationMs = timestampMs - (state.descentStartedMs ?? timestampMs);

  // Too fast to be a repetition. Back to standing without counting it, and
  // without pretending the descent happened.
  if (durationMs < options.minRepMs) {
    return { ...state, phase: 'up', descentStartedMs: null, lowestThisRep: null };
  }

  return {
    phase: 'up',
    reps: [...state.reps, { index: state.reps.length + 1, lowestAngle: lowest, durationMs }],
    descentStartedMs: null,
    lowestThisRep: null,
    skippedFrames: state.skippedFrames,
  };
}

/** The spread of repetition durations, or `null` below two repetitions. */
export function repDurationSpreadMs(state: RepState): number | null {
  if (state.reps.length < 2) return null;

  const durations = state.reps.map((rep) => rep.durationMs);

  return Math.max(...durations) - Math.min(...durations);
}
