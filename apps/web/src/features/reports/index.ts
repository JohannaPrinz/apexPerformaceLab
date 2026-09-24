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

/**
 * Creating an analysis, for the one caller outside this slice: completing an
 * assessment. That caller passes `reuseOpenDraft`, so completing twice does not
 * leave two drafts behind.
 */
export { createAnalysisAction } from './server/actions';

/** The surface a shared link opens onto. */
export { SharedReport } from './components/shared-report';
// The reader's own copy: the browser writes this page to PDF from the layout
// they are looking at. See `SaveAsPdf`.
export { SaveAsPdf } from './components/save-as-pdf';
export { SharePasswordForm } from './components/share-password-form';
export { ShareAnalysis, type AnalysisStatus, type ShareRow } from './components/share-analysis';
export {
  ArchiveAnalysisButton,
  DeleteAnalysisButton,
  NewAnalysisButton,
} from './components/analysis-lifecycle';
export { AnalysisList, type AnalysisListItem } from './components/analysis-list';

/**
 * One analysed movement, drawn the way the report draws it.
 *
 * Exported because the athlete's profile shows the same four blocks — where the
 * values came from, the course, the angles against their targets, and what the
 * coach wrote. A second rendering there would be a second reading of one
 * recording.
 */
export { MovementBlock } from './components/movement-block';
export { mediaUrl } from './components/document';
export type { DocumentMovement, DocumentTest } from './components/document';
