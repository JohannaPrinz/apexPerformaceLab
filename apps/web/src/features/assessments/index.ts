/**
 * Public surface of the assessments slice.
 *
 * `server/service.ts` stays private — it is the only module allowed to touch
 * the database, and a second caller would be a second authorization path.
 */
export { AddModuleForm } from './components/add-module-form';
export { AssessmentForm } from './components/assessment-form';
export { CopyAssessmentButton } from './components/copy-assessment-button';
export { ModuleCard, type ModuleCardData } from './components/module-card';
export {
  addModuleSchema,
  assessmentIdSchema,
  assessmentTypeSchema,
  copyAssessmentSchema,
  createAssessmentSchema,
  listAssessmentsSchema,
  moduleIdSchema,
  updateModuleConfigurationSchema,
  type AddModuleInput,
  type AssessmentIdInput,
  type AssessmentTypeInput,
  type CopyAssessmentInput,
  type CreateAssessmentInput,
  type ListAssessmentsInput,
  type ModuleIdInput,
  type UpdateModuleConfigurationInput,
} from './schemas';
