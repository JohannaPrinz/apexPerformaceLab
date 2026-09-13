import { beforeEach, describe, expect, it, vi } from 'vitest';

import { athleteProcedure, createCallerFactory, createTRPCRouter } from '@/server/api/trpc';

import { revokePortalAccess } from './access';
import { issueActivation } from './activation';
import { portalRouter } from './router';

/**
 * Taking an activated athlete's portal access away (§21).
 *
 * ## What has to be true, and why none of it is visible on a screen
 *
 * 1. **It ends an account, not a record.** Everything the coaching relationship
 *    produced survives — that is §22, and it is the difference between this and
 *    a delete. The assertion is on which tables were written at all.
 * 2. **It is not `revokeActivation`.** That one withdraws a link nobody has
 *    used. The two are one word apart in German and must not touch each other's
 *    rows.
 * 3. **It is not a deactivation.** `archivedAt` is untouched, so a deactivated
 *    athlete who still has access keeps their read-only portal until this is
 *    used on purpose.
 * 4. **The door closes at once.** Not because a cookie was cleared, but because
 *    `athleteProcedure` re-reads `Athlete.userId` on every call — so the last
 *    group here drives the real rung rather than the service.
 * 5. **A new access can follow.** `issueActivation` is run against the world
 *    this leaves behind, because "revocable" without "grantable again" is a
 *    trap door rather than a feature.
 *
 * The fake below *applies* the writes instead of returning what a test wants to
 * see. A fake that answered from the test would let every one of these pass
 * while the service wrote nothing at all.
 */

vi.mock('@apex/database', () => ({ db: {} }));
vi.mock('@apex/auth', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('@/integrations/object-store', () => ({
  putObject: vi.fn(),
  removeObject: vi.fn(),
  objectInfo: vi.fn(),
}));

const TENANT = { organizationId: 'org_1' } as const;

/** Who holds which role, and who has a coach profile behind their login. */
const ROLES: Readonly<Record<string, string>> = {
  usr_coach: 'coach',
  usr_narrow: 'athlete',
  usr_a: 'athlete',
  usr_d: 'athlete',
  usr_e: 'coach',
};

/** `usr_narrow` is the permission door's own case: a coach profile, a role without the write. */
const COACH_PROFILES = new Set(['usr_coach', 'usr_narrow', 'usr_e']);

interface AthleteRow {
  id: string;
  organizationId: string;
  userId: string | null;
  archivedAt: Date | null;
  firstName: string;
  email: string | null;
}

interface UserRow {
  id: string;
  email: string;
  /** Whether a `Coach` row hangs off this login — the safety catch in the service. */
  coachProfile: boolean;
}

/**
 * One workspace, four athletes and the logins behind them.
 *
 * `ath_c` belongs to another workspace and exists to be unreachable. `ath_d` is
 * deactivated *and* has access, which is the combination §21 makes possible and
 * point 3 above is about.
 */
function world() {
  const athletes: AthleteRow[] = [
    {
      id: 'ath_a',
      organizationId: 'org_1',
      userId: 'usr_a',
      archivedAt: null,
      firstName: 'Anna',
      email: 'anna@example.org',
    },
    {
      id: 'ath_b',
      organizationId: 'org_1',
      userId: null,
      archivedAt: null,
      firstName: 'Bea',
      email: 'bea@example.org',
    },
    {
      id: 'ath_c',
      organizationId: 'org_2',
      userId: 'usr_c',
      archivedAt: null,
      firstName: 'Cem',
      email: 'cem@example.org',
    },
    {
      id: 'ath_d',
      organizationId: 'org_1',
      userId: 'usr_d',
      archivedAt: new Date('2026-01-01T00:00:00.000Z'),
      firstName: 'Dana',
      email: 'dana@example.org',
    },
  ];

  const users: UserRow[] = [
    { id: 'usr_a', email: 'anna@example.org', coachProfile: false },
    { id: 'usr_c', email: 'cem@example.org', coachProfile: false },
    { id: 'usr_d', email: 'dana@example.org', coachProfile: false },
    // A login that is also a coach. Deleting it would end access this coach was
    // never given any say over.
    { id: 'usr_e', email: 'eva@example.org', coachProfile: true },
  ];

  let memberships = [
    { userId: 'usr_a', organizationId: 'org_1' },
    { userId: 'usr_c', organizationId: 'org_2' },
    { userId: 'usr_d', organizationId: 'org_1' },
    { userId: 'usr_e', organizationId: 'org_1' },
    { userId: 'usr_coach', organizationId: 'org_1' },
    { userId: 'usr_narrow', organizationId: 'org_1' },
  ];

  let sessions = [
    { id: 'ses_1', userId: 'usr_a' },
    { id: 'ses_2', userId: 'usr_a' },
    { id: 'ses_3', userId: 'usr_d' },
    { id: 'ses_4', userId: 'usr_other' },
  ];

  /** Every model and operation the service asked for, in order. */
  const touched: string[] = [];
  const note = (what: string) => {
    touched.push(what);
  };

  /** Matches on whichever keys the caller sent — `id` here, `userId` in the rung. */
  const matches = (row: AthleteRow, where: Record<string, unknown>) =>
    row.organizationId === where['organizationId'] &&
    (where['id'] === undefined || row.id === where['id']) &&
    (where['userId'] === undefined || row.userId === where['userId']);

  const db = {
    $transaction: <T>(run: (tx: unknown) => Promise<T>) => run(db),

    athlete: {
      findFirst: vi.fn(({ where }: { where: Record<string, unknown> }) => {
        note('athlete.findFirst');
        const row = athletes.find((entry) => matches(entry, where));
        if (!row) return Promise.resolve(null);

        return Promise.resolve({
          ...row,
          user: row.userId === null ? null : (users.find((one) => one.id === row.userId) ?? null),
        });
      }),

      updateMany: vi.fn(
        ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
          note('athlete.updateMany');
          const matched = athletes.filter((row) => matches(row, where));

          for (const row of matched) {
            if ('userId' in data) row.userId = data['userId'] as string | null;
          }

          return Promise.resolve({ count: matched.length });
        },
      ),
    },

    membership: {
      findUnique: vi.fn(
        ({ where }: { where: { userId_organizationId: Record<string, string> } }) => {
          const userId = where.userId_organizationId['userId'] ?? '';
          const organizationId = where.userId_organizationId['organizationId'] ?? '';
          const member = memberships.some(
            (row) => row.userId === userId && row.organizationId === organizationId,
          );

          return Promise.resolve(member ? { role: ROLES[userId] ?? 'athlete' } : null);
        },
      ),

      deleteMany: vi.fn(({ where }: { where: Record<string, unknown> }) => {
        note('membership.deleteMany');
        const before = memberships.length;

        memberships = memberships.filter(
          (row) =>
            !(row.userId === where['userId'] && row.organizationId === where['organizationId']),
        );

        return Promise.resolve({ count: before - memberships.length });
      }),
    },

    session: {
      deleteMany: vi.fn(({ where }: { where: Record<string, unknown> }) => {
        note('session.deleteMany');
        const before = sessions.length;

        sessions = sessions.filter((row) => row.userId !== where['userId']);

        return Promise.resolve({ count: before - sessions.length });
      }),
    },

    user: {
      deleteMany: vi.fn(({ where }: { where: Record<string, unknown> }) => {
        note('user.deleteMany');

        const index = users.findIndex((row) => row.id === where['id']);
        const row = users[index];
        if (!row) return Promise.resolve({ count: 0 });

        // The three relation filters the service sends, applied against the
        // world as it stands inside the transaction.
        const orphan =
          !row.coachProfile &&
          !athletes.some((one) => one.userId === row.id) &&
          !memberships.some((one) => one.userId === row.id);

        if (!orphan) return Promise.resolve({ count: 0 });

        users.splice(index, 1);

        return Promise.resolve({ count: 1 });
      }),
    },

    coach: {
      findUnique: vi.fn(({ where }: { where: { userId: string } }) =>
        Promise.resolve(COACH_PROFILES.has(where.userId) ? { id: `coach_${where.userId}` } : null),
      ),
    },

    // Present so that reaching into it would be visible. An open first-access
    // link is `revokeActivation`'s business, never this one's.
    athleteActivation: {
      updateMany: vi.fn(() => {
        note('athleteActivation.updateMany');

        return Promise.resolve({ count: 1 });
      }),
      create: vi.fn(() => {
        note('athleteActivation.create');

        return Promise.resolve({ id: 'act_2' });
      }),
    },
  };

  return { db, athletes, users, memberships: () => memberships, sessions: () => sessions, touched };
}

let state = world();

beforeEach(() => {
  state = world();
});

const revoke = (athleteId: string) => revokePortalAccess(state.db as never, TENANT, athleteId);

const athleteOf = (id: string) => state.athletes.find((row) => row.id === id);

describe('revoking a portal access', () => {
  it('unlinks the account and ends every session it had', async () => {
    const result = await revoke('ath_a');

    expect(result).toEqual({ ok: true, email: 'anna@example.org' });
    expect(athleteOf('ath_a')?.userId).toBeNull();
    // Both of Anna's, and nobody else's.
    expect(state.sessions().map((row) => row.id)).toEqual(['ses_3', 'ses_4']);
    expect(state.memberships()).not.toContainEqual({ userId: 'usr_a', organizationId: 'org_1' });
  });

  it('keeps the athlete record itself, with everything on it', async () => {
    await revoke('ath_a');

    // The row is still there and still this person: only the link to a login
    // went. §22 — the history outlives the coaching relationship.
    expect(athleteOf('ath_a')).toBeDefined();
    expect(athleteOf('ath_a')?.firstName).toBe('Anna');
    expect(athleteOf('ath_a')?.email).toBe('anna@example.org');
  });

  it('writes to nothing but the four tables the access lives in', async () => {
    // How "assessments, measurements, reports, files and tracking survive" is
    // asserted: not by counting rows in tables the service could have touched,
    // but by showing it never addressed them at all. Anything new appearing in
    // this list is a decision somebody has to make on purpose.
    await revoke('ath_a');

    expect(state.touched).toEqual([
      'athlete.findFirst',
      'athlete.updateMany',
      'membership.deleteMany',
      'session.deleteMany',
      'user.deleteMany',
    ]);
  });

  it('leaves an open first-access link to revokeActivation', async () => {
    // The one confusion this feature has to survive: `revokeActivation`
    // withdraws a link, this closes an account, and neither may quietly do the
    // other's job.
    await revoke('ath_a');

    expect(state.touched.filter((entry) => entry.startsWith('athleteActivation'))).toEqual([]);
  });

  it('does not find an athlete of another workspace', async () => {
    const result = await revoke('ath_c');

    expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' });
    // Cem's access is untouched: the filter carried the workspace, so there was
    // never a row to act on.
    expect(athleteOf('ath_c')?.userId).toBe('usr_c');
    expect(state.sessions()).toHaveLength(4);
  });

  it('refuses an athlete who has no access to take away', async () => {
    expect(await revoke('ath_b')).toEqual({ ok: false, reason: 'NO_ACCESS' });
    expect(state.touched).toEqual(['athlete.findFirst']);
  });

  it('refuses an athlete that does not exist', async () => {
    expect(await revoke('ath_nope')).toEqual({ ok: false, reason: 'NOT_FOUND' });
  });
});

describe('what a revocation does to the login row', () => {
  it('removes a login that exists for nothing else', async () => {
    // Which is every portal account: activation creates the user, the
    // credential and the membership together, and gives it no coach profile.
    await revoke('ath_a');

    expect(state.users.map((row) => row.id)).not.toContain('usr_a');
  });

  it('frees the address, so the athlete can be activated again', async () => {
    // `User.email` is unique platform-wide. A login left behind would hold the
    // address, and every later activation would refuse with EMAIL_TAKEN — which
    // would make this a trap door rather than a revocation.
    await revoke('ath_a');

    expect(state.users.some((row) => row.email === 'anna@example.org')).toBe(false);
  });

  it('keeps a login that is also a coach', async () => {
    // The safety catch. Eva coaches here and would, in this arrangement, also
    // hold the athlete account; ending the portal access must not end her
    // coaching account with it.
    const anna = athleteOf('ath_a');
    if (anna) anna.userId = 'usr_e';

    const result = await revoke('ath_a');

    expect(result.ok).toBe(true);
    expect(state.users.map((row) => row.id)).toContain('usr_e');
    // The access is gone all the same: unlinked, unseated, signed out.
    expect(anna?.userId).toBeNull();
  });
});

describe('a deactivated athlete', () => {
  it('keeps read-only access until it is taken away on purpose', async () => {
    // §21: deactivating is not revoking. Dana is deactivated and still has her
    // portal; revoking somebody else's access may not change that.
    await revoke('ath_a');

    expect(athleteOf('ath_d')?.userId).toBe('usr_d');
    expect(athleteOf('ath_d')?.archivedAt).toEqual(new Date('2026-01-01T00:00:00.000Z'));
  });

  it('can have it taken away without being reactivated or deactivated', async () => {
    const result = await revoke('ath_d');

    expect(result.ok).toBe(true);
    // The one thing this control must never move.
    expect(athleteOf('ath_d')?.archivedAt).toEqual(new Date('2026-01-01T00:00:00.000Z'));
  });
});

describe('after the access is gone', () => {
  it('lets the coach issue a new one through the ordinary activation', async () => {
    await revoke('ath_a');

    const issued = await issueActivation(state.db as never, TENANT, 'coach_1', 'ath_a');

    expect(issued.ok).toBe(true);
    if (issued.ok) expect(issued.email).toBe('anna@example.org');
  });
});

/**
 * The door itself.
 *
 * The service above decides what a revocation *does*; these decide who may ask
 * for one, and what the portal answers afterwards. Both run the real
 * procedures — the rungs are the authorization, and a test that stubbed them
 * would assert nothing.
 */
const callCoachSide = createCallerFactory(portalRouter);

/**
 * The rung every portal read passes through, on its own.
 *
 * Driven directly rather than through `portal.me`, because what is under test
 * is `athleteProcedure` resolving the athlete from `Athlete.userId` on every
 * call — not the columns one query happens to select.
 */
const callPortalSide = createCallerFactory(
  createTRPCRouter({ mine: athleteProcedure.query(({ ctx }) => ctx.athlete) }),
);

const contextFor = (userId: string) =>
  ({
    db: state.db,
    headers: new Headers(),
    session: {
      user: { id: userId, name: 'Test', email: `${userId}@example.org` },
      session: { activeOrganizationId: 'org_1' },
    },
    perRequest: <T>(_key: string, read: () => Promise<T>) => read(),
  }) as never;

describe('who may take an access away', () => {
  it('lets a coach of the workspace do it', async () => {
    const result = await callCoachSide(contextFor('usr_coach')).revokeAccess({
      athleteId: 'ath_a',
    });

    expect(result).toEqual({ email: 'anna@example.org' });
  });

  it('refuses an athlete account', async () => {
    // Two rungs would stop this and the coach profile is the first. The point
    // is that it never reaches the service.
    await expect(
      callCoachSide(contextFor('usr_a')).revokeAccess({ athleteId: 'ath_a' }),
    ).rejects.toThrow(/coach profile/i);

    expect(athleteOf('ath_a')?.userId).toBe('usr_a');
  });

  it('refuses a coach whose role does not carry the write', async () => {
    // The permission door proper: a coach profile is not the permission, and
    // this is the same gate `athletes.setArchived` sits behind.
    await expect(
      callCoachSide(contextFor('usr_narrow')).revokeAccess({ athleteId: 'ath_a' }),
    ).rejects.toThrow(/athlete:write/i);

    expect(athleteOf('ath_a')?.userId).toBe('usr_a');
  });

  it('refuses a signed-in user who is not a member of the workspace', async () => {
    await expect(
      callCoachSide(contextFor('usr_stranger')).revokeAccess({ athleteId: 'ath_a' }),
    ).rejects.toThrow(/not a member/i);
  });

  it('refuses an athlete of another workspace by not finding them', async () => {
    await expect(
      callCoachSide(contextFor('usr_coach')).revokeAccess({ athleteId: 'ath_c' }),
    ).rejects.toThrow(/nicht gefunden/i);
  });

  it('refuses an athlete who has no access', async () => {
    await expect(
      callCoachSide(contextFor('usr_coach')).revokeAccess({ athleteId: 'ath_b' }),
    ).rejects.toThrow(/keinen Portalzugang/i);
  });
});

describe('the portal itself, once the access is gone', () => {
  it('let the athlete in before it', async () => {
    // Without this the refusal below would prove nothing.
    await expect(callPortalSide(contextFor('usr_a')).mine()).resolves.toMatchObject({
      id: 'ath_a',
    });
  });

  it('refuses the athlete whose access was revoked', async () => {
    await callCoachSide(contextFor('usr_coach')).revokeAccess({ athleteId: 'ath_a' });

    // The workspace tie is what goes first, so this is where the refusal lands.
    // Nothing was signed out to make it happen: both rungs read the database on
    // every call, which is why a session opened before the revocation is
    // refused just as this one is.
    await expect(callPortalSide(contextFor('usr_a')).mine()).rejects.toThrow(/not a member/i);
  });

  it('would still refuse if only the membership had gone', async () => {
    await callCoachSide(contextFor('usr_coach')).revokeAccess({ athleteId: 'ath_a' });

    // Belt and braces, made visible: put the workspace tie back and the athlete
    // link alone still closes the portal. Neither lock is carrying this on its
    // own.
    state.memberships().push({ userId: 'usr_a', organizationId: 'org_1' });

    await expect(callPortalSide(contextFor('usr_a')).mine()).rejects.toThrow(
      /athlete portal account/i,
    );
  });

  it('leaves the other athletes exactly as they were', async () => {
    await callCoachSide(contextFor('usr_coach')).revokeAccess({ athleteId: 'ath_a' });

    await expect(callPortalSide(contextFor('usr_d')).mine()).resolves.toMatchObject({
      id: 'ath_d',
    });
  });
});
