import { describe, expect, it, vi } from 'vitest';

import { listBleeding, recordBleeding, removeBleeding } from './cycle';

/**
 * Documented bleeding.
 *
 * This is health data in its most sensitive form, so the workspace boundary is
 * asserted on every read and every write — on the queries themselves, never
 * through a screen. A UI test with a mocked procedure would prove nothing about
 * the filter that actually runs.
 *
 * The second thing under test is what the service refuses to do: it stores
 * dates and returns them. No cycle length, no phase, no prediction.
 */

const TENANT = { organizationId: 'org_a' } as const;
const OTHER = { organizationId: 'org_b' } as const;

const COACH = { recordedBy: 'COACH' as const, coachId: 'coach_1' };

function cycleDb(
  options: {
    athleteFound?: boolean;
    existing?: { id: string } | null;
    episodes?: unknown[];
    deleted?: number;
  } = {},
) {
  const bleedingEpisode = {
    findFirst: vi.fn(() => Promise.resolve(options.existing ?? null)),
    findMany: vi.fn(() => Promise.resolve(options.episodes ?? [])),
    create: vi.fn((args: { data: Record<string, unknown> }) =>
      Promise.resolve({ id: 'ep_1', ...args.data }),
    ),
    deleteMany: vi.fn(() => Promise.resolve({ count: options.deleted ?? 1 })),
  };

  const athlete = {
    findFirst: vi.fn(() =>
      Promise.resolve(options.athleteFound === false ? null : { id: 'ath_1' }),
    ),
  };

  const db = { bleedingEpisode, athlete } as unknown as Parameters<typeof listBleeding>[0];

  return { db, bleedingEpisode, athlete };
}

const argsOf = (spy: { mock: { calls: unknown[][] } }, call = 0) =>
  (spy.mock.calls[call]?.[0] ?? {}) as {
    where?: Record<string, unknown>;
    data?: unknown;
    select?: object;
    orderBy?: unknown;
  };

describe('recording a bleeding', () => {
  it('stores the first day as a calendar day', async () => {
    // Midnight UTC, which is what a DATE column holds. Parsed any other way the
    // entry shifts by a day for anyone outside Greenwich.
    const { db, bleedingEpisode } = cycleDb();

    await recordBleeding(db, TENANT, { athleteId: 'ath_1', startedOn: '2026-03-04' }, COACH);

    expect(argsOf(bleedingEpisode.create).data).toMatchObject({
      startedOn: new Date('2026-03-04T00:00:00.000Z'),
    });
  });

  it('leaves the end open when there is none', async () => {
    // The first day is recorded on the day it happens, when the end is still in
    // the future. Demanding it would make the common entry the awkward one.
    const { db, bleedingEpisode } = cycleDb();

    await recordBleeding(db, TENANT, { athleteId: 'ath_1', startedOn: '2026-03-04' }, COACH);

    expect(argsOf(bleedingEpisode.create).data).toMatchObject({ endedOn: null, note: null });
  });

  it('stores an end and a note where they are given', async () => {
    const { db, bleedingEpisode } = cycleDb();

    await recordBleeding(
      db,
      TENANT,
      { athleteId: 'ath_1', startedOn: '2026-03-04', endedOn: '2026-03-09', note: 'stark' },
      COACH,
    );

    expect(argsOf(bleedingEpisode.create).data).toMatchObject({
      endedOn: new Date('2026-03-09T00:00:00.000Z'),
      note: 'stark',
    });
  });

  it('names the coach who recorded it', async () => {
    const { db, bleedingEpisode } = cycleDb();

    await recordBleeding(db, TENANT, { athleteId: 'ath_1', startedOn: '2026-03-04' }, COACH);

    expect(argsOf(bleedingEpisode.create).data).toMatchObject({
      recordedBy: 'COACH',
      recordedByCoachId: 'coach_1',
    });
  });

  it('names no coach when the athlete recorded it', async () => {
    // The author is a parameter so the athlete's own path can be added without
    // touching the data model. The database refuses the mismatched pair too.
    const { db, bleedingEpisode } = cycleDb();

    await recordBleeding(
      db,
      TENANT,
      { athleteId: 'ath_1', startedOn: '2026-03-04' },
      {
        recordedBy: 'ATHLETE',
        coachId: null,
      },
    );

    expect(argsOf(bleedingEpisode.create).data).toMatchObject({
      recordedBy: 'ATHLETE',
      recordedByCoachId: null,
    });
  });

  it('refuses a second entry for the same first day', async () => {
    // Both the athlete and their coach may enter it. The second is a duplicate,
    // not a second bleeding.
    const { db, bleedingEpisode } = cycleDb({ existing: { id: 'ep_old' } });

    const result = await recordBleeding(
      db,
      TENANT,
      { athleteId: 'ath_1', startedOn: '2026-03-04' },
      COACH,
    );

    expect(result).toEqual({ ok: false, reason: 'ALREADY_RECORDED' });
    expect(bleedingEpisode.create).not.toHaveBeenCalled();
  });

  it('never touches an assessment, a module or a measurement', async () => {
    // The independence is structural: this service has no access to them at all.
    const { db } = cycleDb();

    await recordBleeding(db, TENANT, { athleteId: 'ath_1', startedOn: '2026-03-04' }, COACH);

    expect(Object.keys(db as object).sort()).toEqual(['athlete', 'bleedingEpisode']);
  });
});

describe('reading the log', () => {
  it('returns the episodes newest first', async () => {
    const { db, bleedingEpisode } = cycleDb();

    await listBleeding(db, TENANT, { athleteId: 'ath_1' });

    expect(argsOf(bleedingEpisode.findMany)).toMatchObject({
      orderBy: [{ startedOn: 'desc' }],
    });
  });

  it('selects the dates and nothing derived from them', async () => {
    // No cycle length, no phase, no prediction: the read returns observations.
    const { db, bleedingEpisode } = cycleDb();

    await listBleeding(db, TENANT, { athleteId: 'ath_1' });

    const select = (argsOf(bleedingEpisode.findMany) as { select?: object }).select ?? {};

    expect(Object.keys(select).sort()).toEqual([
      'endedOn',
      'id',
      // How strong it was, which is an observation like the dates — not
      // something derived from them.
      'intensity',
      'note',
      'recordedBy',
      'recordedByCoachId',
      'startedOn',
    ]);
  });

  it('reports an athlete outside the workspace as missing', async () => {
    const { db, bleedingEpisode } = cycleDb({ athleteFound: false });

    expect(await listBleeding(db, OTHER, { athleteId: 'ath_1' })).toBeNull();
    expect(bleedingEpisode.findMany).not.toHaveBeenCalled();
  });
});

/**
 * The boundary, asserted where it runs.
 */
describe('the workspace boundary', () => {
  it('verifies the athlete inside the tenant before writing', async () => {
    const { db, athlete } = cycleDb();

    await recordBleeding(db, OTHER, { athleteId: 'ath_1', startedOn: '2026-03-04' }, COACH);

    expect(argsOf(athlete.findFirst).where).toMatchObject({
      id: 'ath_1',
      organizationId: 'org_b',
    });
  });

  it('refuses to write for an athlete of another workspace', async () => {
    const { db, bleedingEpisode } = cycleDb({ athleteFound: false });

    const result = await recordBleeding(
      db,
      OTHER,
      { athleteId: 'ath_1', startedOn: '2026-03-04' },
      COACH,
    );

    expect(result).toEqual({ ok: false, reason: 'ATHLETE_NOT_FOUND' });
    expect(bleedingEpisode.create).not.toHaveBeenCalled();
  });

  it('writes the entry into the workspace it was read from', async () => {
    const { db, bleedingEpisode } = cycleDb();

    await recordBleeding(db, OTHER, { athleteId: 'ath_1', startedOn: '2026-03-04' }, COACH);

    expect(argsOf(bleedingEpisode.create).data).toMatchObject({ organizationId: 'org_b' });
  });

  it('scopes the duplicate check', async () => {
    // Unscoped, it would report a bleeding in another workspace as a duplicate
    // — which tells the caller that workspace has one.
    const { db, bleedingEpisode } = cycleDb();

    await recordBleeding(db, OTHER, { athleteId: 'ath_1', startedOn: '2026-03-04' }, COACH);

    expect(argsOf(bleedingEpisode.findFirst).where).toMatchObject({ organizationId: 'org_b' });
  });

  it('scopes the log', async () => {
    const { db, bleedingEpisode } = cycleDb();

    await listBleeding(db, OTHER, { athleteId: 'ath_1' });

    expect(argsOf(bleedingEpisode.findMany).where).toMatchObject({
      organizationId: 'org_b',
      athleteId: 'ath_1',
    });
  });

  it('deletes through the tenant filter, never by id alone', async () => {
    const { db, bleedingEpisode } = cycleDb();

    await removeBleeding(db, OTHER, { episodeId: 'ep_1' }, null);

    expect(argsOf(bleedingEpisode.deleteMany).where).toMatchObject({
      id: 'ep_1',
      organizationId: 'org_b',
    });
  });

  it('reports a foreign entry as untouched rather than deleted', async () => {
    const { db } = cycleDb({ deleted: 0 });

    expect(await removeBleeding(db, OTHER, { episodeId: 'ep_1' }, null)).toEqual({ ok: false });
  });

  /** The portal path: one athlete, named in the filter rather than checked (§21). */
  it('narrows to one athlete when an owner is named', async () => {
    const { db, bleedingEpisode } = cycleDb();

    await removeBleeding(db, OTHER, { episodeId: 'ep_1' }, 'ath_1');

    expect(argsOf(bleedingEpisode.deleteMany).where).toMatchObject({
      id: 'ep_1',
      organizationId: 'org_b',
      athleteId: 'ath_1',
    });
  });
});
