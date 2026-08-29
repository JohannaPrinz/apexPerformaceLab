import { describe, expect, it } from 'vitest';

import {
  hasMovementProfile,
  landmarkIndex,
  LANDMARK_ROLES,
  MOVEMENT_PROFILES,
  movementProfile,
  POSE_LANDMARKS,
  positionOf,
  profileForExercise,
  seriesKeyOf,
  SQUAT_PROFILE,
  trackOf,
} from './profile';

/**
 * The profile is data, and this is what that buys.
 *
 * Every assertion here is one a coach or a physio could read and disagree with —
 * which is the point of declaring the anatomy rather than coding it. The two
 * that matter most are the ones nothing else would catch: an angle built from
 * the wrong landmarks measures a different joint under the right name, and an
 * unknown profile key resolved to *something* would analyse one movement as
 * another.
 */

describe('the squat profile', () => {
  it('measures the knee from hip, knee and ankle', () => {
    const knee = trackOf(SQUAT_PROFILE, 'knee');

    expect(knee).toMatchObject({ vertex: 'knee', from: 'hip', to: 'ankle' });
  });

  it('measures the hip from shoulder, hip and knee', () => {
    expect(trackOf(SQUAT_PROFILE, 'hip')).toMatchObject({
      vertex: 'hip',
      from: 'shoulder',
      to: 'knee',
    });
  });

  it('measures the ankle from knee, ankle and toe', () => {
    expect(trackOf(SQUAT_PROFILE, 'ankle')).toMatchObject({
      vertex: 'ankle',
      from: 'knee',
      to: 'footIndex',
    });
  });

  it('warns about the ankle rather than offering it silently', () => {
    // It rests on the foot landmarks, which a shoe and a trouser leg both
    // degrade. Offering it without saying so would be the dishonest half.
    expect(trackOf(SQUAT_PROFILE, 'ankle')?.caution).toBeTruthy();
    expect(trackOf(SQUAT_PROFILE, 'knee')?.caution).toBeUndefined();
  });

  it('names both ends of the movement and which extreme each is', () => {
    expect(positionOf(SQUAT_PROFILE, 'extended')).toMatchObject({ end: 'max', label: 'gestreckt' });
    expect(positionOf(SQUAT_PROFILE, 'flexed')).toMatchObject({ end: 'min', label: 'gebeugt' });
  });

  it('counts from the knee, on both sides', () => {
    expect(SQUAT_PROFILE.counting).toMatchObject({ kind: 'hysteresis', track: 'knee' });
    expect(SQUAT_PROFILE.sides).toEqual(['left', 'right']);
  });

  it('names a track for everything it counts from', () => {
    // A counting rule pointing at a track that does not exist would silently
    // never count anything.
    if (SQUAT_PROFILE.counting.kind !== 'hysteresis') return;

    expect(trackOf(SQUAT_PROFILE, SQUAT_PROFILE.counting.track)).not.toBeNull();
  });

  it('suggests a target without imposing one', () => {
    // A suggestion is a starting point the coach confirms. A profile that
    // *applied* it would be the platform deciding how deep a squat should be.
    expect(SQUAT_PROFILE.suggestedTargets.length).toBeGreaterThan(0);

    for (const suggestion of SQUAT_PROFILE.suggestedTargets) {
      expect(trackOf(SQUAT_PROFILE, suggestion.track)).not.toBeNull();
      expect(positionOf(SQUAT_PROFILE, suggestion.position)).not.toBeNull();
    }
  });
});

describe('the profile is purely declarative', () => {
  it('contains no functions', () => {
    // The moment a profile can compute, the engine stops being the only place
    // that measures — and two answers to "what is the knee angle" appear.
    const walk = (value: unknown): void => {
      if (typeof value === 'function') throw new Error('a profile must not contain behaviour');
      if (Array.isArray(value)) value.forEach(walk);
      else if (value !== null && typeof value === 'object') Object.values(value).forEach(walk);
    };

    expect(() => walk(SQUAT_PROFILE)).not.toThrow();
  });

  it('survives being round-tripped through JSON unchanged', () => {
    expect(JSON.parse(JSON.stringify(SQUAT_PROFILE))).toEqual(SQUAT_PROFILE);
  });

  it('builds every angle from landmarks the pose actually has', () => {
    for (const profile of MOVEMENT_PROFILES) {
      for (const track of profile.tracks) {
        for (const role of [track.vertex, track.from, track.to]) {
          expect(LANDMARK_ROLES).toContain(role);
          for (const side of profile.sides) {
            const index = landmarkIndex(role, side);

            expect(index).toBeGreaterThanOrEqual(0);
            expect(index).toBeLessThan(33);
          }
        }
      }
    }
  });

  it('gives every track a distinct key', () => {
    const keys = SQUAT_PROFILE.tracks.map((track) => track.key);

    expect(new Set(keys).size).toBe(keys.length);
  });

  it('keeps left and right apart in the landmark table', () => {
    for (const role of LANDMARK_ROLES) {
      expect(POSE_LANDMARKS[role].left).not.toBe(POSE_LANDMARKS[role].right);
    }
  });
});

describe('finding a profile', () => {
  it('resolves the squat exercise', () => {
    expect(profileForExercise('squat')?.key).toBe('squat');
    expect(hasMovementProfile('squat')).toBe(true);
  });

  it('returns nothing for an exercise with no profile', () => {
    // An ordinary answer, not an error: most of the catalogue has none, and a
    // guess would analyse a bench press as a squat.
    expect(profileForExercise('bench_press')).toBeNull();
    expect(hasMovementProfile('bench_press')).toBe(false);
  });

  it('returns nothing for nothing', () => {
    expect(profileForExercise(null)).toBeNull();
    expect(profileForExercise(undefined)).toBeNull();
    expect(movementProfile('')).toBeNull();
  });

  it('never resolves an unknown key to something else', () => {
    expect(movementProfile('deep_squat_v2')).toBeNull();
    expect(movementProfile('SQUAT')).toBeNull();
  });

  it('ships the profiles that were built, and no more', () => {
    // Pinned so that growing this list stays a decision somebody took, and so
    // that a profile arriving without a real recording behind it is noticed.
    expect(MOVEMENT_PROFILES.map((profile) => profile.key)).toEqual(['squat', 'deadlift']);
  });
});

/**
 * Kreuzheben.
 *
 * The tests worth having are about the two decisions that separate it from a
 * squat: it is counted off the hip, and it deliberately measures no trunk
 * angle.
 */
describe('the deadlift profile', () => {
  const deadlift = MOVEMENT_PROFILES.find((profile) => profile.key === 'deadlift');

  it('is counted off the hip, not the knee', () => {
    // A hinge travels through a much larger hip arc than knee arc. Counting the
    // knee would miss repetitions the athlete plainly performed.
    expect(deadlift?.counting.kind).toBe('hysteresis');
    expect(deadlift?.counting.kind === 'hysteresis' ? deadlift.counting.track : null).toBe('hip');
  });

  it('keeps its hysteresis inside the arc the movement actually covers', () => {
    if (deadlift?.counting.kind !== 'hysteresis') throw new Error('expected a counted profile');

    // Measured against a real recording: the hip runs from roughly 60° to 170°.
    expect(deadlift.counting.descendBelow).toBeGreaterThan(60);
    expect(deadlift.counting.ascendAbove).toBeLessThan(170);
    expect(deadlift.counting.descendBelow).toBeLessThan(deadlift.counting.ascendAbove);
  });

  it('measures no trunk angle, because it cannot', () => {
    // The shoulder-to-hip line gives inclination, never curvature — MediaPipe
    // returns no landmark between them. A "rounding" measurement would be
    // invented, and would look exactly like a measured one.
    expect(deadlift?.tracks.map((track) => track.key)).toEqual(['hip', 'knee']);
  });

  it('proposes no target', () => {
    // A deadlift's bottom is set by the bar, not by the athlete's choice.
    expect(deadlift?.suggestedTargets).toEqual([]);
  });

  it('reaches the profile through the exercise catalogue', () => {
    expect(profileForExercise('deadlift')?.key).toBe('deadlift');
    expect(hasMovementProfile('deadlift')).toBe(true);
  });
});

describe('the series key', () => {
  it('joins track and side the way the engine reads it back', () => {
    expect(seriesKeyOf('knee', 'left')).toBe('knee_left');
  });
});
