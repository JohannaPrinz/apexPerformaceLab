/**
 * Public surface of the exercises slice.
 *
 * `server/service.ts` stays private — it is the only module allowed to touch
 * the database, and a second caller would be a second authorization path.
 * Other slices reach the catalogue through `api.exercises.*`.
 */
export {
  createExerciseSchema,
  exerciseIdSchema,
  listExercisesSchema,
  setExerciseArchivedSchema,
  updateExerciseSchema,
  variantLinkSchema,
  type CreateExerciseInput,
  type ExerciseIdInput,
  type ListExercisesInput,
  type SetExerciseArchivedInput,
  type UpdateExerciseInput,
  type VariantLinkInput,
} from './schemas';
