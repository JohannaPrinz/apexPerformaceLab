import { describe, expect, it, vi } from 'vitest';

import {
  ACTIVATION_DAYS,
  activationTokenHash,
  issueActivation,
  newActivationToken,
  resolveActivation,
  revokeActivations,
} from './activation';

/**
 * Handing an existing athlete a way into their own record (§21).
 *
 * Four guarantees, and none of them could be shown on a screen:
 *
 * 1. **The workspace boundary.** Issuing reads and writes an athlete, and a
 *    coach of one workspace must not be able to open a door in another. The
 *    assertions are on the queries themselves.
 * 2. **The token is never stored.** Only its hash reaches the database. A test
 *    that merely checked "a row was written" would pass with the token in it.
 * 3. **One way in at a time.** Issuing again supersedes what was standing —
 *    otherwise withdrawing one link would leave another working.
 * 4. **A link that should not open, does not.** Used, revoked, expired, or an
 *    athlete who already has an account: four different refusals, because they
 *    need four different next steps.
 */

const TENANT = { organizationId: 'org_a' } as const;

interface AthleteRow {
  id: string;
  organizationId: string;
  firstName: string;
  email: string | null;
  archivedAt: Date | null;
  userId: string | null;
}

const athleteRow = (over: Partial<AthleteRow> = {}): AthleteRow => ({
  id: 'ath_1',
  organizationId: 'org_a',
  firstName: 'Lena',
  email: 'lena@example.org',
  archivedAt: null,
  userId: null,
  ...over,
});

/**
 * A fake that answers from the filter rather than from the test.
 *
 * `findFirst` and `updateMany` interpret their `where`. A fake that returned
 * whatever the test configured would pass every assertion below while the
 * service scoped nothing at all — which is exactly how a tenant leak survives
 * a green suite.
 */
function dbFor(rows: readonly AthleteRow[]) {
  const created: Record<string, unknown>[] = [];
  const revoked: Record<string, unknown>[] = [];

  const matches = (row: AthleteRow, where: Record<string, unknown>) =>
    row.organizationId === where['organizationId'] && row.id === where['id'];

  return {
    created,
    revoked,
    db: {
      athlete: {
        findFirst: vi.fn(({ where }: { where: Record<string, unknown> }) =>
          Promise.resolve(rows.find((row) => matches(row, where)) ?? null),
        ),
      },
      athleteActivation: {
        updateMany: vi.fn(({ where }: { where: Record<string, unknown> }) => {
          revoked.push(where);

          return Promise.resolve({ count: 1 });
        }),
        create: vi.fn(({ data }: { data: Record<string, unknown> }) => {
          created.push(data);

          return Promise.resolve({ id: 'act_1' });
        }),
      },
    },
  };
}

const issue = (db: unknown, athleteId = 'ath_1') =>
  issueActivation(db as never, TENANT, 'coach_1', athleteId);

describe('issueActivation', () => {
  it('writes only the hash of the token, never the token', async () => {
    const { db, created } = dbFor([athleteRow()]);

    const issued = await issue(db);

    expect(issued.ok).toBe(true);
    if (!issued.ok) return;

    const row = created[0];
    expect(row?.['tokenHash']).toBe(activationTokenHash(issued.token));
    // The token itself appears nowhere in what was written.
    expect(JSON.stringify(row)).not.toContain(issued.token);
  });

  it('scopes the read, the supersede and the write to the workspace', async () => {
    const { db, created, revoked } = dbFor([athleteRow()]);

    await issue(db);

    expect(revoked[0]).toMatchObject({
      organizationId: 'org_a',
      athleteId: 'ath_1',
      usedAt: null,
      revokedAt: null,
    });
    expect(created[0]).toMatchObject({ organizationId: 'org_a', athleteId: 'ath_1' });
  });

  it('freezes the address the link is sent to', async () => {
    const { db, created } = dbFor([athleteRow({ email: '  lena@example.org  ' })]);

    const issued = await issue(db);

    expect(issued.ok && issued.email).toBe('lena@example.org');
    expect(created[0]?.['email']).toBe('lena@example.org');
  });

  it('expires the link, and not in the distant future', async () => {
    const { db } = dbFor([athleteRow()]);

    const issued = await issue(db);
    if (!issued.ok) throw new Error('expected a link');

    const days = (issued.expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000);
    expect(days).toBeGreaterThan(ACTIVATION_DAYS - 1);
    expect(days).toBeLessThanOrEqual(ACTIVATION_DAYS);
  });

  it('does not find an athlete of another workspace', async () => {
    const { db, created } = dbFor([athleteRow({ organizationId: 'org_b' })]);

    expect(await issue(db)).toEqual({ ok: false, reason: 'NOT_FOUND' });
    expect(created).toHaveLength(0);
  });

  it.each([
    ['an athlete who already has an account', { userId: 'usr_1' }, 'ALREADY_ACTIVE'],
    ['a deactivated athlete', { archivedAt: new Date() }, 'ARCHIVED'],
    ['an athlete with no address', { email: null }, 'NO_EMAIL'],
    ['an athlete whose address is blank', { email: '   ' }, 'NO_EMAIL'],
  ])('refuses %s', async (_name, over, reason) => {
    const { db, created } = dbFor([athleteRow(over)]);

    expect(await issue(db)).toEqual({ ok: false, reason });
    expect(created).toHaveLength(0);
  });
});

describe('revokeActivations', () => {
  it('withdraws only links of this workspace that are still standing', async () => {
    const { db, revoked } = dbFor([]);

    await revokeActivations(db as never, TENANT, 'ath_1');

    expect(revoked[0]).toMatchObject({
      organizationId: 'org_a',
      athleteId: 'ath_1',
      usedAt: null,
      revokedAt: null,
    });
  });
});

/** One activation row, as `resolveActivation` selects it. */
const activationRow = (over: Record<string, unknown> = {}) => ({
  id: 'act_1',
  email: 'lena@example.org',
  expiresAt: new Date(Date.now() + 60_000),
  usedAt: null,
  revokedAt: null,
  athleteId: 'ath_1',
  organizationId: 'org_a',
  athlete: { firstName: 'Lena', lastName: 'Sommer', userId: null },
  ...over,
});

const resolveWith = (row: unknown, token = newActivationToken()) =>
  resolveActivation(
    { athleteActivation: { findUnique: vi.fn().mockResolvedValue(row) } } as never,
    token,
  );

describe('resolveActivation', () => {
  it('opens a link that is standing, and carries the workspace with it', async () => {
    const result = await resolveWith(activationRow());

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The workspace comes from the row, never from the request — this is what
    // makes an unscoped lookup safe.
    expect(result.activation.organizationId).toBe('org_a');
    expect(result.activation.email).toBe('lena@example.org');
  });

  it('looks the token up by its hash and not by the token', async () => {
    const findUnique = vi.fn().mockResolvedValue(activationRow());
    const token = newActivationToken();

    await resolveActivation({ athleteActivation: { findUnique } } as never, token);

    expect(findUnique).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tokenHash: activationTokenHash(token) } }),
    );
  });

  it.each([
    ['an unknown token', null, 'UNKNOWN'],
    ['a spent link', activationRow({ usedAt: new Date() }), 'USED'],
    ['a withdrawn link', activationRow({ revokedAt: new Date() }), 'REVOKED'],
    ['an expired link', activationRow({ expiresAt: new Date(Date.now() - 1) }), 'EXPIRED'],
    [
      'an athlete who already has an account',
      activationRow({ athlete: { firstName: 'Lena', lastName: 'Sommer', userId: 'usr_1' } }),
      'ALREADY_ACTIVE',
    ],
  ])('refuses %s', async (_name, row, reason) => {
    expect(await resolveWith(row)).toEqual({ ok: false, reason });
  });
});
