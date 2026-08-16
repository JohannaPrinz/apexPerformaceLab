import { describe, expect, it } from 'vitest';

import {
  describeImportProblem,
  exerciseImportSchema,
  importReadiness,
  planExerciseImport,
  type ExerciseImport,
} from './import';

/**
 * A catalogue of several hundred rows must be validated as a **unit** before
 * anything is written. Half an import is worse than none: it leaves exercises
 * whose variants point at movements that never landed.
 */

const entry = (key: string, overrides: Record<string, unknown> = {}) => ({
  key,
  name: key,
  canonicalName: key,
  ...overrides,
});

/**
 * Overrides are typed loosely on purpose: this is the schema's **input**, where
 * defaults have not been applied yet, and `Partial<ExerciseImport>` describes
 * its output. Parsing is exactly the boundary between the two.
 */
const file = (overrides: Record<string, unknown> = {}): ExerciseImport =>
  exerciseImportSchema.parse({
    formatVersion: 1,
    exercises: [entry('bench_press')],
    ...overrides,
  });

describe('the import file', () => {
  it('carries a format version, so the shape can change without guessing', () => {
    expect(exerciseImportSchema.safeParse({ exercises: [entry('a')] }).success).toBe(false);
  });

  it('requires both names on every entry', () => {
    const missingCanonical = { formatVersion: 1, exercises: [{ key: 'squat', name: 'Kniebeuge' }] };

    expect(exerciseImportSchema.safeParse(missingCanonical).success).toBe(false);
  });

  it('rejects a key that is not a stable identifier', () => {
    expect(
      exerciseImportSchema.safeParse({
        formatVersion: 1,
        exercises: [entry('Bench Press')],
      }).success,
    ).toBe(false);
  });

  it('accepts an entry with nothing classified — classification is optional', () => {
    expect(
      exerciseImportSchema.safeParse({ formatVersion: 1, exercises: [entry('squat')] }).success,
    ).toBe(true);
  });

  it('accepts a fully classified entry in our own vocabulary', () => {
    const classified = {
      formatVersion: 1,
      exercises: [
        entry('squat', {
          primaryMuscles: ['quads', 'glutes'],
          equipment: ['barbell'],
          category: 'strength',
          forceType: 'push',
          mechanic: 'compound',
          difficulty: 'intermediate',
        }),
      ],
    };

    expect(exerciseImportSchema.safeParse(classified).success).toBe(true);
  });

  /**
   * The file is expected to be in *our* vocabulary — external spellings are
   * translated by `mapping.ts` before they get here, so an untranslated one is
   * a mistake rather than something to accommodate.
   */
  it('rejects a source spelling that was never translated', () => {
    const untranslated = {
      formatVersion: 1,
      exercises: [entry('squat', { primaryMuscles: ['quadriceps femoris'] })],
    };

    expect(exerciseImportSchema.safeParse(untranslated).success).toBe(false);
  });
});

describe('provenance', () => {
  it('applies the file’s source and licence to every entry', () => {
    const plan = planExerciseImport(
      file({ source: 'example-dataset', license: 'CC-BY-4.0', exercises: [entry('squat')] }),
    );

    expect(plan.entries[0]).toMatchObject({ source: 'example-dataset', license: 'CC-BY-4.0' });
  });

  it('lets an entry override the file’s licence', () => {
    const plan = planExerciseImport(
      file({
        source: 'example-dataset',
        license: 'CC-BY-4.0',
        exercises: [entry('squat', { license: 'CC0-1.0' })],
      }),
    );

    expect(plan.entries[0]?.license).toBe('CC0-1.0');
  });

  /**
   * A source without a licence is exactly the state that makes a later
   * redistribution question unanswerable — which is why the field exists.
   */
  it('refuses imported data that records no licence', () => {
    const plan = planExerciseImport(file({ source: 'example-dataset' }));

    expect(plan.problems).toContainEqual({ kind: 'MISSING_LICENCE', key: 'bench_press' });
  });

  it('accepts an entry with neither — it was authored here, not imported', () => {
    expect(planExerciseImport(file()).problems).toEqual([]);
  });

  it('refuses two entries sharing a source id, which a re-import could not tell apart', () => {
    const plan = planExerciseImport(
      file({
        source: 'example-dataset',
        license: 'CC0-1.0',
        exercises: [entry('a', { sourceId: '17' }), entry('b', { sourceId: '17' })],
      }),
    );

    expect(plan.problems).toContainEqual({ kind: 'DUPLICATE_SOURCE_ID', sourceId: '17' });
  });
});

describe('variants across the file', () => {
  it('stores one row per pair, however many sides declare it', () => {
    const plan = planExerciseImport(
      file({
        exercises: [
          entry('squat', { variantKeys: ['front_squat'] }),
          entry('front_squat', { variantKeys: ['squat'] }),
        ],
      }),
    );

    expect(plan.variantPairs).toEqual([{ a: 'front_squat', b: 'squat', type: 'related' }]);
  });

  it('orders the pair, so the same fact is never written twice', () => {
    const plan = planExerciseImport(
      file({
        exercises: [entry('zercher_squat', { variantKeys: ['squat'] }), entry('squat')],
      }),
    );

    expect(plan.variantPairs).toEqual([{ a: 'squat', b: 'zercher_squat', type: 'related' }]);
  });

  it('refuses a variant the file does not contain', () => {
    const plan = planExerciseImport(
      file({ exercises: [entry('squat', { variantKeys: ['hack_squat'] })] }),
    );

    expect(plan.problems).toContainEqual({
      kind: 'UNKNOWN_VARIANT',
      key: 'squat',
      variantKey: 'hack_squat',
    });
  });

  it('refuses an exercise listing itself', () => {
    const plan = planExerciseImport(
      file({ exercises: [entry('squat', { variantKeys: ['squat'] })] }),
    );

    expect(plan.problems).toContainEqual({ kind: 'SELF_VARIANT', key: 'squat' });
  });
});

describe('duplicate keys', () => {
  it('refuses a file that names one key twice', () => {
    const plan = planExerciseImport(file({ exercises: [entry('squat'), entry('squat')] }));

    expect(plan.problems).toContainEqual({ kind: 'DUPLICATE_KEY', key: 'squat' });
  });
});

describe('problem messages', () => {
  it('names what is wrong rather than that something is', () => {
    expect(describeImportProblem({ kind: 'DUPLICATE_KEY', key: 'squat' })).toContain('squat');
    expect(
      describeImportProblem({ kind: 'UNKNOWN_VARIANT', key: 'squat', variantKey: 'hack_squat' }),
    ).toContain('hack_squat');
    expect(describeImportProblem({ kind: 'MISSING_LICENCE', key: 'squat' })).toContain('licence');
  });
});

/**
 * The vocabularies are settled, so the catalogue is importable as far as the
 * taxonomy is concerned. The check stays as a guard: a vocabulary emptied by
 * accident would otherwise fail row by row with the same message several
 * hundred times.
 */
describe('import readiness', () => {
  it('reports the taxonomy as ready', () => {
    const readiness = importReadiness();

    expect(readiness.ready).toBe(true);
    expect(readiness.pending).toEqual([]);
  });
});
