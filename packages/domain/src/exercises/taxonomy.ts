import { z } from 'zod';

/**
 * Controlled vocabularies for the exercise catalogue.
 *
 * ## Ours, informed by the sources — not copied from them
 *
 * The lists below were settled by checking what wger and Exercemus actually
 * carry (see `sources.ts`) and then deciding what *we* mean. Every value here
 * appears in at least one of those datasets, except where a note says
 * otherwise — so nothing is invented, and nothing is adopted merely because a
 * source happened to spell it that way.
 *
 * External spellings never reach the database. `mapping.ts` translates them.
 *
 * ## Why these are code, not a database enum
 *
 * Exactly the arrangement `moduleKey` and `MeasurementType.category` already
 * use: the column is a `String`, and what may go in it is a list maintained
 * here. Adding a muscle or a piece of equipment is then **a code change with a
 * reviewable diff**, not a migration — which matters for a catalogue meant to
 * grow to several hundred exercises whose vocabulary will be corrected as it
 * does.
 *
 * "No free strings" is satisfied at the layer that can actually satisfy it:
 * every boundary validates against these lists, and an unknown value is
 * rejected with the vocabulary named.
 */

export interface Vocabulary {
  /** Named in error messages, so a rejection says which list was consulted. */
  readonly name: string;
  readonly values: readonly string[];
}

function vocabulary(name: string, values: readonly string[]): Vocabulary {
  return { name, values };
}

/**
 * The muscles a movement works.
 *
 * Twenty, drawn from the union of what the two sources name. wger uses Latin
 * anatomy with English aliases (`Pectoralis major` / `Chest`); Exercemus uses
 * common English (`chest`). **We use the common form**, because the reader is a
 * coach choosing an exercise, not an anatomist — and because the Latin term is
 * recoverable from the mapping table while the reverse is not.
 *
 * Deliberately absent: Exercemus's `back` and `cardio`. The first is a region
 * covering three entries we already have separately, the second is not a
 * muscle at all. Both are handled in `mapping.ts` rather than adopted.
 */
export const MUSCLES = [
  // Torso, front
  'chest',
  'serratus_anterior',
  'abs',
  'obliques',
  // Torso, back
  'lats',
  'upper_back',
  'traps',
  'lower_back',
  // Arms and shoulders
  'shoulders',
  'biceps',
  'brachialis',
  'triceps',
  'forearms',
  // Hips and legs
  'glutes',
  'quads',
  'hamstrings',
  'adductors',
  'abductors',
  'calves',
  'soleus',
] as const;

export type Muscle = (typeof MUSCLES)[number];
export const muscleVocabulary = vocabulary('muscle', MUSCLES);

/**
 * What the movement is performed with.
 *
 * Fourteen, from the union of both sources, normalised to one spelling —
 * wger's `SZ-Bar` and Exercemus's `ez curl bar` are the same bar.
 *
 * Deliberately absent, and both handled in `mapping.ts`:
 *
 * - **`none`.** Bodyweight is the *empty list*. A value meaning "no value" is
 *   a second way to say the same thing, and it is the way that makes every
 *   later filter carry a special case.
 * - **`other`.** It classifies nothing. An exercise whose equipment we cannot
 *   place is better left unclassified than filed under a label that tells a
 *   coach nothing and cannot be searched.
 */
export const EQUIPMENT = [
  'barbell',
  'ez_curl_bar',
  'dumbbell',
  'kettlebell',
  'machine',
  'cable',
  'resistance_band',
  'pull_up_bar',
  'bench',
  'incline_bench',
  'gym_mat',
  'exercise_ball',
  'medicine_ball',
  'foam_roller',
  /**
   * A weight belt, as *load* rather than support.
   *
   * Added in the Block 2 catalogue review: the weighted squat hangs its load
   * from a belt, and without this value the exercise could not state what it
   * needs. No source dataset carries the term, so nothing maps to it — it is
   * reached only through a reviewed decision.
   *
   * Not to be confused with a lifting belt worn for bracing, which is
   * equipment a lifter brings, not equipment an exercise requires.
   */
  'weight_belt',
  /**
   * A loose plate, handled on its own rather than loaded onto a bar.
   *
   * Grip work pinches one; carries and holds use one as the whole load. Added in
   * the Block 3 review, where the plate pinch hold had been filed under
   * `machine` for want of anywhere better.
   */
  'weight_plate',
  /**
   * Gymnastic rings.
   *
   * A distinct implement, not a substitute for a bar: the instability is the
   * training stimulus. Added rather than rewriting ring exercises as bar
   * exercises, which would have described a different movement.
   */
  'gymnastic_rings',
  /**
   * A suspension trainer — straps anchored overhead, handles at the ends.
   *
   * Added in the Block 7 review. Four exercises needed it, three of them saying
   * so in their own German name while their equipment list read "bodyweight".
   * The strap is what makes the movement unstable, so it is equipment in the
   * same sense a bench is.
   */
  'suspension_trainer',
  /**
   * A skipping rope, and a battle rope — two ropes that share nothing else.
   *
   * Added in the Block 11 review. The battle rope had been filed as
   * `resistance_band`, which is the opposite of what it does: a band gives way,
   * a battle rope is accelerated.
   */
  'jump_rope',
  'battle_rope',
] as const;

export type Equipment = (typeof EQUIPMENT)[number];
export const equipmentVocabulary = vocabulary('equipment', EQUIPMENT);

/**
 * The kind of training a movement belongs to.
 *
 * **The two sources classify on different axes**, and that had to be decided
 * rather than merged: wger's categories are body regions (Abs, Arms, Back,
 * Chest, Legs, Shoulders, Calves, Cardio); Exercemus's are training types
 * (strength, stretching, plyometrics, cardio, …).
 *
 * We take the **training type**. Body region is already answered — and answered
 * better — by `primaryMuscles`, so a category repeating it would be a second
 * source for one fact. wger's regional categories are therefore mapped to
 * muscles, not to this list.
 *
 * Two departures from Exercemus's set, both deliberate:
 *
 * - **`crossfit` and `strongman` are dropped.** One is a brand, the other a
 *   competition format, and the same rule that keeps HYROX out of the module
 *   registry applies here (§11). Their movements are strength or plyometrics
 *   and map accordingly.
 * - **`stability` is added**, and it is the one value in this file that no
 *   source carries. It is here because stability work was named as required
 *   coverage for the catalogue, and neither dataset offers a home for it.
 *
 * `cardio` is renamed `endurance` and `stretching` renamed `mobility`, to match
 * the words the rest of this system already uses — `MEASUREMENT_CATEGORIES` has
 * `endurance`, and `mobility` is a module key.
 *
 * **`olympic_weightlifting` means the barbell lifts.** Snatch, clean and jerk
 * and their recognisable barbell derivatives. A kettlebell snatch, clean or jerk
 * borrows the name but not the discipline, and belongs in `strength` — decided
 * in the Block 1 catalogue review. Sorting by the word in the name would put
 * half the kettlebell rack into a competition category a coach uses to find
 * barbell work.
 */
/**
 * How two exercises relate.
 *
 * Settled in the relationship review, and the distinction is the whole point of
 * having a type at all:
 *
 * - **`alternative`** — the second exercise can take the first one's place when
 *   the equipment is missing or the movement is unwanted. Barbell squat and
 *   dumbbell squat; machine and free-weight calf raise.
 * - **`related`** — biomechanically close but **not** interchangeable. A front
 *   squat is not a substitute for a back squat, and a conventional deadlift is
 *   not a sumo deadlift; each trains something the other does not.
 *
 * The relationship is symmetric — one row, smaller id first — and the type
 * reads the same from either side. A relationship that meant different things
 * in each direction would need two rows and a second decision nobody made.
 */
export const EXERCISE_RELATIONSHIP_TYPES = ['alternative', 'related'] as const;

export type ExerciseRelationshipType = (typeof EXERCISE_RELATIONSHIP_TYPES)[number];
export const exerciseRelationshipVocabulary = vocabulary(
  'relationship',
  EXERCISE_RELATIONSHIP_TYPES,
);

export const EXERCISE_CATEGORIES = [
  'strength',
  'endurance',
  'mobility',
  'stability',
  'plyometrics',
  'olympic_weightlifting',
  'calisthenics',
] as const;

export type ExerciseCategory = (typeof EXERCISE_CATEGORIES)[number];
export const exerciseCategoryVocabulary = vocabulary('category', EXERCISE_CATEGORIES);

/**
 * How the movement loads the body.
 *
 * **Neither source carries this field.** wger has no equivalent, and the
 * Exercemus dataset drops the `force` field its own upstream once had. These
 * four are therefore ours, set as specified.
 *
 * They mix two ideas — `push`/`pull` describe direction, `static`/`dynamic`
 * describe whether the joint moves. A plank is `static`; a bench press is both
 * `push` and `dynamic`. Since the column holds one value, the rule is: name the
 * **direction** when the movement has one, and fall back to `static` or
 * `dynamic` when it does not. Recorded here because it is the kind of thing
 * that gets classified inconsistently once several people fill the catalogue.
 */
export const EXERCISE_FORCE_TYPES = ['push', 'pull', 'static', 'dynamic'] as const;
export type ExerciseForceType = (typeof EXERCISE_FORCE_TYPES)[number];
export const forceTypeVocabulary = vocabulary('force type', EXERCISE_FORCE_TYPES);

/**
 * Whether the movement crosses several joints or one.
 *
 * Also carried by neither source in the data we checked. Two values, and the
 * distinction is standard enough to be uncontroversial.
 */
export const EXERCISE_MECHANICS = ['compound', 'isolation'] as const;
export type ExerciseMechanic = (typeof EXERCISE_MECHANICS)[number];
export const mechanicVocabulary = vocabulary('mechanic', EXERCISE_MECHANICS);

/**
 * How demanding the movement is to perform correctly.
 *
 * Carried by neither source either. Note that this describes the **movement**,
 * never the athlete — a beginner may be prescribed an advanced movement, and
 * the catalogue has no opinion about that.
 */
export const EXERCISE_DIFFICULTIES = ['beginner', 'intermediate', 'advanced'] as const;
export type ExerciseDifficulty = (typeof EXERCISE_DIFFICULTIES)[number];
export const difficultyVocabulary = vocabulary('difficulty', EXERCISE_DIFFICULTIES);

export const EXERCISE_VOCABULARIES = {
  muscle: muscleVocabulary,
  equipment: equipmentVocabulary,
  category: exerciseCategoryVocabulary,
  forceType: forceTypeVocabulary,
  mechanic: mechanicVocabulary,
  difficulty: difficultyVocabulary,
} as const;

export type ExerciseVocabularyName = keyof typeof EXERCISE_VOCABULARIES;

/** Whether a vocabulary has been filled in. */
export function isDefined(vocabulary_: Vocabulary): boolean {
  return vocabulary_.values.length > 0;
}

/** Vocabularies with no values — none today; the check stays as a guard. */
export function pendingVocabularies(): readonly ExerciseVocabularyName[] {
  return (Object.keys(EXERCISE_VOCABULARIES) as ExerciseVocabularyName[]).filter(
    (name) => !isDefined(EXERCISE_VOCABULARIES[name]),
  );
}

export function isInVocabulary(vocabulary_: Vocabulary, value: string): boolean {
  return vocabulary_.values.includes(value);
}

/**
 * A schema accepting one value of a vocabulary.
 *
 * An empty vocabulary rejects everything, and says so — the honest answer while
 * a list is unfilled, and far better than accepting whatever arrives and
 * discovering at import time that half the catalogue used a spelling nobody
 * agreed on.
 */
export function vocabularySchema(vocabulary_: Vocabulary): z.ZodType<string> {
  return z.string().superRefine((value, context) => {
    if (isInVocabulary(vocabulary_, value)) return;

    context.addIssue({
      code: 'custom',
      message: isDefined(vocabulary_)
        ? `"${value}" is not a known ${vocabulary_.name}.`
        : `The ${vocabulary_.name} vocabulary is not defined yet, so no value can be accepted.`,
    });
  });
}

/** A schema accepting a list of vocabulary values, without duplicates. */
export function vocabularyListSchema(vocabulary_: Vocabulary, max = 20): z.ZodType<string[]> {
  return z
    .array(vocabularySchema(vocabulary_))
    .max(max)
    .refine((values) => new Set(values).size === values.length, {
      message: `The same ${vocabulary_.name} is listed twice.`,
    });
}
