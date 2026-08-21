import { z } from 'zod';

import {
  assessmentStatusSchema,
  measurementTemplateKeySchema,
  moduleConfigurationSchema,
  moduleKeySchema,
} from '@apex/domain';

/**
 * The assessment slice's input contract.
 *
 * As everywhere: no `organizationId`, no coach id. The tenant comes from the
 * session and the author from the coach profile.
 *
 * The module configuration schema is imported from `@apex/domain` rather than
 * restated. It is the same contract that validates `AssessmentModule.payload`,
 * and two copies would drift the moment one of them gained a field.
 */

export const assessmentTypeSchema = z.enum(['INITIAL', 'RE_ASSESSMENT', 'FOLLOW_UP']);
export type AssessmentTypeInput = z.infer<typeof assessmentTypeSchema>;

/**
 * Creating an assessment.
 *
 * `question` is required, because every Assessment answers exactly one question
 * (§10, §26.6). It is the field that stops an assessment being a bag of
 * measurements — and the reason it is not optional is that an optional one
 * would be left empty.
 *
 * The Case is not asked for. An assessment is created **for an athlete**, and
 * the open case is found or created automatically (§8).
 */
export const createAssessmentSchema = z.object({
  athleteId: z.string().min(1),
  question: z.string().trim().min(1, 'What should this assessment answer?').max(500),
  type: assessmentTypeSchema.default('INITIAL'),
  /**
   * Which engagement this assessment belongs to.
   *
   * Optional, and that is the whole point: §8 says a case appears on its own
   * with the first assessment, and it still does when none is named. What the
   * coach gains is the ability to *say* which one when they have several — the
   * default is proposed, never demanded.
   */
  caseId: z.string().min(1).optional(),
  /** Defaults to now when the coach records as they go. */
  performedAt: z.iso.datetime({ offset: true }).optional(),
});

export type CreateAssessmentInput = z.infer<typeof createAssessmentSchema>;

/**
 * Changing what a coach wrote.
 *
 * Every field optional, none of them nullable except the description: a request
 * carries what changed and stays silent about the rest, so two coaches editing
 * different fields cannot overwrite each other's work with stale values.
 *
 * **The status is not here.** It has transition rules of its own
 * (`setAssessmentStatusSchema`), and an ordinary edit must not be able to close
 * a session because a form posted every field it rendered.
 *
 * `performedAt` is the examination's one date. While the assessment is planned
 * it reads as "geplant für" and afterwards as "durchgeführt am" — one column,
 * because two would eventually disagree about which one the timeline follows.
 */
export const updateAssessmentSchema = z.object({
  assessmentId: z.string().min(1),
  question: z
    .string()
    .trim()
    .min(1, 'Bitte angeben, was dieses Assessment beantworten soll.')
    .max(500)
    .optional(),
  description: z
    .union([z.string().trim().max(2000), z.literal(''), z.null()])
    .transform((value) => (value === '' || value === null ? null : value))
    .optional(),
  type: assessmentTypeSchema.optional(),
  performedAt: z.iso.datetime({ offset: true }).optional(),
});

export type UpdateAssessmentInput = z.infer<typeof updateAssessmentSchema>;

export const assessmentIdSchema = z.object({
  assessmentId: z.string().min(1),
});

export type AssessmentIdInput = z.infer<typeof assessmentIdSchema>;

export const listAssessmentsSchema = z.object({
  athleteId: z.string().min(1),
  /** Archived examinations stay out of the working view unless asked for. */
  includeArchived: z.boolean().default(false),
});

export type ListAssessmentsInput = z.infer<typeof listAssessmentsSchema>;

/**
 * Adding a module — a single test — to an assessment.
 *
 * Either a template is named, in which case its configuration is the starting
 * point, or a configuration is supplied outright. A template is only a
 * proposal: whatever the coach ends up with is what gets stored, and no
 * reference to the template survives.
 */
export const addModuleSchema = z
  .object({
    assessmentId: z.string().min(1),
    /**
     * What the coach calls this test.
     *
     * Required for a new test, because it is what tells two tests of the same
     * type apart. Trimmed and capped like every other name in the product.
     */
    name: z.string().trim().min(1, 'Bitte einen Namen für den Test eingeben.').max(120),
    moduleKey: moduleKeySchema,
    templateKey: measurementTemplateKeySchema.optional(),
    configuration: moduleConfigurationSchema.optional(),
  })
  .refine((input) => input.templateKey ?? input.configuration, {
    message: 'Bitte eine Vorlage wählen oder den Test konfigurieren.',
    path: ['configuration'],
  });

export type AddModuleInput = z.infer<typeof addModuleSchema>;

export const moduleIdSchema = z.object({
  moduleId: z.string().min(1),
});

export type ModuleIdInput = z.infer<typeof moduleIdSchema>;

/**
 * Renaming a test, or saying what it is for.
 *
 * Separate from `updateModuleConfiguration`: that one revalidates the whole
 * protocol against the catalogue and can fail because an exercise was archived.
 * A coach fixing a typo in a name should not meet any of that.
 *
 * The name may be cleared. It then falls back to the type's label everywhere,
 * which is what tests written before names existed already do.
 */
/**
 * Putting a test away, or bringing it back.
 *
 * Separate from the status: archiving says whether the test belongs in the
 * working view, the status says how far the coach got. A test holding
 * measurements is exactly the kind that gets archived rather than removed.
 */
export const setModuleArchivedSchema = moduleIdSchema.extend({
  archived: z.boolean(),
});

export type SetModuleArchivedInput = z.infer<typeof setModuleArchivedSchema>;

export const updateModuleSchema = moduleIdSchema.extend({
  name: z
    .union([z.string().trim().max(160), z.literal(''), z.null()])
    .transform((value) => (value === '' || value === null ? null : value))
    .optional(),
  description: z
    .union([z.string().trim().max(2000), z.literal(''), z.null()])
    .transform((value) => (value === '' || value === null ? null : value))
    .optional(),
});

export type UpdateModuleInput = z.infer<typeof updateModuleSchema>;

export const updateModuleConfigurationSchema = moduleIdSchema.extend({
  configuration: moduleConfigurationSchema,
});

export type UpdateModuleConfigurationInput = z.infer<typeof updateModuleConfigurationSchema>;

/**
 * Copying an assessment as a template.
 *
 * The copy takes the question, the type and every module's `moduleKey`,
 * `moduleVersion` and `payload`. It takes **no measurements** — the new
 * assessment is an independent examination, not a duplicate record.
 */
export const copyAssessmentSchema = z.object({
  assessmentId: z.string().min(1),
  /** Defaults to the source's athlete; a different one makes it a template. */
  athleteId: z.string().min(1).optional(),
  question: z.string().trim().min(1).max(500).optional(),
  performedAt: z.iso.datetime({ offset: true }).optional(),
});

export type CopyAssessmentInput = z.infer<typeof copyAssessmentSchema>;

/**
 * Copying one test inside its assessment.
 *
 * The copy takes `moduleKey`, `moduleVersion` and the configuration, and **no
 * measurement** — it is a fresh test, not a duplicated record.
 *
 * `targetAssessmentId` defaults to the source's own assessment. An assessment
 * holds each module once (`@@unique([assessmentId, moduleKey])`), so copying
 * within one assessment is refused with a sentence rather than a constraint
 * error; the field exists to copy a configured test into a *different*
 * assessment, which is the case that motivates copying at all.
 */
export const copyModuleSchema = moduleIdSchema.extend({
  targetAssessmentId: z.string().min(1).optional(),
});

export type CopyModuleInput = z.infer<typeof copyModuleSchema>;

/**
 * Moving an examination through its lifecycle.
 *
 * A dedicated input, never a field on the edit form: a status carries
 * transition rules, and folding it into an ordinary correction would let a
 * typo close a session.
 */
export const setAssessmentStatusSchema = z.object({
  assessmentId: z.string().min(1),
  status: assessmentStatusSchema,
});

export type SetAssessmentStatusInput = z.infer<typeof setAssessmentStatusSchema>;

/** Which examinations a list shows. Archived ones stay out of the working view. */
export const ASSESSMENT_VIEWS = ['live', 'all'] as const;
export type AssessmentView = (typeof ASSESSMENT_VIEWS)[number];
