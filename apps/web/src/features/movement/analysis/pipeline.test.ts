import { describe, expect, it, vi } from 'vitest';

import { POSE_LANDMARKS, SQUAT_PROFILE, type Landmark } from '@apex/domain';

import {
  analyseClip,
  aspectRatioOf,
  DEFAULT_SAMPLE_FPS,
  frameCountOf,
  type FrameReader,
  type VideoClip,
} from './pipeline';

/**
 * Driving a recording past the model.
 *
 * The reader is faked, and that is the point: what has to hold here is the
 * behaviour a browser makes almost impossible to provoke on purpose — a frame
 * the decoder refused, a coach pressing stop half way, a video whose length the
 * container lied about. Each of those, handled wrongly, either loses an analysis
 * that was nearly finished or reports one that never happened.
 */

const DEG = Math.PI / 180;

/** The same stick figure the domain tests use, at a given depth. */
function poseAt(depth: number, visibility = 1): Landmark[] {
  const shank = 2 + 43 * depth;
  const thigh = 3 + 52 * depth;
  const trunk = 2 + 38 * depth;

  const point = (x: number, y: number): Landmark => ({ x, y, z: 0, visibility });

  const ankle = { x: 0.5, y: 0.9 };
  const knee = {
    x: ankle.x + 0.2 * Math.sin(shank * DEG),
    y: ankle.y - 0.2 * Math.cos(shank * DEG),
  };
  const hip = {
    x: knee.x - 0.2 * Math.sin(thigh * DEG),
    y: knee.y - 0.2 * Math.cos(thigh * DEG),
  };
  const shoulder = {
    x: hip.x + 0.28 * Math.sin(trunk * DEG),
    y: hip.y - 0.28 * Math.cos(trunk * DEG),
  };

  const pose: Landmark[] = Array.from({ length: 33 }, () => point(0, 0));

  const place = (role: keyof typeof POSE_LANDMARKS, at: { x: number; y: number }) => {
    pose[POSE_LANDMARKS[role].left] = point(at.x, at.y);
    pose[POSE_LANDMARKS[role].right] = point(at.x + 0.01, at.y);
  };

  place('shoulder', shoulder);
  place('hip', hip);
  place('knee', knee);
  place('ankle', ankle);
  place('heel', { x: ankle.x - 0.03, y: ankle.y });
  place('footIndex', { x: ankle.x + 0.09, y: ankle.y });

  return pose;
}

/** How deep the athlete is at a moment, for `reps` squats over `durationMs`. */
function depthAt(timeMs: number, reps: number, durationMs: number): number {
  const cycle = durationMs / reps;
  const phase = (timeMs % cycle) / cycle;

  // A triangle: down for the first half, up for the second, with a pause at the
  // top so the counter sees standing between repetitions.
  if (phase < 0.1 || phase > 0.9) return 0;
  if (phase < 0.5) return (phase - 0.1) / 0.4;

  return 1 - (phase - 0.5) / 0.4;
}

const CLIP: VideoClip = { durationMs: 12_000, width: 1920, height: 1080 };
const PORTRAIT: VideoClip = { durationMs: 12_000, width: 1080, height: 1920 };

/** A reader over a synthetic recording of `reps` squats. */
function fakeReader(
  reps: number,
  options: {
    clip?: VideoClip;
    visibility?: number;
    /** Positions where the reader throws, as a predicate on the frame index. */
    failAt?: (index: number) => boolean;
    /** Positions where the model finds nobody. */
    emptyAt?: (index: number) => boolean;
  } = {},
): FrameReader & { calls: number[] } {
  const clip = options.clip ?? CLIP;
  const calls: number[] = [];

  return {
    clip,
    calls,
    readAt(timeMs: number) {
      const index = calls.length;
      calls.push(timeMs);

      if (options.failAt?.(index) === true) return Promise.reject(new Error('decoder gave up'));
      if (options.emptyAt?.(index) === true) return Promise.resolve(null);

      return Promise.resolve(
        poseAt(depthAt(timeMs, reps, clip.durationMs), options.visibility ?? 1),
      );
    },
  };
}

/**
 * A yield that costs nothing.
 *
 * The real one is a `setTimeout`, and a test that exercised it on every frame of
 * every case would spend a minute waiting for the timer queue. The two tests
 * that are *about* yielding use the real one; everything else says so explicitly
 * rather than quietly depending on the timer.
 */
const noYield = () => Promise.resolve();

/** Every track the shipped profile offers. */
const TRACKS = SQUAT_PROFILE.tracks.map((track) => track.key);

/** `analyseClip` with the profile and tracks these tests always use. */
const analyseClip2 = (reader: FrameReader, options: Parameters<typeof analyseClip>[3] = {}) =>
  analyseClip(reader, SQUAT_PROFILE, TRACKS, options);

/** A clock that advances a fixed amount per call, so nothing waits. */
function fakeClock(stepMs = 20) {
  let t = 0;

  return () => {
    t += stepMs;

    return t;
  };
}

describe('reading the recording', () => {
  it('samples the whole clip at the requested rate', async () => {
    const reader = fakeReader(5);
    await analyseClip(reader, SQUAT_PROFILE, TRACKS, {
      sampleFps: 10,
      now: fakeClock(),
      yieldControl: noYield,
    });

    expect(reader.calls).toHaveLength(frameCountOf(CLIP, 10));
    expect(reader.calls[0]).toBe(0);
    expect(reader.calls.at(-1)).toBeLessThanOrEqual(CLIP.durationMs);
  });

  it('never asks for the same moment twice, and never goes backwards', async () => {
    // `detectForVideo` refuses a timestamp that is not ahead of the last one.
    const reader = fakeReader(5);
    await analyseClip(reader, SQUAT_PROFILE, TRACKS, {
      sampleFps: 15,
      now: fakeClock(),
      yieldControl: noYield,
    });

    for (let index = 1; index < reader.calls.length; index += 1) {
      expect(reader.calls[index]).toBeGreaterThan(reader.calls[index - 1] ?? 0);
    }
  });

  it('does fewer inferences at a lower sample rate', async () => {
    // The first lever when a real device is slow.
    const fast = fakeReader(5);
    const slow = fakeReader(5);

    await analyseClip(fast, SQUAT_PROFILE, TRACKS, {
      sampleFps: 30,
      now: fakeClock(),
      yieldControl: noYield,
    });
    await analyseClip(slow, SQUAT_PROFILE, TRACKS, {
      sampleFps: 10,
      now: fakeClock(),
      yieldControl: noYield,
    });

    expect(slow.calls.length).toBeLessThan(fast.calls.length);
  });

  it('counts five squats in a recording of five', async () => {
    const run = await analyseClip2(fakeReader(5), { now: fakeClock(), yieldControl: noYield });

    expect(run.kind).toBe('done');
    if (run.kind !== 'done') return;

    expect(run.outcome.ok).toBe(true);
    if (!run.outcome.ok) return;

    expect(run.outcome.result.repetitions).toBe(5);
  });
});

describe('orientation', () => {
  it('takes the aspect ratio from the displayed dimensions', () => {
    expect(aspectRatioOf(CLIP)).toBeCloseTo(16 / 9, 6);
    expect(aspectRatioOf(PORTRAIT)).toBeCloseTo(9 / 16, 6);
  });

  it('never divides by a height of zero', () => {
    // A video element reports 0×0 before metadata arrives; an aspect ratio of
    // Infinity would make every angle NaN and the screen would show nothing at
    // all rather than an error.
    expect(aspectRatioOf({ durationMs: 1000, width: 1920, height: 0 })).toBe(1);
  });

  it('counts the same repetitions in portrait and in landscape', async () => {
    const landscape = await analyseClip2(fakeReader(4), {
      now: fakeClock(),
      yieldControl: noYield,
    });
    const portrait = await analyseClip2(fakeReader(4, { clip: PORTRAIT }), {
      now: fakeClock(),
      yieldControl: noYield,
    });

    expect(
      landscape.kind === 'done' && landscape.outcome.ok && landscape.outcome.result.repetitions,
    ).toBe(4);
    expect(
      portrait.kind === 'done' && portrait.outcome.ok && portrait.outcome.result.repetitions,
    ).toBe(4);
  });
});

describe('progress', () => {
  it('reports every frame, ending at the total', async () => {
    const seen: number[] = [];
    await analyseClip2(fakeReader(3), {
      sampleFps: 10,
      now: fakeClock(),
      yieldControl: noYield,
      onProgress: (progress) => seen.push(progress.processedFrames),
    });

    expect(seen[0]).toBe(1);
    expect(seen.at(-1)).toBe(frameCountOf(CLIP, 10));
  });

  it('never reports more frames than it will do', async () => {
    const overshoots: boolean[] = [];
    await analyseClip2(fakeReader(3), {
      now: fakeClock(),
      yieldControl: noYield,
      onProgress: (progress) => overshoots.push(progress.processedFrames > progress.totalFrames),
    });

    expect(overshoots).not.toContain(true);
  });

  it('reports where in the recording it is', async () => {
    let last = -1;
    await analyseClip2(fakeReader(3), {
      now: fakeClock(),
      yieldControl: noYield,
      onProgress: (progress) => {
        last = progress.positionMs;
      },
    });

    expect(last).toBeGreaterThan(CLIP.durationMs * 0.9);
    expect(last).toBeLessThanOrEqual(CLIP.durationMs);
  });

  it('separates inference time from the frame count', async () => {
    // The number that decides whether a Web Worker is worth building.
    const run = await analyseClip2(fakeReader(3), {
      sampleFps: 10,
      now: fakeClock(50),
      yieldControl: noYield,
    });

    expect(run.kind).toBe('done');
    if (run.kind !== 'done') return;

    expect(run.progress.inferenceMs).toBeGreaterThan(0);
    expect(run.progress.worstInferenceMs).toBeGreaterThanOrEqual(run.progress.inferenceMs);
    expect(run.progress.elapsedMs).toBeGreaterThan(run.progress.inferenceMs);
  });
});

describe('stopping', () => {
  it('stops when the coach asks it to', async () => {
    const controller = new AbortController();
    const reader = fakeReader(5);

    const original = reader.readAt.bind(reader);
    reader.readAt = (timeMs: number) => {
      if (reader.calls.length >= 20) controller.abort();

      return original(timeMs);
    };

    const run = await analyseClip(reader, SQUAT_PROFILE, TRACKS, {
      signal: controller.signal,
      now: fakeClock(),
      yieldControl: noYield,
    });

    expect(run.kind).toBe('cancelled');
    expect(reader.calls.length).toBeLessThan(frameCountOf(CLIP, DEFAULT_SAMPLE_FPS));
  });

  it('keeps what it already measured when stopped', async () => {
    const controller = new AbortController();
    const reader = fakeReader(5);

    const original = reader.readAt.bind(reader);
    reader.readAt = (timeMs: number) => {
      if (timeMs > 8000) controller.abort();

      return original(timeMs);
    };

    const run = await analyseClip(reader, SQUAT_PROFILE, TRACKS, {
      signal: controller.signal,
      now: fakeClock(),
      yieldControl: noYield,
    });

    expect(run.kind).toBe('cancelled');
    if (run.kind !== 'cancelled') return;

    // Three of the five repetitions were already complete; throwing them away
    // would punish a coach for stopping a long analysis.
    expect(run.outcome.ok).toBe(true);
    if (!run.outcome.ok) return;

    expect(run.outcome.result.repetitions).toBeGreaterThanOrEqual(2);
  });

  it('does nothing at all when aborted before the first frame', async () => {
    const controller = new AbortController();
    controller.abort();

    const reader = fakeReader(5);
    const run = await analyseClip(reader, SQUAT_PROFILE, TRACKS, {
      signal: controller.signal,
      now: fakeClock(),
      yieldControl: noYield,
    });

    expect(reader.calls).toHaveLength(0);
    expect(run.kind).toBe('cancelled');
  });
});

describe('frames that go wrong', () => {
  it('treats a frame the decoder refused as a frame without a pose', async () => {
    const reader = fakeReader(5, { failAt: (index) => index % 20 === 7 });
    const run = await analyseClip(reader, SQUAT_PROFILE, TRACKS, {
      now: fakeClock(),
      yieldControl: noYield,
    });

    expect(run.kind).toBe('done');
    if (run.kind !== 'done') return;

    // Counted, not skipped: a tally that hid them would claim the recording was
    // cleaner than it was.
    expect(run.outcome.frames.withoutPose).toBeGreaterThan(0);
    expect(run.outcome.frames.total).toBe(frameCountOf(CLIP, DEFAULT_SAMPLE_FPS));
  });

  it('still counts the repetitions around a few bad frames', async () => {
    const run = await analyseClip2(fakeReader(5, { failAt: (index) => index % 37 === 0 }), {
      now: fakeClock(),
      yieldControl: noYield,
    });

    expect(run.kind === 'done' && run.outcome.ok && run.outcome.result.repetitions).toBe(5);
  });

  it('gives up on a video it cannot read at all', async () => {
    const run = await analyseClip2(fakeReader(5, { failAt: () => true }), {
      now: fakeClock(),
      yieldControl: noYield,
    });

    expect(run.kind).toBe('failed');
    if (run.kind !== 'failed') return;

    expect(run.message).toContain('nicht gelesen');
  });

  it('refuses a clip with no length rather than dividing by it', async () => {
    const reader = fakeReader(5, { clip: { durationMs: 0, width: 1920, height: 1080 } });
    const run = await analyseClip(reader, SQUAT_PROFILE, TRACKS, {
      now: fakeClock(),
      yieldControl: noYield,
    });

    expect(run.kind).toBe('failed');
    expect(reader.calls).toHaveLength(0);
  });
});

describe('when there is nobody in the video', () => {
  it('comes back with a refusal rather than a count of zero', async () => {
    const run = await analyseClip2(fakeReader(5, { emptyAt: () => true }), {
      now: fakeClock(),
      yieldControl: noYield,
    });

    expect(run.kind).toBe('done');
    if (run.kind !== 'done') return;

    expect(run.outcome.ok).toBe(false);
    if (run.outcome.ok) return;

    expect(run.outcome.refusal).toBe('NO_POSE');
  });

  it('refuses a recording the model could only read now and then', async () => {
    const run = await analyseClip2(fakeReader(5, { emptyAt: (index) => index % 4 !== 0 }), {
      now: fakeClock(),
      yieldControl: noYield,
    });

    expect(run.kind).toBe('done');
    if (run.kind !== 'done') return;

    expect(run.outcome.ok).toBe(false);
    if (run.outcome.ok) return;

    expect(run.outcome.refusal).toBe('POSE_TOO_INTERMITTENT');
  });

  it('refuses a pose the model was unsure about', async () => {
    const run = await analyseClip2(fakeReader(5, { visibility: 0.2 }), {
      now: fakeClock(),
      yieldControl: noYield,
    });

    expect(run.kind === 'done' && run.outcome.ok).toBe(false);
  });
});

describe('what it never keeps', () => {
  it('returns no landmarks anywhere in the result', async () => {
    // Raw landmarks are not a measurement and are not persisted. The result a
    // screen receives should not carry them either, or the next person to add a
    // "save this" button would be one line away from storing them.
    const run = await analyseClip2(fakeReader(3), { now: fakeClock(), yieldControl: noYield });

    expect(run.kind).toBe('done');
    if (run.kind !== 'done') return;

    const serialised = JSON.stringify(run.outcome);

    expect(serialised).not.toContain('visibility');
    expect(serialised).not.toContain('landmarks');
  });
});

describe('the defaults', () => {
  it('samples below the frame rate of a phone recording', () => {
    // 30 fps in, half of it analysed: the arithmetic that halves the wait.
    expect(DEFAULT_SAMPLE_FPS).toBeLessThan(30);
    expect(DEFAULT_SAMPLE_FPS).toBeGreaterThanOrEqual(10);
  });

  it('counts at least one frame for any clip with a length', () => {
    expect(frameCountOf({ durationMs: 100, width: 10, height: 10 }, 15)).toBeGreaterThanOrEqual(1);
  });

  it('hands the main thread back while it works', async () => {
    // Awaiting the reader is not enough: a promise that is already settled is a
    // microtask, and microtasks run before the browser gets a turn. Without an
    // explicit yield a long video freezes the page — no paint, no cancel button.
    const yields = vi.fn(() => Promise.resolve());
    const reader = fakeReader(3);

    await analyseClip(reader, SQUAT_PROFILE, TRACKS, {
      sampleFps: 15,
      now: fakeClock(30),
      yieldControl: yields,
    });

    expect(yields).toHaveBeenCalled();
  });

  it('really lets a timer run, with the yield it ships with', async () => {
    // The same claim against the real implementation rather than a stub.
    const ticks: string[] = [];
    const reader = fakeReader(1, { clip: { durationMs: 2000, width: 640, height: 480 } });

    const timer = setInterval(() => ticks.push('tick'), 0);
    await analyseClip(reader, SQUAT_PROFILE, TRACKS, { sampleFps: 15, now: fakeClock(30) });
    clearInterval(timer);

    expect(ticks.length).toBeGreaterThan(0);
  });

  it('does not yield after every single frame', async () => {
    // A yield costs a timer round trip. Doing it per frame over a long video is
    // measurable, which is why it is time-based rather than count-based.
    const yields = vi.fn(() => Promise.resolve());
    const reader = fakeReader(3);

    await analyseClip(reader, SQUAT_PROFILE, TRACKS, {
      sampleFps: 15,
      now: fakeClock(1),
      yieldControl: yields,
    });

    expect(yields.mock.calls.length).toBeLessThan(reader.calls.length);
  });
});

describe('the live preview', () => {
  it('reports every frame it read, in order', async () => {
    const seen: number[] = [];
    await analyseClip2(fakeReader(2), {
      sampleFps: 10,
      now: fakeClock(),
      yieldControl: noYield,
      onFrame: (_landmarks, timestampMs) => seen.push(timestampMs),
    });

    expect(seen).toHaveLength(frameCountOf(CLIP, 10));
    for (let index = 1; index < seen.length; index += 1) {
      expect(seen[index]).toBeGreaterThan(seen[index - 1] ?? 0);
    }
  });

  it('says so when the model found nobody, rather than repeating the last pose', async () => {
    // An overlay that froze on the last good skeleton would claim the athlete
    // was still being tracked while they had left the frame.
    const poses: (readonly unknown[] | null)[] = [];
    await analyseClip2(fakeReader(2, { emptyAt: (index) => index % 2 === 0 }), {
      sampleFps: 10,
      now: fakeClock(),
      yieldControl: noYield,
      onFrame: (landmarks) => poses.push(landmarks),
    });

    expect(poses.some((pose) => pose === null)).toBe(true);
    expect(poses.some((pose) => pose !== null)).toBe(true);
  });

  it('is optional — the analysis runs without a preview', async () => {
    const run = await analyseClip2(fakeReader(3), { now: fakeClock(), yieldControl: noYield });

    expect(run.kind).toBe('done');
  });
});

describe('the reader contract', () => {
  it('asks for positions inside the recording only', async () => {
    const reader = fakeReader(2);
    await analyseClip(reader, SQUAT_PROFILE, TRACKS, { now: fakeClock(), yieldControl: noYield });

    for (const call of reader.calls) {
      expect(call).toBeGreaterThanOrEqual(0);
      expect(call).toBeLessThanOrEqual(CLIP.durationMs);
    }
  });

  it('reports progress once per frame, no more', async () => {
    const onProgress = vi.fn();
    await analyseClip2(fakeReader(2), {
      sampleFps: 10,
      now: fakeClock(),
      yieldControl: noYield,
      onProgress,
    });

    expect(onProgress).toHaveBeenCalledTimes(frameCountOf(CLIP, 10));
  });
});

/**
 * Keeping every frame, for the annotated export.
 *
 * The switch is the point of these tests. Collecting is what makes an export
 * possible; collecting *by default* would mean every analysis quietly held a
 * recording's worth of landmarks whether anyone wanted one or not.
 */
describe('the annotated frames', () => {
  it('are not kept unless asked for', async () => {
    const run = await analyseClip2(fakeReader(5), { yieldControl: noYield });

    expect(run.kind).toBe('done');
    if (run.kind !== 'done') return;

    expect(run.annotations).toEqual([]);
  });

  it('are one per frame read, in order, when asked for', async () => {
    const reader = fakeReader(5);
    const run = await analyseClip2(reader, { collectFrames: true, yieldControl: noYield });

    expect(run.kind).toBe('done');
    if (run.kind !== 'done') return;

    expect(run.annotations).toHaveLength(run.progress.processedFrames);

    const times = run.annotations.map((frame) => frame.timestampMs);
    expect([...times].sort((a, b) => a - b)).toEqual(times);

    // They line up with the positions the reader was actually asked for, so the
    // export draws each annotation on the frame it came from.
    expect(times).toEqual(reader.calls);
  });

  it('carry the pose and the measured angles', async () => {
    const run = await analyseClip2(fakeReader(5), { collectFrames: true, yieldControl: noYield });
    if (run.kind !== 'done') throw new Error('expected a completed run');

    const withPose = run.annotations.filter((frame) => frame.landmarks !== null);

    expect(withPose.length).toBeGreaterThan(0);
    expect(Object.keys(withPose[0]?.angles ?? {}).length).toBeGreaterThan(0);
  });

  it('keep what was read before a cancellation', async () => {
    const controller = new AbortController();
    const reader = fakeReader(5);

    const run = await analyseClip2(reader, {
      collectFrames: true,
      yieldControl: noYield,
      signal: controller.signal,
      onProgress: (progress) => {
        if (progress.processedFrames >= 12) controller.abort();
      },
    });

    expect(run.kind).toBe('cancelled');
    if (run.kind !== 'cancelled') return;

    // Everything read up to the stop is still there — an export over a
    // half-analysed clip is the coach's call, not a reason to throw the frames
    // away.
    expect(run.annotations).toHaveLength(run.progress.processedFrames);
    expect(run.annotations.length).toBeGreaterThanOrEqual(12);
  });

  it('records a frame the model found nobody in, rather than skipping it', async () => {
    const run = await analyseClip2(fakeReader(5, { emptyAt: (index) => index % 4 === 0 }), {
      collectFrames: true,
      yieldControl: noYield,
    });

    if (run.kind !== 'done') throw new Error('expected a completed run');

    const blank = run.annotations.filter((frame) => frame.landmarks === null);

    expect(blank.length).toBeGreaterThan(0);
    // A gap the export can draw as a gap. Inventing a pose to fill it would put
    // a skeleton where the model saw none.
    expect(blank.every((frame) => Object.keys(frame.angles).length === 0)).toBe(true);
  });
});
