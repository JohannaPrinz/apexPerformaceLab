import { z } from 'zod';

/**
 * The lifecycle of a test.
 *
 * ## Pausing is not a status
 *
 * A paused test is one that has been started and is not finished — which is
 * exactly `IN_PROGRESS`. A separate `PAUSED` would be indistinguishable from it
 * in every query and every rule, and the coach would have to remember which of
 * the two they left it in. Pausing and resuming are things a person does; the
 * record only needs to know the test is under way.
 *
 * ## Skipped and aborted are different statements
 *
 * `SKIPPED` — the coach decided not to run it. `ABORTED` — it was started and
 * stopped. Both are worth keeping, and neither creates a Measurement: a value
 * that was never taken has no row, and inventing one to represent its absence
 * would put fiction into a scientific record.
 *
 * ## Status does not decide evaluability
 *
 * A `COMPLETED` test may still be missing values, and an `ABORTED` one may hold
 * enough to be useful. Whether an analysis can be drawn is computed from the
 * measurements present — see `evaluateReadiness`.
 */
export const ASSESSMENT_MODULE_STATUSES = [
  'PLANNED',
  'IN_PROGRESS',
  'COMPLETED',
  'SKIPPED',
  'ABORTED',
] as const;

export const assessmentModuleStatusSchema = z.enum(ASSESSMENT_MODULE_STATUSES);
export type AssessmentModuleStatus = z.infer<typeof assessmentModuleStatusSchema>;

export const ASSESSMENT_MODULE_STATUS_LABELS: Readonly<Record<AssessmentModuleStatus, string>> = {
  PLANNED: 'Planned',
  IN_PROGRESS: 'In progress',
  COMPLETED: 'Completed',
  SKIPPED: 'Skipped',
  ABORTED: 'Aborted',
} as const;

/**
 * Which transitions are allowed.
 *
 * Everything is reversible except through deletion, because a coach who
 * completes a test and then notices a missing value must be able to go back —
 * and the alternative, a second test recording the same thing, would corrupt
 * the history far worse than a reopened status.
 *
 * `PLANNED` is not reachable again once work has begun: a test that produced
 * measurements was never merely planned, and pretending otherwise would make
 * the status lie about what happened.
 */
const TRANSITIONS: Readonly<Record<AssessmentModuleStatus, readonly AssessmentModuleStatus[]>> = {
  PLANNED: ['IN_PROGRESS', 'SKIPPED'],
  IN_PROGRESS: ['COMPLETED', 'ABORTED'],
  COMPLETED: ['IN_PROGRESS'],
  SKIPPED: ['PLANNED', 'IN_PROGRESS'],
  ABORTED: ['IN_PROGRESS'],
} as const;

export function canTransition(from: AssessmentModuleStatus, to: AssessmentModuleStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function allowedTransitions(
  from: AssessmentModuleStatus,
): readonly AssessmentModuleStatus[] {
  return TRANSITIONS[from];
}

/** Statuses that mean the test has produced, or may still produce, values. */
export function hasStarted(status: AssessmentModuleStatus): boolean {
  return status === 'IN_PROGRESS' || status === 'COMPLETED' || status === 'ABORTED';
}

/**
 * Whether a test may be removed from its assessment outright.
 *
 * Only a test that was never started and holds nothing. There is no history to
 * preserve, and leaving it behind would clutter the record with a decision
 * nobody took.
 *
 * `SKIPPED` is deliberately **not** removable: "we decided not to run this" is
 * a statement about the examination, and losing it would make the assessment
 * look like the test was never considered. A started test is `ABORTED`, never
 * deleted — its measurements stay.
 */
export function canRemove(status: AssessmentModuleStatus, measurementCount: number): boolean {
  return status === 'PLANNED' && measurementCount === 0;
}
