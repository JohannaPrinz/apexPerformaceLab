import { describe, expect, it, vi } from 'vitest';

import { createReportShare } from './sharing';

/**
 * Where a shared analysis is sent, and what that does to the athlete's record.
 *
 * The address is the only thing this file is about. Sending itself belongs to
 * the action, and the token and password have their own guarantees elsewhere.
 *
 * Three of them, and the last two are the reason the file exists:
 *
 * 1. **A stored address wins.** It is the athlete's own; a box in a send dialog
 *    must not be able to redirect a document away from them.
 * 2. **A supplied address is written scoped.** The write reaches one athlete in
 *    one workspace, and only where the column is still empty. Both conditions
 *    live in the filter, so the database enforces them rather than a check that
 *    ran a moment earlier.
 * 3. **A write that changed nothing does not become a recipient.** If the
 *    filter matched no row, the address was not accepted and must not be used
 *    as though it had been.
 */

const TENANT = { organizationId: 'org_a' } as const;

const report = (email: string | null) => ({
  id: 'rep_1',
  assessment: { case: { athlete: { id: 'ath_1', email } } },
});

/**
 * A fake that answers from the filter rather than from the test.
 *
 * `updateMany` interprets `where` — a fake that returned a configured count
 * regardless of it would pass every assertion below while the service scoped
 * nothing at all.
 */
const dbFor = (
  stored: string | null,
  rows: readonly { id: string; organizationId: string; email: string | null }[] = [],
) => {
  const updates: unknown[] = [];

  return {
    updates,
    db: {
      report: { findFirst: vi.fn().mockResolvedValue(report(stored)) },
      athlete: {
        updateMany: vi.fn(({ where }: { where: Record<string, unknown> }) => {
          updates.push(where);
          const count = rows.filter(
            (row) =>
              row.organizationId === where.organizationId &&
              row.id === where.id &&
              row.email === where.email,
          ).length;

          return Promise.resolve({ count });
        }),
      },
      share: { create: vi.fn().mockResolvedValue({ id: 'shr_1' }) },
    },
  };
};

const create = (db: unknown, email?: string) =>
  createReportShare(db as never, TENANT, 'coach_1', 'rep_1', 7, 'passwort-lang-genug', email);

describe('createReportShare', () => {
  it('sends to the stored address and leaves the record alone', async () => {
    const { db, updates } = dbFor('lena@example.org');

    const share = await create(db, 'jemand.anderes@example.org');

    expect(share?.recipient).toBe('lena@example.org');
    expect(updates).toHaveLength(0);
  });

  it('stores a supplied address, scoped to the workspace and to an empty column', async () => {
    const { db, updates } = dbFor(null, [{ id: 'ath_1', organizationId: 'org_a', email: null }]);

    const share = await create(db, 'lena@example.org');

    expect(share?.recipient).toBe('lena@example.org');
    expect(updates).toEqual([{ organizationId: 'org_a', id: 'ath_1', email: null }]);
  });

  it('does not adopt an address the write did not accept', async () => {
    // The row sits in another workspace: the filter matches nothing.
    const { db } = dbFor(null, [{ id: 'ath_1', organizationId: 'org_b', email: null }]);

    const share = await create(db, 'lena@example.org');

    expect(share?.recipient).toBeNull();
  });

  it('has no recipient when none is stored and none is given', async () => {
    const { db, updates } = dbFor(null);

    const share = await create(db);

    expect(share?.recipient).toBeNull();
    expect(updates).toHaveLength(0);
  });
});
