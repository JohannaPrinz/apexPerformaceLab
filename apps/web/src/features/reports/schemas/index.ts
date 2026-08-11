import { z } from 'zod';

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

export type ListReportsInput = z.infer<typeof listReportsSchema>;
