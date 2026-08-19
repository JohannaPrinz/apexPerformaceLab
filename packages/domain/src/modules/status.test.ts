import { describe, expect, it } from 'vitest';

import {
  allowedTransitions,
  ASSESSMENT_MODULE_STATUSES,
  ASSESSMENT_MODULE_STATUS_LABELS,
  assessmentHasBegun,
  canRemoveModule,
  canTransition,
  hasStarted,
} from './status';

describe('test lifecycle', () => {
  it('holds exactly the five statuses', () => {
    expect(ASSESSMENT_MODULE_STATUSES).toEqual([
      'PLANNED',
      'IN_PROGRESS',
      'COMPLETED',
      'SKIPPED',
      'ABORTED',
    ]);
  });

  /**
   * A paused test is one that has been started and is not finished — which is
   * `IN_PROGRESS`. A `PAUSED` status would be indistinguishable from it in
   * every rule, and the coach would have to remember which they left it in.
   */
  it('has no PAUSED status', () => {
    expect(ASSESSMENT_MODULE_STATUSES).not.toContain('PAUSED');
  });

  it('labels every status', () => {
    for (const status of ASSESSMENT_MODULE_STATUSES) {
      expect(ASSESSMENT_MODULE_STATUS_LABELS[status]).toBeTruthy();
    }
  });

  it('starts and skips from PLANNED, nothing else', () => {
    expect(allowedTransitions('PLANNED')).toEqual(['IN_PROGRESS', 'SKIPPED']);
    expect(canTransition('PLANNED', 'COMPLETED')).toBe(false);
  });

  it('completes or aborts a running test', () => {
    expect(canTransition('IN_PROGRESS', 'COMPLETED')).toBe(true);
    expect(canTransition('IN_PROGRESS', 'ABORTED')).toBe(true);
  });

  /**
   * A coach who completes a test and then notices a missing value must be able
   * to go back. The alternative — a second test recording the same thing —
   * corrupts the history far worse than a reopened status.
   */
  it('lets a completed or aborted test be reopened', () => {
    expect(canTransition('COMPLETED', 'IN_PROGRESS')).toBe(true);
    expect(canTransition('ABORTED', 'IN_PROGRESS')).toBe(true);
  });

  it('never returns to PLANNED once work has begun', () => {
    for (const from of ['IN_PROGRESS', 'COMPLETED', 'ABORTED'] as const) {
      expect(canTransition(from, 'PLANNED'), `${from} → PLANNED must not be allowed`).toBe(false);
    }
  });

  it('lets a skipped test be taken up after all', () => {
    expect(canTransition('SKIPPED', 'IN_PROGRESS')).toBe(true);
    expect(canTransition('SKIPPED', 'PLANNED')).toBe(true);
  });

  it('knows which statuses mean work happened', () => {
    expect(hasStarted('PLANNED')).toBe(false);
    expect(hasStarted('SKIPPED')).toBe(false);
    expect(hasStarted('IN_PROGRESS')).toBe(true);
    expect(hasStarted('ABORTED')).toBe(true);
  });
});

describe('deciding whether an assessment has begun', () => {
  it('has not begun while every test is still planned', () => {
    expect(assessmentHasBegun(['PLANNED', 'PLANNED'])).toBe(false);
    expect(assessmentHasBegun([])).toBe(false);
  });

  it('has begun as soon as one test was acted on', () => {
    // Any departure from PLANNED means somebody did something — including
    // deciding not to run a test.
    for (const status of ['IN_PROGRESS', 'COMPLETED', 'SKIPPED', 'ABORTED'] as const) {
      expect(assessmentHasBegun(['PLANNED', status]), status).toBe(true);
    }
  });
});

describe('removing a test', () => {
  it('allows any test while the assessment is still being assembled', () => {
    // Nothing has happened yet, so removing one is editing a plan.
    for (const status of ['PLANNED', 'SKIPPED'] as const) {
      expect(canRemoveModule(status, 0, false).ok, status).toBe(true);
    }
  });

  it('allows a skipped test once the assessment has been performed', () => {
    expect(canRemoveModule('SKIPPED', 0, true).ok).toBe(true);
  });

  it('refuses a test that took place', () => {
    for (const status of ['PLANNED', 'IN_PROGRESS', 'COMPLETED', 'ABORTED'] as const) {
      const removal = canRemoveModule(status, 0, true);

      expect(removal.ok, `${status} must not be removable`).toBe(false);
      expect(removal.ok ? null : removal.reason).toBe('ASSESSMENT_BEGUN');
    }
  });

  it('never removes a test holding measurements, whatever its status', () => {
    // §13: a measurement is never deleted, an erroneous reading included. This
    // refusal outranks every other case, including the skipped one.
    for (const begun of [true, false]) {
      const removal = canRemoveModule('SKIPPED', 1, begun);

      expect(removal.ok).toBe(false);
      expect(removal.ok ? null : removal.reason).toBe('HAS_MEASUREMENTS');
    }
  });
});
