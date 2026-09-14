import { describe, expect, it, vi } from 'vitest';

import {
  canonicalContext,
  MIN_COHORT,
  percentileOf,
  protocolKey,
  readModuleConfiguration,
} from '@apex/domain';

import { assessmentEvaluation } from './service';

// The service's imports reach the Prisma client at load time. Nothing here talks
// to a database — every read is answered by the fake below.
vi.mock('@apex/database', () => ({ db: {} }));

/**
 * Where an athlete stands among the workspace's others — through the real read
 * (§16).
 *
 * ## What is being protected
 *
 * The cohort used to be every reading of every other athlete, cut off at 5000
 * rows. Past that, athletes went missing and others were counted with only some
 * of their values — and the percentile still came out as a plausible number,
 * which a published analysis then freezes for good.
 *
 * It is now two reads: the tests of the other athletes, and each test's extremes
 * per coordinate from `measurement.groupBy`. What these cases pin is that the
 * answer is **the answer over the complete data**: the expected percentile is
 * computed row by row by `completeCohort` below, straight from the business
 * rules, and the service has to arrive at the same number.
 *
 * ## Why the fake applies the filters
 *
 * A fake that answered whatever a test handed it would pass while the service
 * forgot the tenant, the supersede rule or the archive rule. This one reads the
 * `where` it is given, and groups the way Postgres groups JSONB — key order
 * ignored, value types kept apart — so the merge in `cohortOf` is exercised
 * against the shapes the database actually returns.
 *
 * **Not covered here:** that Postgres itself groups a JSONB column this way.
 * The repository has no database-backed test infrastructure, and this phase
 * does not build one; `measurement.groupBy` over `context` was checked once
 * against the development database by hand.
 */

const TENANT = { organizationId: 'org_a' } as const;
const ME = 'ath_me';
const LABELS = { module: (key: string) => key, moduleStatus: (status: string) => status };

interface ModuleRow {
  id: string;
  organizationId: string;
  moduleKey: string;
  archivedAt: Date | null;
  athleteId: string;
  payload: unknown;
  moduleVersion: number;
}

interface Row {
  id: string;
  organizationId: string;
  assessmentModuleId: string;
  measurementTypeId: string;
  side: string;
  exerciseId: string | null;
  passIndex: number | null;
  context: unknown;
  numericValue: string | null;
  supersededById: string | null;
}

const configuration = (protocol?: Record<string, unknown>) => ({
  measurementTypes: [{ measurementTypeId: 'mt_grip', role: 'required' }],
  exerciseIds: [],
  passes: 1,
  recordsSide: true,
  dimensions: [],
  ...(protocol === undefined ? {} : { protocol }),
});

const HIGHER = configuration({ key: 'grip', betterDirection: 'higher' });
const LOWER = configuration({ key: 'grip', betterDirection: 'lower' });
/** A protocol, and no direction: the catalogue's scale has to fill in. */
const UNDIRECTED = configuration({ key: 'grip' });
const NO_PROTOCOL = configuration();

/** The quantity's catalogue keys. `grip_strength` has a scale direction, `mt_other`'s has none. */
const TYPES: Record<string, { key: string; name: string; unit: string; valueType: string }> = {
  mt_grip: { key: 'grip_strength', name: 'Griffkraft', unit: 'kg', valueType: 'NUMERIC' },
  mt_other: { key: 'custom_score', name: 'Wert', unit: '', valueType: 'NUMERIC' },
};

/** A workspace, built up row by row. Ids are issued in order, so "row 5001" means something. */
class World {
  readonly modules: ModuleRow[] = [];
  readonly rows: Row[] = [];
  private next = 0;

  constructor(
    private readonly own: { payload: unknown; context?: unknown; value: string; typeId?: string },
  ) {
    this.module(ME, { id: 'mod_me', payload: own.payload });
    this.value('mod_me', own.value, {
      context: own.context ?? null,
      measurementTypeId: own.typeId ?? 'mt_grip',
    });
  }

  module(athleteId: string, over: Partial<ModuleRow> = {}): string {
    const id = over.id ?? `mod_${athleteId}_${String(this.modules.length)}`;
    this.modules.push({
      id,
      organizationId: 'org_a',
      moduleKey: 'grip',
      archivedAt: null,
      athleteId,
      payload: this.own.payload,
      moduleVersion: 2,
      ...over,
    });

    return id;
  }

  value(moduleId: string, numericValue: string | null, over: Partial<Row> = {}): void {
    this.next += 1;
    this.rows.push({
      id: `m_${String(this.next).padStart(7, '0')}`,
      organizationId: 'org_a',
      assessmentModuleId: moduleId,
      measurementTypeId: 'mt_grip',
      side: 'BILATERAL',
      exerciseId: null,
      passIndex: null,
      context: null,
      numericValue,
      supersededById: null,
      ...over,
    });
  }

  /** Several athletes with one test each, one value each. */
  athletes(values: readonly string[], over: Partial<ModuleRow> = {}, prefix = 'ath'): void {
    values.forEach((numericValue, index) => {
      const moduleId = this.module(`${prefix}_${String(index + 1)}`, over);
      this.value(moduleId, numericValue);
    });
  }
}

/** Postgres compares JSONB with key order ignored and value types kept: `1` is not `"1"`. */
function jsonbKey(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (Array.isArray(value)) return `[${value.map(jsonbKey).join(',')}]`;
  if (typeof value === 'object') {
    const record = value as Record<string, unknown>;

    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${jsonbKey(record[key])}`)
      .join(',')}}`;
  }

  return JSON.stringify(value);
}

interface ModuleFilter {
  moduleKey?: { in: string[] };
  archivedAt?: null;
  assessment?: { case: { athleteId: string | { not: string } } };
}

function passesModuleFilter(test: ModuleRow, filter: ModuleFilter | undefined): boolean {
  if (filter === undefined) return true;
  if (filter.moduleKey && !filter.moduleKey.in.includes(test.moduleKey)) return false;
  if ('archivedAt' in filter && filter.archivedAt === null && test.archivedAt !== null)
    return false;

  const athlete = filter.assessment?.case.athleteId;
  if (typeof athlete === 'string' && test.athleteId !== athlete) return false;
  if (typeof athlete === 'object' && test.athleteId === athlete.not) return false;

  return true;
}

function databaseFor(world: World) {
  const moduleById = new Map(world.modules.map((test) => [test.id, test]));

  const rowPasses = (row: Row, where: Record<string, unknown>) => {
    if (where['organizationId'] !== undefined && row.organizationId !== where['organizationId'])
      return false;
    if (
      'supersededById' in where &&
      where['supersededById'] === null &&
      row.supersededById !== null
    )
      return false;
    if (where['numericValue'] !== undefined && row.numericValue === null) return false;

    const test = moduleById.get(row.assessmentModuleId);

    return (
      test !== undefined && passesModuleFilter(test, where['assessmentModule'] as ModuleFilter)
    );
  };

  const own = world.modules.find((test) => test.id === 'mod_me');

  return {
    assessment: {
      findFirst: vi.fn(() =>
        Promise.resolve({
          id: 'ass_1',
          question: 'Wie stark?',
          status: 'COMPLETED',
          performedAt: new Date('2026-06-01T00:00:00.000Z'),
          case: {
            athlete: {
              id: ME,
              firstName: 'Mara',
              lastName: 'Berg',
              heightCm: null,
              weightKg: null,
              dateOfBirth: null,
              sex: 'not_specified',
            },
          },
          modules: [
            {
              id: 'mod_me',
              name: 'Griffkraft',
              moduleKey: 'grip',
              status: 'COMPLETED',
              payload: own?.payload,
              moduleVersion: 2,
            },
          ],
        }),
      ),
    },
    report: {
      findFirst: vi.fn(() =>
        Promise.resolve({
          id: 'rep_1',
          title: 'Auswertung',
          version: 1,
          draft: null,
          authorCoach: { displayName: 'Johanna', user: { name: 'Johanna' } },
          modules: [{ assessmentModuleId: 'mod_me', included: true }],
        }),
      ),
    },
    measurement: {
      // This athlete's own readings.
      findMany: vi.fn(({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve(
          world.rows
            .filter((row) => rowPasses(row, where))
            .map((row) => {
              const test = moduleById.get(row.assessmentModuleId)!;

              return {
                ...row,
                numericValue:
                  row.numericValue === null ? null : { toString: () => row.numericValue },
                capturedAt: new Date('2026-06-01T09:00:00.000Z'),
                source: 'MANUAL',
                assessmentModule: {
                  id: test.id,
                  moduleKey: test.moduleKey,
                  payload: test.payload,
                  moduleVersion: test.moduleVersion,
                  name: 'Griffkraft',
                  status: 'COMPLETED',
                },
                measurementType: TYPES[row.measurementTypeId],
              };
            }),
        ),
      ),

      groupBy: vi.fn(({ by, where }: { by: (keyof Row)[]; where: Record<string, unknown> }) => {
        const groups = new Map<string, { sample: Row; min: number; max: number }>();

        for (const row of world.rows) {
          if (!rowPasses(row, where) || row.numericValue === null) continue;

          const key = JSON.stringify(
            by.map((field) => (field === 'context' ? jsonbKey(row.context) : row[field])),
          );
          const value = Number(row.numericValue);
          const held = groups.get(key);

          groups.set(
            key,
            held === undefined
              ? { sample: row, min: value, max: value }
              : {
                  sample: held.sample,
                  min: Math.min(held.min, value),
                  max: Math.max(held.max, value),
                },
          );
        }

        return Promise.resolve(
          [...groups.values()].map(({ sample, min, max }) => ({
            ...Object.fromEntries(by.map((field) => [field, sample[field]])),
            _min: { numericValue: { toString: () => String(min) } },
            _max: { numericValue: { toString: () => String(max) } },
          })),
        );
      }),
    },
    assessmentModule: {
      findMany: vi.fn(({ where }: { where: Record<string, unknown> & ModuleFilter }) =>
        Promise.resolve(
          world.modules
            .filter(
              (test) =>
                test.organizationId === where['organizationId'] && passesModuleFilter(test, where),
            )
            .map((test) => ({
              id: test.id,
              payload: test.payload,
              moduleVersion: test.moduleVersion,
              assessment: { case: { athleteId: test.athleteId } },
            })),
        ),
      ),
    },
    exercise: { findMany: vi.fn(() => Promise.resolve([])) },
  };
}

/**
 * The oracle: the cohort worked out row by row from the complete data, the way
 * the business rules state it and without any cap. One value per other athlete
 * — their lowest where lower is ahead, their highest where higher is.
 */
function completeCohort(world: World, direction: 'lower' | 'higher'): number[] {
  const own = world.rows.find((row) => row.assessmentModuleId === 'mod_me')!;
  const protocolOf = (test: ModuleRow) =>
    protocolKey(readModuleConfiguration(test.payload, test.moduleVersion)?.protocol ?? null);
  const ownModule = world.modules.find((test) => test.id === 'mod_me')!;
  const byAthlete = new Map<string, number[]>();

  for (const row of world.rows) {
    const test = world.modules.find((entry) => entry.id === row.assessmentModuleId)!;

    const counts =
      row.organizationId === 'org_a' &&
      row.supersededById === null &&
      row.numericValue !== null &&
      test.archivedAt === null &&
      test.moduleKey === ownModule.moduleKey &&
      test.athleteId !== ME &&
      row.measurementTypeId === own.measurementTypeId &&
      row.side === own.side &&
      row.exerciseId === own.exerciseId &&
      row.passIndex === own.passIndex &&
      canonicalContext(row.context) === canonicalContext(own.context) &&
      protocolOf(test) === protocolOf(ownModule);

    if (!counts) continue;

    byAthlete.set(test.athleteId, [
      ...(byAthlete.get(test.athleteId) ?? []),
      Number(row.numericValue),
    ]);
  }

  return [...byAthlete.values()].map((values) =>
    direction === 'lower' ? Math.min(...values) : Math.max(...values),
  );
}

async function percentileFor(world: World) {
  const db = databaseFor(world);
  const found = await assessmentEvaluation(
    db as unknown as Parameters<typeof assessmentEvaluation>[0],
    TENANT,
    'ass_1',
    LABELS,
  );

  return {
    db,
    series: found?.modules[0]?.series[0],
    percentile: found?.modules[0]?.series[0]?.percentile,
  };
}

/** Eight other athletes, which is exactly enough to state a percentile. */
const EIGHT = ['40', '42', '44', '46', '48', '52', '54', '56'];

describe('who is in the cohort', () => {
  it('leaves this athlete out, however many tests they have', async () => {
    const world = new World({ payload: HIGHER, value: '50' });
    world.athletes(EIGHT);
    // An earlier test of the same athlete, far ahead of everybody. Counted, it
    // would be a ninth person and move the percentile.
    world.value(world.module(ME), '99');

    const { percentile } = await percentileFor(world);

    // 40 · 42 · 44 · 46 · 48 are behind a 50: five of eight.
    expect(percentile).toEqual({ percentile: 63, cohort: 8 });
    expect(percentile).toEqual(percentileOf(50, completeCohort(world, 'higher'), 'higher'));
  });

  it('counts each other athlete once, with their highest where higher is ahead', async () => {
    const world = new World({ payload: HIGHER, value: '50' });
    world.athletes(EIGHT);
    // Athlete 1 also has a 60 in a second test, and a 30: one person, their best.
    const second = world.module('ath_1');
    world.value(second, '60');
    world.value(second, '30');

    const { percentile } = await percentileFor(world);

    expect(percentile?.cohort).toBe(8);
    expect(percentile).toEqual(percentileOf(50, completeCohort(world, 'higher'), 'higher'));
    // Their 40 no longer counts behind this athlete; their 60 is ahead.
    expect(percentile?.percentile).toBe(50);
  });

  it('counts each other athlete with their lowest where lower is ahead', async () => {
    const world = new World({ payload: LOWER, value: '50' });
    world.athletes(EIGHT, { payload: LOWER });
    const second = world.module('ath_8', { payload: LOWER });
    world.value(second, '20');

    const { percentile } = await percentileFor(world);

    expect(percentile).toEqual(percentileOf(50, completeCohort(world, 'lower'), 'lower'));
    // Athlete 8's 20 is ahead of a 50 when lower is wanted; their 56 is not
    // what counts. Behind: 52 · 54 — two of eight.
    expect(percentile?.percentile).toBe(25);
  });

  it('falls back to the quantity’s own direction where the protocol states none', async () => {
    // `grip_strength` is ahead at the higher end in the catalogue. That — and
    // only that — lets a percentile be stated without a coach's direction.
    const world = new World({ payload: UNDIRECTED, value: '50' });
    world.athletes(EIGHT, { payload: UNDIRECTED });

    const { series, percentile } = await percentileFor(world);

    expect(series?.betterDirection).toBeNull();
    expect(percentile).toEqual(percentileOf(50, completeCohort(world, 'higher'), 'higher'));
  });

  it('states no percentile where neither the protocol nor the quantity has a direction', async () => {
    const world = new World({ payload: UNDIRECTED, value: '50', typeId: 'mt_other' });
    EIGHT.forEach((value, index) => {
      world.value(world.module(`ath_${String(index + 1)}`, { payload: UNDIRECTED }), value, {
        measurementTypeId: 'mt_other',
      });
    });

    expect((await percentileFor(world)).percentile).toBeNull();
  });
});

describe('which readings are the same series', () => {
  it('keeps athletes under another protocol out', async () => {
    const world = new World({ payload: HIGHER, value: '50' });
    world.athletes(EIGHT);
    world.athletes(
      ['99', '99', '99'],
      { payload: configuration({ key: 'grip_dyno', betterDirection: 'higher' }) },
      'dyno',
    );

    expect((await percentileFor(world)).percentile).toEqual({ percentile: 63, cohort: 8 });
  });

  it('puts an unreadable configuration with the tests that declare no protocol', async () => {
    // `readModuleConfiguration` answers `null` for it, and `protocolKey(null)`
    // is the no-protocol class — the existing semantics, carried through.
    const world = new World({ payload: NO_PROTOCOL, value: '50' });
    world.athletes(EIGHT.slice(0, 4), { payload: NO_PROTOCOL });
    world.athletes(EIGHT.slice(4), { payload: { unreadable: true } }, 'unreadable');
    world.athletes(['99', '99'], { payload: HIGHER }, 'declared');

    const { percentile } = await percentileFor(world);

    expect(percentile?.cohort).toBe(8);
    expect(percentile).toEqual(percentileOf(50, completeCohort(world, 'higher'), 'higher'));
  });

  it('treats a context written in another key order as the same series', async () => {
    const world = new World({
      payload: HIGHER,
      value: '50',
      context: { joint: 'knee', position: 'flexed' },
    });
    EIGHT.forEach((value, index) => {
      world.value(world.module(`ath_${String(index + 1)}`), value, {
        context:
          index % 2 === 0
            ? { position: 'flexed', joint: 'knee' }
            : { joint: 'knee', position: 'flexed' },
      });
    });
    // Another position is another series.
    world.value(world.module('ath_9'), '99', { context: { joint: 'knee', position: 'extended' } });

    expect((await percentileFor(world)).percentile).toEqual({ percentile: 63, cohort: 8 });
  });

  it('merges what JSONB groups apart but the series identity does not', async () => {
    // `{"stage": 1}` and `{"stage": "1"}` arrive as two groups, even for one
    // athlete. They are one series, and that athlete is still one person.
    const world = new World({ payload: HIGHER, value: '50', context: { stage: '1' } });
    EIGHT.forEach((value, index) => {
      world.value(world.module(`ath_${String(index + 1)}`), value, { context: { stage: '1' } });
    });
    world.value(world.module('ath_1'), '70', { context: { stage: 1 } });

    const { db, percentile } = await percentileFor(world);

    expect(percentile).toEqual({ percentile: 50, cohort: 8 });
    expect(percentile).toEqual(percentileOf(50, completeCohort(world, 'higher'), 'higher'));
    // Proof the fake really did hand over the two contexts as separate groups.
    const groups = await (db.measurement.groupBy.mock.results[0]?.value as Promise<
      { context: unknown }[]
    >);
    expect(groups.filter((entry) => jsonbKey(entry.context) !== '{"stage":"1"}')).toHaveLength(1);
  });
});

describe('what never counts', () => {
  it('a superseded value, a value of an archived test, a missing number or another workspace', async () => {
    const world = new World({ payload: HIGHER, value: '50' });
    world.athletes(EIGHT);

    // Each of these would be a ninth athlete ahead of everybody.
    world.value(world.module('ath_superseded'), '99', { supersededById: 'm_newer' });
    world.value(
      world.module('ath_archived', { archivedAt: new Date('2026-01-01T00:00:00.000Z') }),
      '99',
    );
    world.value(world.module('ath_empty'), null);
    world.value(world.module('ath_foreign', { organizationId: 'org_b' }), '99', {
      organizationId: 'org_b',
    });

    const { percentile } = await percentileFor(world);

    expect(percentile).toEqual({ percentile: 63, cohort: 8 });
    expect(percentile).toEqual(percentileOf(50, completeCohort(world, 'higher'), 'higher'));
  });
});

/**
 * The failure the cap produced, reproduced and shown gone.
 *
 * The first 5000 rows by id are filled almost entirely with readings of *other*
 * series of the same test type — which the old read counted against its cap all
 * the same. Behind them sit three athletes the old read never reached, and the
 * best value of a fourth.
 */
describe('a workspace past the old 5000-row cap', () => {
  const build = () => {
    const world = new World({ payload: HIGHER, value: '50' });

    // Early: six athletes, and the weaker of athlete 9's two values.
    const early = ['41', '43', '45', '47', '49', '51'].map((value, index) => {
      const moduleId = world.module(`ath_${String(index + 1)}`);
      world.value(moduleId, value);

      return moduleId;
    });
    const nine = world.module('ath_9');
    world.value(nine, '30');

    // Other series of the same test type: another quantity and another stage,
    // with values that would dominate the series if they leaked into it.
    for (let index = 0; index < 5200; index += 1) {
      const moduleId = early[index % early.length]!;
      world.value(
        moduleId,
        '999',
        index % 2 === 0 ? { measurementTypeId: 'mt_other' } : { passIndex: 2 },
      );
    }

    // Late: athletes 7 and 8, and athlete 9's best.
    world.value(world.module('ath_7'), '53');
    world.value(world.module('ath_8'), '70');
    world.value(nine, '65');

    return world;
  };

  it('is a fixture that actually reproduces the old failure', () => {
    const world = build();
    const moduleById = new Map(world.modules.map((test) => [test.id, test]));

    // Everything the old read's filter admitted, in the order it cut by.
    const admitted = world.rows
      .filter((row) => moduleById.get(row.assessmentModuleId)!.athleteId !== ME)
      .sort((a, b) => a.id.localeCompare(b.id));
    expect(admitted.length).toBeGreaterThan(5000);

    const cut = admitted.slice(0, 5000);
    const lastOfNine = admitted.findIndex((row) => row.numericValue === '65');
    expect(lastOfNine).toBeGreaterThanOrEqual(5000);

    const seenInCut = new Map<string, number>();
    for (const row of cut) {
      if (row.measurementTypeId !== 'mt_grip' || row.passIndex !== null) continue;
      const athlete = moduleById.get(row.assessmentModuleId)!.athleteId;
      seenInCut.set(
        athlete,
        Math.max(seenInCut.get(athlete) ?? -Infinity, Number(row.numericValue)),
      );
    }

    // What the old read would have stated: seven athletes, below the floor.
    expect(seenInCut.size).toBeLessThan(MIN_COHORT);
    expect(percentileOf(50, [...seenInCut.values()], 'higher')).toBeNull();
  });

  it('answers with the complete data', async () => {
    const world = build();

    const { percentile } = await percentileFor(world);
    const expected = percentileOf(50, completeCohort(world, 'higher'), 'higher');

    // Nine athletes: 41 · 43 · 45 · 47 · 49 are behind a 50; 51 · 53 · 70 and
    // athlete 9's late 65 are ahead of it.
    expect(expected).toEqual({ percentile: 56, cohort: 9 });
    expect(percentile).toEqual(expected);
    expect(percentile?.cohort).toBeGreaterThanOrEqual(MIN_COHORT);
  });

  it('is not moved by the thousands of readings of other series', async () => {
    const world = build();
    const quiet = build();
    quiet.rows.splice(
      0,
      quiet.rows.length,
      ...quiet.rows.filter((row) => row.measurementTypeId === 'mt_grip' && row.passIndex === null),
    );

    expect((await percentileFor(world)).percentile).toEqual(
      (await percentileFor(quiet)).percentile,
    );
  });
});

describe('the shape of the cohort read', () => {
  it('asks for groups and tests, once each, uncapped and unordered', async () => {
    const world = new World({ payload: HIGHER, value: '50' });
    world.athletes(EIGHT);

    const { db } = await percentileFor(world);

    expect(db.measurement.groupBy).toHaveBeenCalledTimes(1);
    expect(db.measurement.groupBy.mock.calls[0]?.[0]).toEqual({
      by: ['assessmentModuleId', 'measurementTypeId', 'side', 'exerciseId', 'passIndex', 'context'],
      where: {
        organizationId: 'org_a',
        supersededById: null,
        numericValue: { not: null },
        assessmentModule: {
          moduleKey: { in: ['grip'] },
          archivedAt: null,
          assessment: { case: { athleteId: { not: ME } } },
        },
      },
      _min: { numericValue: true },
      _max: { numericValue: true },
    });

    expect(db.assessmentModule.findMany).toHaveBeenCalledTimes(1);
    expect(db.assessmentModule.findMany.mock.calls[0]?.[0]).toEqual({
      where: {
        organizationId: 'org_a',
        moduleKey: { in: ['grip'] },
        archivedAt: null,
        assessment: { case: { athleteId: { not: ME } } },
      },
      select: {
        id: true,
        payload: true,
        moduleVersion: true,
        assessment: { select: { case: { select: { athleteId: true } } } },
      },
    });

    // This athlete's own readings are the only row read left.
    expect(db.measurement.findMany).toHaveBeenCalledTimes(1);
  });

  it('costs the same reads for nine athletes and thousands of rows as for eight', async () => {
    const small = new World({ payload: HIGHER, value: '50' });
    small.athletes(EIGHT);
    const large = new World({ payload: HIGHER, value: '50' });
    large.athletes([...EIGHT, '58']);
    for (let index = 0; index < 6000; index += 1) large.value('mod_ath_1_1', String(index));

    const calls = async (world: World) => {
      const { db } = await percentileFor(world);

      return (
        db.measurement.findMany.mock.calls.length +
        db.measurement.groupBy.mock.calls.length +
        db.assessmentModule.findMany.mock.calls.length
      );
    };

    expect(await calls(large)).toBe(await calls(small));
  });
});
