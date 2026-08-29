import { describe, expect, it, vi } from 'vitest';

import { deleteTrackingEntry, recordTrackingEntry, setTrendCard, trendCardsFor } from './tracking';

/**
 * Values recorded outside an examination.
 *
 * The guarantees under test are the ones no screen could prove: that the write
 * stays inside the workspace, that the athlete is checked rather than trusted
 * from the input, and that a stored card selection is changed by reading it
 * first — a blind overwrite would lose an order the coach arranged.
 */

/** The first argument a spy was called with. The mocks take none by signature. */
const argsOf = (spy: { mock: { calls: unknown[] } }, call = 0) =>
  ((spy.mock.calls[call] as unknown[] | undefined)?.[0] ?? {}) as {
    where?: Record<string, unknown> & { OR?: unknown[] };
    data?: Record<string, unknown>;
  };

const TENANT = { organizationId: 'org_a' } as const;
const OTHER = { organizationId: 'org_b' } as const;

function trackingDb(
  options: {
    athleteFound?: boolean;
    typeFound?: boolean;
    trendCards?: unknown;
    deleted?: number;
  } = {},
) {
  const created: Record<string, unknown>[] = [];
  const updated: Record<string, unknown>[] = [];

  const athlete = {
    findFirst: vi.fn(() =>
      Promise.resolve(
        options.athleteFound === false
          ? null
          : { id: 'ath_1', trendCards: options.trendCards ?? null },
      ),
    ),
    updateMany: vi.fn((args: { data: Record<string, unknown> }) => {
      updated.push(args.data);

      return Promise.resolve({ count: 1 });
    }),
  };

  const measurementType = {
    findFirst: vi.fn(() =>
      Promise.resolve(options.typeFound === false ? null : { id: 'mt_weight' }),
    ),
  };

  const trackingEntry = {
    create: vi.fn((args: { data: Record<string, unknown> }) => {
      created.push(args.data);

      return Promise.resolve({ id: 'te_1' });
    }),
    deleteMany: vi.fn(() => Promise.resolve({ count: options.deleted ?? 1 })),
    findMany: vi.fn(() => Promise.resolve([])),
  };

  const db = { athlete, measurementType, trackingEntry } as unknown as Parameters<
    typeof recordTrackingEntry
  >[0];

  return { db, athlete, measurementType, trackingEntry, created, updated };
}

const INPUT = {
  athleteId: 'ath_1',
  measurementTypeKey: 'weight',
  value: 71.4,
  capturedAt: new Date('2026-03-12T09:00:00.000Z'),
};

describe('writing a reading', () => {
  it('records the value, the moment and who put it there', async () => {
    const { db, created } = trackingDb();

    const result = await recordTrackingEntry(
      db,
      TENANT,
      { by: 'COACH', coachId: 'coach_1' },
      INPUT,
    );

    expect(result).toEqual({ ok: true, id: 'te_1' });
    expect(created[0]).toMatchObject({
      organizationId: 'org_a',
      athleteId: 'ath_1',
      measurementTypeId: 'mt_weight',
      numericValue: 71.4,
      recordedBy: 'COACH',
      recordedByCoachId: 'coach_1',
      source: 'MANUAL',
    });
  });

  it('records an athlete self-report without a coach', async () => {
    // §13: the person and the instrument are independent. Both type.
    const { db, created } = trackingDb();

    await recordTrackingEntry(db, TENANT, { by: 'ATHLETE', coachId: null }, INPUT);

    expect(created[0]).toMatchObject({ recordedBy: 'ATHLETE', recordedByCoachId: null });
  });

  it('checks the athlete inside the workspace rather than trusting the input', async () => {
    const { db, athlete } = trackingDb();

    await recordTrackingEntry(db, OTHER, { by: 'COACH', coachId: 'coach_1' }, INPUT);

    expect(argsOf(athlete.findFirst).where?.['organizationId']).toBe('org_b');
  });

  it('refuses an athlete of another workspace', async () => {
    const { db, created } = trackingDb({ athleteFound: false });

    const result = await recordTrackingEntry(
      db,
      TENANT,
      { by: 'COACH', coachId: 'coach_1' },
      INPUT,
    );

    expect(result).toEqual({ ok: false, refusal: 'ATHLETE_NOT_FOUND' });
    expect(created).toHaveLength(0);
  });

  it('refuses a quantity the catalogue does not hold', async () => {
    const { db, created } = trackingDb({ typeFound: false });

    const result = await recordTrackingEntry(
      db,
      TENANT,
      { by: 'COACH', coachId: 'coach_1' },
      INPUT,
    );

    expect(result).toEqual({ ok: false, refusal: 'TYPE_NOT_FOUND' });
    expect(created).toHaveLength(0);
  });

  it('accepts a system type this workspace has never recorded', async () => {
    // What makes a documentation card choosable before anything exists.
    const { db, measurementType } = trackingDb();

    await recordTrackingEntry(db, TENANT, { by: 'COACH', coachId: 'coach_1' }, INPUT);

    expect(argsOf(measurementType.findFirst).where?.OR).toEqual([
      { organizationId: 'org_a' },
      { organizationId: null },
    ]);
  });

  it('leaves a blank note out rather than storing an empty one', async () => {
    const { db, created } = trackingDb();

    await recordTrackingEntry(
      db,
      TENANT,
      { by: 'COACH', coachId: 'coach_1' },
      { ...INPUT, note: '   ' },
    );

    expect(created[0]).not.toHaveProperty('note');
  });
});

describe('removing a reading', () => {
  it('deletes it, because a self-report is not a finding with a history', async () => {
    const { db, trackingEntry } = trackingDb();

    expect(await deleteTrackingEntry(db, TENANT, 'te_1')).toBe(true);

    expect(argsOf(trackingEntry.deleteMany).where?.['organizationId']).toBe('org_a');
  });

  it('reports nothing removed for another workspace', async () => {
    const { db } = trackingDb({ deleted: 0 });

    expect(await deleteTrackingEntry(db, TENANT, 'te_1')).toBe(false);
  });
});

describe('which cards a profile shows', () => {
  it('is empty until the coach chooses', async () => {
    const { db } = trackingDb();

    expect(await trendCardsFor(db, TENANT, 'ath_1')).toEqual([]);
  });

  it('adds a card without disturbing the ones already there', async () => {
    const { db, updated } = trackingDb({
      trendCards: { version: 1, keys: ['weight', 'body_fat'] },
    });

    await setTrendCard(db, TENANT, 'ath_1', 'grip_strength', true);

    expect(updated[0]?.['trendCards']).toEqual({
      version: 1,
      keys: ['weight', 'body_fat', 'grip_strength'],
    });
  });

  it('removes one and keeps the rest in order', async () => {
    const { db, updated } = trackingDb({
      trendCards: { version: 1, keys: ['weight', 'body_fat', 'grip_strength'] },
    });

    await setTrendCard(db, TENANT, 'ath_1', 'body_fat', false);

    expect(updated[0]?.['trendCards']).toEqual({
      version: 1,
      keys: ['weight', 'grip_strength'],
    });
  });

  it('reads before it writes, so a click on one card cannot clear the others', async () => {
    const { db, athlete } = trackingDb({ trendCards: { version: 1, keys: ['weight'] } });

    await setTrendCard(db, TENANT, 'ath_1', 'body_fat', true);

    expect(athlete.findFirst).toHaveBeenCalled();
  });

  it('refuses an athlete of another workspace', async () => {
    const { db, updated } = trackingDb({ athleteFound: false });

    expect(await setTrendCard(db, TENANT, 'ath_1', 'weight', true)).toBe(false);
    expect(updated).toHaveLength(0);
  });
});
