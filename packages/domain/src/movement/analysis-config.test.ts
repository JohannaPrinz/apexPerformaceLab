import { describe, expect, it } from 'vitest';

import {
  activeTargets,
  defaultAnalysisConfig,
  EQUALS_TOLERANCE_DEGREES,
  meetsTarget,
  movementAnalysisConfigSchema,
  readMovementConfig,
  selectedTracks,
  suggestedTargetsFor,
  type AngleTargetConfig,
} from './analysis-config';
import { SQUAT_PROFILE } from './profile';

/**
 * The coach's decisions for one test.
 *
 * Two failures would be invisible and expensive: a comparison inverted, so every
 * squat that met its depth is reported as a miss in words that read like a
 * correct result; and a stored configuration that stops an older test from
 * working, which would take a coach's existing analyses with it.
 */

const target = (over: Partial<AngleTargetConfig> = {}): AngleTargetConfig => ({
  track: 'knee',
  position: 'flexed',
  comparison: 'at_most',
  degrees: 90,
  ...over,
});

describe('what a coach starts from', () => {
  it('selects every angle the profile offers', () => {
    const config = defaultAnalysisConfig(SQUAT_PROFILE);

    expect(config.tracks).toEqual(['knee', 'hip', 'ankle']);
  });

  it('applies no targets at all', () => {
    // The profile's suggestions are offered separately. One that arrived
    // already applied would be the platform setting a criterion and the coach
    // finding out afterwards.
    expect(defaultAnalysisConfig(SQUAT_PROFILE).targets).toEqual([]);
    expect(suggestedTargetsFor(SQUAT_PROFILE).length).toBeGreaterThan(0);
  });

  it('treats an absent selection as all of them', () => {
    // What an older configuration implies, and what a coach sees before they
    // touch anything.
    expect(selectedTracks(SQUAT_PROFILE, null)).toEqual(['knee', 'hip', 'ankle']);
    expect(selectedTracks(SQUAT_PROFILE, { profileKey: 'squat', targets: [] })).toEqual([
      'knee',
      'hip',
      'ankle',
    ]);
  });
});

describe('deselecting angles', () => {
  it('keeps only what the coach kept', () => {
    const config = { profileKey: 'squat', tracks: ['knee', 'ankle'], targets: [] };

    expect(selectedTracks(SQUAT_PROFILE, config)).toEqual(['knee', 'ankle']);
  });

  it('drops a stored track the profile no longer defines', () => {
    // Renaming or retiring a track must not produce a column nothing can fill.
    const config = { profileKey: 'squat', tracks: ['knee', 'elbow'], targets: [] };

    expect(selectedTracks(SQUAT_PROFILE, config)).toEqual(['knee']);
  });

  it('can end up with nothing selected', () => {
    expect(selectedTracks(SQUAT_PROFILE, { profileKey: 'squat', tracks: [], targets: [] })).toEqual(
      [],
    );
  });
});

describe('targets are optional and belong to the test', () => {
  it('carries none by default', () => {
    expect(activeTargets(SQUAT_PROFILE, null)).toEqual([]);
  });

  it('carries the ones the coach set', () => {
    const config = { profileKey: 'squat', tracks: ['knee'], targets: [target()] };

    expect(activeTargets(SQUAT_PROFILE, config)).toHaveLength(1);
  });

  it('ignores a target whose angle the coach deselected', () => {
    // The coach said that angle is not relevant here. A "Ziel nicht erreicht"
    // for something nobody chose to measure is noise reported as a finding.
    const config = {
      profileKey: 'squat',
      tracks: ['hip'],
      targets: [target({ track: 'knee' })],
    };

    expect(activeTargets(SQUAT_PROFILE, config)).toEqual([]);
  });

  it('ignores a target naming a position the profile does not have', () => {
    const config = {
      profileKey: 'squat',
      tracks: ['knee'],
      targets: [target({ position: 'halfway' })],
    };

    expect(activeTargets(SQUAT_PROFILE, config)).toEqual([]);
  });

  it('lets two tests of the same exercise aim at different numbers', () => {
    const strict = { profileKey: 'squat', tracks: ['knee'], targets: [target({ degrees: 80 })] };
    const lenient = { profileKey: 'squat', tracks: ['knee'], targets: [target({ degrees: 110 })] };

    expect(activeTargets(SQUAT_PROFILE, strict)[0]?.degrees).toBe(80);
    expect(activeTargets(SQUAT_PROFILE, lenient)[0]?.degrees).toBe(110);
  });
});

describe('the comparison', () => {
  it('treats a smaller angle as meeting an upper bound', () => {
    // The squat case: 78° is deeper than the 90° asked for.
    expect(meetsTarget(78, target())).toBe(true);
    expect(meetsTarget(118, target())).toBe(false);
  });

  it('inverts for a lower bound', () => {
    // The mobility case, where the same joint wants a larger angle.
    const reach = target({ comparison: 'at_least', degrees: 25 });

    expect(meetsTarget(30, reach)).toBe(true);
    expect(meetsTarget(19, reach)).toBe(false);
  });

  it('counts the boundary itself as met, both ways', () => {
    expect(meetsTarget(90, target())).toBe(true);
    expect(meetsTarget(25, target({ comparison: 'at_least', degrees: 25 }))).toBe(true);
  });

  it('allows a tolerance for equality, because a pose estimate has one', () => {
    // Demanding exactly 90.0° from a model that jitters by more than a degree
    // demands a coincidence, not a movement.
    const exact = target({ comparison: 'equals', degrees: 90 });

    expect(meetsTarget(90, exact)).toBe(true);
    expect(meetsTarget(90 + EQUALS_TOLERANCE_DEGREES, exact)).toBe(true);
    expect(meetsTarget(90 - EQUALS_TOLERANCE_DEGREES, exact)).toBe(true);
    expect(meetsTarget(90 + EQUALS_TOLERANCE_DEGREES + 0.1, exact)).toBe(false);
    expect(meetsTarget(80, exact)).toBe(false);
  });
});

describe('reading it back out of a module payload', () => {
  it('reads a configuration it wrote', () => {
    const payload = { movement: { profileKey: 'squat', tracks: ['knee'], targets: [target()] } };

    expect(readMovementConfig(payload)?.tracks).toEqual(['knee']);
  });

  it('returns nothing for a test configured before this existed', () => {
    // The state every existing test is in, and the reason every caller has to
    // handle null anyway.
    expect(readMovementConfig({ measurementTypes: [], dimensions: [] })).toBeNull();
  });

  it('returns nothing rather than guessing at a malformed block', () => {
    expect(readMovementConfig({ movement: { profileKey: 5 } })).toBeNull();
    expect(readMovementConfig({ movement: 'squat' })).toBeNull();
    expect(readMovementConfig(null)).toBeNull();
  });

  it('refuses a configuration naming a profile nobody ships', () => {
    // Guessing a replacement would analyse one movement as another.
    expect(
      readMovementConfig({ movement: { profileKey: 'clean_and_jerk', targets: [] } }),
    ).toBeNull();
  });

  it('defaults the target list when it is absent', () => {
    const parsed = movementAnalysisConfigSchema.parse({ profileKey: 'squat' });

    expect(parsed.targets).toEqual([]);
    expect(parsed.tracks).toBeUndefined();
  });

  it('refuses a target with an impossible angle', () => {
    expect(
      movementAnalysisConfigSchema.safeParse({
        profileKey: 'squat',
        targets: [target({ degrees: 400 })],
      }).success,
    ).toBe(false);
  });
});
