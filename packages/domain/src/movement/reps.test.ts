import { describe, expect, it } from 'vitest';

import {
  DEFAULT_REP_OPTIONS,
  initialRepState,
  pushAngle,
  pushFrame,
  repDurationSpreadMs,
  type AngleFrame,
  type RepState,
} from './reps';

/**
 * Counting repetitions from one noisy signal, and measuring the arcs travelled.
 *
 * The failures worth ruling out are all forms of counting something that did
 * not happen: a signal hovering at the threshold, a model twitch, a frame the
 * model never confidently saw. A count that is late is a nuisance; a count that
 * is invented is a lie in a report.
 */

/** Replays a sequence of angles at a fixed frame interval. */
const replay = (
  angles: readonly (number | null)[],
  frameMs = 33,
  state: RepState = initialRepState,
): RepState =>
  angles.reduce<RepState>(
    (current, angle, index) => pushAngle(current, angle, index * frameMs),
    state,
  );

/** One squat: standing, down, up, standing. */
const oneSquat = (frames = 30) => [
  ...Array.from({ length: 5 }, () => 175),
  ...Array.from({ length: frames }, (_entry, index) => 175 - (index * 100) / frames),
  ...Array.from({ length: frames }, (_entry, index) => 75 + (index * 100) / frames),
  ...Array.from({ length: 5 }, () => 175),
];

describe('counting a repetition', () => {
  it('counts one squat once', () => {
    expect(replay(oneSquat()).reps).toHaveLength(1);
  });

  it('counts three squats three times', () => {
    expect(replay([...oneSquat(), ...oneSquat(), ...oneSquat()]).reps).toHaveLength(3);
  });

  it('counts five squats five times', () => {
    // The number the browser QA films, so it is the number a test pins.
    const five = Array.from({ length: 5 }, () => oneSquat()).flat();

    expect(replay(five).reps).toHaveLength(5);
  });

  it('reports the lowest angle it saw', () => {
    // Measured, not judged: how deep is a number, not a verdict.
    const state = replay(oneSquat());

    expect(state.reps[0]?.lowestPrimary).toBeLessThan(80);
  });

  it('reports how long the repetition took', () => {
    // Timed from threshold to threshold, not from the first flicker of
    // movement: the clock starts when the athlete is unambiguously descending
    // and stops when they are unambiguously standing. That makes the number
    // shorter than the movement and — more importantly — reproducible.
    const state = replay(oneSquat(30), 33);

    expect(state.reps[0]?.durationMs).toBeGreaterThan(900);
    expect(state.reps[0]?.durationMs).toBeLessThan(2000);
  });

  it('reports when the repetition started and ended', () => {
    const state = replay(oneSquat(30), 33);
    const rep = state.reps[0];

    expect(rep?.endedAtMs).toBeGreaterThan(rep?.startedAtMs ?? 0);
    expect((rep?.endedAtMs ?? 0) - (rep?.startedAtMs ?? 0)).toBe(rep?.durationMs);
  });

  it('times a slower repetition as longer', () => {
    const quick = replay(oneSquat(20), 33).reps[0]?.durationMs ?? 0;
    const slow = replay(oneSquat(60), 33).reps[0]?.durationMs ?? 0;

    expect(slow).toBeGreaterThan(quick);
  });

  it('numbers the repetitions in order', () => {
    const state = replay([...oneSquat(), ...oneSquat()]);

    expect(state.reps.map((rep) => rep.index)).toEqual([1, 2]);
  });

  it('counts every frame it was given', () => {
    const angles = oneSquat();

    expect(replay(angles).totalFrames).toBe(angles.length);
  });
});

describe('what it refuses to count', () => {
  it('ignores a signal hovering at one threshold', () => {
    // The estimate crosses any single value several times a second while
    // nobody moves. This is what the second threshold is for.
    const hovering = Array.from(
      { length: 200 },
      (_entry, index) => DEFAULT_REP_OPTIONS.descendBelow + (index % 2 === 0 ? 0.4 : -0.4),
    );

    expect(replay([175, ...hovering]).reps).toEqual([]);
  });

  it('ignores a descent that never comes back up', () => {
    // Somebody sitting down is not a repetition until they stand again.
    expect(replay([175, 175, 100, 90, 85, 85, 85]).reps).toEqual([]);
  });

  it('ignores a transition faster than a person can squat', () => {
    // A model twitch: full travel inside two frames.
    expect(replay([175, 80, 175], 33).reps).toEqual([]);
  });

  it('counts the same movement once it takes a plausible time', () => {
    const slow = [175, ...Array.from({ length: 40 }, () => 80), 175];

    expect(replay(slow, 33).reps).toHaveLength(1);
  });

  it('counts nothing before it has seen the athlete standing', () => {
    // Starting mid-squat, the first ascent is not a repetition — nobody saw
    // the descent.
    expect(replay([80, 85, 90, 175]).reps).toEqual([]);
  });

  it('starts counting once standing has been seen', () => {
    const state = replay([80, 85, 175, ...oneSquat()]);

    expect(state.reps).toHaveLength(1);
  });
});

describe('frames the model could not read', () => {
  it('counts them rather than guessing an angle', () => {
    // Carrying the last known angle forward would invent movement.
    const state = replay([175, null, null, 175]);

    expect(state.skippedFrames).toBe(2);
    expect(state.reps).toEqual([]);
  });

  it('treats a non-number the same way', () => {
    expect(replay([175, Number.NaN]).skippedFrames).toBe(1);
  });

  it('carries on where the pose comes back', () => {
    const withGap = [...oneSquat(20), null, null, ...oneSquat(20)];
    const state = replay(withGap);

    expect(state.reps).toHaveLength(2);
    expect(state.skippedFrames).toBe(2);
  });

  it('does not let a gap end a repetition on its own', () => {
    const state = replay([175, 175, 100, null, null, null, 90]);

    expect(state.reps).toEqual([]);
    expect(state.phase).toBe('down');
  });
});

describe('the arc each joint travelled', () => {
  /** A squat carrying a second, shallower joint alongside the driving signal. */
  const frames = (primaries: readonly number[], hipOf: (knee: number) => number): AngleFrame[] =>
    primaries.map((primary, index) => ({
      timestampMs: index * 33,
      primary,
      angles: { knee: primary, hip: hipOf(primary) },
    }));

  const fold = (list: readonly AngleFrame[]): RepState =>
    list.reduce<RepState>((state, frame) => pushFrame(state, frame), initialRepState);

  it('reports the range of every tracked joint, per repetition', () => {
    const state = fold(frames(oneSquat(), (knee) => knee / 2 + 90));
    const rep = state.reps[0];

    expect(rep?.ranges.knee?.range).toBeGreaterThan(50);
    expect(rep?.ranges.hip?.range).toBeGreaterThan(25);
  });

  it('measures the range as the arc, not the depth', () => {
    // max − min, and nothing else: a squat from 170° to 80° travelled 90°,
    // whatever the athlete weighs or intended.
    const state = fold(frames(oneSquat(), (knee) => knee));
    const knee = state.reps[0]?.ranges.knee;

    expect(knee?.range).toBeCloseTo((knee?.max ?? 0) - (knee?.min ?? 0), 6);
  });

  it('keeps each repetition to its own range', () => {
    // Otherwise the arc of the second repetition would include the first.
    const state = fold([
      ...frames(oneSquat(), (knee) => knee),
      ...frames(oneSquat(), (knee) => knee).map((frame, index) => ({
        ...frame,
        timestampMs: 100_000 + index * 33,
      })),
    ]);

    expect(state.reps).toHaveLength(2);
    expect(state.reps[0]?.ranges.knee?.range).toBeCloseTo(
      state.reps[1]?.ranges.knee?.range ?? 0,
      6,
    );
  });

  it('does not widen a range with a joint it could not see', () => {
    // A null is absence, not a zero-degree angle. A zero would make every range
    // look like a full arc.
    const list: AngleFrame[] = [
      { timestampMs: 0, primary: 175, angles: { knee: 175, hip: 170 } },
      { timestampMs: 500, primary: 100, angles: { knee: 100, hip: null } },
      { timestampMs: 1000, primary: 90, angles: { knee: 90, hip: null } },
      { timestampMs: 2000, primary: 175, angles: { knee: 175, hip: 168 } },
    ];

    const hip = fold(list).reps[0]?.ranges.hip;

    // Only the two frames that actually carried a hip angle count: the standing
    // reference and the one closing the repetition. The two in between were
    // invisible, and an invisible joint is not a joint at zero degrees.
    expect(hip?.min).toBeGreaterThan(100);
    expect(hip?.frames).toBe(2);
  });

  it('records nothing for a joint that was never seen', () => {
    const list: AngleFrame[] = [
      { timestampMs: 0, primary: 175, angles: { knee: 175 } },
      { timestampMs: 500, primary: 100, angles: { knee: 100 } },
      { timestampMs: 2000, primary: 175, angles: { knee: 175 } },
    ];

    expect(fold(list).reps[0]?.ranges.hip).toBeUndefined();
  });

  it('forgets the ranges of a repetition it refused to count', () => {
    // A twitch must not leave its arc behind for the next repetition to inherit.
    const twitch: AngleFrame[] = [
      { timestampMs: 0, primary: 175, angles: { knee: 175 } },
      { timestampMs: 33, primary: 60, angles: { knee: 60 } },
      { timestampMs: 66, primary: 175, angles: { knee: 175 } },
    ];

    const state = fold([...twitch, ...frames(oneSquat(), (knee) => knee)]);

    expect(state.reps).toHaveLength(1);
    expect(state.reps[0]?.ranges.knee?.min).toBeGreaterThan(60);
  });
});

describe('the state itself', () => {
  it('starts knowing nothing', () => {
    expect(initialRepState.phase).toBe('unknown');
    expect(initialRepState.reps).toEqual([]);
  });

  it('is never mutated', () => {
    const before = structuredClone(initialRepState);
    pushAngle(initialRepState, 175, 0);

    expect(initialRepState).toEqual(before);
  });

  it('reports the spread of repetition durations', () => {
    const state = replay([...oneSquat(20), ...oneSquat(40)], 33);

    expect(repDurationSpreadMs(state)).toBeGreaterThan(0);
  });

  it('reports no spread below two repetitions', () => {
    expect(repDurationSpreadMs(replay(oneSquat()))).toBeNull();
  });
});
