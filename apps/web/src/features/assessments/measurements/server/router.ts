import 'server-only';

import { TRPCError } from '@trpc/server';

import { AppError } from '@apex/types';

import { createTRPCRouter, withCoachPermission, withPermission } from '@/server/api/trpc';

import {
  addModuleNoteSchema,
  correctMeasurementSchema,
  moduleMeasurementsSchema,
  recordMeasurementSchema,
  recordMeasurementsSchema,
  saveStageSchema,
} from '../schemas';

import {
  addModuleNote,
  correctMeasurement,
  listMeasurementsForModule,
  moduleReadiness,
  moduleWorkspace,
  recordMeasurement,
  recordMeasurements,
  saveStage,
  type RecordFailure,
  type RecordResult,
} from './service';

/**
 * Turns a refusal into a tRPC error.
 *
 * A missing module or measurement is `NOT_FOUND` — never `FORBIDDEN`, which
 * would confirm the row exists in another workspace (docs/SECURITY.md §4).
 * Everything else is a `BAD_REQUEST` with a message a form can show.
 */
function toError(failure: RecordFailure): TRPCError {
  switch (failure.reason) {
    case 'MODULE_NOT_FOUND':
      return new TRPCError({
        code: 'NOT_FOUND',
        message: 'Test not found.',
        cause: AppError.notFound('Test'),
      });
    case 'MEASUREMENT_NOT_FOUND':
      return new TRPCError({
        code: 'NOT_FOUND',
        message: 'Measurement not found.',
        cause: AppError.notFound('Measurement'),
      });
    case 'MODULE_NOT_CONFIGURED':
      return new TRPCError({
        code: 'BAD_REQUEST',
        message: 'This test has no readable configuration.',
      });
    case 'TYPE_NOT_CONFIGURED':
      return new TRPCError({
        code: 'BAD_REQUEST',
        message: 'This test is not configured to record that measurement.',
      });
    case 'TYPE_NOT_AVAILABLE':
      return new TRPCError({ code: 'BAD_REQUEST', message: 'Unknown measurement type.' });
    case 'VALUE_TYPE_MISMATCH':
      return new TRPCError({
        code: 'BAD_REQUEST',
        message: `This measurement expects a ${failure.expected.toLowerCase()} value.`,
      });
    case 'PASS_INVALID':
      return new TRPCError({
        code: 'BAD_REQUEST',
        message:
          failure.passes > 1
            ? `Give a pass between 1 and ${String(failure.passes)}.`
            : 'This test records a single pass, so no pass number belongs on the value.',
      });
    case 'EXERCISE_NOT_CONFIGURED':
      return new TRPCError({
        code: 'BAD_REQUEST',
        message: 'This test does not cover any exercise, so a value cannot name one.',
      });
    case 'EXERCISE_MISSING':
      return new TRPCError({
        code: 'BAD_REQUEST',
        message: 'Say which exercise this value was recorded during.',
      });
    case 'CONTEXT_INVALID':
      return new TRPCError({
        code: 'BAD_REQUEST',
        message: Object.values(failure.errors)[0] ?? 'The dimensions of this value are invalid.',
      });
    case 'ALREADY_SUPERSEDED':
      return new TRPCError({
        code: 'BAD_REQUEST',
        message: 'This value has already been corrected. Correct the current one instead.',
      });
  }
}

const unwrap = (result: RecordResult) => {
  if (!result.ok) throw toError(result.failure);

  return result.measurement;
};

export const measurementsRouter = createTRPCRouter({
  forModule: withPermission('measurement:read')
    .input(moduleMeasurementsSchema)
    .query(({ ctx, input }) =>
      listMeasurementsForModule(ctx.db, ctx.tenant, input.moduleId, input.includeSuperseded),
    ),

  /**
   * Readiness of a test — computed, never stored, never read from the status.
   */
  readiness: withPermission('measurement:read')
    .input(moduleMeasurementsSchema.pick({ moduleId: true }))
    .query(async ({ ctx, input }) => {
      const result = await moduleReadiness(ctx.db, ctx.tenant, input.moduleId);
      if (!result) throw toError({ reason: 'MODULE_NOT_FOUND' });

      return result.readiness;
    }),

  /**
   * Everything the entry screen needs, in one call — the configuration, the
   * measurement types, what is recorded, what was superseded, the notes and the
   * readiness. The screen is built from this and never from the module key.
   */
  workspace: withPermission('measurement:read')
    .input(moduleMeasurementsSchema.pick({ moduleId: true }))
    .query(async ({ ctx, input }) => {
      const workspace = await moduleWorkspace(ctx.db, ctx.tenant, input.moduleId);
      if (!workspace) throw toError({ reason: 'MODULE_NOT_FOUND' });

      return workspace;
    }),

  /** A remark about the test, or about one of its stages — a Note (§20). */
  addNote: withCoachPermission('measurement:write')
    .input(addModuleNoteSchema)
    .mutation(async ({ ctx, input }) => {
      const note = await addModuleNote(
        ctx.db,
        ctx.tenant,
        ctx.coach.id,
        input.moduleId,
        input.body,
        input.passIndex ?? null,
      );

      if (!note) throw toError({ reason: 'MODULE_NOT_FOUND' });

      return note;
    }),

  record: withCoachPermission('measurement:write')
    .input(recordMeasurementSchema)
    .mutation(async ({ ctx, input }) => unwrap(await recordMeasurement(ctx.db, ctx.tenant, input))),

  /**
   * Corrects a value by superseding it. There is deliberately no `update`:
   * a measurement is never overwritten (§4, §13).
   */
  /**
   * Records a whole stage at once.
   *
   * Every entry is validated before anything is written, and the writes share a
   * transaction — a stage with one bad value stores nothing rather than part of
   * itself. The failures come back indexed, so the screen can point at the
   * field rather than saying "something was wrong".
   */
  recordMany: withCoachPermission('measurement:write')
    .input(recordMeasurementsSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await recordMeasurements(ctx.db, ctx.tenant, input.measurements);

      if (!result.ok) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Mindestens ein Messwert konnte nicht gespeichert werden.',
          cause: result.failures,
        });
      }

      return result.measurements;
    }),

  /**
   * Saves a whole stage — new values and corrections together.
   *
   * What "Weiter" calls. One transaction, so a stage is never half-written, and
   * indexed failures so the screen can point at the field rather than the form.
   */
  saveStage: withCoachPermission('measurement:write')
    .input(saveStageSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await saveStage(ctx.db, ctx.tenant, input.entries);

      if (!result.ok) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Mindestens ein Wert dieser Stufe konnte nicht gespeichert werden.',
          cause: result.failures,
        });
      }

      return result.measurements;
    }),

  correct: withCoachPermission('measurement:write')
    .input(correctMeasurementSchema)
    .mutation(async ({ ctx, input }) =>
      unwrap(await correctMeasurement(ctx.db, ctx.tenant, input)),
    ),
});
