import { describe, expect, it, vi } from 'vitest';

import { sharedReportFor, sharedReportsFor } from './reports';

/**
 * Which analyses an athlete may read in their portal (§21).
 *
 * The claims are all about the **filter**, because that is where the answer is
 * decided. A fake that returned rows regardless would pass a test of the return
 * value while the query fetched every report in the workspace.
 *
 * 1. The workspace, the athlete and an active share are all conditions of the
 *    read — none of them a check made afterwards.
 * 2. A withdrawn or expired share removes the analysis from the portal, because
 *    the coach's control over sharing must stay the only control.
 * 3. All three report scopes reach the athlete, so a case-scoped analysis does
 *    not silently never appear.
 * 4. A drafted or archived report is never returned.
 */

const TENANT = { organizationId: 'org_a' } as const;
const NOW = new Date('2026-09-05T10:00:00.000Z');

const capture = () => {
  const wheres: Record<string, unknown>[] = [];

  return {
    wheres,
    db: {
      report: {
        findMany: vi.fn(({ where }: { where: Record<string, unknown> }) => {
          wheres.push(where);

          return Promise.resolve([]);
        }),
        findFirst: vi.fn(({ where }: { where: Record<string, unknown> }) => {
          wheres.push(where);

          return Promise.resolve(null);
        }),
      },
    },
  };
};

describe('what the filter demands', () => {
  it('carries the workspace, publication and an unwithdrawn, unexpired share', async () => {
    const { db, wheres } = capture();

    await sharedReportsFor(db as never, TENANT, 'ath_1', NOW);

    expect(wheres[0]).toMatchObject({
      organizationId: 'org_a',
      status: 'PUBLISHED',
      archivedAt: null,
      shares: { some: { revokedAt: null, OR: [{ expiresAt: null }, { expiresAt: { gt: NOW } }] } },
    });
  });

  it('reaches the athlete through all three report scopes', async () => {
    const { db, wheres } = capture();

    await sharedReportsFor(db as never, TENANT, 'ath_1', NOW);

    expect(wheres[0]?.['OR']).toEqual([
      { assessment: { case: { athleteId: 'ath_1' } } },
      { case: { athleteId: 'ath_1' } },
      { assessmentModule: { assessment: { case: { athleteId: 'ath_1' } } } },
    ]);
  });

  it('narrows a single report by its id **and** by everything else', async () => {
    const { db, wheres } = capture();

    await sharedReportFor(db as never, TENANT, 'ath_1', 'rep_of_somebody_else', NOW);

    // The id from the request is one condition among four, never the ground.
    expect(wheres[0]).toMatchObject({
      id: 'rep_of_somebody_else',
      organizationId: 'org_a',
      status: 'PUBLISHED',
    });
    expect(wheres[0]?.['OR']).toBeDefined();
    expect(wheres[0]?.['shares']).toBeDefined();
  });

  it('answers null for a report the filter did not match', async () => {
    const { db } = capture();

    expect(await sharedReportFor(db as never, TENANT, 'ath_1', 'rep_x', NOW)).toBeNull();
  });

  it('answers null for a published report whose snapshot cannot be read', async () => {
    const db = {
      report: {
        findFirst: vi
          .fn()
          .mockResolvedValue({ title: 'Auswertung', publishedAt: NOW, content: { broken: true } }),
      },
    };

    // A document with holes in it is worse than saying it cannot be shown.
    expect(await sharedReportFor(db as never, TENANT, 'ath_1', 'rep_1', NOW)).toBeNull();
  });
});

describe('the list an athlete sees', () => {
  it('carries the examination it belongs to, newest first', async () => {
    const db = {
      report: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'rep_1',
            title: 'Standortbestimmung',
            publishedAt: new Date('2026-09-01T00:00:00.000Z'),
            assessment: {
              question: 'Wo steht sie zum Saisonstart?',
              performedAt: new Date('2026-08-30T00:00:00.000Z'),
            },
          },
          { id: 'rep_2', title: 'Fallbericht', publishedAt: null, assessment: null },
        ]),
      },
    };

    const list = await sharedReportsFor(db as never, TENANT, 'ath_1', NOW);

    expect(list[0]).toEqual({
      id: 'rep_1',
      title: 'Standortbestimmung',
      publishedAt: new Date('2026-09-01T00:00:00.000Z'),
      question: 'Wo steht sie zum Saisonstart?',
      performedAt: new Date('2026-08-30T00:00:00.000Z'),
    });
    // A case-scoped analysis has no examination behind it, and says so rather
    // than borrowing one.
    expect(list[1]).toMatchObject({ id: 'rep_2', question: null, performedAt: null });
    expect(db.report.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ orderBy: [{ publishedAt: 'desc' }] }),
    );
  });
});
