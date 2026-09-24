import 'server-only';

import { TRPCError } from '@trpc/server';
import { z } from 'zod';

import {
  MODULE_STATUS_LABELS_DE,
  movementProfile,
  parseAnalysisStillKey,
  positionOf,
} from '@apex/domain';
import { AppError } from '@apex/types';

import { measurementCharts, MODULE_LABELS_DE } from '@/features/assessments';
import { createTRPCRouter, withCoachPermission, withPermission } from '@/server/api/trpc';

import {
  assessmentAnalysisSchema,
  createReportSchema,
  listReportsSchema,
  reportIdSchema,
  createShareSchema,
  setStillSchema,
  revokeShareSchema,
  setReportModuleSchema,
  updateDraftTextSchema,
} from '../schemas';

import {
  analysisStillsFor,
  analysisStillTests,
  discardAnalysisStills,
  freezeReportMedia,
  sweepAnalysisStills,
} from './media';
import {
  analysesForAssessment,
  analysisOfAssessment,
  archiveReport,
  assessmentAnalysisOverview,
  assessmentEvaluation,
  deleteDraftReport,
  publishReport,
  createReport,
  listReportsForAssessment,
  otherOpenDrafts,
  reopenUnsharedReport,
  reportReadiness,
  reportSnapshot,
  reportStatus,
  setReportModuleInclusion,
  updateDraftText,
  evaluationForReport,
  draftSnapshot,
  publishedSnapshot,
  setDraftStill,
} from './service';
import { createReportShare, revokeShare, sharedAssessmentIds, sharesForReport } from './sharing';

/** The one vocabulary for test types, handed to a service that holds none. */
const moduleLabels = {
  moduleStatus: (status: string) => MODULE_STATUS_LABELS_DE[status as never] ?? status,
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
    .query(async ({ ctx, input }) => {
      /**
       * Which tests have working files at all — asked first, awaited last.
       *
       * It needs nothing but the workspace, so it does not have to wait for the
       * analysis to be read. Started here, its round trip runs underneath the
       * database work instead of after it, and by the time the stills are
       * wanted the answer is already there.
       */
      const withStills = analysisStillTests(ctx.tenant);

      const evaluation = await assessmentEvaluation(
        ctx.db,
        ctx.tenant,
        input.assessmentId,
        moduleLabels,
        input.reportId,
      );

      if (evaluation === null) return null;

      /**
       * Which stills each test offers.
       *
       * Listing them is the object store's business rather than the service's,
       * which is what keeps the service answerable in a workspace with no
       * bucket — there this simply comes back empty and the analysis opens
       * exactly as before.
       *
       * The curves are **not** read here any more. They are drawn from the
       * readings the analysis itself already loaded, so what used to be six
       * round trips behind this one is now no read at all (§16).
       */
      const offered = await analysisStillsFor(
        ctx.tenant,
        evaluation.modules.map((entry) => entry.moduleId),
        await withStills,
      );

      /**
       * Each offered still with the word for the position it shows.
       *
       * Translated through the movement profile that wrote the key, exactly as
       * the chosen ones are. A position the profile no longer defines keeps its
       * raw key rather than losing its caption.
       */
      const profileOf = new Map(
        evaluation.modules.map((entry) => [entry.moduleId, entry.movement?.profileKey ?? null]),
      );

      const byModule = new Map(
        [...offered.entries()].map(([moduleId, keys]) => {
          const profile = movementProfile(profileOf.get(moduleId) ?? undefined);

          return [
            moduleId,
            keys.map((key) => {
              const position = parseAnalysisStillKey(key)?.position ?? '';

              return {
                key,
                label:
                  (profile === null ? null : positionOf(profile, position)?.label) ??
                  (position === '' ? 'Standbild' : position),
              };
            }),
          ] as const;
        }),
      );

      // The curves travel beside the tests inside the service; the screen wants
      // them on each test, and nothing else may see them (see `curves` there).
      const { curves, ...rest } = evaluation;

      return {
        ...rest,
        modules: evaluation.modules.map((entry) => ({
          ...entry,
          offeredStills: byModule.get(entry.moduleId) ?? [],
          charts: curves.get(entry.moduleId) ?? [],
        })),
      };
    }),

  /**
   * The frozen document, for the coach who published it.
   *
   * The same content the athlete's link resolves to — the coach reads what they
   * sent, not a second rendering of it.
   */
  publishedSnapshot: withPermission('report:read')
    .input(assessmentAnalysisSchema)
    .query(({ ctx, input }) => publishedSnapshot(ctx.db, ctx.tenant, input.assessmentId)),

  /**
   * The document as it stands, for a coach who wants it on paper before
   * publishing.
   *
   * `report:read`, not `report:write`: this reads and stores nothing. What it
   * returns is never the record — only publishing writes a version (§16).
   */
  draftSnapshot: withPermission('report:read')
    .input(assessmentAnalysisSchema)
    .query(({ ctx, input }) =>
      draftSnapshot(ctx.db, ctx.tenant, input.assessmentId, moduleLabels, input.reportId),
    ),

  /**
   * Removes the working files of analyses nobody came back to.
   *
   * Age, not state: publishing already clears what it published, so what is left
   * is the coach who analysed a video and never wrote the report. Two weeks
   * without anybody returning is the honest signal, and the record holds no
   * better one.
   */
  sweepAnalysisFiles: withCoachPermission('report:write').mutation(async ({ ctx }) => ({
    removed: await sweepAnalysisStills(ctx.tenant),
  })),

  /** Adds or removes one still from the document. Draft only (§16). */
  setStill: withPermission('report:write')
    .input(setStillSchema)
    .mutation(async ({ ctx, input }) => {
      const updated = await setDraftStill(
        ctx.db,
        ctx.tenant,
        input.reportId,
        input.moduleId,
        input.key,
        input.chosen,
      );

      if (!updated) throw notFound('Analysis');

      return { ok: true };
    }),

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
   * Shares an analysis with the athlete — and, where it is still a draft,
   * finishes it in the same act.
   *
   * ## Why sharing is what finishes an analysis
   *
   * An analysis used to be finished by a button of its own and shared by
   * another. The coach put it more simply: an analysis is done when the athlete
   * has it. Until then tests go in and out and the text changes; from then on
   * it is the document the athlete holds (§16). So the freeze happens here, at
   * the moment of handing over, and nowhere else.
   *
   * ## The order, and what happens when the second step fails
   *
   * The pictures are copied and the document frozen first, the link created
   * second — a link must never open onto a document still being written. Should
   * the link fail, the freeze is taken back: an analysis that is finished but
   * was never shared is exactly the state this removes.
   *
   * The working stills are cleared only once no other draft of the assessment
   * is open, because a second draft may be using the same pictures.
   *
   * The password comes back **once**, in this response, and is never readable
   * again — only its hash is stored.
   */
  createShare: withCoachPermission('report:write')
    .input(createShareSchema)
    .mutation(async ({ ctx, input }) => {
      const current = await reportStatus(ctx.db, ctx.tenant, input.reportId);
      if (!current) throw notFound('Analysis');

      if (current.status === 'ARCHIVED') {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Diese Auswertung ist archiviert und lässt sich nicht mehr teilen.',
        });
      }

      const finishing = current.status === 'DRAFT';
      const frozenTests = finishing ? await freezeForSharing(ctx, input.reportId) : [];

      let share: Awaited<ReturnType<typeof createReportShare>> = null;

      try {
        share = await createReportShare(
          ctx.db,
          ctx.tenant,
          ctx.coach.id,
          input.reportId,
          input.days,
          input.password,
          input.email,
        );
      } finally {
        // A freeze no link followed is taken back — see above.
        if (finishing && share === null) {
          await reopenUnsharedReport(ctx.db, ctx.tenant, input.reportId);
        }
      }

      if (!share) throw notFound('Analysis');

      if (
        finishing &&
        current.assessmentId !== null &&
        (await otherOpenDrafts(ctx.db, ctx.tenant, current.assessmentId, input.reportId)) === 0
      ) {
        await discardAnalysisStills(ctx.tenant, frozenTests);
      }

      return share;
    }),

  /**
   * Every analysis of an assessment, with the counts its list shows.
   *
   * Drafts, shared ones and archived ones alike: the screen groups them, and
   * reading them together keeps the groups from disagreeing with each other.
   */
  analyses: withPermission('report:read')
    .input(listReportsSchema)
    .query(({ ctx, input }) => analysesForAssessment(ctx.db, ctx.tenant, input.assessmentId)),

  /** One analysis of an assessment, refused where the two do not belong together. */
  analysis: withPermission('report:read')
    .input(reportIdSchema.extend({ assessmentId: z.string().min(1).max(64) }))
    .query(async ({ ctx, input }) => {
      const found = await analysisOfAssessment(
        ctx.db,
        ctx.tenant,
        input.assessmentId,
        input.reportId,
      );
      if (!found) throw notFound('Analysis');

      return found;
    }),

  /** The frozen document of one shared or archived analysis. */
  snapshot: withPermission('report:read')
    .input(reportIdSchema)
    .query(({ ctx, input }) => reportSnapshot(ctx.db, ctx.tenant, input.reportId)),

  /** Deletes an analysis nobody has been given. A shared one can only be archived. */
  deleteDraft: withPermission('report:write')
    .input(reportIdSchema)
    .mutation(async ({ ctx, input }) => {
      if (!(await deleteDraftReport(ctx.db, ctx.tenant, input.reportId))) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Nur eine noch nicht geteilte Auswertung lässt sich löschen.',
        });
      }

      return { ok: true };
    }),

  /** Puts a shared analysis away and ends every link to it. */
  archive: withPermission('report:write')
    .input(reportIdSchema)
    .mutation(async ({ ctx, input }) => {
      if (!(await archiveReport(ctx.db, ctx.tenant, input.reportId))) {
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Nur eine geteilte Auswertung lässt sich archivieren.',
        });
      }

      return { ok: true };
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

/** What a procedure behind a coach's write permission is handed. */
type CoachWriteContext = Parameters<
  Parameters<ReturnType<typeof withCoachPermission>['mutation']>[0]
>[0]['ctx'];

/**
 * Copies the chosen stills and freezes the draft — the first half of sharing.
 *
 * Returns the tests the frozen document draws on, so the caller can clear
 * their working stills once the link exists.
 */
async function freezeForSharing(ctx: CoachWriteContext, reportId: string): Promise<string[]> {
  const evaluation = await evaluationForReport(ctx.db, ctx.tenant, reportId, moduleLabels);
  const included = (evaluation?.modules ?? []).filter((entry) => entry.included);

  /**
   * Copy the chosen stills, then freeze — in that order. Freezing first would
   * name pictures that were never written; a failure in between leaves a copy
   * the bucket's lifecycle rule removes, which is the harmless direction.
   */
  const frozen = await freezeReportMedia(reportId, included);

  // The same curves the coach was looking at, through the same batched read the
  // screen uses, so the frozen curves cannot differ from the ones on screen.
  const drawn = await measurementCharts(
    ctx.db,
    ctx.tenant,
    included.map((entry) => entry.moduleId),
  );

  const result = await publishReport(
    ctx.db,
    ctx.tenant,
    reportId,
    moduleLabels,
    frozen,
    included.map((entry) => ({
      moduleId: entry.moduleId,
      charts: drawn.get(entry.moduleId) ?? [],
    })),
  );

  if (!result.ok && result.reason === 'NOT_FOUND') throw notFound('Analysis');
  if (!result.ok) {
    throw new TRPCError({
      code: 'BAD_REQUEST',
      message: 'Diese Auswertung zieht keinen Test heran und lässt sich deshalb nicht teilen.',
    });
  }

  return included.map((entry) => entry.moduleId);
}
