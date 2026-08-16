import { describe, expect, it } from 'vitest';

import {
  canArchiveExercise,
  canEditExercise,
  canLinkVariants,
  canRemoveExercise,
  describeVariantRefusal,
  exerciseSchema,
  findSystemExercise,
  isUsed,
  NO_EXERCISE_USAGE,
  scopeOf,
  SYSTEM_EXERCISES,
  variantPairKey,
  type ExerciseUsage,
} from './index';

describe('the system catalogue', () => {
  it('ships exactly the movements that were specified', () => {
    expect(SYSTEM_EXERCISES.map((exercise) => exercise.key)).toEqual([
      'bench_press',
      'squat',
      'deadlift',
      'overhead_press',
      'pull_up',
      'leg_press',
    ]);
  });

  it('uses stable identifiers', () => {
    for (const exercise of SYSTEM_EXERCISES) {
      expect(exerciseSchema.safeParse(exercise).success, exercise.key).toBe(true);
    }
  });

  /**
   * `name` is what a coach reads — German. `canonicalName` is the professional
   * English term an import matches against. Two columns, because the canonical
   * name is data about the movement rather than a rendering of the German one.
   */
  it('carries a German name and a canonical English one', () => {
    expect(findSystemExercise('bench_press')).toMatchObject({
      name: 'Bankdrücken',
      canonicalName: 'Bench Press',
    });
    expect(findSystemExercise('squat')).toMatchObject({
      name: 'Kniebeuge',
      canonicalName: 'Squat',
    });
  });

  it('classifies nothing yet, because the vocabularies are the import\u2019s job', () => {
    for (const exercise of SYSTEM_EXERCISES) {
      const parsed = exerciseSchema.parse(exercise);

      expect(parsed.primaryMuscles, exercise.key).toEqual([]);
      expect(parsed.equipment, exercise.key).toEqual([]);
      expect(parsed.category, exercise.key).toBeUndefined();
    }
  });

  it('carries no provenance — these were authored here, not imported', () => {
    for (const exercise of SYSTEM_EXERCISES) {
      const parsed = exerciseSchema.parse(exercise);

      expect(parsed.source, exercise.key).toBeUndefined();
      expect(parsed.license, exercise.key).toBeUndefined();
    }
  });

  it('has no duplicate keys', () => {
    const keys = SYSTEM_EXERCISES.map((exercise) => exercise.key);

    expect(new Set(keys).size).toBe(keys.length);
  });

  /**
   * An Exercise describes what was done; a Measurement Type describes what was
   * measured. If a movement ever appeared in the type catalogue the two
   * concepts would have started merging, which is the failure this whole design
   * exists to prevent.
   */
  it('names no quantity — an exercise is not a measurement type', () => {
    const quantities = ['force', 'weight', 'lactate', 'heart_rate', 'range_of_motion'];

    for (const exercise of SYSTEM_EXERCISES) {
      expect(quantities, `"${exercise.key}" is a quantity, not a movement`).not.toContain(
        exercise.key,
      );
    }
  });

  it('looks up by key', () => {
    expect(findSystemExercise('deadlift')).toMatchObject({
      name: 'Kreuzheben',
      canonicalName: 'Deadlift',
    });
    expect(findSystemExercise('not_a_movement')).toBeUndefined();
  });
});

describe('exercise input', () => {
  it('requires a stable identifier, not a display name', () => {
    expect(
      exerciseSchema.safeParse({
        key: 'Bench Press',
        name: 'Bankdrücken',
        canonicalName: 'Bench Press',
      }).success,
    ).toBe(false);
  });

  it('accepts a muscle from the vocabulary', () => {
    const withMuscle = {
      key: 'hip_thrust',
      name: 'Hüftheben',
      canonicalName: 'Hip Thrust',
      primaryMuscles: ['glutes'],
      secondaryMuscles: ['hamstrings'],
      equipment: ['barbell'],
      category: 'strength',
    };

    expect(exerciseSchema.safeParse(withMuscle).success).toBe(true);
  });

  it('refuses one that is not on the list', () => {
    const invented = {
      key: 'hip_thrust',
      name: 'Hüftheben',
      canonicalName: 'Hip Thrust',
      primaryMuscles: ['gluteus_maximus_superior'],
    };

    expect(exerciseSchema.safeParse(invented).success).toBe(false);
  });

  it('refuses the same muscle listed twice', () => {
    const repeated = {
      key: 'hip_thrust',
      name: 'Hüftheben',
      canonicalName: 'Hip Thrust',
      primaryMuscles: ['glutes', 'glutes'],
    };

    expect(exerciseSchema.safeParse(repeated).success).toBe(false);
  });

  it('defaults to nothing classified rather than guessing', () => {
    const parsed = exerciseSchema.parse({ key: 'row', name: 'Rudern', canonicalName: 'Row' });

    expect(parsed.primaryMuscles).toEqual([]);
    expect(parsed.secondaryMuscles).toEqual([]);
    expect(parsed.equipment).toEqual([]);
    expect(parsed.instructions).toEqual([]);
    expect(parsed.media).toEqual([]);
    expect(parsed.unilateral).toBe(false);
  });

  it('takes ordered instructions', () => {
    const parsed = exerciseSchema.parse({
      key: 'row',
      name: 'Rudern',
      canonicalName: 'Row',
      instructions: ['Set the hips back.', 'Pull to the ribs.'],
    });

    expect(parsed.instructions).toHaveLength(2);
  });

  it('records whether the movement is performed one side at a time', () => {
    const parsed = exerciseSchema.parse({
      key: 'split_squat',
      name: 'Ausfallschritt',
      canonicalName: 'Split Squat',
      unilateral: true,
    });

    expect(parsed.unilateral).toBe(true);
  });
});

describe('scope is derived from organizationId, never stored twice', () => {
  it('reads a null organization as a system exercise', () => {
    expect(scopeOf({ organizationId: null })).toBe('SYSTEM');
  });

  it('reads an organization as a workspace exercise', () => {
    expect(scopeOf({ organizationId: 'org_1' })).toBe('WORKSPACE');
  });
});

describe('deleting versus archiving', () => {
  const used: ExerciseUsage = { ...NO_EXERCISE_USAGE, measurements: 3 };

  it('never deletes a system exercise, used or not', () => {
    expect(canRemoveExercise('SYSTEM', NO_EXERCISE_USAGE)).toEqual({
      allowed: false,
      reason: 'SYSTEM_EXERCISE',
    });
    expect(canRemoveExercise('SYSTEM', used)).toEqual({
      allowed: false,
      reason: 'SYSTEM_EXERCISE',
    });
  });

  it('deletes an unused workspace exercise', () => {
    expect(canRemoveExercise('WORKSPACE', NO_EXERCISE_USAGE)).toEqual({
      allowed: true,
      action: 'DELETE',
    });
  });

  /**
   * The measurement taken during a bench press does not stop having been taken.
   * Archiving removes the exercise from selection and leaves the record whole.
   */
  it('refuses to delete a workspace exercise that has measurements', () => {
    expect(canRemoveExercise('WORKSPACE', used)).toEqual({ allowed: false, reason: 'IN_USE' });
  });

  it('counts use in a training plan, a recommendation or a report as history too', () => {
    for (const field of ['programs', 'recommendations', 'reports'] as const) {
      const usage = { ...NO_EXERCISE_USAGE, [field]: 1 };

      expect(isUsed(usage), field).toBe(true);
      expect(canRemoveExercise('WORKSPACE', usage), field).toEqual({
        allowed: false,
        reason: 'IN_USE',
      });
    }
  });

  it('archives a workspace exercise whether or not it was used', () => {
    expect(canArchiveExercise('WORKSPACE')).toBe(true);
  });

  it('refuses to archive a system exercise — that would hide it for everyone', () => {
    expect(canArchiveExercise('SYSTEM')).toBe(false);
  });

  it('lets a workspace edit only its own exercises', () => {
    expect(canEditExercise('WORKSPACE')).toBe(true);
    expect(canEditExercise('SYSTEM')).toBe(false);
  });
});

/**
 * Variants are peers, not copies and not a hierarchy — front squat and goblet
 * squat vary one another with no parent. The link is symmetric, so the pair is
 * the fact and the order is only how it is written down.
 */
describe('variant pairs are stored once', () => {
  it('orders the pair the same way whichever side is named first', () => {
    expect(variantPairKey('ex_b', 'ex_a')).toEqual({ exerciseId: 'ex_a', variantId: 'ex_b' });
    expect(variantPairKey('ex_a', 'ex_b')).toEqual({ exerciseId: 'ex_a', variantId: 'ex_b' });
  });
});

describe('who may be linked as a variant', () => {
  const system = (id: string) => ({ id, organizationId: null });
  const own = (id: string) => ({ id, organizationId: 'org_a' });
  const other = (id: string) => ({ id, organizationId: 'org_b' });

  it('links two of a workspace own exercises', () => {
    expect(canLinkVariants(own('ex_1'), own('ex_2'), 'org_a')).toEqual({ allowed: true });
  });

  it('links a workspace exercise to a system one', () => {
    expect(canLinkVariants(own('ex_1'), system('ex_sys'), 'org_a')).toEqual({ allowed: true });
  });

  it('lets the seed link two system exercises', () => {
    expect(canLinkVariants(system('ex_1'), system('ex_2'), null)).toEqual({ allowed: true });
  });

  it('refuses an exercise as a variant of itself', () => {
    expect(canLinkVariants(own('ex_1'), own('ex_1'), 'org_a')).toEqual({
      allowed: false,
      reason: 'SAME_EXERCISE',
    });
  });

  /**
   * The link would reference a row the other tenant cannot read, and its very
   * existence would leak that the row exists.
   */
  it('refuses a link across two workspaces', () => {
    expect(canLinkVariants(own('ex_1'), other('ex_2'), 'org_a')).toEqual({
      allowed: false,
      reason: 'ACROSS_WORKSPACES',
    });
  });

  it('refuses a workspace linking another tenant exercise to a system one', () => {
    expect(canLinkVariants(other('ex_1'), system('ex_sys'), 'org_a')).toEqual({
      allowed: false,
      reason: 'ACROSS_WORKSPACES',
    });
  });

  /**
   * Two system exercises linked by a workspace would join the shared catalogue,
   * and every other workspace would see it — editing the system catalogue by
   * the back door.
   */
  it('refuses a workspace linking two system exercises', () => {
    expect(canLinkVariants(system('ex_1'), system('ex_2'), 'org_a')).toEqual({
      allowed: false,
      reason: 'WOULD_EDIT_SYSTEM_CATALOGUE',
    });
  });

  it('explains each refusal without naming another workspace', () => {
    expect(describeVariantRefusal('ACROSS_WORKSPACES')).not.toContain('org_');
    expect(describeVariantRefusal('SAME_EXERCISE')).toContain('itself');
    expect(describeVariantRefusal('WOULD_EDIT_SYSTEM_CATALOGUE')).toContain('shared');
  });
});
