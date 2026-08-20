/**
 * Public surface of the assessments slice.
 *
 * `server/service.ts` stays private — it is the only module allowed to touch
 * the database, and a second caller would be a second authorization path.
 */
export { AddModuleForm } from './components/add-module-form';
export { AssessmentForm } from './components/assessment-form';
export { CreateAssessmentDialog } from './components/create-assessment-dialog';
export { CreateTestDialog, type SelectableExercise } from './components/create-test-dialog';
export { CopyAssessmentButton } from './components/copy-assessment-button';
export { CopyModuleButton, type CopyTarget } from './components/copy-module-button';
export { ModuleCard, type ModuleCardData } from './components/module-card';
export { TestBuilder } from './components/builder/test-builder';
export {
  BUILDER_STEPS,
  draftFromConfiguration,
  draftFromTemplateKey,
  emptyDraft,
  summarise,
  toConfiguration,
  type BuilderDraft,
  type BuilderStep,
} from './components/builder/draft';
export { MeasurementCell } from './measurements/components/measurement-cell';
export { TestRunner } from './measurements/components/test-runner';
export {
  findRecorded,
  formatValue,
  isPassEmpty,
  passesOf,
  passProgress,
  slotsForPass,
  type MeasurementSlot,
  type RecordedMeasurement,
} from './measurements/components/slots';
export {
  addModuleNoteSchema,
  correctMeasurementSchema,
  moduleMeasurementsSchema,
  recordMeasurementSchema,
  type AddModuleNoteInput,
  type CorrectMeasurementInput,
  type RecordMeasurementInput,
} from './measurements/schemas';
export {
  addModuleSchema,
  assessmentIdSchema,
  assessmentTypeSchema,
  copyAssessmentSchema,
  copyModuleSchema,
  createAssessmentSchema,
  listAssessmentsSchema,
  moduleIdSchema,
  updateModuleConfigurationSchema,
  type AddModuleInput,
  type AssessmentIdInput,
  type AssessmentTypeInput,
  type CopyAssessmentInput,
  type CopyModuleInput,
  type CreateAssessmentInput,
  type ListAssessmentsInput,
  type ModuleIdInput,
  type UpdateModuleConfigurationInput,
} from './schemas';
