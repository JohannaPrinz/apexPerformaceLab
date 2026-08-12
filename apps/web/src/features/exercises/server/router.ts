import 'server-only';

import { TRPCError } from '@trpc/server';

import { describeRemovalRefusal } from '@apex/domain';
import { AppError } from '@apex/types';

import { createTRPCRouter, withCoachPermission, withPermission } from '@/server/api/trpc';

import {
  createExerciseSchema,
  exerciseIdSchema,
  listExercisesSchema,
  setExerciseArchivedSchema,
  updateExerciseSchema,
} from '../schemas';

import {
  createExercise,
  exerciseUsage,
  getExercise,
  listExercises,
  removeExercise,
  setExerciseArchived,
  updateExercise,
} from './service';

const notFound = () =>
  new TRPCError({
    code: 'NOT_FOUND',
    message: 'Exercise not found.',
    cause: AppError.notFound('Exercise'),
  });

export const exercisesRouter = createTRPCRouter({
  /** System and workspace exercises together — the catalogue a coach chooses from. */
  list: withPermission('exercise:read')
    .input(listExercisesSchema)
    .query(({ ctx, input }) => listExercises(ctx.db, ctx.tenant, input)),

  byId: withPermission('exercise:read')
    .input(exerciseIdSchema)
    .query(async ({ ctx, input }) => {
      const exercise = await getExercise(ctx.db, ctx.tenant, input.exerciseId);
      if (!exercise) throw notFound();

      return exercise;
    }),

  /**
   * How often an exercise has been used — what decides delete versus archive.
   */
  usage: withPermission('exercise:read')
    .input(exerciseIdSchema)
    .query(async ({ ctx, input }) => {
      const exercise = await getExercise(ctx.db, ctx.tenant, input.exerciseId);
      if (!exercise) throw notFound();

      return exerciseUsage(ctx.db, ctx.tenant, input.exerciseId);
    }),

  create: withCoachPermission('exercise:write')
    .input(createExerciseSchema)
    .mutation(({ ctx, input }) => createExercise(ctx.db, ctx.tenant, ctx.coach.id, input)),

  /**
   * Edits a workspace's own exercise.
   *
   * A system exercise reports `NOT_FOUND` rather than a distinct refusal: the
   * write is `scoped()` and structurally cannot match one, and a separate
   * message would confirm which ids exist (docs/SECURITY.md §4).
   */
  update: withPermission('exercise:write')
    .input(updateExerciseSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await updateExercise(ctx.db, ctx.tenant, input);
      if (!result.ok) throw notFound();

      return result.exercise;
    }),

  /** Archiving is what replaces deletion once an exercise has been used. */
  setArchived: withPermission('exercise:write')
    .input(setExerciseArchivedSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await setExerciseArchived(
        ctx.db,
        ctx.tenant,
        input.exerciseId,
        input.archived,
      );

      if (!result.ok) throw notFound();

      return result.exercise;
    }),

  /**
   * Deletes an unused workspace exercise.
   *
   * A system exercise and one that has been used are both refused, with a
   * sentence that names which. The foreign key refuses the second case anyway;
   * this exists so a coach gets an explanation rather than a constraint error.
   */
  remove: withPermission('exercise:write')
    .input(exerciseIdSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await removeExercise(ctx.db, ctx.tenant, input.exerciseId);

      if (!result.ok) {
        if (result.reason === 'NOT_FOUND') throw notFound();

        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: describeRemovalRefusal(result.reason),
        });
      }

      return { exerciseId: input.exerciseId };
    }),
});
