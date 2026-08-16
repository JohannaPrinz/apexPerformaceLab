import { describe, expect, it } from 'vitest';

import {
  curate,
  executionDetailReason,
  isUnilateral,
  keyFor,
  movementPattern,
  outOfScopeReason,
  refineCategory,
} from './select';
import { composeGermanName } from './terms';

import type { Candidate } from '../candidates';

const candidate = (overrides: Partial<Candidate> = {}): Candidate => ({
  fingerprint: 'x',
  suggestedCanonicalName: 'Barbell Bench Press',
  names: [{ source: 'wrkout', name: 'Barbell Bench Press' }],
  sources: ['wrkout'],
  corroboration: 1,
  primaryMuscles: ['chest'],
  secondaryMuscles: ['triceps'],
  equipment: ['barbell'],
  category: 'strength',
  forceType: 'push',
  mechanic: 'compound',
  difficulty: 'intermediate',
  unmapped: [],
  conflicts: [],
  variantsOf: [],
  provenance: [{ source: 'wrkout', sourceId: 'Barbell_Bench_Press', license: 'Public Domain' }],
  missing: [],
  ...overrides,
});

describe('German names are composed, never translated', () => {
  it('keeps the modifier in front and the implement behind', () => {
    expect(composeGermanName('Barbell Incline Bench Press').name).toBe(
      'Schräg-Bankdrücken mit Langhantel',
    );
  });

  it('uses the established term, not a literal rendering', () => {
    expect(composeGermanName('Romanian Deadlift').name).toBe('Rumänisches Kreuzheben');
    expect(composeGermanName('Deadlift').name).toBe('Kreuzheben');
    expect(composeGermanName('Squat').name).toBe('Kniebeuge');
  });

  /**
   * The tables read with hyphens; lookups happen on normalised text. Both sides
   * go through the same function — they did not, and every hyphenated key was
   * dead, sending 676 candidates to review for a term the table already held.
   */
  it('matches a hyphenated term after normalisation', () => {
    expect(composeGermanName('Chin-Up').name).toBe('Klimmzug im Kammgriff');
    expect(composeGermanName('Pull-Up').name).toBe('Klimmzug');
  });

  it('matches an English plural', () => {
    expect(composeGermanName('Mountain Climbers').name).toBe('Mountain Climber');
  });

  it('prefers the longest base movement', () => {
    // "bench press" must win over "press".
    expect(composeGermanName('Dumbbell Bench Press').name).toContain('Bankdrücken');
  });

  /** A term nobody entered is named, not guessed. */
  it('reports an unknown movement rather than inventing a name', () => {
    const result = composeGermanName('Zottman Flapjack');

    expect(result.name).toBe('');
    expect(result.unknown).toEqual(['Zottman Flapjack']);
  });

  it('reports an unknown modifier while keeping the base', () => {
    const result = composeGermanName('Zottman Curl');

    expect(result.name).toBe('Curl');
    expect(result.unknown).toContain('zottman');
  });
});

describe('what is not an exercise of its own', () => {
  it('excludes a grip width — a cue, not a movement', () => {
    expect(executionDetailReason('Close-Grip Bench Press')).toContain('grip width');
    expect(executionDetailReason('Wide-Grip Lat Pulldown')).toBeDefined();
  });

  it('excludes a tempo prescription', () => {
    expect(executionDetailReason('Slow Tempo Squat')).toBeDefined();
  });

  it('keeps a genuinely distinct movement', () => {
    expect(executionDetailReason('Incline Bench Press')).toBeUndefined();
    expect(executionDetailReason('Front Squat')).toBeUndefined();
  });

  it('excludes apparatus outside a general coaching catalogue', () => {
    expect(outOfScopeReason('Atlas Stone Lift')).toBeDefined();
    expect(outOfScopeReason('Smith Machine Squat')).toBeDefined();
    expect(outOfScopeReason('Barbell Squat')).toBeUndefined();
  });
});

describe('movement patterns drive breadth', () => {
  it('reads the pattern from the movement', () => {
    expect(movementPattern('Barbell Back Squat')).toBe('squat');
    expect(movementPattern('Romanian Deadlift')).toBe('hinge');
    expect(movementPattern('Bulgarian Split Squat')).toBe('lunge');
    expect(movementPattern('Bench Press')).toBe('horizontal_press');
    expect(movementPattern('Pull-Up')).toBe('vertical_pull');
    expect(movementPattern('Pallof Press')).toBe('anti_rotation');
    expect(movementPattern('Power Clean')).toBe('olympic');
  });

  it('prefers the more specific pattern where two could match', () => {
    // A split squat is a lunge pattern, not a squat pattern.
    expect(movementPattern('Split Squat')).toBe('lunge');
  });
});

/**
 * `stability` and `calisthenics` are ours; no source carries them. Without
 * these rules the catalogue would file a plank and a pull-up as strength —
 * not wrong, and not useful.
 */
describe('the two categories no source carries', () => {
  it('moves a held position to stability', () => {
    const result = refineCategory(
      candidate({ suggestedCanonicalName: 'Front Plank' }),
      'anti_extension',
    );

    expect(result.category).toBe('stability');
    expect(result.changed).toBe(true);
  });

  it('moves a bodyweight calisthenics movement out of strength', () => {
    const result = refineCategory(
      candidate({ suggestedCanonicalName: 'Muscle Up', equipment: [] }),
      'vertical_pull',
    );

    expect(result.category).toBe('calisthenics');
  });

  it('leaves a loaded movement where the sources put it', () => {
    expect(refineCategory(candidate(), 'horizontal_press').category).toBe('strength');
  });
});

describe('curating a candidate', () => {
  it('produces a complete entry from a complete candidate', () => {
    const result = curate(candidate());

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.exercise.name).toBe('Bankdrücken mit Langhantel');
    expect(result.exercise.key).toBe('barbell_bench_press');
    expect(result.exercise.review).toEqual([]);
  });

  /** wrkout is public domain and the only source with force and mechanic. */
  it('attributes to wrkout where it contributed', () => {
    const result = curate(
      candidate({
        provenance: [
          { source: 'wger', sourceId: '192', license: 'CC-BY-SA-4.0' },
          { source: 'wrkout', sourceId: 'Bench_Press', license: 'Public Domain' },
        ],
      }),
    );

    if (!result.ok) throw new Error('expected a curated entry');
    expect(result.exercise.source).toBe('wrkout');
    // The other source stays recorded — it corroborated the movement.
    expect(result.exercise.provenance).toHaveLength(2);
  });

  it('marks a missing classification for review rather than guessing', () => {
    const result = curate(candidate({ mechanic: undefined }));

    if (!result.ok) throw new Error('expected a curated entry');
    expect(result.exercise.review.some((entry) => entry.includes('mechanic'))).toBe(true);
  });

  it('keeps both claims of a conflict and asks for a decision', () => {
    const result = curate(
      candidate({ conflicts: [{ field: 'equipment', claims: ['barbell', 'bodyweight'] }] }),
    );

    if (!result.ok) throw new Error('expected a curated entry');
    expect(result.exercise.conflicts[0]).toMatchObject({
      field: 'equipment',
      proposedValue: null,
      reviewRequired: true,
    });
    expect(result.exercise.conflicts[0]?.sourceClaims).toEqual(['barbell', 'bodyweight']);
  });

  it('reads unilateral from the movement', () => {
    expect(isUnilateral('Bulgarian Split Squat')).toBe(true);
    expect(isUnilateral('Single-Arm Dumbbell Row')).toBe(true);
    expect(isUnilateral('Barbell Bench Press')).toBe(false);
  });

  it('builds a key that the import schema accepts', () => {
    expect(keyFor('Romanian Deadlift')).toBe('romanian_deadlift');
    expect(keyFor("Farmer's Walk")).toBe('farmer_s_walk');
  });
});
