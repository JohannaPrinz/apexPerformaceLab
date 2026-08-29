import { describe, expect, it } from 'vitest';

import {
  SQUAT_PROFILE,
  type AngleTargetConfig,
  type AnnotatedFrame,
  type TargetOutcome,
} from '@apex/domain';

import { overlayFor, summaryLines, targetLine } from './overlay';

/**
 * What the exported video is allowed to say.
 *
 * These tests are about honesty rather than pixels. The drawing itself is a
 * handful of canvas calls and a browser is the only place worth checking it; the
 * decisions — which angle appears, what the counter claims, and above all that a
 * single frame never carries a target's verdict — are decided here and can be
 * got wrong silently.
 */

const ALL = SQUAT_PROFILE.tracks.map((track) => track.key);

const frame = (over: Partial<AnnotatedFrame> = {}): AnnotatedFrame => ({
  timestampMs: 1500,
  landmarks: null,
  angles: {
    knee_left: 88.4,
    knee_right: 91.2,
    hip_left: 74,
    hip_right: 75,
    ankle_left: 122,
    ankle_right: 122,
  },
  signal: 88.4,
  repInProgress: 2,
  completedReps: 1,
  ...over,
});

const TARGET: AngleTargetConfig = {
  track: 'knee',
  position: 'flexed',
  comparison: 'at_most',
  degrees: 90,
};

describe('what one frame shows', () => {
  it('draws only the tracks the coach kept', () => {
    const overlay = overlayFor(frame(), SQUAT_PROFILE, ['knee'], [], 'left');

    expect(overlay.angles.map((angle) => angle.track)).toEqual(['knee']);
  });

  it('takes the angle from the analysis, unrounded and unrecalculated', () => {
    const overlay = overlayFor(frame(), SQUAT_PROFILE, ALL, [], 'left');
    const knee = overlay.angles.find((angle) => angle.track === 'knee');

    expect(knee?.degrees).toBe(88.4);
  });

  it('reads one side for the whole video', () => {
    const left = overlayFor(frame(), SQUAT_PROFILE, ['knee'], [], 'left');
    const right = overlayFor(frame(), SQUAT_PROFILE, ['knee'], [], 'right');

    // Switching legs mid-clip would make the number jump for a reason no viewer
    // could see, so the side is fixed by the caller and honoured here.
    expect(left.angles[0]?.degrees).toBe(88.4);
    expect(right.angles[0]?.degrees).toBe(91.2);
  });

  it('leaves out a track the frame holds no angle for', () => {
    const overlay = overlayFor(
      frame({ angles: { knee_left: 88.4 } }),
      SQUAT_PROFILE,
      ALL,
      [],
      'left',
    );

    expect(overlay.angles.map((angle) => angle.track)).toEqual(['knee']);
  });

  it('names the repetition under way', () => {
    expect(overlayFor(frame(), SQUAT_PROFILE, ALL, [], 'left').counter).toBe('Wiederholung 2');
  });

  it('states the finished count between repetitions', () => {
    const between = frame({ repInProgress: null, completedReps: 3 });

    expect(overlayFor(between, SQUAT_PROFILE, ALL, [], 'left').counter).toBe('3 Wiederholungen');
  });

  it('says nothing at all before the first repetition', () => {
    const start = frame({ repInProgress: null, completedReps: 0 });

    // "0 Wiederholungen" over an athlete who has not started yet reads like a
    // verdict on them.
    expect(overlayFor(start, SQUAT_PROFILE, ALL, [], 'left').counter).toBeNull();
  });

  it('shows what the target asked for and never whether it was met', () => {
    const overlay = overlayFor(frame(), SQUAT_PROFILE, ALL, [TARGET], 'left');

    expect(overlay.targetLines).toEqual(['Ziel: Knie gebeugt höchstens 90°']);

    // This frame's knee is 88.4° — inside the target. A frame is nonetheless
    // somewhere on the way to the extreme the target speaks about, so no verdict
    // may appear on it. The closing card is where that belongs.
    const joined = overlay.targetLines.join(' ');
    expect(joined).not.toContain('erreicht');
    expect(joined).not.toContain('nicht');
  });

  it('carries the moment it belongs to', () => {
    expect(overlayFor(frame(), SQUAT_PROFILE, ALL, [], 'left').timestampMs).toBe(1500);
  });
});

describe('the target line', () => {
  it("names the joint and the position in the coach's own words", () => {
    expect(targetLine(TARGET, SQUAT_PROFILE)).toBe('Ziel: Knie gebeugt höchstens 90°');
  });

  it('falls back to the raw keys rather than dropping an unknown target', () => {
    const unknown: AngleTargetConfig = { ...TARGET, track: 'elbow', position: 'cocked' };

    expect(targetLine(unknown, SQUAT_PROFILE)).toContain('elbow cocked');
  });
});

describe('the closing card', () => {
  const outcome = (verdict: TargetOutcome['verdict']): TargetOutcome => ({
    target: TARGET,
    verdict,
    sides: [],
    label: 'Knie gebeugt',
  });

  it('leads with the repetition count', () => {
    expect(summaryLines(11, [])).toEqual(['11 Wiederholungen']);
  });

  it('counts one repetition in the singular', () => {
    expect(summaryLines(1, [])).toEqual(['1 Wiederholung']);
  });

  it('repeats the verdict it was handed, and reaches no verdict of its own', () => {
    expect(summaryLines(3, [outcome('reached')])).toEqual([
      '3 Wiederholungen',
      'Knie gebeugt: Ziel erreicht',
    ]);

    expect(summaryLines(3, [outcome('missed')])[1]).toBe('Knie gebeugt: Ziel nicht erreicht');
  });

  it('says so plainly where nothing was measured for a target', () => {
    expect(summaryLines(3, [outcome('unmeasured')])[1]).toBe('Knie gebeugt: nicht gemessen');
  });
});
