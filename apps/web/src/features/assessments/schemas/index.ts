import { z } from 'zod';

import {
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

export const assessmentIdSchema = z.object({
  assessmentId: z.string().min(1),
});

export type AssessmentIdInput = z.infer<typeof assessmentIdSchema>;

export const listAssessmentsSchema = z.object({
  athleteId: z.string().min(1),
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
