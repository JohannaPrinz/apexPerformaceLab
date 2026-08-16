import { describe, expect, it } from 'vitest';

import { exerciseImportSchema, planExerciseImport } from './import';

/**
 * Relationships gained a type. These tests pin the two things that could go
 * wrong quietly: an old file losing nothing, and a typed file losing its type.
 */

const exercise = (key: string, extra: Record<string, unknown> = {}) => ({
  key,
  name: key,
  canonicalName: key,
  instructions: ['Eins.', 'Zwei.', 'Drei.'],
  primaryMuscles: ['chest'],
  secondaryMuscles: [],
  equipment: ['barbell'],
  category: 'strength',
  forceType: 'push',
  mechanic: 'compound',
  difficulty: 'beginner',
  unilateral: false,
  ...extra,
});

const plan = (exercises: unknown[]) =>
  planExerciseImport(exerciseImportSchema.parse({ formatVersion: 1, exercises }), []);

describe('the old flat format', () => {
  it('still imports, and counts as related', () => {
    const result = plan([exercise('a', { variantKeys: ['b'] }), exercise('b')]);

    expect(result.problems).toEqual([]);
    expect(result.variantPairs).toEqual([{ a: 'a', b: 'b', type: 'related' }]);
  });
});

describe('typed relationships', () => {
  it('keeps alternative', () => {
    const result = plan([
      exercise('a', { relationships: [{ key: 'b', type: 'alternative' }] }),
      exercise('b'),
    ]);

    expect(result.variantPairs).toEqual([{ a: 'a', b: 'b', type: 'alternative' }]);
  });

  it('keeps related', () => {
    const result = plan([
      exercise('a', { relationships: [{ key: 'b', type: 'related' }] }),
      exercise('b'),
    ]);

    expect(result.variantPairs).toEqual([{ a: 'a', b: 'b', type: 'related' }]);
  });

  it('rejects a type outside the vocabulary', () => {
    expect(() =>
      plan([exercise('a', { relationships: [{ key: 'b', type: 'sibling' }] }), exercise('b')]),
    ).toThrow();
  });

  /**
   * The upgrade case: a file may carry both forms while it is being migrated.
   * The typed declaration must win — the flat one knows less, and letting it
   * overwrite would be the silent information loss this change exists to stop.
   */
  it('lets a typed declaration win over an untyped one for the same pair', () => {
    const result = plan([
      exercise('a', { variantKeys: ['b'], relationships: [{ key: 'b', type: 'alternative' }] }),
      exercise('b'),
    ]);

    expect(result.variantPairs).toEqual([{ a: 'a', b: 'b', type: 'alternative' }]);
  });

  it('accepts the same typed pair declared from both sides', () => {
    const result = plan([
      exercise('a', { relationships: [{ key: 'b', type: 'alternative' }] }),
      exercise('b', { relationships: [{ key: 'a', type: 'alternative' }] }),
    ]);

    expect(result.variantPairs).toHaveLength(1);
    expect(result.variantPairs[0]?.type).toBe('alternative');
  });

  it('reports a pair declared with two different types instead of picking one', () => {
    const result = plan([
      exercise('a', { relationships: [{ key: 'b', type: 'alternative' }] }),
      exercise('b', { relationships: [{ key: 'a', type: 'related' }] }),
    ]);

    expect(result.problems.map((problem) => problem.kind)).toContain('CONFLICTING_RELATIONSHIP');
  });

  it('still refuses a relationship to an exercise the file does not have', () => {
    const result = plan([exercise('a', { relationships: [{ key: 'ghost', type: 'related' }] })]);

    expect(result.problems.map((problem) => problem.kind)).toContain('UNKNOWN_VARIANT');
  });
});
