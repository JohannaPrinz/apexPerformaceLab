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
 * Whether an assessment has been performed, from its tests alone.
 *
 * Written when there was no status on the Assessment itself. There is one now
 * (`AssessmentStatus`), so this is **no longer what the removal rule asks** —
 * see `canRemoveModule`. It survives for the readings that genuinely are about
 * the tests rather than about the examination.
 */
export function assessmentHasBegun(statuses: readonly AssessmentModuleStatus[]): boolean {
  return statuses.some((status) => status !== 'PLANNED');
}

export type ModuleRemovalRefusal = 'HAS_MEASUREMENTS' | 'ASSESSMENT_CLOSED';

export type ModuleRemoval =
  { readonly ok: true } | { readonly ok: false; readonly reason: ModuleRemovalRefusal };

/**
 * Whether a test may be removed from its assessment outright.
 *
 * Two different situations, and the rule differs because the record means
 * different things in each:
 *
 * **While the examination is still live** — planned or running — removing a
 * test is editing the plan. Nothing about that test happened, so nothing is
 * lost.
 *
 * **Once the examination is closed** — completed, abandoned or archived — only
 * a `SKIPPED` test may go. What took place is what the record has to keep
 * saying.
 *
 * ## What "closed" is read from
 *
 * The Assessment's own status, and no longer from its tests. This function used
 * to take "has any test left PLANNED", which was the best available answer
 * before the Assessment had a status of its own — but it makes starting the
 * examination the moment every *other* test freezes. A coach who starts a
 * session and then notices they configured a test they do not need has to keep
 * it: exactly the situation this rule was never meant to describe.
 *
 * ## Why SKIPPED became removable
 *
 * This reverses the earlier rule here, which kept skipped tests on the grounds
 * that "we decided not to run this" is itself a statement about the
 * examination. That reasoning is sound and still holds — but it is a decision
 * for the coach to make about their own documentation, not one for this
 * function to enforce. A skip entered by mistake, or a test skipped and then
 * genuinely dropped from the plan, otherwise stays visible forever with no way
 * to correct it. The coach is asked to confirm; that is where the weight
 * belongs.
 *
 * ## The one refusal that is not negotiable
 *
 * A test holding measurements is never removable, whatever its status. §13:
 * measurements are never deleted, an erroneous reading included. If a skipped
 * test somehow holds values, they are the record and the test stays with them.
 */
export function canRemoveModule(
  status: AssessmentModuleStatus,
  measurementCount: number,
  assessmentClosed: boolean,
): ModuleRemoval {
  if (measurementCount > 0) return { ok: false, reason: 'HAS_MEASUREMENTS' };
  if (!assessmentClosed) return { ok: true };
  if (status === 'SKIPPED') return { ok: true };

  return { ok: false, reason: 'ASSESSMENT_CLOSED' };
}
