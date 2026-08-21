import { z } from 'zod';

import type { AssessmentModuleStatus } from '../modules/status';

/**
 * The lifecycle of an assessment.
 *
 * Modelled on the test's lifecycle (`../modules/status.ts`) rather than beside
 * it: the same words mean the same things one level up, and a coach who has
 * learned what `IN_PROGRESS` means on a test should not have to learn a second
 * vocabulary for the examination that contains it.
 *
 * ## What is deliberately absent
 *
 * **`SKIPPED`.** A test may be skipped because the examination went ahead
 * without it. An examination that does not happen is not skipped — it is simply
 * not created, or it is archived without ever running.
 *
 * **`PAUSED`.** For the same reason it is absent on a test: a paused assessment
 * is one that was started and is not finished, which is `IN_PROGRESS`. Pausing
 * is something a person does; the record only needs to know it is under way.
 *
 * ## Why `ARCHIVED` exists here and not on a test
 *
 * `PerformanceCase` — the object one level above — already uses `ARCHIVED` as
 * the state that takes something out of the working view without deleting it
 * (§8). An assessment needs the same, because a roster of examinations grows
 * for as long as an athlete is coached. A test does not: it lives inside an
 * assessment that can be archived as a whole.
 */
export const ASSESSMENT_STATUSES = [
  'PLANNED',
  'IN_PROGRESS',
  'COMPLETED',
  'ABORTED',
  'ARCHIVED',
] as const;

export const assessmentStatusSchema = z.enum(ASSESSMENT_STATUSES);
export type AssessmentStatus = z.infer<typeof assessmentStatusSchema>;

/**
 * Which transitions are allowed.
 *
 * Reversible while the record is live, for the same reason the test's is: a
 * coach who completes an examination and then notices a missing value must be
 * able to reopen it, and the alternative — a second assessment recording the
 * same session — would corrupt the history far worse than a reopened status.
 *
 * **`ARCHIVED` is terminal**, matching `PerformanceCase`, where §8 states a case
 * may be reopened *while not archived*. Archiving is the deliberate act of
 * putting something away; making it undoable would make it mean nothing.
 *
 * **`PLANNED` may be archived but never aborted.** Aborting says the
 * examination was started and stopped. One that never began is put away, and
 * the status has to keep saying which of the two happened.
 *
 * **`PLANNED` is not reachable again** once work has begun — an assessment that
 * produced measurements was never merely planned.
 */
const TRANSITIONS: Readonly<Record<AssessmentStatus, readonly AssessmentStatus[]>> = {
  PLANNED: ['IN_PROGRESS', 'ARCHIVED'],
  IN_PROGRESS: ['COMPLETED', 'ABORTED'],
  COMPLETED: ['IN_PROGRESS', 'ARCHIVED'],
  ABORTED: ['IN_PROGRESS', 'ARCHIVED'],
  ARCHIVED: [],
} as const;

export function canTransitionAssessment(from: AssessmentStatus, to: AssessmentStatus): boolean {
  return TRANSITIONS[from].includes(to);
}

export function allowedAssessmentTransitions(from: AssessmentStatus): readonly AssessmentStatus[] {
  return TRANSITIONS[from];
}

/** Whether the examination may still be worked on. */
export function isAssessmentLive(status: AssessmentStatus): boolean {
  return status === 'PLANNED' || status === 'IN_PROGRESS';
}

/**
 * A test that needs no further decision from the coach.
 *
 * `COMPLETED` — it was performed. `SKIPPED` — the coach decided not to run it.
 * `ABORTED` — it was started and stopped. All three are decisions; `PLANNED`
 * and `IN_PROGRESS` are not.
 *
 * This is what "all relevant tests are done" means, and it is deliberately
 * wider than "completed": an examination where one test was skipped on purpose
 * is finished, and refusing to let the coach close it would make the skip
 * useless.
 */
export function isModuleSettled(status: AssessmentModuleStatus): boolean {
  return status === 'COMPLETED' || status === 'SKIPPED' || status === 'ABORTED';
}

export interface AssessmentProgress {
  /** Tests that were actually performed. */
  readonly completed: number;
  /** Tests the coach deliberately did not run. */
  readonly skipped: number;
  /** Tests started and stopped. */
  readonly aborted: number;
  /** Tests still awaiting a decision — planned or under way. */
  readonly open: number;
  readonly total: number;
  /** Whether every test has been decided, so the assessment may be closed. */
  readonly settled: boolean;
}

/**
 * How far an examination has got, from its tests alone.
 *
 * Derived, never stored: a second copy of this number would be one more thing
 * that can disagree with the tests it describes. The counts are kept apart
 * because they say different things — "2 von 3" is not the same statement as
 * "2 abgeschlossen, 1 übersprungen".
 *
 * An assessment with no tests is **not** settled. §26.6 requires at least one,
 * and letting an empty examination be closed would record a session that never
 * took place.
 */
export function assessmentProgress(
  statuses: readonly AssessmentModuleStatus[],
): AssessmentProgress {
  const count = (wanted: AssessmentModuleStatus): number =>
    statuses.filter((status) => status === wanted).length;

  const completed = count('COMPLETED');
  const skipped = count('SKIPPED');
  const aborted = count('ABORTED');
  const total = statuses.length;
  const open = total - completed - skipped - aborted;

  return {
    completed,
    skipped,
    aborted,
    open,
    total,
    settled: total > 0 && open === 0,
  };
}

/**
 * The status an existing assessment should carry, read from its tests.
 *
 * Used to give rows written before this lifecycle existed a truthful starting
 * value instead of a uniform default. Nothing is guessed: a set of tests that
 * are all settled describes a completed examination, and one with a test under
 * way describes a running one.
 */
export function assessmentStatusFrom(
  statuses: readonly AssessmentModuleStatus[],
): AssessmentStatus {
  if (statuses.length === 0) return 'PLANNED';
  if (statuses.every((status) => status === 'PLANNED')) return 'PLANNED';

  return assessmentProgress(statuses).settled ? 'COMPLETED' : 'IN_PROGRESS';
}
