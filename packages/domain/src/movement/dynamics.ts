import type { MovementRep, SignalPoint } from './engine';

/**
 * How fast each repetition was, derived from what the analysis already measured.
 *
 * ## Why this is arithmetic and not a score
 *
 * Everything here comes from two things the engine already produces: the driving
 * angle over time, and where each repetition started and ended. Splitting a
 * repetition at its turning point gives the lowering phase and the lifting
 * phase; dividing the arc travelled by the time it took gives an angular
 * velocity in degrees per second.
 *
 * That is a measurement, in a unit, with a definition. It is deliberately **not**
 * called explosiveness: power is force times velocity, force needs mass and
 * velocity needs a scale in metres, and a single camera provides neither. An
 * angular velocity is what the recording actually supports, and calling it what
 * it is keeps the record honest.
 *
 * ## Why the trend is first-to-last and nothing cleverer
 *
 * Across a set the question a coach asks is whether the athlete slowed down. The
 * honest answer is the difference between the opening repetitions and the
 * closing ones — no fitted curve, no index, no normalisation against anything
 * that would need a reference population.
 *
 * ## What it refuses
 *
 * A phase sampled too thinly to time, a repetition whose turning point sits at
 * its very edge, and a set too short for a trend. Each of those answers `null`
 * rather than a number, because a tempo computed from two samples would look
 * exactly like one computed from twenty.
 */

/** Fewer usable samples than this in a phase and its duration is not stated. */
const MIN_PHASE_SAMPLES = 3;

/** Fewer repetitions than this and no trend across the set is stated. */
export const MIN_REPS_FOR_TREND = 4;

/** How one repetition was executed. */
export interface RepTempo {
  readonly index: number;
  readonly durationMs: number;
  /** Turning point to end — the lifting phase. `null` where it cannot be timed. */
  readonly concentricMs: number | null;
  /** Start to turning point — the lowering phase. */
  readonly eccentricMs: number | null;
  /** The arc the driving angle travelled, in degrees. */
  readonly rangeDegrees: number | null;
  /**
   * Arc per second of the lifting phase, in degrees per second.
   *
   * Scale-free: an angle is dimensionless, so this needs no calibration and no
   * known distance. It is the fastest thing a single camera can honestly say
   * about how explosively a repetition was performed.
   */
  readonly concentricVelocity: number | null;
}

/** How the set went as a whole. */
export interface SetTempo {
  readonly reps: readonly RepTempo[];
  /** Mean lifting velocity of the opening repetitions, in degrees per second. */
  readonly openingVelocity: number | null;
  /** The same for the closing repetitions. */
  readonly closingVelocity: number | null;
  /**
   * Closing minus opening, as a share of the opening.
   *
   * Negative means the athlete slowed down over the set. `null` where the set is
   * too short to say, which is the normal answer for a handful of repetitions.
   */
  readonly change: number | null;
}

/** The readable samples of one repetition, in time order. */
function samplesOf(
  signal: readonly SignalPoint[],
  rep: MovementRep,
): readonly { timestampMs: number; primary: number }[] {
  return signal
    .filter(
      (point): point is { timestampMs: number; primary: number } =>
        point.primary !== null &&
        point.timestampMs >= rep.startedAtMs &&
        point.timestampMs <= rep.endedAtMs,
    )
    .map((point) => ({ timestampMs: point.timestampMs, primary: point.primary }));
}

/**
 * One repetition, split at its turning point.
 *
 * The turning point is the lowest the driving angle reached — for every profile
 * here the counting rule descends and then ascends, so the minimum is where the
 * movement reversed. A turning point at the very first or very last sample means
 * the repetition was not captured whole, and both phases are then refused rather
 * than one of them being reported as instantaneous.
 */
export function repTempo(signal: readonly SignalPoint[], rep: MovementRep): RepTempo {
  const samples = samplesOf(signal, rep);

  const empty: RepTempo = {
    index: rep.index,
    durationMs: rep.durationMs,
    concentricMs: null,
    eccentricMs: null,
    rangeDegrees: null,
    concentricVelocity: null,
  };

  if (samples.length < MIN_PHASE_SAMPLES * 2) return empty;

  let lowest = 0;
  for (let index = 1; index < samples.length; index += 1) {
    if (samples[index]!.primary < samples[lowest]!.primary) lowest = index;
  }

  // A reversal at the edge means the repetition was clipped by the sampling
  // window, not that a phase took no time.
  if (lowest < MIN_PHASE_SAMPLES - 1 || lowest > samples.length - MIN_PHASE_SAMPLES) return empty;

  const turn = samples[lowest]!;
  const first = samples[0]!;
  const last = samples[samples.length - 1]!;

  const eccentricMs = turn.timestampMs - first.timestampMs;
  const concentricMs = last.timestampMs - turn.timestampMs;

  const highest = Math.max(...samples.map((sample) => sample.primary));
  const rangeDegrees = highest - turn.primary;

  return {
    index: rep.index,
    durationMs: rep.durationMs,
    concentricMs: concentricMs > 0 ? concentricMs : null,
    eccentricMs: eccentricMs > 0 ? eccentricMs : null,
    rangeDegrees,
    concentricVelocity:
      concentricMs > 0 ? Math.round((rangeDegrees / (concentricMs / 1000)) * 10) / 10 : null,
  };
}

const mean = (values: readonly number[]): number | null =>
  values.length === 0 ? null : values.reduce((total, value) => total + value, 0) / values.length;

/**
 * The whole set.
 *
 * Opening and closing are a third of the repetitions each, at least one and at
 * most three: comparing a single first repetition against a single last one puts
 * the whole statement at the mercy of one badly tracked frame.
 */
export function setTempo(signal: readonly SignalPoint[], reps: readonly MovementRep[]): SetTempo {
  const tempos = reps.map((rep) => repTempo(signal, rep));
  const measured = tempos.filter(
    (tempo): tempo is RepTempo & { concentricVelocity: number } =>
      tempo.concentricVelocity !== null,
  );

  if (measured.length < MIN_REPS_FOR_TREND) {
    return { reps: tempos, openingVelocity: null, closingVelocity: null, change: null };
  }

  const span = Math.min(3, Math.max(1, Math.floor(measured.length / 3)));
  const opening = mean(measured.slice(0, span).map((tempo) => tempo.concentricVelocity));
  const closing = mean(measured.slice(-span).map((tempo) => tempo.concentricVelocity));

  return {
    reps: tempos,
    openingVelocity: opening === null ? null : Math.round(opening * 10) / 10,
    closingVelocity: closing === null ? null : Math.round(closing * 10) / 10,
    change:
      opening === null || closing === null || opening === 0
        ? null
        : Math.round(((closing - opening) / opening) * 1000) / 1000,
  };
}

/** Whether a set has anything at all to say about tempo. */
export function hasTempo(tempo: SetTempo): boolean {
  return tempo.reps.some((rep) => rep.concentricVelocity !== null);
}
