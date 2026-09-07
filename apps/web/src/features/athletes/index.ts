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
// The analysis a test carries, in full. The test screen shows it and the
// profile lists the tiles that lead there — one reading, drawn once.
export { MovementAnalysisDetail } from './components/movement-analysis-detail';
export { AthleteForm, type AthleteFormValues } from './components/athlete-form';
export { DuplicateWarning } from './components/duplicate-warning';
export { AthleteTile, type AthleteTileData } from './components/athlete-tile';
export { CreateAthleteDialog } from './components/create-athlete-dialog';
export { LoadMoreAthletes } from './components/load-more-athletes';
/**
 * The three tracking tables, and the shape their writes take.
 *
 * Exported because the athlete portal renders the same tables (§21). They are
 * safe to share in a way `server/` is not: none of them names an athlete or
 * touches the database — the writes arrive as props, so each surface binds its
 * own procedures and neither can reach through the other's.
 */
export {
  NutritionWeek,
  type NutritionWeekView,
  type NutritionWrites,
} from './components/nutrition-week';
export {
  BiofeedbackWeek,
  type BiofeedbackWeekView,
  type BiofeedbackWrites,
} from './components/biofeedback-week';
export { CycleMonth, type CycleMonthView, type CycleWrites } from './components/cycle-month';
export type { WriteOutcome } from './components/writes';
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
