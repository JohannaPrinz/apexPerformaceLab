/**
 * Public surface of the athletes slice.
 *
 * `server/router.ts` is absent on purpose: it is registered once in
 * `src/server/api/root.ts` and imported nowhere else, which keeps the API
 * surface fully described by that file. `server/service.ts` is absent for a
 * stronger reason — it is the only module allowed to touch the database, and
 * exporting it would invite a second caller that skips the procedure's
 * authorization.
 */
export { ArchiveButton } from './components/archive-button';
export { AthleteForm, type AthleteFormValues } from './components/athlete-form';
export { DuplicateWarning } from './components/duplicate-warning';
export { AthleteTile, type AthleteTileData } from './components/athlete-tile';
export { CreateAthleteDialog } from './components/create-athlete-dialog';
export { LoadMoreAthletes } from './components/load-more-athletes';
export {
  athleteIdSchema,
  createAthleteSchema,
  listAthletesSchema,
  setAthleteArchivedSchema,
  updateAthleteSchema,
  type AthleteIdInput,
  type CreateAthleteInput,
  type ListAthletesInput,
  type SetAthleteArchivedInput,
  type UpdateAthleteInput,
} from './schemas';
