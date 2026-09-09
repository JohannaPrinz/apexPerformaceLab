import { describe, expect, it, vi } from 'vitest';

import { athleteTrends, CYCLE_TREND_KEY } from './trends';

/**
 * One athlete's record over time.
 *
 * Three guarantees are under test. That a line is only drawn between readings
 * that are actually the same value — the rule lives in `@apex/domain` and this
 * asserts it is the rule being used, not a second one that looks like it. That
 * the cards a coach documents over time are offered **before** anything has
 * been recorded, which is the only way to start recording. And the workspace
 * boundary, asserted on the queries: this read reaches every assessment an
 * athlete ever had.
 */

const TENANT = { organizationId: 'org_a' } as const;
const OTHER = { organizationId: 'org_b' } as const;

const day = (iso: string) => new Date(`${iso}T09:00:00.000Z`);

/** A female athlete, so the cycle card is offered. */
const ATHLETE = { id: 'ath_1', sex: 'female' as const };
const MALE = { id: 'ath_1', sex: 'male' as const };

interface Row {
  measurementTypeId: string;
  side: string;
  exerciseId: string | null;
  passIndex: number | null;
  context: unknown;
  numericValue: number | null;
  capturedAt: Date;
  assessmentModule: { name: string | null };
  measurementType: { key: string; name: string; unit: string };
}

const row = (over: Partial<Row> = {}): Row => ({
  measurementTypeId: 'mt_weight',
  side: 'BILATERAL',
  exerciseId: null,
  passIndex: null,
  context: null,
  numericValue: 64.5,
  capturedAt: day('2026-03-01'),
  assessmentModule: { name: 'Körperfett März' },
  measurementType: { key: 'weight', name: 'Weight', unit: 'kg' },
  ...over,
});

function trendDb(
  options: {
    rows?: Row[];
    episodes?: { id: string; startedOn: Date; endedOn: Date | null }[];
    exercises?: { id: string; name: string }[];
    /** Catalogue keys this workspace knows. Everything by default. */
    knownKeys?: string[] | null;
    /** What the athlete or a device contributed. */
    tracked?: { capturedAt: Date; numericValue: unknown }[];
    trackedCounts?: { measurementTypeId: string; _count: { _all: number } }[];
  } = {},
) {
  const measurement = { findMany: vi.fn(() => Promise.resolve(options.rows ?? [])) };
  const bleedingEpisode = {
    findMany: vi.fn(() => Promise.resolve(options.episodes ?? [])),
    count: vi.fn(() => Promise.resolve((options.episodes ?? []).length)),
  };
  const exercise = { findMany: vi.fn(() => Promise.resolve(options.exercises ?? [])) };
  const measurementType = {
    /**
     * The cards' quantities and the documentation keys — both by key list.
     *
     * There is no `findFirst` here any more, and that is the point of the
     * batch: one read names every card, however many there are.
     */
    findMany: vi.fn((args: { where: { key?: { in: string[] } } }) => {
      const known = options.knownKeys;
      const wanted = args.where.key?.in ?? [];

      return Promise.resolve(
        wanted
          .filter((key) => known === undefined || known === null || known.includes(key))
          .map((key) => ({
            key,
            name: `Katalog ${key}`,
            unit: 'kg',
            organizationId: null,
          })),
      );
    }),
    /** Which table cards the catalogue can hold, grouped by category. */
    groupBy: vi.fn(() => {
      const known = options.knownKeys;

      return Promise.resolve(
        known === undefined || known === null
          ? [
              { category: 'nutrition', _count: { _all: 5 } },
              { category: 'biofeedback', _count: { _all: 8 } },
            ]
          : [],
      );
    }),
    // How many types of a table card's kind the catalogue holds. Those cards are
    // offered only where at least one exists, so an unseeded workspace gets no
    // card — the same rule every other option here follows. Asked either by an
    // explicit key list (nutrition) or by category (biofeedback).
    count: vi.fn((args: { where: { key?: { in: string[] }; category?: string } }) => {
      const known = options.knownKeys;
      if (known !== undefined && known !== null) {
        const wanted = args.where.key?.in;

        return Promise.resolve(
          wanted === undefined ? 0 : wanted.filter((key) => known.includes(key)).length,
        );
      }

      return Promise.resolve(args.where.key?.in.length ?? 1);
    }),
  };

  // Self-reported readings share the axis. The fake answers with none unless a
  // test says otherwise, so every existing expectation still describes what a
  // coach measured.
  const trackingEntry = {
    findMany: vi.fn(() => Promise.resolve(options.tracked ?? [])),
    groupBy: vi.fn(() => Promise.resolve(options.trackedCounts ?? [])),
  };

  const db = {
    measurement,
    bleedingEpisode,
    exercise,
    measurementType,
    trackingEntry,
  } as unknown as Parameters<typeof athleteTrends>[0];

  return { db, measurement, bleedingEpisode, exercise, measurementType, trackingEntry };
}

const argsOf = (spy: { mock: { calls: unknown[][] } }, index = 0) =>
  (spy.mock.calls[index]?.[0] ?? {}) as { where?: Record<string, unknown>; orderBy?: unknown };

const keysOf = (options: readonly { key: string }[]) => options.map((option) => option.key);

type Fixture = Parameters<typeof athleteTrends>[0];
type Tenant = Parameters<typeof athleteTrends>[1];
type Subject = Parameters<typeof athleteTrends>[2];
type Selection = Parameters<typeof athleteTrends>[3][number];

/** Which cards this athlete may be given — no card asked for. */
const optionsFor = async (db: Fixture, tenant: Tenant, athlete: Subject) =>
  (await athleteTrends(db, tenant, athlete, [])).options;

/** The one card behind one selection. */
const chartFor = async (db: Fixture, tenant: Tenant, athlete: Subject, selection: Selection) =>
  (await athleteTrends(db, tenant, athlete, [selection])).charts[0];

describe('which cards an athlete may be given', () => {
  it('offers a quantity they have values for, keyed by its catalogue key', async () => {
    // An id belongs to a workspace; a key is the same everywhere, which is what
    // lets a card be offered before the value exists.
    const { db } = trendDb({ rows: [row()] });

    expect(await optionsFor(db, TENANT, MALE)).toContainEqual({
      key: 'weight',
      kind: 'measurement',
      name: 'Weight',
      unit: 'kg',
      exercises: [],
      count: 1,
    });
  });

  it('offers body weight and body fat before anything is recorded', async () => {
    // A card that only appeared once a value existed would be a card nobody
    // could use to start tracking one.
    const options = await optionsFor(trendDb({ rows: [] }).db, TENANT, MALE);

    // The two table cards are offered on the same reasoning and for the same
    // reason: nobody can start writing a week down against a card that is not
    // there.
    expect([...keysOf(options)].sort()).toEqual(['biofeedback', 'body_fat', 'nutrition', 'weight']);
    expect(options.every((option) => option.count === 0)).toBe(true);
  });

  it('offers nothing it cannot name', async () => {
    // A workspace whose catalogue was never seeded has no such type, and
    // inventing a name for it would be worse than leaving the card out.
    const { db } = trendDb({ rows: [], knownKeys: [] });

    expect(await optionsFor(db, TENANT, MALE)).toEqual([]);
  });

  it('leaves a non-numeric quantity out', async () => {
    // A movement-quality note has no position on a value axis. Not a judgement
    // about it — arithmetic.
    const { db } = trendDb({
      rows: [
        row({
          numericValue: null,
          measurementType: { key: 'movement_quality', name: 'Bewegungsqualität', unit: '' },
        }),
      ],
    });

    expect(keysOf(await optionsFor(db, TENANT, MALE))).not.toContain('movement_quality');
  });

  it('names the movements a quantity was recorded with', async () => {
    const load = { key: 'external_load', name: 'External Load', unit: 'kg' };
    const { db } = trendDb({
      rows: [
        row({ exerciseId: 'ex_bench', measurementType: load }),
        row({ exerciseId: 'ex_dead', measurementType: load }),
      ],
      exercises: [
        { id: 'ex_bench', name: 'Bankdrücken' },
        { id: 'ex_dead', name: 'Kreuzheben' },
      ],
    });

    const option = (await optionsFor(db, TENANT, MALE)).find(
      (entry) => entry.key === 'external_load',
    );

    expect(option?.exercises).toEqual([
      { id: 'ex_bench', name: 'Bankdrücken' },
      { id: 'ex_dead', name: 'Kreuzheben' },
    ]);
  });

  it('offers the cycle to a female athlete before anything is documented', async () => {
    // The chicken and egg a browser run found: a card that appeared only once a
    // bleeding existed left no way to record the first one.
    const { db } = trendDb({ rows: [], episodes: [] });

    expect(keysOf(await optionsFor(db, TENANT, ATHLETE))).toContain(CYCLE_TREND_KEY);
  });

  it('does not offer it where the sex says otherwise', async () => {
    const { db } = trendDb({ rows: [], episodes: [] });

    expect(keysOf(await optionsFor(db, TENANT, MALE))).not.toContain(CYCLE_TREND_KEY);
  });

  it('still offers it where something is already documented', async () => {
    // Nothing already written down may become unreachable.
    const { db } = trendDb({
      rows: [],
      episodes: [{ id: 'ep_1', startedOn: day('2026-03-04'), endedOn: null }],
    });

    expect(keysOf(await optionsFor(db, TENANT, MALE))).toContain(CYCLE_TREND_KEY);
  });

  it('asks only for readings that still stand, from tests still in view', async () => {
    const { db, measurement } = trendDb({ rows: [] });

    await optionsFor(db, TENANT, MALE);

    expect(argsOf(measurement.findMany).where).toMatchObject({
      supersededById: null,
      assessmentModule: {
        archivedAt: null,
        assessment: { case: { athleteId: 'ath_1' } },
      },
    });
  });
});

describe('the points behind one card', () => {
  const weight = { key: 'weight', exerciseIds: [] };

  it('draws one line where every coordinate matches', async () => {
    const { db } = trendDb({
      rows: [
        row({ capturedAt: day('2026-01-01'), numericValue: 66 }),
        row({ capturedAt: day('2026-03-01'), numericValue: 64.5 }),
      ],
    });

    const chart = await chartFor(db, TENANT, MALE, weight);

    expect(chart?.series).toHaveLength(1);
    expect(chart?.series[0]?.points.map((point) => point.value)).toEqual([66, 64.5]);
  });

  it('draws one line per stage, never one across stages', async () => {
    // Stage 3 of March and stage 3 of May are the same quantity; stage 1 and
    // stage 3 are not (§11). The rule is `comparisonKey`, not a local copy.
    const lactate = (passIndex: number, value: number, at: string) =>
      row({
        passIndex,
        numericValue: value,
        capturedAt: day(at),
        measurementType: { key: 'lactate', name: 'Lactate', unit: 'mmol/L' },
      });

    const { db } = trendDb({
      rows: [
        lactate(1, 1.2, '2026-01-01'),
        lactate(2, 2.6, '2026-01-01'),
        lactate(1, 1.1, '2026-05-01'),
      ],
    });

    const chart = await chartFor(db, TENANT, MALE, { key: 'lactate', exerciseIds: [] });

    expect(chart?.series).toHaveLength(2);
    expect(chart?.series[0]?.points).toHaveLength(2);
    expect(chart?.series.map((series) => series.label)).toEqual(['Stufe 1', 'Stufe 2']);
  });

  it('keeps left and right apart', async () => {
    const { db } = trendDb({ rows: [row({ side: 'LEFT' }), row({ side: 'RIGHT' })] });

    const chart = await chartFor(db, TENANT, MALE, weight);

    expect(chart?.series.map((series) => series.label)).toEqual(['Links', 'Rechts']);
  });

  it('draws one line per movement', async () => {
    const { db } = trendDb({
      rows: [row({ exerciseId: 'ex_bench' }), row({ exerciseId: 'ex_dead' })],
      exercises: [
        { id: 'ex_bench', name: 'Bankdrücken' },
        { id: 'ex_dead', name: 'Kreuzheben' },
      ],
    });

    const chart = await chartFor(db, TENANT, MALE, weight);

    expect(chart?.series.map((series) => series.label)).toEqual(['Bankdrücken', 'Kreuzheben']);
  });

  it('narrows to the movements that were chosen', async () => {
    // The narrowing moved out of the `WHERE` and into memory, so what it does
    // is asserted on the points rather than on the query: only the chosen lift
    // is drawn, and a reading that belongs to no lift is not smuggled in.
    const load = { key: 'external_load', name: 'External Load', unit: 'kg' };
    const { db, measurement } = trendDb({
      rows: [
        row({ exerciseId: 'ex_bench', numericValue: 100, measurementType: load }),
        row({ exerciseId: 'ex_dead', numericValue: 140, measurementType: load }),
        row({ exerciseId: null, numericValue: 80, measurementType: load }),
      ],
      exercises: [
        { id: 'ex_bench', name: 'Bankdrücken' },
        { id: 'ex_dead', name: 'Kreuzheben' },
      ],
    });

    const chart = await chartFor(db, TENANT, MALE, {
      key: 'external_load',
      exerciseIds: ['ex_bench'],
    });

    expect(chart?.series.map((series) => series.label)).toEqual(['Bankdrücken']);
    expect(chart?.series.flatMap((series) => series.points.map((point) => point.value))).toEqual([
      100,
    ]);
    expect(measurement.findMany).toHaveBeenCalledTimes(1);
  });

  it('draws only the quantity it is a card for', async () => {
    // Every reading now arrives in one list, so the key that used to be a
    // `WHERE` has to keep the cards apart in memory.
    const { db } = trendDb({
      rows: [
        row({ numericValue: 64.5 }),
        row({
          numericValue: 12,
          measurementTypeId: 'mt_fat',
          measurementType: { key: 'body_fat', name: 'Body Fat', unit: '%' },
        }),
      ],
    });

    const chart = await chartFor(db, TENANT, MALE, { key: 'weight', exerciseIds: [] });

    expect(chart?.series.flatMap((series) => series.points.map((point) => point.value))).toEqual([
      64.5,
    ]);
  });

  it('still offers the movements it is not narrowed to', async () => {
    // Otherwise narrowing to one lift would hide the way back to the others.
    const load = { key: 'external_load', name: 'External Load', unit: 'kg' };
    const { db, measurement } = trendDb({
      rows: [
        row({ exerciseId: 'ex_bench', measurementType: load }),
        row({ exerciseId: 'ex_dead', measurementType: load }),
      ],
      exercises: [
        { id: 'ex_bench', name: 'Bankdrücken' },
        { id: 'ex_dead', name: 'Kreuzheben' },
      ],
    });

    const chart = await chartFor(db, TENANT, MALE, {
      key: 'external_load',
      exerciseIds: ['ex_bench'],
    });

    // The wider list was a second read of the same rows. It is now the same
    // rows.
    expect(measurement.findMany).toHaveBeenCalledTimes(1);
    expect(chart?.exercises.map((exercise) => exercise.name).sort()).toEqual([
      'Bankdrücken',
      'Kreuzheben',
    ]);
    expect(chart?.exerciseIds).toEqual(['ex_bench']);
  });

  it('puts the points in time order', async () => {
    const { db } = trendDb({
      rows: [
        row({ capturedAt: day('2026-05-01'), numericValue: 63 }),
        row({ capturedAt: day('2026-01-01'), numericValue: 66 }),
      ],
    });

    const chart = await chartFor(db, TENANT, MALE, weight);

    expect(chart?.series[0]?.points.map((point) => point.value)).toEqual([66, 63]);
  });

  it('is a card that says so where nothing is recorded, not an absence', async () => {
    // What lets a coach add "body weight" before there is a body weight.
    const { db } = trendDb({ rows: [] });

    const chart = await chartFor(db, TENANT, MALE, weight);

    expect(chart).not.toBeNull();
    expect(chart?.series).toEqual([]);
    expect(chart?.title).toBe('Katalog weight');
  });

  it('is nothing at all for a key this workspace does not know', async () => {
    const { db } = trendDb({ rows: [], knownKeys: [] });

    expect(await chartFor(db, TENANT, MALE, { key: 'erfunden', exerciseIds: [] })).toBeNull();
  });

  it('is nothing at all for an unfilled card', async () => {
    const { db, measurementType, trackingEntry } = trendDb({ rows: [row()] });

    expect(await chartFor(db, TENANT, MALE, { key: '', exerciseIds: [] })).toBeNull();

    // Nothing is asked on its behalf: it is not among the keys the card read
    // names, and no self-report is fetched for it.
    expect(trackingEntry.findMany).not.toHaveBeenCalled();
    for (const call of measurementType.findMany.mock.calls) {
      expect(call[0].where.key?.in ?? []).not.toContain('');
    }
  });

  it('computes no trend line, average or rate of change', async () => {
    // Points and dates. Anything else would need a direction the model does
    // not record.
    const { db } = trendDb({ rows: [row(), row({ capturedAt: day('2026-05-01') })] });

    const chart = await chartFor(db, TENANT, MALE, weight);

    expect(Object.keys(chart ?? {}).sort()).toEqual([
      'episodes',
      'exerciseIds',
      'exercises',
      'key',
      'kind',
      'series',
      'title',
      'unit',
    ]);
  });
});

describe('the documented bleedings', () => {
  const cycle = { key: CYCLE_TREND_KEY, exerciseIds: [] };

  it('is a card, and carries nothing else', async () => {
    // Since the cycle card became a calendar it loads its own month, so the
    // chart is the card's identity and nothing more. It used to read every
    // documented bleeding here — all of them, on every render of the profile —
    // for a list the card no longer draws.
    const { db, bleedingEpisode } = trendDb({
      episodes: [
        { id: 'ep_1', startedOn: day('2026-03-04'), endedOn: null },
        { id: 'ep_2', startedOn: day('2026-02-02'), endedOn: day('2026-02-06') },
      ],
    });

    const chart = await chartFor(db, TENANT, ATHLETE, cycle);

    expect(chart?.kind).toBe('cycle');
    expect(chart?.title).toBe('Zyklus');
    expect(chart?.episodes).toEqual([]);
    expect(bleedingEpisode.findMany).not.toHaveBeenCalled();
  });

  it('is a card that says so where nothing is documented', async () => {
    // The card is how a bleeding gets recorded in the first place.
    const { db } = trendDb({ episodes: [] });

    const chart = await chartFor(db, TENANT, ATHLETE, cycle);

    expect(chart).not.toBeNull();
    expect(chart?.episodes).toEqual([]);
  });

  it('computes no cycle length, phase or prediction', async () => {
    const { db } = trendDb({
      episodes: [{ id: 'ep_1', startedOn: day('2026-03-04'), endedOn: null }],
    });

    const chart = await chartFor(db, TENANT, ATHLETE, cycle);

    expect(chart?.series).toEqual([]);
    // What the calendar shows is asserted against the month read, in
    // `features/cycle/server/month.test.ts`, where the days actually come from.
  });

  it('reads nothing of its own', async () => {
    // The readings are read for the options list, as they always were. What the
    // cycle card must not add is a read of its own — no quantity to name, no
    // self-reports.
    const { db, measurementType, trackingEntry } = trendDb({ episodes: [] });

    await chartFor(db, TENANT, ATHLETE, cycle);

    expect(trackingEntry.findMany).not.toHaveBeenCalled();
    for (const call of measurementType.findMany.mock.calls) {
      expect(call[0].where.key?.in ?? []).not.toContain(CYCLE_TREND_KEY);
    }
  });
});

/**
 * This read reaches every assessment an athlete ever had. It must not cross a
 * workspace, and the guarantee is asserted where it lives.
 */
describe('the workspace boundary', () => {
  it('scopes the options read', async () => {
    const { db, measurement, bleedingEpisode } = trendDb({ rows: [] });

    await optionsFor(db, OTHER, ATHLETE);

    expect(argsOf(measurement.findMany).where).toMatchObject({ organizationId: 'org_b' });
    expect(argsOf(bleedingEpisode.count).where).toMatchObject({ organizationId: 'org_b' });
  });

  it('scopes the points read', async () => {
    const { db, measurement } = trendDb({ rows: [row()] });

    await chartFor(db, OTHER, MALE, { key: 'weight', exerciseIds: [] });

    expect(argsOf(measurement.findMany).where).toMatchObject({ organizationId: 'org_b' });
  });

  it('scopes the bleedings count that decides whether the cycle is offered', async () => {
    // The chart no longer reads episodes — the calendar loads its own month,
    // and `features/cycle/server/month.test.ts` holds the boundary for that
    // read. What is left here is the count behind the offer, and it carries
    // the tenant like everything else.
    const { db, bleedingEpisode } = trendDb({
      episodes: [{ id: 'ep_1', startedOn: day('2026-03-04'), endedOn: null }],
    });

    await optionsFor(db, OTHER, MALE);

    expect(argsOf(bleedingEpisode.count).where).toMatchObject({
      organizationId: 'org_b',
      athleteId: 'ath_1',
    });
  });

  it('inherits system types and exercises without dropping the scope', async () => {
    // A system entry carries `organizationId = null` and every workspace
    // inherits it — the catalogue rule, not an absence of scoping.
    const { db, exercise, measurementType } = trendDb({
      rows: [row({ exerciseId: 'ex_bench' })],
      exercises: [{ id: 'ex_bench', name: 'Bankdrücken' }],
    });

    await chartFor(db, OTHER, MALE, { key: 'external_load', exerciseIds: [] });

    // Every type read carries it, the cards' one included — that read is the
    // first, because it starts in the same wave as the readings themselves.
    for (const spy of [exercise.findMany, measurementType.findMany]) {
      expect(argsOf(spy).where).toMatchObject({
        OR: [{ organizationId: 'org_b' }, { organizationId: null }],
      });
    }

    expect(argsOf(measurementType.findMany).where).toMatchObject({
      key: { in: ['external_load'] },
    });
  });
});
