import { describe, expect, it, vi } from 'vitest';

import {
  ANALYSIS_LEASE_MS,
  endAnalysisLease,
  heartbeatAnalysisLease,
  notHeldByAnalysis,
  startAnalysisLease,
  sweepExpiredAnalysisLeases,
} from './analysis-lease';

/**
 * The hold one analysis has on one stored video (§18).
 *
 * Every function here is a **single conditional statement**, and that is the
 * whole design: the condition lives in the `WHERE`, so the database decides who
 * wins rather than a read followed by a write in application code. The tests
 * therefore read the filters — what was asked of the row is the guarantee.
 */

const TENANT = { organizationId: 'org_a' } as const;
const NOW = new Date('2026-09-06T12:00:00.000Z');

/** A fake that answers from the filter, and records what it was given. */
function dbFor(
  rows: readonly {
    id: string;
    organizationId: string;
    status: string | null;
    expiresAt: Date | null;
  }[],
) {
  const updates: { where: Record<string, unknown>; data: Record<string, unknown> }[] = [];

  const free = (row: (typeof rows)[number], now: Date) =>
    row.status === null ||
    row.status !== 'RUNNING' ||
    (row.expiresAt?.getTime() ?? 0) <= now.getTime();

  return {
    updates,
    db: {
      asset: {
        updateMany: vi.fn(
          ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
            updates.push({ where, data });

            const wants = where['OR'] !== undefined;
            const running = where['analysisStatus'] === 'RUNNING';

            const count = rows.filter((row) => {
              if (
                where['organizationId'] !== undefined &&
                row.organizationId !== where['organizationId']
              ) {
                return false;
              }
              if (where['id'] !== undefined && row.id !== where['id']) return false;
              // "Take the hold": only a row nothing is holding.
              if (wants) return free(row, NOW);
              // "Extend the hold": only a row that is genuinely running.
              if (running) {
                return row.status === 'RUNNING' && (row.expiresAt?.getTime() ?? 0) > NOW.getTime();
              }

              return true;
            }).length;

            return Promise.resolve({ count });
          },
        ),
      },
    },
  };
}

const row = (
  over: Partial<{
    id: string;
    organizationId: string;
    status: string | null;
    expiresAt: Date | null;
  }> = {},
) => ({
  id: 'as_1',
  organizationId: 'org_a',
  status: null as string | null,
  expiresAt: null as Date | null,
  ...over,
});

describe('what counts as free', () => {
  it('names the three ways a file is not held', () => {
    expect(notHeldByAnalysis(NOW)).toEqual({
      OR: [
        { analysisStatus: null },
        { analysisStatus: { not: 'RUNNING' } },
        { analysisExpiresAt: { lte: NOW } },
      ],
    });
  });
});

describe('taking the hold', () => {
  it('succeeds on a file nothing is holding, and dates the lease', async () => {
    const { db, updates } = dbFor([row()]);

    expect(await startAnalysisLease(db as never, TENANT, 'as_1', NOW)).toBe(true);
    expect(updates[0]?.data).toEqual({
      analysisStatus: 'RUNNING',
      analysisExpiresAt: new Date(NOW.getTime() + ANALYSIS_LEASE_MS),
    });
  });

  it('scopes to the workspace', async () => {
    const { db, updates } = dbFor([row({ organizationId: 'org_b' })]);

    expect(await startAnalysisLease(db as never, TENANT, 'as_1', NOW)).toBe(false);
    expect(updates[0]?.where).toMatchObject({ organizationId: 'org_a', id: 'as_1' });
  });

  it('refuses while somebody else holds it', async () => {
    const held = row({ status: 'RUNNING', expiresAt: new Date(NOW.getTime() + 60_000) });
    const { db } = dbFor([held]);

    // The race: two coaches open the same recording. The condition is inside
    // the statement, so exactly one of them updates a row.
    expect(await startAnalysisLease(db as never, TENANT, 'as_1', NOW)).toBe(false);
  });

  it('takes over a hold whose lease has run out', async () => {
    const stale = row({ status: 'RUNNING', expiresAt: new Date(NOW.getTime() - 1) });
    const { db } = dbFor([stale]);

    expect(await startAnalysisLease(db as never, TENANT, 'as_1', NOW)).toBe(true);
  });

  it('takes a file whose last analysis finished', async () => {
    const { db } = dbFor([row({ status: 'FINISHED' })]);

    expect(await startAnalysisLease(db as never, TENANT, 'as_1', NOW)).toBe(true);
  });
});

describe('keeping the hold alive', () => {
  it('extends a running lease', async () => {
    const held = row({ status: 'RUNNING', expiresAt: new Date(NOW.getTime() + 60_000) });
    const { db, updates } = dbFor([held]);

    expect(await heartbeatAnalysisLease(db as never, TENANT, 'as_1', NOW)).toBe(true);
    expect(updates[0]?.data).toEqual({
      analysisExpiresAt: new Date(NOW.getTime() + ANALYSIS_LEASE_MS),
    });
  });

  it('cannot revive a lease that already expired', async () => {
    const stale = row({ status: 'RUNNING', expiresAt: new Date(NOW.getTime() - 1) });
    const { db } = dbFor([stale]);

    // Somebody may already have taken it over; a heartbeat must not snatch it
    // back from under them.
    expect(await heartbeatAnalysisLease(db as never, TENANT, 'as_1', NOW)).toBe(false);
  });

  it('cannot revive a lease that was ended', async () => {
    const { db } = dbFor([row({ status: 'FINISHED' })]);

    expect(await heartbeatAnalysisLease(db as never, TENANT, 'as_1', NOW)).toBe(false);
  });
});

describe('ending the analysis', () => {
  it.each(['FINISHED', 'FAILED'] as const)('records %s and clears the lease', async (outcome) => {
    const { db, updates } = dbFor([row({ status: 'RUNNING', expiresAt: NOW })]);

    await endAnalysisLease(db as never, TENANT, 'as_1', outcome);

    expect(updates[0]?.data).toEqual({ analysisStatus: outcome, analysisExpiresAt: null });
    expect(updates[0]?.where).toMatchObject({ organizationId: 'org_a', id: 'as_1' });
  });
});

describe('sweeping what was abandoned', () => {
  it('clears only running holds whose lease has run out', async () => {
    const { db, updates } = dbFor([
      row({ status: 'RUNNING', expiresAt: new Date(NOW.getTime() - 1) }),
    ]);

    await sweepExpiredAnalysisLeases(db as never, NOW);

    expect(updates[0]?.where).toEqual({
      analysisStatus: 'RUNNING',
      analysisExpiresAt: { lte: NOW },
    });
    // Recorded as failed: that is what an analysis which stopped answering is.
    expect(updates[0]?.data).toEqual({ analysisStatus: 'FAILED', analysisExpiresAt: null });
  });

  it('runs across every workspace, because it is caretaking', async () => {
    const { db, updates } = dbFor([]);

    await sweepExpiredAnalysisLeases(db as never, NOW);

    expect(updates[0]?.where).not.toHaveProperty('organizationId');
  });
});
