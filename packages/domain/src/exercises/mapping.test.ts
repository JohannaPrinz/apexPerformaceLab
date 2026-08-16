import { describe, expect, it } from 'vitest';

import { mapExternalList, mapExternalValue, mappingTable, normaliseExternal } from './mapping';
import {
  EQUIPMENT,
  EXERCISE_CATEGORIES,
  isInVocabulary,
  MUSCLES,
  muscleVocabulary,
} from './taxonomy';

/**
 * No source's taxonomy reaches the database. These tests pin the translation
 * and — more importantly — pin that an untranslated value is *reported* rather
 * than guessed or quietly dropped.
 */

describe('normalising an external value', () => {
  it('reduces the spellings the sources actually differ in', () => {
    expect(normaliseExternal('SZ-Bar')).toBe('sz_bar');
    expect(normaliseExternal('ez curl bar')).toBe('ez_curl_bar');
    expect(normaliseExternal('  Pull-up bar ')).toBe('pull_up_bar');
    expect(normaliseExternal('Olympic Weightlifting')).toBe('olympic_weightlifting');
  });
});

describe('wger muscles', () => {
  it('translates the Latin names it publishes', () => {
    expect(mapExternalValue('wger', 'muscle', 'Pectoralis major')).toEqual({
      kind: 'mapped',
      value: 'chest',
    });
    expect(mapExternalValue('wger', 'muscle', 'Biceps femoris')).toEqual({
      kind: 'mapped',
      value: 'hamstrings',
    });
    expect(mapExternalValue('wger', 'muscle', 'Obliquus externus abdominis')).toEqual({
      kind: 'mapped',
      value: 'obliques',
    });
  });

  it('also takes the English aliases the same API carries', () => {
    expect(mapExternalValue('wger', 'muscle', 'Quads')).toEqual({ kind: 'mapped', value: 'quads' });
  });

  it('reports a muscle nobody has decided on', () => {
    expect(mapExternalValue('wger', 'muscle', 'Rhomboideus')).toEqual({ kind: 'unmapped' });
  });
});

describe('exercemus muscles', () => {
  it('translates its common English names', () => {
    expect(mapExternalValue('exercemus', 'muscle', 'middle back')).toEqual({
      kind: 'mapped',
      value: 'upper_back',
    });
  });

  /**
   * A dropped value and an unmapped one look identical in the database and
   * could not be more different in review — which is why they are separate
   * outcomes rather than both being "absent".
   */
  it('drops a region with a reason rather than inventing a muscle', () => {
    const outcome = mapExternalValue('exercemus', 'muscle', 'back');

    expect(outcome.kind).toBe('dropped');
    expect(outcome.kind === 'dropped' && outcome.reason).toContain('region');
  });

  it('drops "cardio", which is not a muscle at all', () => {
    expect(mapExternalValue('exercemus', 'muscle', 'cardio').kind).toBe('dropped');
  });
});

describe('equipment', () => {
  it('brings both spellings of the same bar onto one value', () => {
    expect(mapExternalValue('wger', 'equipment', 'SZ-Bar')).toEqual({
      kind: 'mapped',
      value: 'ez_curl_bar',
    });
    expect(mapExternalValue('exercemus', 'equipment', 'ez curl bar')).toEqual({
      kind: 'mapped',
      value: 'ez_curl_bar',
    });
  });

  it('maps the ball each source names differently', () => {
    expect(mapExternalValue('wger', 'equipment', 'Swiss Ball')).toEqual({
      kind: 'mapped',
      value: 'exercise_ball',
    });
    expect(mapExternalValue('exercemus', 'equipment', 'exercise ball')).toEqual({
      kind: 'mapped',
      value: 'exercise_ball',
    });
  });

  /** Bodyweight is the empty list; a value meaning "no value" is a second way to say it. */
  it('drops "none" rather than carrying a value for having none', () => {
    expect(mapExternalValue('exercemus', 'equipment', 'none').kind).toBe('dropped');
    expect(mapExternalValue('wger', 'equipment', 'none (bodyweight exercise)').kind).toBe(
      'dropped',
    );
  });

  it('drops "other", which classifies nothing', () => {
    expect(mapExternalValue('exercemus', 'equipment', 'other').kind).toBe('dropped');
  });
});

/**
 * The two sources classify on different axes: wger by body region, Exercemus by
 * training type. We take the training type, because body region is already
 * answered by the muscles — so wger's categories map to nothing here.
 */
describe('categories', () => {
  it('takes Exercemus’s training types', () => {
    expect(mapExternalValue('exercemus', 'category', 'strength')).toEqual({
      kind: 'mapped',
      value: 'strength',
    });
    expect(mapExternalValue('exercemus', 'category', 'stretching')).toEqual({
      kind: 'mapped',
      value: 'mobility',
    });
    expect(mapExternalValue('exercemus', 'category', 'cardio')).toEqual({
      kind: 'mapped',
      value: 'endurance',
    });
  });

  it('drops wger’s body regions, which are a different axis', () => {
    for (const region of ['Abs', 'Arms', 'Back', 'Chest', 'Legs', 'Shoulders', 'Calves']) {
      const outcome = mapExternalValue('wger', 'category', region);

      expect(outcome.kind, region).toBe('dropped');
      expect(outcome.kind === 'dropped' && outcome.reason, region).toContain('region');
    }
  });

  it('keeps wger’s one training-type category', () => {
    expect(mapExternalValue('wger', 'category', 'Cardio')).toEqual({
      kind: 'mapped',
      value: 'endurance',
    });
  });

  /** A brand and a competition format, kept out for the same reason HYROX is not a module. */
  it('drops crossfit and strongman', () => {
    expect(mapExternalValue('exercemus', 'category', 'crossfit').kind).toBe('dropped');
    expect(mapExternalValue('exercemus', 'category', 'strongman').kind).toBe('dropped');
  });
});

describe('a value already in our vocabulary passes through', () => {
  it('accepts our own spelling without a table entry', () => {
    expect(mapExternalValue('wger', 'muscle', 'upper_back')).toEqual({
      kind: 'mapped',
      value: 'upper_back',
    });
  });

  it('accepts a hand-written file that uses no source dialect at all', () => {
    expect(mapExternalValue('a_source_with_no_table', 'category', 'stability')).toEqual({
      kind: 'mapped',
      value: 'stability',
    });
  });
});

describe('mapping a list', () => {
  it('keeps order and removes the duplicates two spellings create', () => {
    const result = mapExternalList('wger', 'muscle', [
      'Pectoralis major',
      'Chest',
      'Triceps brachii',
    ]);

    expect(result.values).toEqual(['chest', 'triceps']);
  });

  it('separates what was dropped from what nobody decided', () => {
    const result = mapExternalList('exercemus', 'muscle', ['chest', 'back', 'rhomboids']);

    expect(result.values).toEqual(['chest']);
    expect(result.dropped.map((entry) => entry.external)).toEqual(['back']);
    expect(result.unmapped).toEqual(['rhomboids']);
  });
});

/**
 * Every table entry must land on a value our vocabulary holds. A table pointing
 * at a value we removed would produce exercises classified against a word that
 * no longer exists, and nothing else would catch it.
 */
describe('the tables agree with the vocabularies', () => {
  const cases = [
    { source: 'wger', vocabulary: 'muscle' as const, values: MUSCLES },
    { source: 'exercemus', vocabulary: 'muscle' as const, values: MUSCLES },
    { source: 'wger', vocabulary: 'equipment' as const, values: EQUIPMENT },
    { source: 'exercemus', vocabulary: 'equipment' as const, values: EQUIPMENT },
    { source: 'wger', vocabulary: 'category' as const, values: EXERCISE_CATEGORIES },
    { source: 'exercemus', vocabulary: 'category' as const, values: EXERCISE_CATEGORIES },
  ];

  for (const { source, vocabulary, values } of cases) {
    it(`${source} → ${vocabulary}`, () => {
      for (const entry of mappingTable(source, vocabulary)) {
        if (entry.internal === null) continue;

        expect(values as readonly string[], `${entry.external} → ${entry.internal}`).toContain(
          entry.internal,
        );
      }
    });
  }

  it('translates every muscle both sources publish', () => {
    // The exact lists read from the two APIs in August 2026.
    const wger = [
      'Anterior deltoid',
      'Biceps brachii',
      'Biceps femoris',
      'Brachialis',
      'Gastrocnemius',
      'Gluteus maximus',
      'Latissimus dorsi',
      'Obliquus externus abdominis',
      'Pectoralis major',
      'Quadriceps femoris',
      'Rectus abdominis',
      'Serratus anterior',
      'Soleus',
      'Trapezius',
      'Triceps brachii',
    ];

    for (const muscle of wger) {
      expect(mapExternalValue('wger', 'muscle', muscle).kind, muscle).toBe('mapped');
    }
  });

  it('translates every piece of equipment both sources publish', () => {
    const wger = [
      'Barbell',
      'SZ-Bar',
      'Dumbbell',
      'Gym mat',
      'Swiss Ball',
      'Pull-up bar',
      'none (bodyweight exercise)',
      'Bench',
      'Incline bench',
      'Kettlebell',
      'Resistance band',
      'Cable machine',
    ];
    const exercemus = [
      'none',
      'ez curl bar',
      'barbell',
      'dumbbell',
      'gym mat',
      'exercise ball',
      'medicine ball',
      'pull-up bar',
      'bench',
      'incline bench',
      'kettlebell',
      'machine',
      'cable',
      'bands',
      'foam roll',
      'other',
    ];

    for (const item of wger) {
      expect(mapExternalValue('wger', 'equipment', item).kind, item).not.toBe('unmapped');
    }
    for (const item of exercemus) {
      expect(mapExternalValue('exercemus', 'equipment', item).kind, item).not.toBe('unmapped');
    }
  });

  it('translates every category both sources publish', () => {
    const wger = ['Abs', 'Arms', 'Back', 'Calves', 'Cardio', 'Chest', 'Legs', 'Shoulders'];
    const exercemus = [
      'strength',
      'stretching',
      'plyometrics',
      'strongman',
      'cardio',
      'olympic weightlifting',
      'crossfit',
      'calisthenics',
    ];

    for (const item of wger) {
      expect(mapExternalValue('wger', 'category', item).kind, item).not.toBe('unmapped');
    }
    for (const item of exercemus) {
      expect(mapExternalValue('exercemus', 'category', item).kind, item).not.toBe('unmapped');
    }
  });
});

describe('our vocabularies', () => {
  it('hold what the mapping targets', () => {
    expect(isInVocabulary(muscleVocabulary, 'upper_back')).toBe(true);
    expect(MUSCLES).toHaveLength(20);
    // 20: five implements added by the review, one block at a time.
    expect(EQUIPMENT).toHaveLength(20);
  });

  /**
   * Three implements no source dataset names.
   *
   * They exist because a reviewer looked at an exercise and found the vocabulary
   * short — a plate pinch filed under `machine`, a ring muscle-up under
   * `pull_up_bar`. Nothing may map onto them automatically: a source value
   * silently landing here would put an implement on an exercise nobody checked.
   */
  it('reaches the reviewed implements through a decision only', () => {
    const reviewOnly = ['weight_belt', 'weight_plate', 'gymnastic_rings', 'suspension_trainer'];

    for (const value of reviewOnly) {
      expect(EQUIPMENT as readonly string[]).toContain(value);
    }

    for (const source of ['wger', 'exercemus', 'wrkout']) {
      for (const entry of mappingTable(source, 'equipment')) {
        expect(reviewOnly, `${source}: ${entry.external}`).not.toContain(entry.internal);
        expect(reviewOnly, `${source}: ${entry.external}`).not.toContain(entry.external);
      }
    }
    expect(EXERCISE_CATEGORIES).toHaveLength(7);
  });
});
