import { describe, expect, it } from 'vitest';

import {
  allowedAssessmentTransitions,
  assessmentProgress,
  assessmentStatusFrom,
  canTransitionAssessment,
  isAssessmentLive,
  isModuleSettled,
} from './status';

import type { AssessmentModuleStatus } from '../modules/status';

/**
 * The lifecycle of an examination.
 *
 * Two things are worth guarding here rather than in the service: which moves
 * are legal, and what "everything is done" means. Both decide whether a coach
 * can close a session, and both are pure — the service asks these functions and
 * does not repeat the reasoning.
 */

describe('moving an assessment through its lifecycle', () => {
  it('starts a planned examination', () => {
    expect(canTransitionAssessment('PLANNED', 'IN_PROGRESS')).toBe(true);
  });

  it('finishes or abandons a running one', () => {
    expect(canTransitionAssessment('IN_PROGRESS', 'COMPLETED')).toBe(true);
    expect(canTransitionAssessment('IN_PROGRESS', 'ABORTED')).toBe(true);
  });

  it('reopens a finished one', () => {
    // Same reasoning as a test: a coach who notices a missing value must be
    // able to go back, and a second assessment recording the same session would
    // corrupt the history far worse.
    expect(canTransitionAssessment('COMPLETED', 'IN_PROGRESS')).toBe(true);
    expect(canTransitionAssessment('ABORTED', 'IN_PROGRESS')).toBe(true);
  });

  it('never returns to planned once work has begun', () => {
    // An examination that produced measurements was never merely planned.
    for (const from of ['IN_PROGRESS', 'COMPLETED', 'ABORTED'] as const) {
      expect(canTransitionAssessment(from, 'PLANNED'), from).toBe(false);
    }
  });

  it('never aborts something that never started', () => {
    // Aborting says it was started and stopped. A planned one is put away.
    expect(canTransitionAssessment('PLANNED', 'ABORTED')).toBe(false);
    expect(canTransitionAssessment('PLANNED', 'ARCHIVED')).toBe(true);
  });

  it('treats archiving as final, like a performance case', () => {
    // §8: a case may be reopened *while not archived*. Archiving is the
    // deliberate act of putting something away; undoable, it would mean nothing.
    expect(allowedAssessmentTransitions('ARCHIVED')).toEqual([]);
  });

  it('cannot skip straight from planned to finished', () => {
    expect(canTransitionAssessment('PLANNED', 'COMPLETED')).toBe(false);
  });

  it('knows which states may still be worked on', () => {
    expect(isAssessmentLive('PLANNED')).toBe(true);
    expect(isAssessmentLive('IN_PROGRESS')).toBe(true);
    for (const status of ['COMPLETED', 'ABORTED', 'ARCHIVED'] as const) {
      expect(isAssessmentLive(status), status).toBe(false);
    }
  });
});

describe('deciding when every test is done', () => {
  it('counts a completed, skipped or aborted test as decided', () => {
    // Wider than "completed" on purpose: an examination where one test was
    // skipped deliberately is finished, and refusing to close it would make the
    // skip useless.
    for (const status of ['COMPLETED', 'SKIPPED', 'ABORTED'] as const) {
      expect(isModuleSettled(status), status).toBe(true);
    }
  });

  it('counts a planned or running test as still open', () => {
    for (const status of ['PLANNED', 'IN_PROGRESS'] as const) {
      expect(isModuleSettled(status), status).toBe(false);
    }
  });
});

describe('progress', () => {
  const progress = (statuses: AssessmentModuleStatus[]) => assessmentProgress(statuses);

  it('keeps completed, skipped and aborted apart', () => {
    // "2 von 4" is not the same statement as "2 abgeschlossen, 1 übersprungen".
    const result = progress(['COMPLETED', 'COMPLETED', 'SKIPPED', 'ABORTED']);

    expect(result).toMatchObject({ completed: 2, skipped: 1, aborted: 1, open: 0, total: 4 });
  });

  it('is settled once no test awaits a decision', () => {
    expect(progress(['COMPLETED', 'SKIPPED']).settled).toBe(true);
  });

  it('is not settled while one test is planned or running', () => {
    expect(progress(['COMPLETED', 'PLANNED']).settled).toBe(false);
    expect(progress(['COMPLETED', 'IN_PROGRESS']).settled).toBe(false);
  });

  it('is not settled when there is no test at all', () => {
    // §26.6 requires at least one. Closing an empty examination would record a
    // session that never took place.
    expect(progress([]).settled).toBe(false);
  });

  it('counts several tests of one type separately', () => {
    // Three running tests in one session is the ordinary case (§11).
    expect(progress(['COMPLETED', 'COMPLETED', 'PLANNED'])).toMatchObject({
      completed: 2,
      open: 1,
      total: 3,
    });
  });
});

describe('reading a status off existing tests', () => {
  it('calls an examination with no tests planned', () => {
    expect(assessmentStatusFrom([])).toBe('PLANNED');
  });

  it('calls one whose tests are all planned planned', () => {
    expect(assessmentStatusFrom(['PLANNED', 'PLANNED'])).toBe('PLANNED');
  });

  it('calls one whose tests are all decided completed', () => {
    expect(assessmentStatusFrom(['COMPLETED', 'SKIPPED'])).toBe('COMPLETED');
  });

  it('calls anything in between running', () => {
    expect(assessmentStatusFrom(['COMPLETED', 'PLANNED'])).toBe('IN_PROGRESS');
    expect(assessmentStatusFrom(['IN_PROGRESS'])).toBe('IN_PROGRESS');
  });
});
