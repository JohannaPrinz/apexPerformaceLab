import { z } from 'zod';

import {
  EXERCISE_CATEGORIES,
  EXERCISE_DIFFICULTIES,
  EXERCISE_FORCE_TYPES,
  EXERCISE_MECHANICS,
  exerciseSchema,
} from '@apex/domain';

/**
 * The exercise catalogue's input contract.
 *
 * As everywhere: no `organizationId`, no coach id. The tenant comes from the
 * session and the author from the coach profile.
 *
 * **A workspace only ever writes its own exercises.** There is no scope field
 * in any of these schemas: accepting one would let a request ask to create or
 * edit a system exercise, and the answer is always no. Scope is derived from
 * the row, in the service.
 *
 * The catalogue fields come from `@apex/domain` rather than being restated —
 * the same contract validates an import, a seed and this form, and two copies
 * would drift the moment one gained a field. Only `key` is dropped: it is
 * derived from the name for an exercise a coach types in, and letting a request
 * choose one would let it collide with a system exercise on purpose.
 *
 * `source`, `sourceId` and `license` are dropped too. They describe *imported*
 * data; an exercise created through this form was authored here, and letting a
 * request claim otherwise would make provenance a matter of what the client
 * said it was.
 */

const catalogueFields = exerciseSchema.omit({
  key: true,
  source: true,
  sourceId: true,
  license: true,
});

export const createExerciseSchema = catalogueFields;

export type CreateExerciseInput = z.infer<typeof createExerciseSchema>;

export const exerciseIdSchema = z.object({
  exerciseId: z.string().min(1),
});

export type ExerciseIdInput = z.infer<typeof exerciseIdSchema>;

export const updateExerciseSchema = exerciseIdSchema.extend(catalogueFields.shape);

export type UpdateExerciseInput = z.infer<typeof updateExerciseSchema>;

/**
 * A filter over a list column, given as one value or several.
 *
 * Several values within one filter mean **all of them** — "chest and triceps"
 * finds movements working both, not either. That is the reading a coach means
 * when they narrow a search, and the widening reading is already served by
 * asking for one value at a time.
 */
const listFilter = z
  .union([z.string(), z.array(z.string()).max(20)])
  .transform((value) => (Array.isArray(value) ? value : [value]))
  .optional();

export const listExercisesSchema = z.object({
  /** Matches the German name and the canonical English one. */
  search: z.string().trim().max(120).optional(),
  /**
   * Narrowing filters, combined with AND across groups.
   *
   * Validated against the controlled vocabularies rather than accepted as free
   * strings: a typo returns "unknown category" instead of an empty list, which
   * is the difference between a bug report and a silent dead end.
   */
  category: z.enum(EXERCISE_CATEGORIES).optional(),
  difficulty: z.enum(EXERCISE_DIFFICULTIES).optional(),
  forceType: z.enum(EXERCISE_FORCE_TYPES).optional(),
  mechanic: z.enum(EXERCISE_MECHANICS).optional(),
  unilateral: z.boolean().optional(),
  primaryMuscles: listFilter,
  secondaryMuscles: listFilter,
  equipment: listFilter,
  /**
   * Archived exercises are excluded by default. They stay reachable, because an
   * archived exercise is one that has been used and its history is still read.
   */
  includeArchived: z.boolean().default(false),
});

export type ListExercisesInput = z.infer<typeof listExercisesSchema>;

export const setExerciseArchivedSchema = exerciseIdSchema.extend({
  archived: z.boolean(),
});

export type SetExerciseArchivedInput = z.infer<typeof setExerciseArchivedSchema>;

/**
 * Linking two exercises as variants of one another.
 *
 * Symmetric: which one is named first carries no meaning, and the service
 * stores the pair once regardless of the order it arrives in.
 */
export const variantLinkSchema = z.object({
  exerciseId: z.string().min(1),
  variantId: z.string().min(1),
});

export type VariantLinkInput = z.infer<typeof variantLinkSchema>;
