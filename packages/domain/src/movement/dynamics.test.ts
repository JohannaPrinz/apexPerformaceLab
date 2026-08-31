import { describe, expect, it } from 'vitest';

import { hasTempo, MIN_REPS_FOR_TREND, repTempo, setTempo } from './dynamics';

import type { MovementRep, SignalPoint } from './engine';

/**
 * How fast a repetition was, from what the analysis already measured.
 *
 * The rule under test is refusal: a phase sampled too thinly, a repetition
 * clipped by the sampling window, and a set too short for a trend each answer
 * `null`. A tempo computed from two samples looks exactly like one computed from
 * twenty, and the difference is the whole reason a coach would trust it.
 */

/** One repetition as a V: down to `low`, back up to `high`, evenly sampled. */
function vShape(
  startMs: number,
  samples: number,
  stepMs: number,
  high: number,
  low: number,
): SignalPoint[] {
  const points: SignalPoint[] = [];
  const half = Math.floor(samples / 2);

  for (let index = 0; index < samples; index += 1) {
    const share = index <= half ? index / half : (samples - 1 - index) / (samples - 1 - half);
    points.push({ timestampMs: startMs + index * stepMs, primary: high - (high - low) * share });
  }

  return points;
}

const rep = (index: number, startedAtMs: number, endedAtMs: number): MovementRep => ({
  index,
  startedAtMs,
  endedAtMs,
  durationMs: endedAtMs - startedAtMs,
});

describe('one repetition', () => {
  const signal = vShape(0, 21, 50, 170, 70);
  const only = rep(0, 0, 1000);

  it('splits it at the turning point', () => {
    const tempo = repTempo(signal, only);

    // Twenty-one samples at 50 ms: the lowest sits at 500 ms, so both phases
    // are half a second.
    expect(tempo.eccentricMs).toBe(500);
    expect(tempo.concentricMs).toBe(500);
  });

  it('measures the arc the driving angle travelled', () => {
    expect(repTempo(signal, only).rangeDegrees).toBe(100);
  });

  it('states the lifting phase as degrees per second', () => {
    // 100° in 0.5 s.
    expect(repTempo(signal, only).concentricVelocity).toBe(200);
  });

  it('refuses a repetition with too few samples to time', () => {
    const thin = vShape(0, 4, 50, 170, 70);

    expect(repTempo(thin, rep(0, 0, 200)).concentricVelocity).toBeNull();
    expect(repTempo(thin, rep(0, 0, 200)).concentricMs).toBeNull();
  });

  it('refuses a repetition whose reversal sits at its edge', () => {
    // Monotonically falling: the lowest is the last sample, so the lift was
    // never recorded and reporting it as instantaneous would be a fiction.
    const clipped: SignalPoint[] = Array.from({ length: 12 }, (_entry, index) => ({
      timestampMs: index * 50,
      primary: 170 - index * 8,
    }));

    expect(repTempo(clipped, rep(0, 0, 600)).concentricVelocity).toBeNull();
  });

  it('ignores frames where the model saw nobody', () => {
    const gapped: SignalPoint[] = [
      ...vShape(0, 21, 50, 170, 70),
      { timestampMs: 1050, primary: null },
    ];

    expect(repTempo(gapped, rep(0, 0, 1100)).rangeDegrees).toBe(100);
  });

  it('keeps the repetition it was asked about and no other', () => {
    const two = [...vShape(0, 21, 50, 170, 70), ...vShape(1050, 21, 50, 170, 120)];

    expect(repTempo(two, rep(1, 1050, 2050)).rangeDegrees).toBe(50);
  });
});

describe('a whole set', () => {
  /** Repetitions that get slower: each lift takes longer than the last. */
  function slowingSet(count: number) {
    const signal: SignalPoint[] = [];
    const reps: MovementRep[] = [];
    let clock = 0;

    for (let index = 0; index < count; index += 1) {
      const step = 40 + index * 10;
      const samples = 21;
      signal.push(...vShape(clock, samples, step, 170, 70));
      const length = (samples - 1) * step;
      reps.push(rep(index, clock, clock + length));
      clock += length + 200;
    }

    return { signal, reps };
  }

  it('reports a repetition for every one it was given', () => {
    const { signal, reps } = slowingSet(6);

    expect(setTempo(signal, reps).reps).toHaveLength(6);
  });

  it('notices that the athlete slowed down over the set', () => {
    const { signal, reps } = slowingSet(6);
    const tempo = setTempo(signal, reps);

    expect(tempo.openingVelocity).not.toBeNull();
    expect(tempo.closingVelocity).not.toBeNull();
    expect(tempo.closingVelocity!).toBeLessThan(tempo.openingVelocity!);
    expect(tempo.change!).toBeLessThan(0);
  });

  it('says nothing about a trend for a set that is too short', () => {
    const { signal, reps } = slowingSet(MIN_REPS_FOR_TREND - 1);
    const tempo = setTempo(signal, reps);

    expect(tempo.change).toBeNull();
    expect(tempo.openingVelocity).toBeNull();
    expect(tempo.closingVelocity).toBeNull();
  });

  it('still reports the individual repetitions of a short set', () => {
    const { signal, reps } = slowingSet(2);

    expect(setTempo(signal, reps).reps[0]?.concentricVelocity).not.toBeNull();
  });

  it('says nothing at all where no repetition could be timed', () => {
    const tempo = setTempo([], [rep(0, 0, 1000)]);

    expect(hasTempo(tempo)).toBe(false);
    expect(tempo.change).toBeNull();
  });

  it('knows when it has something to show', () => {
    const { signal, reps } = slowingSet(5);

    expect(hasTempo(setTempo(signal, reps))).toBe(true);
  });
});
