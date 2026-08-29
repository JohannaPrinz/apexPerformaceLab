/**
 * The public surface of the reports slice.
 *
 * Components only. The service and the router are reached through tRPC, and the
 * lint rule that forbids importing a slice's internals is what keeps that true.
 */
export {
  AssessmentEvaluation,
  StartEvaluation,
  type EvaluationView,
} from './components/evaluation';
export { SeriesTable, seriesLabel, type SeriesRow } from './components/series-table';

/**
 * Creating an analysis, for the one caller outside this slice: completing an
 * assessment. It is idempotent, so the caller never has to ask first.
 */
export { createAnalysisAction } from './server/actions';

/** The surface a shared link opens onto. */
export { SharedReport } from './components/shared-report';
export { SharePasswordForm } from './components/share-password-form';
export { PublishAndShare, type ShareRow } from './components/publish-and-share';
