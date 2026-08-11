import 'server-only';

import { TRPCError } from '@trpc/server';

import type { PrismaClientInstance } from '@apex/database';
import { assessmentModuleStatusSchema } from '@apex/domain';
import { AppError } from '@apex/types';

import { createTRPCRouter, withCoachPermission, withPermission } from '@/server/api/trpc';

import { measurementsRouter } from '../measurements/server/router';
import {
  addModuleSchema,
  assessmentIdSchema,
  copyAssessmentSchema,
  createAssessmentSchema,
  listAssessmentsSchema,
  moduleIdSchema,
  updateModuleConfigurationSchema,
} from '../schemas';

import {
  addModule,
  copyAssessment,
  createAssessment,
  getAssessment,
  listAssessmentsForAthlete,
  measurementTypeNames,
  removeModule,
  setModuleStatus,
  updateModuleConfiguration,
} from './service';

const notFound = (resource: string) =>
  new TRPCError({
    code: 'NOT_FOUND',
    message: `${resource} not found.`,
    cause: AppError.notFound(resource),
  });

export const assessmentsRouter = createTRPCRouter({
  listForAthlete: withPermission('assessment:read')
    .input(listAssessmentsSchema)
    .query(({ ctx, input }) => listAssessmentsForAthlete(ctx.db, ctx.tenant, input.athleteId)),

  byId: withPermission('assessment:read')
    .input(assessmentIdSchema)
    .query(async ({ ctx, input }) => {
      const assessment = await getAssessment(ctx.db, ctx.tenant, input.assessmentId);
      if (!assessment) throw notFound('Assessment');

      // Resolved here rather than in the page: a configuration stores type ids,
      // and a screen that showed raw ids would be useless.
      const ids = assessment.modules.flatMap(
        (module) => module.configuration?.measurementTypeIds ?? [],
      );

      return {
        ...assessment,
        measurementTypeNames: await measurementTypeNames(ctx.db, ctx.tenant.organizationId, [
          ...new Set(ids),
        ]),
      };
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

  addModule: withCoachPermission('assessment:write')
    .input(addModuleSchema)
    .mutation(async ({ ctx, input }) => {
      const assessmentModule = await addModule(ctx.db, ctx.tenant, ctx.coach.id, input, (keys) =>
        resolveMeasurementTypeIds(ctx.db, ctx.tenant.organizationId, keys),
      );

      if (!assessmentModule) throw notFound('Assessment');

      return assessmentModule;
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

      if (!updated) throw notFound('Module');

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
          message: `A ${String(result.from).toLowerCase().replace('_', ' ')} test cannot become ${input.status.toLowerCase().replace('_', ' ')}.`,
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
          code: 'BAD_REQUEST',
          message:
            result.status === 'SKIPPED'
              ? 'A skipped test is kept — the decision not to run it is part of the examination.'
              : 'This test has been started. Abort it instead; its measurements are history.',
        });
      }

      return { moduleId: input.moduleId };
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
