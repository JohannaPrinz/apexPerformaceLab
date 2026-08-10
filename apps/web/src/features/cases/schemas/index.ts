import { z } from 'zod';

/**
 * The performance case slice's input contract.
 *
 * As everywhere: no `organizationId`, no `createdByCoachId`. The tenant comes
 * from the session and the author from the coach profile — accepting either
 * from the request would be an IDOR by construction (docs/SECURITY.md §4).
 */

/**
 * Case type and status mirror the Prisma enums.
 *
 * Restated here rather than imported from `@apex/database` because this module
 * is the transport contract and must stay free of the persistence layer — a
 * client-side form imports it. The values are pinned by a test in
 * `@apex/types`' sibling pattern; a divergence would fail typecheck at the
 * service boundary.
 */
export const caseTypeSchema = z.enum(['SINGLE_ASSESSMENT', 'ONGOING']);
export type CaseTypeInput = z.infer<typeof caseTypeSchema>;

export const caseStatusSchema = z.enum(['OPEN', 'CLOSED', 'ARCHIVED']);
export type CaseStatusInput = z.infer<typeof caseStatusSchema>;

export const createCaseSchema = z.object({
  athleteId: z.string().min(1),
  title: z.string().trim().min(1, 'Please give the case a title.').max(160),
  description: z
    .union([z.string().trim().max(2000), z.literal('')])
    .transform((value) => (value === '' ? undefined : value))
    .optional(),
  /**
   * `ONGOING` is the default, matching the schema. A single assessment is the
   * exception the system creates on its own (§8), not the one a coach reaches
   * for when opening a case deliberately.
   */
  type: caseTypeSchema.default('ONGOING'),
});

export type CreateCaseInput = z.infer<typeof createCaseSchema>;

export const listCasesSchema = z.object({
  athleteId: z.string().min(1),
  /** Closed and archived cases are part of the history and stay reachable. */
  status: caseStatusSchema.optional(),
});

export type ListCasesInput = z.infer<typeof listCasesSchema>;

export const caseIdSchema = z.object({
  caseId: z.string().min(1),
});

export type CaseIdInput = z.infer<typeof caseIdSchema>;

export const setCaseStatusSchema = caseIdSchema.extend({
  status: caseStatusSchema,
});

export type SetCaseStatusInput = z.infer<typeof setCaseStatusSchema>;
