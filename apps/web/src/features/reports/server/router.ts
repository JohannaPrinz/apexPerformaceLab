import 'server-only';

import { TRPCError } from '@trpc/server';

import { AppError } from '@apex/types';

import { MODULE_LABELS_DE } from '@/features/assessments';
import { createTRPCRouter, withCoachPermission, withPermission } from '@/server/api/trpc';

import {
  assessmentAnalysisSchema,
  createReportSchema,
  listReportsSchema,
  regenerateDraftSchema,
  reportIdSchema,
  setReportModuleSchema,
  updateDraftTextSchema,
} from '../schemas';

import {
  assessmentAnalysisOverview,
  assessmentDraftView,
  createReport,
  listReportsForAssessment,
  regenerateDraftText,
  reportReadiness,
  setReportModuleInclusion,
  updateDraftText,
} from './service';

/** The one vocabulary for test types, handed to a service that holds none. */
const moduleLabels = {
  module: (moduleKey: string) =>
    MODULE_LABELS_DE[moduleKey as keyof typeof MODULE_LABELS_DE] ?? moduleKey,
};

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

  /**
   * What an analysis of this assessment could draw on, and what it already
   * does.
   *
   * One read for the whole section: which tests have results, which the draft
   * includes, and whether an interim analysis is possible. Asking separately
   * would let the screen show a selection that disagrees with the readiness
   * beside it.
   */
  assessmentOverview: withPermission('report:read')
    .input(assessmentAnalysisSchema)
    .query(async ({ ctx, input }) => {
      const overview = await assessmentAnalysisOverview(ctx.db, ctx.tenant, input.assessmentId);
      if (!overview) throw notFound('Assessment');

      return overview;
    }),

  /**
   * The draft text of the current analysis, and what has moved under it.
   *
   * Facts only — the catalogue holds no reference ranges and the model records
   * no direction for any quantity, so a verdict would have to be invented. The
   * wording is built by `summariseAssessment` in the domain package, where the
   * words it must never use are pinned by test.
   *
   * `null` while no analysis has been started.
   */
  assessmentDraft: withPermission('report:read')
    .input(assessmentAnalysisSchema)
    .query(({ ctx, input }) =>
      assessmentDraftView(ctx.db, ctx.tenant, input.assessmentId, moduleLabels),
    ),

  /**
   * Stores what the coach wrote into one text.
   *
   * Only the addressed text changes, and only on a draft — a published analysis
   * is immutable (§16).
   */
  updateDraftText: withPermission('report:write')
    .input(updateDraftTextSchema)
    .mutation(async ({ ctx, input }) => {
      const updated = await updateDraftText(
        ctx.db,
        ctx.tenant,
        input.reportId,
        input.target,
        input.text,
        moduleLabels,
      );

      if (!updated) throw notFound('Analysis');

      return { ok: true };
    }),

  /**
   * Regenerates one text from the values as they stand now.
   *
   * The only path that replaces something the coach may have written, and it
   * runs because they asked. Every other text is carried through untouched.
   */
  regenerateDraftText: withPermission('report:write')
    .input(regenerateDraftSchema)
    .mutation(async ({ ctx, input }) => {
      const updated = await regenerateDraftText(
        ctx.db,
        ctx.tenant,
        input.reportId,
        input.target,
        moduleLabels,
      );

      if (!updated) throw notFound('Analysis');

      return { ok: true };
    }),

  create: withCoachPermission('report:write')
    .input(createReportSchema)
    .mutation(async ({ ctx, input }) => {
      const report = await createReport(ctx.db, ctx.tenant, ctx.coach.id, input, moduleLabels);
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
