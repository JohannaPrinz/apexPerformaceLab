import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createCallerFactory, createTRPCRouter } from '@/server/api/trpc';

import { athletesRouter } from './router';

/**
 * Who is looking, resolved once per request (§7).
 *
 * Four procedures on this router narrow their list by the same three facts —
 * workspace, role, and which coach this account is — and each of them read the
 * coach row again to learn the third. On an athlete profile that was three
 * identical reads before any athlete data was touched.
 *
 * The memo is what is under test, so this file uses the **real** one: a `Map`
 * with the lifetime of the context, exactly as `createTRPCContext` builds it.
 * What must not change is what the filter then says — so the `where` of every
 * athlete read is asserted too.
 */

vi.mock('@apex/database', () => ({ db: {} }));
vi.mock('@apex/auth', () => ({ auth: { api: { getSession: vi.fn() } } }));
vi.mock('@/integrations/object-store', () => ({
  putObject: vi.fn(),
  removeObject: vi.fn(),
  listObjects: vi.fn(() => Promise.resolve([])),
  objectInfo: vi.fn(),
  objectStoreReady: () => false,
}));

const COACHES = [
  { userId: 'usr_a', organizationId: 'org_1', id: 'coach_a' },
  { userId: 'usr_b', organizationId: 'org_2', id: 'coach_b' },
];

const MEMBERSHIPS = [
  { userId: 'usr_a', organizationId: 'org_1', role: 'coach' },
  { userId: 'usr_b', organizationId: 'org_2', role: 'coach' },
];

const coachReads: { userId: unknown }[] = [];
const athleteFilters: Record<string, unknown>[] = [];
/** Every read of a single athlete record, so a repeat is visible. */
const athleteReads: Record<string, unknown>[] = [];

const ATHLETE = {
  id: 'ath_1',
  firstName: 'Mara',
  lastName: 'Berg',
  dateOfBirth: null,
  sex: 'not_specified',
  email: null,
  phone: null,
  heightCm: null,
  weightKg: null,
  archivedAt: null,
  createdAt: new Date('2026-01-01T00:00:00.000Z'),
  userId: null,
  createdByCoachId: 'coach_a',
  trendCards: [],
};

const db = {
  coach: {
    findFirst: vi.fn(({ where }: { where: { userId: string } }) => {
      coachReads.push({ userId: where.userId });
      const found = COACHES.find((row) => row.userId === where.userId);

      return Promise.resolve(found ? { id: found.id } : null);
    }),
    findUnique: vi.fn(({ where }: { where: { userId: string } }) => {
      const found = COACHES.find((row) => row.userId === where.userId);

      return Promise.resolve(
        found
          ? { id: found.id, displayName: 'Test', professionalTitle: null, createdAt: new Date() }
          : null,
      );
    }),
  },
  membership: {
    findUnique: vi.fn(
      ({
        where,
      }: {
        where: { userId_organizationId: { userId: string; organizationId: string } };
      }) => {
        const { userId, organizationId } = where.userId_organizationId;
        const found = MEMBERSHIPS.find(
          (row) => row.userId === userId && row.organizationId === organizationId,
        );

        return Promise.resolve(found ? { role: found.role } : null);
      },
    ),
  },
  athlete: {
    findMany: vi.fn(({ where }: { where: Record<string, unknown> }) => {
      athleteFilters.push(where);

      return Promise.resolve([]);
    }),
    findFirst: vi.fn(({ where }: { where: Record<string, unknown> }) => {
      athleteReads.push(where);

      return Promise.resolve(where['organizationId'] === 'org_1' ? ATHLETE : null);
    }),
  },
  // What the trend list reads once it has the athlete. Empty answers: this file
  // is about how often the record itself is read, not about what is drawn.
  measurement: { findMany: vi.fn(() => Promise.resolve([])) },
  measurementType: {
    findMany: vi.fn(() => Promise.resolve([])),
    groupBy: vi.fn(() => Promise.resolve([])),
  },
  trackingEntry: { groupBy: vi.fn(() => Promise.resolve([])) },
  bleedingEpisode: { count: vi.fn(() => Promise.resolve(0)) },
  exercise: { findMany: vi.fn(() => Promise.resolve([])) },
};

const createCaller = createCallerFactory(createTRPCRouter({ athletes: athletesRouter }));

/** One caller, one request — with the memo the production context uses. */
const requestFor = (userId: string, activeOrganizationId: string) => {
  const once = new Map<string, Promise<unknown>>();

  return createCaller({
    db,
    headers: new Headers(),
    session: {
      user: { id: userId, name: 'Test', email: `${userId}@example.org` },
      session: { activeOrganizationId },
    },
    perRequest: <T>(key: string, read: () => Promise<T>): Promise<T> => {
      const known = once.get(key);
      if (known !== undefined) return known as Promise<T>;
      const started = read();
      once.set(key, started);

      return started;
    },
  } as never);
};

beforeEach(() => {
  coachReads.length = 0;
  athleteFilters.length = 0;
  athleteReads.length = 0;
});

describe('the athlete record within one request', () => {
  it('is read once, however many procedures need it', async () => {
    const caller = requestFor('usr_a', 'org_1');

    // What the profile screen does: the master data and the trend cards, which
    // need the same record for the sex and the chosen cards.
    await Promise.all([
      caller.athletes.byId({ athleteId: 'ath_1' }),
      caller.athletes.trends({ athleteId: 'ath_1', slots: [] }),
    ]);

    expect(athleteReads).toHaveLength(1);
    expect(athleteReads[0]).toMatchObject({ organizationId: 'org_1', id: 'ath_1' });
  });

  it('is read again in the next request', async () => {
    await requestFor('usr_a', 'org_1').athletes.byId({ athleteId: 'ath_1' });
    await requestFor('usr_a', 'org_1').athletes.byId({ athleteId: 'ath_1' });

    expect(athleteReads).toHaveLength(2);
  });

  it('keeps one athlete apart from another in the same request', async () => {
    const caller = requestFor('usr_a', 'org_1');

    await caller.athletes.byId({ athleteId: 'ath_1' });
    await caller.athletes.byId({ athleteId: 'ath_2' }).catch(() => null);

    expect(athleteReads.map((where) => where['id'])).toEqual(['ath_1', 'ath_2']);
  });

  it('does not carry a record across workspaces', async () => {
    // The same athlete id, a different workspace: the read happens again and
    // the filter names the second workspace, so nothing of the first is reused.
    await requestFor('usr_a', 'org_1').athletes.byId({ athleteId: 'ath_1' });
    await requestFor('usr_b', 'org_2')
      .athletes.byId({ athleteId: 'ath_1' })
      .catch(() => null);

    expect(athleteReads).toHaveLength(2);
    expect(athleteReads[1]).toMatchObject({ organizationId: 'org_2' });
  });
});

describe('the viewer within one request', () => {
  it('is resolved once, however often the list is asked for', async () => {
    const caller = requestFor('usr_a', 'org_1');

    await Promise.all([
      caller.athletes.list({ limit: 10 }),
      caller.athletes.list({ limit: 10 }),
      caller.athletes.list({ limit: 10 }),
    ]);

    expect(coachReads).toEqual([{ userId: 'usr_a' }]);
    expect(athleteFilters).toHaveLength(3);
  });

  it('is resolved again in the next request', async () => {
    await requestFor('usr_a', 'org_1').athletes.list({ limit: 10 });
    await requestFor('usr_a', 'org_1').athletes.list({ limit: 10 });

    expect(coachReads).toHaveLength(2);
  });
});

describe('what the memo must not loosen', () => {
  it('keeps the workspace in every athlete filter', async () => {
    await requestFor('usr_a', 'org_1').athletes.list({ limit: 10 });

    expect(athleteFilters[0]).toMatchObject({ organizationId: 'org_1' });
  });

  it('gives each account its own viewer, never the other’s', async () => {
    await requestFor('usr_a', 'org_1').athletes.list({ limit: 10 });
    await requestFor('usr_b', 'org_2').athletes.list({ limit: 10 });

    expect(coachReads).toEqual([{ userId: 'usr_a' }, { userId: 'usr_b' }]);
    // The second workspace's list is filtered by the second workspace, and the
    // visibility clause names that account's coach — never the first one's.
    expect(athleteFilters[1]).toMatchObject({ organizationId: 'org_2' });
    expect(JSON.stringify(athleteFilters[1])).toContain('coach_b');
    expect(JSON.stringify(athleteFilters[1])).not.toContain('coach_a');
  });

  it('still refuses a workspace the account is not a member of', async () => {
    await expect(requestFor('usr_b', 'org_1').athletes.list({ limit: 10 })).rejects.toThrow(
      /not a member/i,
    );
    expect(athleteFilters).toEqual([]);
  });
});
