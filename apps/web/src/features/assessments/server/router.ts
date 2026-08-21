import 'server-only';

import { TRPCError } from '@trpc/server';

import type { PrismaClientInstance } from '@apex/database';
import {
  assessmentModuleStatusSchema,
  describeConfigurationViolation,
  measurementTypeIdsOf,
} from '@apex/domain';
import { AppError } from '@apex/types';

import { createTRPCRouter, withCoachPermission, withPermission } from '@/server/api/trpc';

import { MODULE_STATUS_LABELS_DE } from '../components/labels';
import { measurementsRouter } from '../measurements/server/router';
import {
  addModuleSchema,
  assessmentIdSchema,
  copyAssessmentSchema,
  copyModuleSchema,
  createAssessmentSchema,
  listAssessmentsSchema,
  moduleIdSchema,
  setAssessmentStatusSchema,
  setModuleArchivedSchema,
  updateAssessmentSchema,
  updateModuleConfigurationSchema,
  updateModuleSchema,
} from '../schemas';

import {
  addModule,
  availableMeasurementTypes,
  copyAssessment,
  copyModule,
  createAssessment,
  exerciseNames,
  getAssessment,
  listAssessmentsForAthlete,
  measurementTypeNames,
  removeModule,
  setAssessmentStatus,
  setModuleArchived,
  setModuleStatus,
  updateAssessment,
  updateModule,
  updateModuleConfiguration,
  type UnavailableReferences,
} from './service';

/**
 * A configuration naming something this workspace cannot use.
 *
 * `BAD_REQUEST`, not `FORBIDDEN`: the ids may belong to another tenant, and
 * confirming that they exist would leak the id space (docs/SECURITY.md §4). The
 * message says the reference is unavailable, never that it belongs elsewhere.
 */
const unavailableError = (unavailable: UnavailableReferences) =>
  new TRPCError({
    code: 'BAD_REQUEST',
    message:
      unavailable.measurementTypeIds.length > 0
        ? 'This test names a measurement that is not available in this workspace.'
        : 'This test names an exercise that is not available in this workspace.',
  });

const notFound = (resource: string) =>
  new TRPCError({
    code: 'NOT_FOUND',
    message: `${resource} not found.`,
    cause: AppError.notFound(resource),
  });

export const assessmentsRouter = createTRPCRouter({
  listForAthlete: withPermission('assessment:read')
    .input(listAssessmentsSchema)
    .query(({ ctx, input }) =>
      listAssessmentsForAthlete(ctx.db, ctx.tenant, input.athleteId, input.includeArchived),
    ),

  byId: withPermission('assessment:read')
    .input(assessmentIdSchema)
    .query(async ({ ctx, input }) => {
      const assessment = await getAssessment(ctx.db, ctx.tenant, input.assessmentId);
      if (!assessment) throw notFound('Assessment');

      // Resolved here rather than in the page: a configuration stores type ids,
      // and a screen that showed raw ids would be useless.
      const ids = assessment.modules.flatMap((entry) =>
        entry.configuration ? measurementTypeIdsOf(entry.configuration) : [],
      );
      const exerciseIds = assessment.modules.flatMap(
        (entry) => entry.configuration?.exerciseIds ?? [],
      );

      const [typeNames, movementNames] = await Promise.all([
        measurementTypeNames(ctx.db, ctx.tenant.organizationId, [...new Set(ids)]),
        exerciseNames(ctx.db, ctx.tenant.organizationId, [...new Set(exerciseIds)]),
      ]);

      return { ...assessment, measurementTypeNames: typeNames, exerciseNames: movementNames };
    }),

  create: withCoachPermission('assessment:write')
    .input(createAssessmentSchema)
    .mutation(async ({ ctx, input }) => {
      const assessment = await createAssessment(ctx.db, ctx.tenant, ctx.coach.id, input);
      // Null means the athlete is not in this workspace — reported as a missing
      // athlete, never as forbidden, which would confirm it exists.
      if (!assessment) throw notFound('Athlete');

      return assessment;
    }),

  /**
   * Copies the configuration of an assessment, never its measurements.
   *
   * The new assessment is an independent examination — see the service.
   */
  copy: withCoachPermission('assessment:write')
    .input(copyAssessmentSchema)
    .mutation(async ({ ctx, input }) => {
      const assessment = await copyAssessment(ctx.db, ctx.tenant, ctx.coach.id, input);
      if (!assessment) throw notFound('Assessment');

      return assessment;
    }),

  /**
   * Changes the question, the description, the type or the date.
   *
   * Never the status — `setStatus` owns that, because a status has transition
   * rules and an ordinary edit must not close a session by accident.
   */
  update: withCoachPermission('assessment:write')
    .input(updateAssessmentSchema)
    .mutation(async ({ ctx, input }) => {
      const assessment = await updateAssessment(ctx.db, ctx.tenant, input);
      if (!assessment) throw notFound('Assessment');

      return assessment;
    }),

  /**
   * Takes a test out of the working view, or brings it back.
   *
   * Never deletes and never refuses: a test holding measurements is precisely
   * the one that should be archived instead of removed (§13).
   */
  setModuleArchived: withCoachPermission('assessment:write')
    .input(setModuleArchivedSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await setModuleArchived(ctx.db, ctx.tenant, input.moduleId, input.archived);
      if (!result) throw notFound('Test');

      return result;
    }),

  /** Renames a test, or records what it is for. Never touches its protocol. */
  updateModule: withCoachPermission('assessment:write')
    .input(updateModuleSchema)
    .mutation(async ({ ctx, input }) => {
      const updated = await updateModule(ctx.db, ctx.tenant, input);
      if (!updated) throw notFound('Test');

      return updated;
    }),

  /**
   * The measurement types this workspace may configure a test with — the
   * builder's catalogue. System and workspace types together (§12).
   */
  measurementTypes: withPermission('assessment:read').query(({ ctx }) =>
    availableMeasurementTypes(ctx.db, ctx.tenant.organizationId),
  ),

  addModule: withCoachPermission('assessment:write')
    .input(addModuleSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await addModule(ctx.db, ctx.tenant, ctx.coach.id, input, (keys) =>
        resolveMeasurementTypeIds(ctx.db, ctx.tenant.organizationId, keys),
      );

      if (!result.ok) {
        if (result.reason === 'ASSESSMENT_NOT_FOUND') throw notFound('Assessment');
        if (result.reason === 'NO_CONFIGURATION') {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'Choose a template or configure the test.',
          });
        }

        throw unavailableError(result.unavailable);
      }

      return result.module;
    }),

  /**
   * Copies a configured test. No measurement travels with it (§13).
   *
   * Into the same assessment or another one. Copying alongside the original
   * used to be refused; §11 permits several tests of one type, so the useful
   * case — a second run of a test the coach has configured carefully — is now
   * the ordinary one.
   */
  copyModule: withCoachPermission('assessment:write')
    .input(copyModuleSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await copyModule(
        ctx.db,
        ctx.tenant,
        ctx.coach.id,
        input.moduleId,
        input.targetAssessmentId,
      );

      if (!result.ok) {
        if (result.reason === 'NOT_FOUND') throw notFound('Test');
        throw notFound('Assessment');
      }

      return result.module;
    }),

  updateModuleConfiguration: withPermission('assessment:write')
    .input(updateModuleConfigurationSchema)
    .mutation(async ({ ctx, input }) => {
      const updated = await updateModuleConfiguration(
        ctx.db,
        ctx.tenant,
        input.moduleId,
        input.configuration,
      );

      if (!updated.ok) {
        if (updated.reason === 'NOT_FOUND') throw notFound('Test');
        if (updated.reason === 'UNAVAILABLE_REFERENCES')
          throw unavailableError(updated.unavailable);
        if (updated.reason === 'UNREADABLE') {
          throw new TRPCError({
            code: 'BAD_REQUEST',
            message: 'This test has no readable configuration, so it cannot be changed.',
          });
        }

        // Names every obstacle, not just the first — a coach editing a test
        // should learn what is in the way in one go.
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: updated.violations.map((v) => describeConfigurationViolation(v)).join(' '),
        });
      }

      return { moduleId: input.moduleId };
    }),

  /**
   * Moves a test through PLANNED → IN_PROGRESS → COMPLETED, or to SKIPPED /
   * ABORTED. Never creates or removes a Measurement.
   */
  setModuleStatus: withPermission('assessment:write')
    .input(moduleIdSchema.extend({ status: assessmentModuleStatusSchema }))
    .mutation(async ({ ctx, input }) => {
      const result = await setModuleStatus(ctx.db, ctx.tenant, input.moduleId, input.status);

      if (!result.ok) {
        if (result.reason === 'NOT_FOUND') throw notFound('Test');

        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: `Ein Test im Status „${MODULE_STATUS_LABELS_DE[result.from ?? 'PLANNED']}“ kann nicht zu „${MODULE_STATUS_LABELS_DE[input.status]}“ werden.`,
        });
      }

      return { moduleId: input.moduleId, status: result.status };
    }),

  /**
   * Removes a test that was never started. A started one is aborted instead —
   * its measurements are history and are never deleted (§22).
   */
  removeModule: withPermission('assessment:write')
    .input(moduleIdSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await removeModule(ctx.db, ctx.tenant, input.moduleId);

      if (!result.ok) {
        if (result.reason === 'NOT_FOUND') throw notFound('Test');

        throw new TRPCError({
          // `PRECONDITION_FAILED`, not `BAD_REQUEST`: the request is well
          // formed and the caller is allowed — the assessment is simply in a
          // state that does not permit it, and it may permit it later.
          code: 'PRECONDITION_FAILED',
          message:
            result.reason === 'HAS_MEASUREMENTS'
              ? 'Dieser Test enthält Messwerte. Messwerte werden nie gelöscht (§13).'
              : 'Dieses Assessment wurde bereits durchgeführt. Nur übersprungene Tests lassen sich noch entfernen.',
        });
      }

      return { moduleId: input.moduleId };
    }),

  /**
   * Starts, finishes, abandons or archives an examination.
   *
   * Separate from `update` on purpose: a status has transition rules, and an
   * ordinary edit must not be able to close a session by accident.
   */
  setStatus: withPermission('assessment:write')
    .input(setAssessmentStatusSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await setAssessmentStatus(
        ctx.db,
        ctx.tenant,
        input.assessmentId,
        input.status,
      );

      if (!result.ok) {
        if (result.reason === 'NOT_FOUND') throw notFound('Assessment');

        throw new TRPCError({
          // The request is well formed and the caller is allowed; the
          // examination is simply in a state that does not permit it — and it
          // may permit it later.
          code: 'PRECONDITION_FAILED',
          message:
            result.reason === 'TESTS_STILL_OPEN'
              ? 'Es sind noch Tests offen. Schließen Sie sie ab oder überspringen Sie sie.'
              : 'Dieser Schritt ist aus dem aktuellen Status heraus nicht möglich.',
        });
      }

      return result.assessment;
    }),

  measurements: measurementsRouter,
});

/**
 * Resolves template measurement type keys to ids for this workspace.
 *
 * **The one query in the codebase that is deliberately not `scoped()`.** System
 * measurement types carry `organizationId = null` (§12) — every workspace
 * inherits them — so a strict tenant filter would return nothing and every
 * template would resolve to an empty configuration. The filter here is
 * `this workspace OR system-wide`, which is the tenant rule for a catalogue
 * rather than an absence of one.
 *
 * A workspace type wins over the system type of the same key: the coach's own
 * definition is the more specific one, and the partial unique index permits the
 * pair to exist precisely so it can.
 */
async function resolveMeasurementTypeIds(
  db: Pick<PrismaClientInstance, 'measurementType'>,
  organizationId: string,
  keys: readonly string[],
): Promise<string[]> {
  const rows = await db.measurementType.findMany({
    where: {
      key: { in: [...keys] },
      archivedAt: null,
      OR: [{ organizationId }, { organizationId: null }],
    },
    select: { id: true, key: true, organizationId: true },
  });

  return keys
    .map((key) => {
      const candidates = rows.filter((row) => row.key === key);

      return (candidates.find((row) => row.organizationId !== null) ?? candidates[0])?.id;
    })
    .filter((id): id is string => Boolean(id));
}
