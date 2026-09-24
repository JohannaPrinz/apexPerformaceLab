import { describe, expect, it, vi } from 'vitest';

import {
  analysesForAssessment,
  archiveReport,
  assessmentEvaluation,
  deleteDraftReport,
  otherOpenDrafts,
  reopenUnsharedReport,
  setReportModuleInclusion,
} from './service';

/**
 * When an analysis is finished, and what may happen to it before and after.
 *
 * The rule, as the coach put it: an analysis is finished when it has been
 * shared with the athlete. Before that, tests go in and out and the draft can
 * be deleted; after it, the analysis is fixed and can only be archived — which
 * ends the athlete's access. An assessment may hold several analyses, and every
 * test with values starts out included.
 *
 * Each rule sits in a `where` clause, so each case asserts the filter the
 * service sends — a check before the write would be a second moment somebody
 * could slip in between.
 */

vi.mock('@apex/database', () => ({ db: {} }));

const TENANT = { organizationId: 'org_a' } as const;

describe('changing which tests an analysis draws on', () => {
  const dbWith = (report: { id: string } | null) => ({
    report: { findFirst: vi.fn(() => Promise.resolve(report)) },
    assessmentModule: { findFirst: vi.fn(() => Promise.resolve({ id: 'mod_1' })) },
    reportModule: { upsert: vi.fn(() => Promise.resolve({})) },
  });

  it('asks for a draft, so a shared analysis cannot be changed', async () => {
    const db = dbWith({ id: 'rep_1' });

    await setReportModuleInclusion(db as never, TENANT, 'rep_1', 'mod_1', false);

    expect(db.report.findFirst.mock.calls[0]).toEqual([
      { where: { id: 'rep_1', status: 'DRAFT', organizationId: 'org_a' }, select: { id: true } },
    ]);
  });

  it('writes nothing where the analysis is no longer a draft', async () => {
    // The filter above finds nothing for a shared analysis.
    const db = dbWith(null);

    expect(await setReportModuleInclusion(db as never, TENANT, 'rep_1', 'mod_1', true)).toBe(false);
    expect(db.reportModule.upsert).not.toHaveBeenCalled();
  });
});

describe('several drafts of one assessment', () => {
  it('reads the draft it is asked for, not merely the newest', async () => {
    const report = { findFirst: vi.fn(() => Promise.resolve(null)) };
    const db = {
      assessment: { findFirst: vi.fn(() => Promise.resolve({ id: 'ass_1', modules: [] })) },
      report,
      measurement: { findMany: vi.fn(), groupBy: vi.fn() },
      assessmentModule: { findMany: vi.fn() },
      exercise: { findMany: vi.fn() },
    };

    await assessmentEvaluation(
      db as never,
      TENANT,
      'ass_1',
      { module: (key) => key, moduleStatus: (status) => status },
      'rep_older',
    );

    const call = report.findFirst.mock.calls[0] as unknown as [{ where: Record<string, unknown> }];
    expect(call[0].where).toMatchObject({
      organizationId: 'org_a',
      assessmentId: 'ass_1',
      status: 'DRAFT',
      id: 'rep_older',
    });
  });

  it('counts the other drafts still open, so shared stills are not cleared under them', async () => {
    const count = vi.fn(() => Promise.resolve(1));

    expect(await otherOpenDrafts({ report: { count } } as never, TENANT, 'ass_1', 'rep_1')).toBe(1);
    expect(count).toHaveBeenCalledWith({
      where: {
        organizationId: 'org_a',
        assessmentId: 'ass_1',
        status: 'DRAFT',
        id: { not: 'rep_1' },
      },
    });
  });
});

describe('deleting an analysis', () => {
  it('deletes only a draft that no link points at', async () => {
    const deleteMany = vi.fn(() => Promise.resolve({ count: 1 }));

    expect(await deleteDraftReport({ report: { deleteMany } } as never, TENANT, 'rep_1')).toBe(
      true,
    );
    expect(deleteMany).toHaveBeenCalledWith({
      where: { id: 'rep_1', status: 'DRAFT', shares: { none: {} }, organizationId: 'org_a' },
    });
  });

  it('refuses a shared analysis — it can only be archived', async () => {
    const deleteMany = vi.fn(() => Promise.resolve({ count: 0 }));

    expect(await deleteDraftReport({ report: { deleteMany } } as never, TENANT, 'rep_1')).toBe(
      false,
    );
  });
});

describe('archiving a shared analysis', () => {
  const transactional = (archived: number) => {
    const report = { updateMany: vi.fn(() => Promise.resolve({ count: archived })) };
    const share = { updateMany: vi.fn(() => Promise.resolve({ count: 2 })) };
    const db = {
      $transaction: <T>(run: (tx: unknown) => Promise<T>) => run({ report, share }),
    };

    return { db, report, share };
  };

  const NOW = new Date('2026-09-16T10:00:00.000Z');

  it('archives only what was shared, and ends every link to it in the same transaction', async () => {
    const { db, report, share } = transactional(1);

    expect(await archiveReport(db as never, TENANT, 'rep_1', NOW)).toBe(true);
    expect(report.updateMany).toHaveBeenCalledWith({
      where: { id: 'rep_1', status: 'PUBLISHED', organizationId: 'org_a' },
      data: { status: 'ARCHIVED', archivedAt: NOW },
    });
    expect(share.updateMany).toHaveBeenCalledWith({
      where: { reportId: 'rep_1', revokedAt: null, organizationId: 'org_a' },
      data: { revokedAt: NOW },
    });
  });

  it('touches no link where there was nothing to archive — a draft, or already archived', async () => {
    const { db, share } = transactional(0);

    expect(await archiveReport(db as never, TENANT, 'rep_1', NOW)).toBe(false);
    expect(share.updateMany).not.toHaveBeenCalled();
  });
});

describe('a share that failed after the freeze', () => {
  it('reopens the analysis only while no link exists', async () => {
    const updateMany = vi.fn(() => Promise.resolve({ count: 1 }));

    expect(await reopenUnsharedReport({ report: { updateMany } } as never, TENANT, 'rep_1')).toBe(
      true,
    );
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: 'rep_1', status: 'PUBLISHED', shares: { none: {} }, organizationId: 'org_a' },
      data: { status: 'DRAFT', publishedAt: null },
    });
  });
});

describe('the list of analyses', () => {
  const NOW = new Date('2026-09-16T10:00:00.000Z');
  const base = {
    title: 'Auswertung',
    scope: 'ASSESSMENT',
    publishedAt: null,
    archivedAt: null,
    createdAt: NOW,
    assessmentId: 'ass_1',
    authorCoachId: 'coach_1',
  };

  const listDb = (reports: unknown[], withValues: string[]) => ({
    report: { findMany: vi.fn(() => Promise.resolve(reports)) },
    measurement: {
      groupBy: vi.fn(() =>
        Promise.resolve(withValues.map((assessmentModuleId) => ({ assessmentModuleId }))),
      ),
    },
  });

  it('counts every test with values for a draft, except those taken out', async () => {
    const db = listDb(
      [
        {
          ...base,
          id: 'rep_draft',
          status: 'DRAFT',
          version: 2,
          // mod_2 was taken out; mod_3 recorded after the draft was made.
          modules: [
            { assessmentModuleId: 'mod_1', included: true },
            { assessmentModuleId: 'mod_2', included: false },
          ],
          shares: [],
        },
      ],
      ['mod_1', 'mod_2', 'mod_3'],
    );

    const [draft] = await analysesForAssessment(db as never, TENANT, 'ass_1', NOW);

    expect(draft?.testCount).toBe(2);
  });

  it('counts what was frozen for a shared analysis, and only the links still open', async () => {
    const db = listDb(
      [
        {
          ...base,
          id: 'rep_shared',
          status: 'PUBLISHED',
          version: 1,
          modules: [{ assessmentModuleId: 'mod_1', included: true }],
          shares: [
            { revokedAt: null, expiresAt: new Date('2026-09-20T00:00:00.000Z') },
            { revokedAt: null, expiresAt: new Date('2026-09-10T00:00:00.000Z') },
            { revokedAt: NOW, expiresAt: null },
            { revokedAt: null, expiresAt: null },
          ],
        },
      ],
      // A test that recorded values since does not join a shared document.
      ['mod_1', 'mod_2'],
    );

    const [shared] = await analysesForAssessment(db as never, TENANT, 'ass_1', NOW);

    expect(shared?.testCount).toBe(1);
    expect(shared?.activeShares).toBe(2);
    expect(shared).not.toHaveProperty('shares');
  });

  it('reads only this workspace and only standing values of working tests', async () => {
    const db = listDb([], []);

    await analysesForAssessment(db as never, TENANT, 'ass_1', NOW);

    expect(db.measurement.groupBy).toHaveBeenCalledWith({
      by: ['assessmentModuleId'],
      where: {
        supersededById: null,
        assessmentModule: { assessmentId: 'ass_1', archivedAt: null },
        organizationId: 'org_a',
      },
    });
  });
});
