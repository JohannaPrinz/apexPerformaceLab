import { describe, expect, it } from 'vitest';

import {
  EQUIPMENT,
  EXERCISE_CATEGORIES,
  EXERCISE_DIFFICULTIES,
  EXERCISE_FORCE_TYPES,
  EXERCISE_MECHANICS,
  MUSCLES,
} from '@apex/domain';

import { BLOCK_1, overriddenFields, REVIEWED, reviewDecision } from './reviewed';

/**
 * The review decisions are hand-written data, and hand-written data drifts.
 *
 * These tests guard the two ways that drift would go unnoticed: a value outside
 * the controlled vocabularies, and a decision that silently changes nothing.
 */

describe('the decisions stay inside the vocabularies', () => {
  it('uses only known muscles', () => {
    for (const decision of REVIEWED) {
      for (const muscle of [
        ...(decision.primaryMuscles ?? []),
        ...(decision.secondaryMuscles ?? []),
      ]) {
        expect(MUSCLES as readonly string[], `${decision.canonicalName}: ${muscle}`).toContain(
          muscle,
        );
      }
    }
  });

  it('uses only known equipment, categories, force types, mechanics and difficulties', () => {
    for (const decision of REVIEWED) {
      for (const item of decision.equipment ?? []) {
        expect(EQUIPMENT as readonly string[], decision.canonicalName).toContain(item);
      }

      if (decision.category !== undefined) {
        expect(EXERCISE_CATEGORIES as readonly string[]).toContain(decision.category);
      }

      if (decision.forceType !== undefined) {
        expect(EXERCISE_FORCE_TYPES as readonly string[]).toContain(decision.forceType);
      }

      if (decision.mechanic !== undefined) {
        expect(EXERCISE_MECHANICS as readonly string[]).toContain(decision.mechanic);
      }

      if (decision.difficulty !== undefined) {
        expect(EXERCISE_DIFFICULTIES as readonly string[]).toContain(decision.difficulty);
      }
    }
  });

  it('never puts the same muscle in primary and secondary', () => {
    for (const decision of REVIEWED) {
      const primary = new Set(decision.primaryMuscles ?? []);

      for (const muscle of decision.secondaryMuscles ?? []) {
        expect(primary.has(muscle), `${decision.canonicalName}: ${muscle}`).toBe(false);
      }
    }
  });
});

describe('every decision carries its reasoning', () => {
  it('has a block and a reason worth reading', () => {
    for (const decision of REVIEWED) {
      expect(decision.block).toBeGreaterThan(0);

      // For a removal the substance sits in `remove`; the note only labels it.
      const reason = decision.remove ?? decision.note;

      expect(reason.length, decision.canonicalName).toBeGreaterThan(20);
    }
  });

  it('either changes a field or removes the exercise', () => {
    for (const decision of REVIEWED) {
      const acts = overriddenFields(decision).length > 0 || decision.remove !== undefined;

      expect(acts, decision.canonicalName).toBe(true);
    }
  });

  it('never both edits and removes the same exercise', () => {
    for (const decision of REVIEWED) {
      if (decision.remove === undefined) continue;

      // A removed row that also carries edits invites the question of which one
      // the run applied. It applies neither, and the decision should say so.
      expect(overriddenFields(decision), decision.canonicalName).toEqual([]);
    }
  });

  it('names each exercise once', () => {
    const names = REVIEWED.map((decision) => decision.canonicalName);

    expect(new Set(names).size).toBe(names.length);
  });
});

/**
 * The whole point of the language decision: no English text survives into the
 * catalogue as display content. A German instruction step that still reads
 * "Repeat for the recommended amount of repetitions" would ship untranslated.
 */
describe('instructions are German', () => {
  it('gives every Block 1 exercise German steps', () => {
    expect(BLOCK_1).toHaveLength(34);

    for (const decision of BLOCK_1) {
      expect(decision.instructions, decision.canonicalName).toBeDefined();
      expect(decision.instructions?.length ?? 0).toBeGreaterThanOrEqual(3);
    }
  });

  it('leaves no English boilerplate behind', () => {
    // Words common in the wrkout prose that are *not* German. Deliberately not
    // "Position" or "Start" — those are German words too, and a check that fires
    // on correct German teaches everyone to ignore it.
    const english = /\b(the|your|and|with|until|while|down|weight|repeat)\b/i;

    for (const decision of REVIEWED) {
      for (const step of decision.instructions ?? []) {
        expect(english.test(step), `${decision.canonicalName}: ${step.slice(0, 60)}`).toBe(false);
      }
    }
  });
});

describe('lookup', () => {
  it('finds a decision by its canonical name', () => {
    expect(reviewDecision('Front Barbell Squat')?.name).toBe('Frontkniebeuge');
    expect(reviewDecision('Front Barbell Squat')?.difficulty).toBe('intermediate');
  });

  it('returns nothing for an exercise nobody reviewed', () => {
    // Any name from a block the review has not reached yet.
    expect(reviewDecision('Barbell Curl')).toBeUndefined();
  });
});
