import 'server-only';

import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import { AppError } from '@apex/types';

import { MODULE_LABELS_DE } from '@/features/assessments';
import { createTRPCRouter, withCoachPermission, withPermission } from '@/server/api/trpc';

import {
  assessmentAnalysisSchema,
  createReportSchema,
  listReportsSchema,
  reportIdSchema,
  createShareSchema,
  publishReportSchema,
  revokeShareSchema,
  setReportModuleSchema,
  updateDraftTextSchema,
} from '../schemas';

import {
  assessmentAnalysisOverview,
  assessmentEvaluation,
  publishReport,
  createReport,
  listReportsForAssessment,
  reportReadiness,
  setReportModuleInclusion,
  updateDraftText,
} from './service';
import { createReportShare, revokeShare, sharedAssessmentIds, sharesForReport } from './sharing';

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
  /**
   * Everything the analysis screen shows, in one read.
   *
   * `null` while no analysis exists for this assessment — the screen then offers
   * to create one rather than showing an analysis nobody asked for.
   */
  evaluation: withPermission('report:read')
    .input(assessmentAnalysisSchema)
    .query(({ ctx, input }) =>
      assessmentEvaluation(ctx.db, ctx.tenant, input.assessmentId, moduleLabels),
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
        input.field,
        input.text,
      );

      if (!updated) throw notFound('Analysis');

      return { ok: true };
    }),

  /**
   * Freezes the analysis (§16). The point of no return: a published analysis is
   * immutable, and a later change is a new version.
   */
  publish: withPermission('report:write')
    .input(publishReportSchema)
    .mutation(async ({ ctx, input }) => {
      const result = await publishReport(ctx.db, ctx.tenant, input.reportId, moduleLabels);

      if (!result.ok && result.reason === 'NOT_FOUND') throw notFound('Analysis');
      if (!result.ok) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Diese Auswertung zieht keinen Test heran.',
        });
      }

      return { ok: true };
    }),

  /**
   * Grants access to a published analysis.
   *
   * The password comes back **once**, in this response, and is never readable
   * again — only its hash is stored.
   */
  createShare: withCoachPermission('report:write')
    .input(createShareSchema)
    .mutation(async ({ ctx, input }) => {
      const share = await createReportShare(
        ctx.db,
        ctx.tenant,
        ctx.coach.id,
        input.reportId,
        input.days,
      );

      if (!share) throw notFound('Analysis');

      return share;
    }),

  /** Withdraws access. The row stays as part of the audit trail (§17). */
  revokeShare: withPermission('report:write')
    .input(revokeShareSchema)
    .mutation(async ({ ctx, input }) => {
      const revoked = await revokeShare(ctx.db, ctx.tenant, input.shareId);
      if (!revoked) throw notFound('Share');

      return { ok: true };
    }),

  /** Which of an athlete's assessments are behind an active link right now. */
  sharedAssessments: withPermission('report:read')
    .input(z.object({ athleteId: z.string().min(1).max(64) }))
    .query(({ ctx, input }) => sharedAssessmentIds(ctx.db, ctx.tenant, input.athleteId)),

  /** Every link ever granted for one analysis. */
  shares: withPermission('report:read')
    .input(reportIdSchema)
    .query(({ ctx, input }) => sharesForReport(ctx.db, ctx.tenant, input.reportId)),

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
