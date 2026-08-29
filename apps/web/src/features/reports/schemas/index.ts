import { z } from 'zod';

import { draftFieldSchema, shareDaysSchema } from '@apex/domain';

/**
 * Analysis input.
 *
 * An analysis **is** a Report (§16): one object with a scope, not a second kind
 * of conclusion beside it. What is new here is which tests it draws on — a
 * relation, held on `ReportModule`, and therefore a decision belonging to the
 * analysis rather than to the test.
 */

export const reportScopeSchema = z.enum(['MODULE', 'ASSESSMENT', 'CASE']);
export type ReportScopeInput = z.infer<typeof reportScopeSchema>;

/**
 * Creating an analysis over an assessment.
 *
 * Only the `ASSESSMENT` scope is offered for now — it is the one the
 * include/exclude decision is about. `MODULE` and `CASE` exist in the model and
 * arrive with the screens that need them.
 */
export const createReportSchema = z.object({
  assessmentId: z.string().min(1),
  title: z.string().trim().min(1, 'Give the analysis a title.').max(200),
});

export type CreateReportInput = z.infer<typeof createReportSchema>;

export const reportIdSchema = z.object({
  reportId: z.string().min(1),
});

export type ReportIdInput = z.infer<typeof reportIdSchema>;

/**
 * Including or excluding one test for **this** analysis.
 *
 * Never global: the same test may be excluded here and used in another
 * analysis, and its own status is untouched either way.
 */
export const setReportModuleSchema = reportIdSchema.extend({
  moduleId: z.string().min(1),
  included: z.boolean(),
});

export type SetReportModuleInput = z.infer<typeof setReportModuleSchema>;

export const listReportsSchema = z.object({
  assessmentId: z.string().min(1),
});

/** What an analysis of this assessment could draw on. One id, nothing else. */
export const assessmentAnalysisSchema = z.object({
  assessmentId: z.string().min(1),
});

export type AssessmentAnalysisInput = z.infer<typeof assessmentAnalysisSchema>;

export type ListReportsInput = z.infer<typeof listReportsSchema>;

/**
 * Which text of a draft is being addressed.
 *
 * One assessment-wide text, and one per test. A discriminated union rather than
 * a nullable module id, so "the overall text" cannot be confused with "a
 * section whose id went missing".
 */
export const draftTargetSchema = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('overall') }),
  z.object({ kind: z.literal('section'), moduleId: z.string().min(1) }),
]);

export type DraftTargetInput = z.infer<typeof draftTargetSchema>;

export const updateDraftTextSchema = reportIdSchema.extend({
  target: draftTargetSchema,
  /**
   * Which of the two texts.
   *
   * The reading of the facts and what follows from it are different statements,
   * and a coach must be able to write one without the other. The vocabulary is
   * the domain's, so a third field cannot appear here without appearing there.
   */
  field: draftFieldSchema,
  /** Generous, but bounded: this is a paragraph, not a document store. */
  text: z.string().max(20_000),
});

export type UpdateDraftTextInput = z.infer<typeof updateDraftTextSchema>;

/** Publishing takes nothing but the analysis it freezes. */
export const publishReportSchema = reportIdSchema;

/**
 * Granting access.
 *
 * The password is **not** an input: it is generated, shown once and only its
 * hash is kept. A coach-chosen one would end up the same for every athlete.
 */
export const createShareSchema = reportIdSchema.extend({ days: shareDaysSchema });
export type CreateShareInput = z.infer<typeof createShareSchema>;

export const revokeShareSchema = z.object({ shareId: z.string().min(1).max(64) });
