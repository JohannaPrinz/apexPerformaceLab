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
