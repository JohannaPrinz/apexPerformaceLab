import { describe, expect, it } from 'vitest';

import {
  analyseMovement,
  DEFAULT_ENGINE_OPTIONS,
  finish,
  initialEngineState,
  keyFramesOf,
  keyMomentsOf,
  pushPoseFrame,
} from './engine';
import {
  BOTTOM,
  emptyVideo,
  hipAngleOf,
  kneeAngleOf,
  poseOf,
  squatVideo,
  STANDING,
} from './figure.test-helper';
import { SQUAT_PROFILE, type MovementProfile } from './profile';

import type { PoseFrame } from './engine';

/**
 * The engine, driven by a profile and a stick figure.
 *
 * The engine knows nothing about squats — the squat profile is used here because
 * it is the one the platform ships, not because the engine special-cases it. The
 * tests that matter most are the ones that would still pass if the anatomy were
 * wrong: a count that is invented, a range measured between the counting
 * thresholds instead of the athlete's own extremes, a track the coach deselected
 * turning up anyway.
 */

const ALL = SQUAT_PROFILE.tracks.map((track) => track.key);
const KNEE_ONLY = ['knee'];

describe('what the figure is, by construction', () => {
  it('stands nearly straight and bottoms out deep', () => {
    // If these drift the expectations below stop meaning anything.
    expect(kneeAngleOf(STANDING)).toBeCloseTo(175, 6);
    expect(kneeAngleOf(BOTTOM)).toBeCloseTo(80, 6);
    expect(hipAngleOf(STANDING)).toBeCloseTo(175, 6);
    expect(hipAngleOf(BOTTOM)).toBeCloseTo(85, 6);
  });
});

describe('counting repetitions', () => {
  it('counts five squats as five', () => {
    const outcome = analyseMovement(squatVideo(5), SQUAT_PROFILE, ALL);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    expect(outcome.result.repetitions).toBe(5);
  });

  it('counts one as one and numbers them in order', () => {
    const one = analyseMovement(squatVideo(1), SQUAT_PROFILE, ALL);
    const three = analyseMovement(squatVideo(3), SQUAT_PROFILE, ALL);

    expect(one.ok && one.result.repetitions).toBe(1);
    expect(three.ok && three.result.reps.map((rep) => rep.index)).toEqual([1, 2, 3]);
  });

  it('uses the thresholds the profile declares, unchanged', () => {
    // These are the values the squat analysis has always used. A profile that
    // silently re-tuned them would change every historical comparison.
    expect(SQUAT_PROFILE.counting).toMatchObject({
      kind: 'hysteresis',
      track: 'knee',
      descendBelow: 120,
      ascendAbove: 155,
      minRepMs: 600,
    });
  });

  it('counts nothing where the profile counts nothing', () => {
    // A mobility hold has angles worth measuring and no repetitions at all.
    const held: MovementProfile = { ...SQUAT_PROFILE, counting: { kind: 'none' } };
    const outcome = analyseMovement(squatVideo(3), held, ALL);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    expect(outcome.result.repetitions).toBe(0);
    // And it is not refused for having none, which is the point of `none`.
    expect(outcome.result.frames.usable).toBeGreaterThan(0);
  });
});

describe('what it measures', () => {
  it('reports every selected track on both sides', () => {
    const outcome = analyseMovement(squatVideo(3), SQUAT_PROFILE, ALL);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    expect(Object.keys(outcome.result.tracks).sort()).toEqual([
      'ankle_left',
      'ankle_right',
      'hip_left',
      'hip_right',
      'knee_left',
      'knee_right',
    ]);
  });

  it('names the angle at each position the profile declares', () => {
    const outcome = analyseMovement(squatVideo(3), SQUAT_PROFILE, ALL);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const knee = outcome.result.tracks.knee_left;

    expect(knee?.positions.extended).toBeGreaterThan(160);
    expect(knee?.positions.flexed).toBeLessThan(100);
  });

  it('measures the arc from the athlete extremes, not from the thresholds', () => {
    // The repetition is *counted* between 120° and 155°, but the athlete
    // travelled from 175° to 80°. A range of 35° would be a property of this
    // file rather than of the athlete.
    const outcome = analyseMovement(squatVideo(3), SQUAT_PROFILE, ALL);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    expect(outcome.result.tracks.knee_left?.range).toBeGreaterThan(60);
  });

  it('reports a shallower squat as a smaller arc', () => {
    const deep = analyseMovement(squatVideo(3), SQUAT_PROFILE, ALL);
    const shallow = analyseMovement(
      squatVideo(3, { bottom: { shank: 30, thigh: 40, trunk: 25 } }),
      SQUAT_PROFILE,
      ALL,
    );

    expect(deep.ok && shallow.ok).toBe(true);
    if (!deep.ok || !shallow.ok) return;

    expect(deep.result.repetitions).toBe(shallow.result.repetitions);
    expect(shallow.result.tracks.knee_left?.range ?? 0).toBeLessThan(
      deep.result.tracks.knee_left?.range ?? 0,
    );
  });

  it('keeps the knee and the hip apart', () => {
    const outcome = analyseMovement(squatVideo(3), SQUAT_PROFILE, ALL);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    expect(outcome.result.tracks.knee_left?.positions.flexed).not.toBeCloseTo(
      outcome.result.tracks.hip_left?.positions.flexed ?? 0,
      0,
    );
  });

  it('measures the ankle from knee, ankle and toe', () => {
    // The track the profile added. It is geometrically real — three landmarks
    // MediaPipe returns — and its value has to move when the foot does.
    const flat = analyseMovement(squatVideo(3), SQUAT_PROFILE, ALL);
    const lifted = analyseMovement(
      squatVideo(3, { bottom: { ...BOTTOM, foot: 25 } }),
      SQUAT_PROFILE,
      ALL,
    );

    expect(flat.ok && lifted.ok).toBe(true);
    if (!flat.ok || !lifted.ok) return;

    expect(flat.result.tracks.ankle_left?.positions.flexed).not.toBeCloseTo(
      lifted.result.tracks.ankle_left?.positions.flexed ?? 0,
      0,
    );
  });

  it('reports how long each repetition took', () => {
    const outcome = analyseMovement(squatVideo(3, { repFrames: 30, fps: 30 }), SQUAT_PROFILE, ALL);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    expect(outcome.result.meanRepDurationMs).toBeGreaterThan(800);
    expect(outcome.result.meanRepDurationMs).toBeLessThan(2100);

    for (const rep of outcome.result.reps) {
      expect(rep.endedAtMs - rep.startedAtMs).toBe(rep.durationMs);
    }
  });

  it('times a slower set as longer', () => {
    const quick = analyseMovement(squatVideo(3, { repFrames: 20 }), SQUAT_PROFILE, ALL);
    const slow = analyseMovement(squatVideo(3, { repFrames: 60 }), SQUAT_PROFILE, ALL);

    expect(quick.ok && slow.ok).toBe(true);
    if (!quick.ok || !slow.ok) return;

    expect(slow.result.meanRepDurationMs).toBeGreaterThan(quick.result.meanRepDurationMs);
  });
});

describe('the tracks the coach selected', () => {
  it('measures only those', () => {
    const outcome = analyseMovement(squatVideo(3), SQUAT_PROFILE, KNEE_ONLY);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    expect(Object.keys(outcome.result.tracks).sort()).toEqual(['knee_left', 'knee_right']);
  });

  it('still counts repetitions when the driving track is kept', () => {
    const outcome = analyseMovement(squatVideo(4), SQUAT_PROFILE, KNEE_ONLY);

    expect(outcome.ok && outcome.result.repetitions).toBe(4);
  });

  it('counts nothing when the driving track was deselected', () => {
    // Refused rather than reported as zero: the coach removed the signal the
    // count rests on, and a confident 0 would look like the athlete stood still.
    const outcome = analyseMovement(squatVideo(4), SQUAT_PROFILE, ['hip']);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;

    expect(outcome.refusal).toBe('NO_REPETITIONS');
  });

  it('measures nothing at all when everything was deselected', () => {
    const outcome = analyseMovement(squatVideo(3), SQUAT_PROFILE, []);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;

    expect(outcome.refusal).toBe('NO_POSE');
  });
});

describe('orientation', () => {
  it('counts the same repetitions in portrait and in landscape', () => {
    const landscape = analyseMovement(squatVideo(3, { aspectRatio: 16 / 9 }), SQUAT_PROFILE, ALL);
    const portrait = analyseMovement(squatVideo(3, { aspectRatio: 9 / 16 }), SQUAT_PROFILE, ALL);

    expect(landscape.ok && landscape.result.repetitions).toBe(3);
    expect(portrait.ok && portrait.result.repetitions).toBe(3);
  });

  it('produces different angles for a frame declared with the wrong aspect', () => {
    // The failure the aspect argument exists to prevent: a portrait video handed
    // over as landscape is silently wrong, not obviously wrong.
    const right = analyseMovement(squatVideo(2, { aspectRatio: 9 / 16 }), SQUAT_PROFILE, ALL);
    const wrong = analyseMovement(squatVideo(2, { aspectRatio: 16 / 9 }), SQUAT_PROFILE, ALL);

    expect(right.ok && wrong.ok).toBe(true);
    if (!right.ok || !wrong.ok) return;

    expect(right.result.tracks.knee_left?.range).not.toBeCloseTo(
      wrong.result.tracks.knee_left?.range ?? 0,
      0,
    );
  });
});

describe('when there is nothing to measure', () => {
  it('refuses a recording with nobody in it', () => {
    const outcome = analyseMovement(emptyVideo(120), SQUAT_PROFILE, ALL);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;

    expect(outcome.refusal).toBe('NO_POSE');
    expect(outcome.frames.withoutPose).toBe(120);
  });

  it('refuses a recording the model could only read now and then', () => {
    const frames = squatVideo(3).map((frame, index) =>
      index % 3 === 0 ? frame : { ...frame, landmarks: null },
    );

    const outcome = analyseMovement(frames, SQUAT_PROFILE, ALL);

    expect(outcome.ok === false && outcome.refusal).toBe('POSE_TOO_INTERMITTENT');
  });

  it('refuses a clip too short to hold a repetition', () => {
    const outcome = analyseMovement(squatVideo(1).slice(0, 10), SQUAT_PROFILE, ALL);

    expect(outcome.ok === false && outcome.refusal).toBe('TOO_FEW_FRAMES');
    expect(outcome.frames.total).toBe(10);
  });

  it('refuses a recording of somebody standing still', () => {
    const standing = Array.from({ length: 200 }, (_entry, index) => ({
      timestampMs: index * 33,
      landmarks: poseOf(STANDING),
      aspectRatio: 1,
    }));

    expect(analyseMovement(standing, SQUAT_PROFILE, ALL).ok).toBe(false);
  });

  it('refuses a pose the model was unsure about', () => {
    const unsure = squatVideo(3).map((frame) => ({
      ...frame,
      landmarks: poseOf({ ...STANDING, visibility: 0.2 }),
    }));

    expect(analyseMovement(unsure, SQUAT_PROFILE, ALL).ok === false).toBe(true);
  });
});

describe('the fold', () => {
  it('can be folded frame by frame and finished later', () => {
    // What lets a screen show progress instead of freezing for a minute.
    const frames = squatVideo(2);
    const state = frames.reduce(
      (current, frame) => pushPoseFrame(current, frame, SQUAT_PROFILE, ALL),
      initialEngineState(SQUAT_PROFILE),
    );

    expect(finish(state, SQUAT_PROFILE, ALL)).toEqual(analyseMovement(frames, SQUAT_PROFILE, ALL));
  });

  it('counts every frame it was given', () => {
    const frames = squatVideo(1);

    expect(analyseMovement(frames, SQUAT_PROFILE, ALL).frames.total).toBe(frames.length);
  });
});

describe('the moments worth a still image', () => {
  it('offers one per position the profile names', () => {
    const outcome = analyseMovement(squatVideo(3), SQUAT_PROFILE, ALL);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    expect(outcome.result.keyMoments.map((moment) => moment.position)).toEqual([
      'extended',
      'flexed',
    ]);
  });

  it('offers one still where nothing moved', () => {
    // Two identical pictures would suggest an arc that was never travelled.
    expect(keyMomentsOf([{ timestampMs: 0, primary: 175 }], SQUAT_PROFILE)).toHaveLength(1);
  });

  it('offers none where nothing was readable', () => {
    expect(keyMomentsOf([{ timestampMs: 0, primary: null }], SQUAT_PROFILE)).toEqual([]);
  });
});

describe('the stills the analysis hands over', () => {
  it('carries the pose the analysis itself measured', () => {
    // Re-detecting these frames afterwards was measured to disagree by 8–16° on
    // the identical frame. The picture and its caption have to come from one
    // measurement or they contradict each other.
    const state = squatVideo(3).reduce(
      (current, frame) => pushPoseFrame(current, frame, SQUAT_PROFILE, ALL),
      initialEngineState(SQUAT_PROFILE),
    );

    const frames = keyFramesOf(state, SQUAT_PROFILE);

    expect(frames.map((frame) => frame.position)).toEqual(['extended', 'flexed']);
    for (const frame of frames) {
      expect(frame.landmarks.length).toBe(33);
      expect(frame.timestampMs).toBeGreaterThanOrEqual(0);
    }
  });

  it('picks the repetition the table is describing, not the most extreme one', () => {
    // The table reports the median across repetitions. A still taken at the
    // deepest of eleven shows a number the table does not contain.
    const shallow = squatVideo(1, { bottom: { shank: 30, thigh: 40, trunk: 25 } });
    const deep = squatVideo(1);
    const middling = squatVideo(1, { bottom: { shank: 38, thigh: 47, trunk: 32 } });

    const offset = (frames: typeof deep, by: number) =>
      frames.map((frame) => ({ ...frame, timestampMs: frame.timestampMs + by }));

    const state = [...shallow, ...offset(deep, 100000), ...offset(middling, 200000)].reduce(
      (current, frame) => pushPoseFrame(current, frame, SQUAT_PROFILE, ALL),
      initialEngineState(SQUAT_PROFILE),
    );

    const outcome = finish(state, SQUAT_PROFILE, ALL);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const flexedStill = keyFramesOf(state, SQUAT_PROFILE).find(
      (frame) => frame.position === 'flexed',
    );

    // The chosen still belongs to the middle repetition, not the deep one.
    expect(flexedStill?.timestampMs).toBeGreaterThan(200000);
  });

  it('keeps the result itself free of pose data', () => {
    // The result crosses into storage code; the stills do not.
    const outcome = analyseMovement(squatVideo(3), SQUAT_PROFILE, ALL);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const serialised = JSON.stringify(outcome.result);

    expect(serialised).not.toContain('visibility');
    expect(serialised).not.toContain('landmarks');
  });

  it('points the key moments at the same frames the stills use', () => {
    const state = squatVideo(3).reduce(
      (current, frame) => pushPoseFrame(current, frame, SQUAT_PROFILE, ALL),
      initialEngineState(SQUAT_PROFILE),
    );
    const outcome = finish(state, SQUAT_PROFILE, ALL);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    expect(outcome.result.keyMoments.map((moment) => moment.timestampMs)).toEqual(
      keyFramesOf(state, SQUAT_PROFILE).map((frame) => frame.timestampMs),
    );
  });

  it('still offers a still where no repetition completed', () => {
    // A profile that counts nothing, or a recording cut short: the extreme seen
    // so far is better than no picture at all.
    const held = { ...SQUAT_PROFILE, counting: { kind: 'none' } as const };
    const state = squatVideo(2).reduce(
      (current, frame) => pushPoseFrame(current, frame, held, ALL),
      initialEngineState(held),
    );

    expect(keyFramesOf(state, held).length).toBeGreaterThan(0);
  });
});

describe('the options', () => {
  it('ship thresholds a movement can actually cross', () => {
    expect(DEFAULT_ENGINE_OPTIONS.minUsableShare).toBeGreaterThan(0);
    expect(DEFAULT_ENGINE_OPTIONS.minUsableShare).toBeLessThanOrEqual(1);
    expect(DEFAULT_ENGINE_OPTIONS.minVisibility).toBeGreaterThan(0);
  });
});

/**
 * The per-frame record an annotated export is drawn from.
 *
 * What has to hold is one thing above all: the numbers on a frame are the
 * numbers the analysis measured, not numbers something else worked out later.
 * That is the failure the still image already had once — a caption disagreeing
 * with its own picture by 8–16° — and an exported video would carry it into an
 * athlete's hands.
 */
describe('the annotated frame', () => {
  const push = (frames: readonly PoseFrame[], tracks: readonly string[] = ALL) =>
    frames.reduce(
      (state, frame) => pushPoseFrame(state, frame, SQUAT_PROFILE, tracks),
      initialEngineState(SQUAT_PROFILE),
    );

  it('is absent before anything has been read', () => {
    expect(initialEngineState(SQUAT_PROFILE).lastFrame).toBeNull();
  });

  it('carries the angles the result is built from, not a fresh calculation', () => {
    const frames = squatVideo(3);
    const state = push(frames);
    const outcome = finish(state, SQUAT_PROFILE, ALL);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    const frame = state.lastFrame;
    expect(frame).not.toBeNull();
    if (frame === null) return;

    // The very keys the engine measures under, and nothing invented beside them.
    expect(Object.keys(frame.angles).sort()).toEqual(
      ALL.flatMap((track) => [`${track}_left`, `${track}_right`]).sort(),
    );

    // The last frame of the recording is the athlete standing, so the knee is
    // near its standing angle rather than somewhere in between.
    expect(frame.angles['knee_left']).toBeCloseTo(kneeAngleOf(STANDING), 0);
  });

  it('holds only the tracks the coach kept', () => {
    const state = push(squatVideo(2), KNEE_ONLY);

    expect(Object.keys(state.lastFrame?.angles ?? {})).toEqual(['knee_left', 'knee_right']);
  });

  it('names the repetition under way, and counts the finished ones between', () => {
    const frames = squatVideo(2);

    // Walked frame by frame so both states are actually observed: mid-descent,
    // and standing again afterwards.
    let state = initialEngineState(SQUAT_PROFILE);
    const seen: { inProgress: number | null; completed: number }[] = [];

    for (const frame of frames) {
      state = pushPoseFrame(state, frame, SQUAT_PROFILE, ALL);
      const last = state.lastFrame;
      if (last) seen.push({ inProgress: last.repInProgress, completed: last.completedReps });
    }

    // A repetition in progress is always the one after the last completed.
    for (const entry of seen) {
      if (entry.inProgress !== null) expect(entry.inProgress).toBe(entry.completed + 1);
    }

    expect(seen.some((entry) => entry.inProgress === 1)).toBe(true);
    expect(seen.some((entry) => entry.inProgress === 2)).toBe(true);
    expect(seen.at(-1)?.completed).toBe(2);
  });

  it('reports a frame the model could not read without inventing angles', () => {
    const state = push([
      ...squatVideo(1),
      { timestampMs: 99_999, landmarks: null, aspectRatio: 1 },
    ]);

    expect(state.lastFrame?.landmarks).toBeNull();
    expect(state.lastFrame?.angles).toEqual({});
    expect(state.lastFrame?.signal).toBeNull();
  });

  it('never leaks pose data into the result', () => {
    const outcome = finish(push(squatVideo(3)), SQUAT_PROFILE, ALL);

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;

    // The result crosses into storage code. Whatever the export needs, it does
    // not travel this way.
    expect(JSON.stringify(outcome.result)).not.toContain('visibility');
    expect('landmarks' in outcome.result).toBe(false);
  });
});
