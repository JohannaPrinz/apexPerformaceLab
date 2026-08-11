import { describe, expect, it } from 'vitest';

import {
  allowedTransitions,
  ASSESSMENT_MODULE_STATUSES,
  ASSESSMENT_MODULE_STATUS_LABELS,
  canRemove,
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

describe('removing a test', () => {
  it('is allowed only for one that was never started and holds nothing', () => {
    expect(canRemove('PLANNED', 0)).toBe(true);
    expect(canRemove('PLANNED', 1)).toBe(false);
  });

  /**
   * "We decided not to run this" is a statement about the examination. Losing
   * it would make the assessment look like the test was never considered.
   */
  it('is refused for a skipped test — the decision is worth keeping', () => {
    expect(canRemove('SKIPPED', 0)).toBe(false);
  });

  it('is refused once a test has been started', () => {
    for (const status of ['IN_PROGRESS', 'COMPLETED', 'ABORTED'] as const) {
      expect(canRemove(status, 0), `${status} must not be removable`).toBe(false);
    }
  });
});
