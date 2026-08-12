import { z } from 'zod';

import { muscleGroupSchema } from '@apex/domain';

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
 */

export const createExerciseSchema = z.object({
  name: z.string().trim().min(1, 'Give the exercise a name.').max(120),
  description: z
    .union([z.string().trim().max(4000), z.literal('')])
    .transform((value) => (value === '' ? undefined : value))
    .optional(),
  /** Freely named — no invented anatomical vocabulary (§26). */
  muscleGroups: z.array(muscleGroupSchema).max(20).default([]),
});

export type CreateExerciseInput = z.infer<typeof createExerciseSchema>;

export const exerciseIdSchema = z.object({
  exerciseId: z.string().min(1),
});

export type ExerciseIdInput = z.infer<typeof exerciseIdSchema>;

export const updateExerciseSchema = exerciseIdSchema.extend(createExerciseSchema.shape);

export type UpdateExerciseInput = z.infer<typeof updateExerciseSchema>;

export const listExercisesSchema = z.object({
  /** Matches name; the catalogue is browsed by what a movement is called. */
  search: z.string().trim().max(120).optional(),
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
