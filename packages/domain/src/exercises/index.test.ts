import { describe, expect, it } from 'vitest';

import {
  canArchiveExercise,
  canEditExercise,
  canRemoveExercise,
  exerciseSchema,
  findSystemExercise,
  isUsed,
  NO_EXERCISE_USAGE,
  scopeOf,
  SYSTEM_EXERCISES,
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
    expect(findSystemExercise('deadlift')?.name).toBe('Deadlift');
    expect(findSystemExercise('not_a_movement')).toBeUndefined();
  });
});

describe('exercise input', () => {
  it('requires a stable identifier, not a display name', () => {
    expect(exerciseSchema.safeParse({ key: 'Bench Press', name: 'Bench Press' }).success).toBe(
      false,
    );
  });

  it('accepts freely named muscle groups — no invented taxonomy', () => {
    const parsed = exerciseSchema.parse({
      key: 'hip_thrust',
      name: 'Hip thrust',
      muscleGroups: ['glutes', 'hamstrings'],
    });

    expect(parsed.muscleGroups).toEqual(['glutes', 'hamstrings']);
  });

  it('defaults to no muscle groups rather than guessing them', () => {
    expect(exerciseSchema.parse({ key: 'row', name: 'Row' }).muscleGroups).toEqual([]);
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
