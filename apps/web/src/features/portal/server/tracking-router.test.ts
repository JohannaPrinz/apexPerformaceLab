import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createCallerFactory, createTRPCRouter } from '@/server/api/trpc';

import { portalTrackingProcedures } from './tracking-router';

/**
 * The context is built by hand below, so the real client and the real auth
 * instance are never used — but importing the tRPC module pulls both in, and
 * each wants a live configuration. Mocked at the module boundary so this file
 * needs no database and no environment.
 *
 * `@apex/database/tenant` is deliberately **not** mocked: `scoped` and
 * `withTenant` are what put the workspace into every filter, and stubbing them
 * would remove the thing under test.
 */
vi.mock('@apex/database', () => ({ db: {} }));
vi.mock('@apex/auth', () => ({ auth: { api: { getSession: vi.fn() } } }));

/**
 * The portal's authorization, tested where it actually lives.
 *
 * The services were already covered; what could not be shown there is the thing
 * this slice exists for — that **an athlete reaches their own record and no
 * other** (§21). That guarantee is made in the procedure, so this exercises the
 * procedure.
 *
 * Four claims:
 *
 * 1. The athlete is resolved from the **session**, by `userId` *and* workspace.
 * 2. An `athleteId` smuggled into a payload changes nothing — the schemas do
 *    not accept one, so it never reaches the service.
 * 3. Athlete A's session reads and writes athlete A. Give the same call athlete
 *    B's session and it addresses B, with nothing in the request having changed.
 * 4. An account with no athlete linked is refused outright, and a deactivated
 *    athlete may read but not write.
 */

const router = createTRPCRouter(portalTrackingProcedures);
const createCaller = createCallerFactory(router);

/** Who exists, and which account each belongs to. */
const ATHLETES = [
  { id: 'ath_a', userId: 'usr_a', organizationId: 'org_1', archivedAt: null },
  { id: 'ath_b', userId: 'usr_b', organizationId: 'org_1', archivedAt: null },
  { id: 'ath_c', userId: 'usr_c', organizationId: 'org_1', archivedAt: new Date('2026-01-01') },
];

const lookups: Record<string, unknown>[] = [];
/** The filter every entry-addressed delete ran with. */
const deletes: Record<string, unknown>[] = [];

/**
 * A database that answers from the filter.
 *
 * `athlete.findFirst` serves two callers here — the procedure resolving the
 * session, and the services looking the athlete up by id — so it interprets
 * whichever keys it is given. A fake that returned a fixed row would pass every
 * assertion below while the procedure resolved nothing at all.
 */
const db = {
  membership: {
    findUnique: vi.fn().mockResolvedValue({ role: 'athlete' }),
  },
  athlete: {
    findFirst: vi.fn(({ where }: { where: Record<string, unknown> }) => {
      lookups.push(where);

      const found = ATHLETES.find(
        (row) =>
          (where['userId'] === undefined || row.userId === where['userId']) &&
          (where['id'] === undefined || row.id === where['id']) &&
          row.organizationId === where['organizationId'],
      );

      return Promise.resolve(found ?? null);
    }),
  },
  measurementType: {
    findFirst: vi.fn().mockResolvedValue({ id: 'mt_1', key: 'protein', unit: 'g', scaleMax: null }),
    findMany: vi
      .fn()
      .mockResolvedValue([{ id: 'mt_1', key: 'protein', name: 'Eiweiß', unit: 'g' }]),
  },
  trackingEntry: {
    findFirst: vi.fn().mockResolvedValue(null),
    updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    deleteMany: vi.fn(({ where }: { where: Record<string, unknown> }) => {
      deletes.push(where);

      return Promise.resolve({ count: 1 });
    }),
    create: vi.fn().mockResolvedValue({ id: 'te_1' }),
    findMany: vi.fn().mockResolvedValue([]),
  },
};

/** A signed-in session for one user, in one workspace. */
const callerFor = (userId: string) =>
  createCaller({
    db,
    headers: new Headers(),
    session: {
      user: { id: userId, name: 'Test', email: `${userId}@example.org` },
      session: { activeOrganizationId: 'org_1' },
    },
    perRequest: <T>(_key: string, read: () => Promise<T>) => read(),
  } as never);

/** Only the lookups the procedure itself made, in order. */
const sessionLookups = () => lookups.filter((where) => where['userId'] !== undefined);

beforeEach(() => {
  lookups.length = 0;
  deletes.length = 0;
});

describe('who the portal is talking to', () => {
  it('resolves the athlete from the session, by account and by workspace', async () => {
    await callerFor('usr_a').clearNutritionValue({ entryId: 'te_1' });

    expect(sessionLookups()[0]).toEqual({ userId: 'usr_a', organizationId: 'org_1' });
  });

  it('refuses an account that is not an athlete', async () => {
    await expect(callerFor('usr_coach').clearNutritionValue({ entryId: 'te_1' })).rejects.toThrow(
      /athlete portal account/i,
    );
  });
});

describe('athlete A cannot reach athlete B', () => {
  it('writes against the session athlete, not against an id in the payload', async () => {
    // An `athleteId` is smuggled in beside the real fields. The schema does not
    // declare one, so it is stripped before the procedure ever runs.
    await callerFor('usr_a').setNutritionValue({
      measurementTypeKey: 'protein',
      day: new Date('2026-03-02T00:00:00.000Z'),
      value: 150,
      athleteId: 'ath_b',
    } as never);

    // The service looked up an athlete — and it was A's, by id, in A's workspace.
    const byId = lookups.filter((where) => where['id'] !== undefined);
    expect(byId).toHaveLength(1);
    expect(byId[0]).toEqual({ id: 'ath_a', organizationId: 'org_1' });
  });

  it('narrows an entry-addressed delete to the session athlete', async () => {
    await callerFor('usr_a').clearBiofeedbackValue({ entryId: 'te_of_b' });

    // The id came from the request; whose entry it may be did not.
    expect(deletes.at(-1)).toMatchObject({
      id: 'te_of_b',
      organizationId: 'org_1',
      athleteId: 'ath_a',
    });
  });

  it('addresses B when B is the one signed in, with the request unchanged', async () => {
    await callerFor('usr_b').clearBiofeedbackValue({ entryId: 'te_of_b' });

    expect(deletes.at(-1)).toMatchObject({ athleteId: 'ath_b' });
  });

  it('takes no athlete in any input schema', () => {
    // The structural half of the guarantee: there is no parameter to tamper
    // with, so there is no comparison anybody can forget to make.
    for (const [name, procedure] of Object.entries(portalTrackingProcedures)) {
      const inputs = (procedure as { _def: { inputs: unknown[] } })._def.inputs;

      for (const input of inputs) {
        const shape = (input as { shape?: Record<string, unknown> }).shape ?? {};
        expect(Object.keys(shape), `${name} accepts an athlete`).not.toContain('athleteId');
      }
    }
  });
});

describe('a deactivated athlete', () => {
  it('may still read', async () => {
    await expect(
      callerFor('usr_c').nutritionWeek({ weekStart: new Date('2026-03-02T00:00:00.000Z') }),
    ).resolves.toBeDefined();
  });

  it('may not write', async () => {
    await expect(
      callerFor('usr_c').setNutritionValue({
        measurementTypeKey: 'protein',
        day: new Date('2026-03-02T00:00:00.000Z'),
        value: 150,
      }),
    ).rejects.toThrow(/auf Lesen gestellt/);
  });
});
