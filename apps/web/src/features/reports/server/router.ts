import 'server-only';

import { TRPCError } from '@trpc/server';

import { AppError } from '@apex/types';

import { createTRPCRouter, withCoachPermission, withPermission } from '@/server/api/trpc';

import {
  createReportSchema,
  listReportsSchema,
  reportIdSchema,
  setReportModuleSchema,
} from '../schemas';

import {
  createReport,
  listReportsForAssessment,
  reportReadiness,
  setReportModuleInclusion,
} from './service';

const notFound = (resource: string) =>
  new TRPCError({
    code: 'NOT_FOUND',
    message: `${resource} not found.`,
    cause: AppError.notFound(resource),
  });

export const reportsRouter = createTRPCRouter({
  listForAssessment: withPermission('report:read')
    .input(listReportsSchema)
    .query(({ ctx, input }) => listReportsForAssessment(ctx.db, ctx.tenant, input.assessmentId)),

  create: withCoachPermission('report:write')
    .input(createReportSchema)
    .mutation(async ({ ctx, input }) => {
      const report = await createReport(ctx.db, ctx.tenant, ctx.coach.id, input);
      if (!report) throw notFound('Assessment');

      return report;
    }),

  /**
   * Includes or excludes a test **for this analysis only**.
   *
   * The test's own status is untouched, and every other analysis keeps its own
   * decision.
   */
  setModuleInclusion: withPermission('report:write')
    .input(setReportModuleSchema)
    .mutation(async ({ ctx, input }) => {
      const updated = await setReportModuleInclusion(
        ctx.db,
        ctx.tenant,
        input.reportId,
        input.moduleId,
        input.included,
      );

      if (!updated) throw notFound('Analysis');

      return { reportId: input.reportId, moduleId: input.moduleId, included: input.included };
    }),

  /**
   * Whether the analysis has what it needs — from the status, the measurements
   * and the inclusion decision together.
   */
  readiness: withPermission('report:read')
    .input(reportIdSchema)
    .query(async ({ ctx, input }) => {
      const readiness = await reportReadiness(ctx.db, ctx.tenant, input.reportId);
      if (!readiness) throw notFound('Analysis');

      return readiness;
    }),
});
