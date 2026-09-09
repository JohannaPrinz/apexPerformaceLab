import { describe, expect, it, vi } from 'vitest';

import { athleteTrends } from './trends';

/**
 * What a profile's trend cards read, and when.
 *
 * Two guarantees, and they pull in opposite directions if you are careless.
 *
 * **Shape of the waiting.** Reads that need nothing from each other must all
 * have started before any of them finished; the one that genuinely depends —
 * naming the movements, which can only follow from the readings that name them
 * — must still start afterwards. A test about timing has to be able to see
 * time, so every read here resolves on a later tick and records when it began
 * and ended.
 *
 * **Number of reads.** A card used to be four reads of its own, two of which
 * Prisma split further out of the relation columns. Eight cards were 53
 * queries. What is asserted below is that the count no longer moves with the
 * number of cards at all — and, in the same breath, that each card still draws
 * exactly its own readings, because a consolidation that got that wrong would
 * also look constant.
 */

const TENANT = { organizationId: 'org_a' } as const;
const ATHLETE = { id: 'ath_1', sex: 'female' as const };

const day = (iso: string) => new Date(`${iso}T09:00:00.000Z`);

/** Eight quantities, so a profile can be asked for eight cards. */
const KEYS = [
  'weight',
  'body_fat',
  'lactate',
  'external_load',
  'vo2max',
  'hrv',
  'sprint',
  'jump',
] as const;

interface FakeRow {
  measurementTypeId: string;
  side: string;
  exerciseId: string | null;
  passIndex: number | null;
  context: unknown;
  numericValue: number;
  capturedAt: Date;
  assessmentModule: { name: string | null };
  measurementType: { key: string; name: string; unit: string };
}

/** Two readings per quantity, later one first, so the ordering has work to do. */
const ROWS: FakeRow[] = KEYS.flatMap((key, index) => [
  {
    measurementTypeId: `mt_${key}`,
    side: 'BILATERAL',
    exerciseId: null,
    passIndex: null,
    context: null,
    numericValue: index * 10 + 2,
    capturedAt: day('2026-05-01'),
    assessmentModule: { name: 'Mai' },
    measurementType: { key, name: `Name ${key}`, unit: 'x' },
  },
  {
    measurementTypeId: `mt_${key}`,
    side: 'BILATERAL',
    exerciseId: null,
    passIndex: null,
    context: null,
    numericValue: index * 10 + 1,
    capturedAt: day('2026-01-01'),
    assessmentModule: { name: 'Januar' },
    measurementType: { key, name: `Name ${key}`, unit: 'x' },
  },
]);

interface FakeOptions {
  /** Names every read as it starts and as it comes back. */
  readonly events?: string[];
  readonly rows?: FakeRow[];
  readonly exercises?: { id: string; name: string }[];
  /** Catalogue keys this workspace knows. Everything by default. */
  readonly knownKeys?: readonly string[];
  readonly tracked?: { capturedAt: Date; numericValue: unknown; key: string }[];
}

function trendDb(options: FakeOptions = {}) {
  const events = options.events;

  /** Every read resolves a tick later, so the order of the waves is visible. */
  const read =
    <T>(name: string, value: () => T) =>
    () => {
      events?.push(`${name}:start`);

      return new Promise<T>((resolve) => {
        setTimeout(() => {
          events?.push(`${name}:end`);
          resolve(value());
        }, 5);
      });
    };

  const known = (key: string) => options.knownKeys === undefined || options.knownKeys.includes(key);

  const measurement = { findMany: vi.fn(read('values', () => options.rows ?? ROWS)) };
  const exercise = { findMany: vi.fn(read('exerciseNames', () => options.exercises ?? [])) };
  const bleedingEpisode = { count: vi.fn(read('bleedings', () => 0)) };

  const measurementType = {
    findMany: vi.fn((args: { where: { key?: { in: string[] } } }) =>
      read('types', () =>
        (args.where.key?.in ?? [])
          .filter(known)
          .map((key) => ({ key, name: `Katalog ${key}`, unit: 'x', organizationId: null })),
      )(),
    ),
    groupBy: vi.fn(read('tableTypes', () => [])),
  };

  const trackingEntry = {
    findMany: vi.fn((args: { where: { measurementType: { key: { in: string[] } } } }) =>
      read('tracked', () =>
        (options.tracked ?? [])
          .filter((entry) => args.where.measurementType.key.in.includes(entry.key))
          .map((entry) => ({
            capturedAt: entry.capturedAt,
            numericValue: entry.numericValue,
            measurementType: { key: entry.key },
          })),
      )(),
    ),
    groupBy: vi.fn(read('trackedCounts', () => [])),
  };

  const db = { measurement, exercise, bleedingEpisode, measurementType, trackingEntry };

  /** Every read this fake answered, however many cards asked for it. */
  const queries = () =>
    [
      measurement.findMany,
      exercise.findMany,
      bleedingEpisode.count,
      measurementType.findMany,
      measurementType.groupBy,
      trackingEntry.findMany,
      trackingEntry.groupBy,
    ].reduce((total, spy) => total + spy.mock.calls.length, 0);

  return {
    db: db as unknown as Parameters<typeof athleteTrends>[0],
    measurement,
    exercise,
    measurementType,
    trackingEntry,
    queries,
  };
}

const cardsFor = (count: number) =>
  KEYS.slice(0, count).map((key) => ({ key, exerciseIds: [] as string[] }));

const before = (events: string[], one: string, other: string) =>
  events.indexOf(one) < events.indexOf(other);

describe('what the trend cards wait for', () => {
  it('asks for the readings, the quantities and the self-reports in one wave', async () => {
    const events: string[] = [];
    const { db } = trendDb({ events, tracked: [] });

    await athleteTrends(db, TENANT, ATHLETE, cardsFor(2));

    // Four questions about four tables, none of which needs an answer from
    // another — so each started before any of them came back.
    for (const started of ['types:start', 'tracked:start', 'trackedCounts:start']) {
      expect(before(events, started, 'values:end')).toBe(true);
    }
    expect(before(events, 'values:start', 'types:end')).toBe(true);
  });

  it('still waits for the readings before naming the movements', async () => {
    const events: string[] = [];
    const rows = ROWS.map((entry) => ({ ...entry, exerciseId: 'ex_1' }));
    const { db } = trendDb({ events, rows, exercises: [{ id: 'ex_1', name: 'Bankdrücken' }] });

    await athleteTrends(db, TENANT, ATHLETE, cardsFor(1));

    // The one real dependency in the whole path.
    expect(before(events, 'values:end', 'exerciseNames:start')).toBe(true);
  });

  it('leaves the self-reports out where every card is narrowed to movements', async () => {
    const { db, trackingEntry } = trendDb({
      tracked: [{ capturedAt: day('2026-02-01'), numericValue: 70, key: 'weight' }],
    });

    const { charts } = await athleteTrends(db, TENANT, ATHLETE, [
      { key: 'weight', exerciseIds: ['ex_1'] },
    ]);

    // A self-reported value belongs to no lift, so a narrowed card must not
    // read them at all — the batch must not have made that read unconditional.
    expect(trackingEntry.findMany).not.toHaveBeenCalled();
    expect(charts[0]?.series.some((series) => series.origin === 'tracked')).toBe(false);
  });

  it('keeps the self-reports for the card that is not narrowed', async () => {
    // Two cards for one quantity, one narrowed and one not: the read happens
    // for the second, and its rows must not leak onto the first.
    const { db } = trendDb({
      rows: ROWS.map((entry) =>
        entry.measurementType.key === 'weight' ? { ...entry, exerciseId: 'ex_1' } : entry,
      ),
      exercises: [{ id: 'ex_1', name: 'Bankdrücken' }],
      tracked: [{ capturedAt: day('2026-02-01'), numericValue: 70, key: 'weight' }],
    });

    const { charts } = await athleteTrends(db, TENANT, ATHLETE, [
      { key: 'weight', exerciseIds: ['ex_1'] },
      { key: 'weight', exerciseIds: [] },
    ]);

    expect(charts[0]?.series.some((series) => series.origin === 'tracked')).toBe(false);
    expect(charts[1]?.series.some((series) => series.origin === 'tracked')).toBe(true);
  });

  it('answers null for a quantity this workspace does not have', async () => {
    const { db } = trendDb({ knownKeys: [] });

    const { charts } = await athleteTrends(db, TENANT, ATHLETE, [{ key: 'gone', exerciseIds: [] }]);

    expect(charts[0]).toBeNull();
  });

  it('draws the cycle card without asking anything on its behalf', async () => {
    const { db, measurementType, trackingEntry } = trendDb();

    const { charts } = await athleteTrends(db, TENANT, ATHLETE, [
      { key: 'cycle', exerciseIds: [] },
    ]);

    expect(charts[0]?.kind).toBe('cycle');
    expect(trackingEntry.findMany).not.toHaveBeenCalled();
    for (const call of measurementType.findMany.mock.calls) {
      const where = (call as unknown[])[0] as { where: { key?: { in: string[] } } };
      expect(where.where.key?.in ?? []).not.toContain('cycle');
    }
  });
});

/**
 * The count must not move with the number of cards.
 *
 * This is the regression the phase exists to prevent: a card that reads its own
 * measurements again is invisible in every behavioural test and shows up only
 * here.
 */
describe('how many reads a profile costs', () => {
  for (const count of [1, 2, 4, 8]) {
    it(`asks the same questions for ${String(count)} cards as for one`, async () => {
      const { db, measurement, exercise, measurementType, trackingEntry, queries } = trendDb();

      const { charts } = await athleteTrends(db, TENANT, ATHLETE, cardsFor(count));

      expect(charts).toHaveLength(count);

      // One read of the readings, whatever is drawn from them.
      expect(measurement.findMany).toHaveBeenCalledTimes(1);
      // One read for every card's quantity, plus the documentation keys.
      expect(measurementType.findMany.mock.calls.length).toBeLessThanOrEqual(2);
      // One read of the self-reports, and one of their counts.
      expect(trackingEntry.findMany).toHaveBeenCalledTimes(1);
      expect(trackingEntry.groupBy).toHaveBeenCalledTimes(1);
      // The movements were named once, for every card at once.
      expect(exercise.findMany.mock.calls.length).toBeLessThanOrEqual(1);

      /**
       * Six, for one card and for eight alike: the readings, their self-report
       * counts, the cards' quantities, the self-reports, the bleedings behind
       * the cycle offer, and the categories behind the table cards.
       */
      expect(queries()).toBe(6);
    });
  }

  it('draws each card from its own readings only', async () => {
    const { db } = trendDb();

    const { charts } = await athleteTrends(db, TENANT, ATHLETE, cardsFor(8));

    // Two readings per quantity, put in time order, and never another card's.
    expect(
      charts.map((chart) =>
        chart?.series.flatMap((series) => series.points.map((point) => point.value)),
      ),
    ).toEqual(KEYS.map((_key, index) => [index * 10 + 1, index * 10 + 2]));
  });

  it('gives one card the same points whether it is drawn alone or among eight', async () => {
    const alone = await athleteTrends(trendDb().db, TENANT, ATHLETE, cardsFor(1));
    const among = await athleteTrends(trendDb().db, TENANT, ATHLETE, cardsFor(8));

    expect(among.charts[0]).toEqual(alone.charts[0]);
  });
});
