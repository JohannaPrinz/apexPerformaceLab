import { describe, expect, it } from 'vitest';

import {
  EXERCISE_DIFFICULTIES,
  EXERCISE_FORCE_TYPES,
  EXERCISE_MECHANICS,
  EXERCISE_VOCABULARIES,
  isDefined,
  isInVocabulary,
  pendingVocabularies,
  vocabularyListSchema,
  vocabularySchema,
  type Vocabulary,
} from './taxonomy';

/**
 * The vocabularies are what turns "no free strings" from an intention into a
 * property. These tests pin both halves: that a known value passes, and that an
 * unknown one is refused with the list named.
 */
describe('the small vocabularies', () => {
  it('describe how a movement loads, not who performs it', () => {
    expect(EXERCISE_FORCE_TYPES).toEqual(['push', 'pull', 'static', 'dynamic']);
    expect(EXERCISE_MECHANICS).toEqual(['compound', 'isolation']);
    expect(EXERCISE_DIFFICULTIES).toEqual(['beginner', 'intermediate', 'advanced']);
  });

  it('accepts a value it knows', () => {
    expect(vocabularySchema(EXERCISE_VOCABULARIES.forceType).safeParse('push').success).toBe(true);
  });

  it('refuses one it does not, and names the vocabulary', () => {
    const result = vocabularySchema(EXERCISE_VOCABULARIES.mechanic).safeParse('hybrid');

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain('mechanic');
  });
});

/**
 * All six are settled now. The machinery for an empty one stays, because it is
 * what would catch a vocabulary emptied by accident — and because a value
 * rejected with "the list is not defined yet" is far easier to act on than a
 * silent pass.
 */
describe('every vocabulary is defined', () => {
  it('leaves none open', () => {
    expect(pendingVocabularies()).toEqual([]);
  });

  it('reports each as defined', () => {
    for (const name of Object.keys(
      EXERCISE_VOCABULARIES,
    ) as (keyof typeof EXERCISE_VOCABULARIES)[]) {
      expect(isDefined(EXERCISE_VOCABULARIES[name]), name).toBe(true);
    }
  });

  it('still accepts an empty list — an unclassified exercise is valid', () => {
    expect(vocabularyListSchema(EXERCISE_VOCABULARIES.muscle).safeParse([]).success).toBe(true);
  });

  it('refuses a plausible-looking muscle that is not on the list', () => {
    const result = vocabularySchema(EXERCISE_VOCABULARIES.muscle).safeParse('pectorals');

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain('not a known muscle');
  });

  it('still says so plainly if a list were emptied', () => {
    const emptied = { name: 'muscle', values: [] as string[] };
    const result = vocabularySchema(emptied).safeParse('chest');

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain('not defined yet');
  });
});

/**
 * The lists themselves. Checked against what wger and Exercemus actually carry,
 * then decided by us — every value appears in at least one source except
 * `stability`, which is ours and is marked as such in the module.
 */
describe('the settled vocabularies', () => {
  it('names twenty muscles, in our common form rather than Latin', () => {
    expect(EXERCISE_VOCABULARIES.muscle.values).toHaveLength(20);
    expect(EXERCISE_VOCABULARIES.muscle.values).toContain('chest');
    expect(EXERCISE_VOCABULARIES.muscle.values).not.toContain('pectoralis_major');
  });

  it('carries no value meaning "no equipment" — bodyweight is the empty list', () => {
    expect(EXERCISE_VOCABULARIES.equipment.values).not.toContain('none');
    expect(EXERCISE_VOCABULARIES.equipment.values).not.toContain('other');
  });

  /**
   * Categories are the training type. Body region is already answered by the
   * muscles, and a category repeating it would be a second source for one fact.
   */
  it('classifies by training type, not body region', () => {
    for (const region of ['abs', 'arms', 'back', 'chest', 'legs', 'shoulders', 'calves']) {
      expect(EXERCISE_VOCABULARIES.category.values, region).not.toContain(region);
    }
    expect(EXERCISE_VOCABULARIES.category.values).toContain('strength');
    expect(EXERCISE_VOCABULARIES.category.values).toContain('mobility');
  });

  /** A brand and a competition format, kept out as §11 keeps HYROX out. */
  it('names no brand or competition format', () => {
    for (const value of Object.values(EXERCISE_VOCABULARIES).flatMap((v) => v.values)) {
      expect(['crossfit', 'strongman', 'hyrox'], value).not.toContain(value);
    }
  });
});

describe('vocabulary lists', () => {
  const colours: Vocabulary = { name: 'colour', values: ['red', 'green', 'blue'] };

  it('accepts several known values', () => {
    expect(vocabularyListSchema(colours).safeParse(['red', 'blue']).success).toBe(true);
  });

  it('refuses the same value twice', () => {
    const result = vocabularyListSchema(colours).safeParse(['red', 'red']);

    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toContain('twice');
  });

  it('refuses an unknown value among known ones', () => {
    expect(vocabularyListSchema(colours).safeParse(['red', 'mauve']).success).toBe(false);
  });

  it('caps the list', () => {
    expect(vocabularyListSchema(colours, 2).safeParse(['red', 'green', 'blue']).success).toBe(
      false,
    );
  });

  it('answers membership directly', () => {
    expect(isInVocabulary(colours, 'green')).toBe(true);
    expect(isInVocabulary(colours, 'chartreuse')).toBe(false);
  });
});
