import { describe, expect, it, vi } from 'vitest';

import { measurementChart, moduleWorkspace, recordMeasurements } from './service';

/**
 * Saving a whole stage at once.
 *
 * The guarantee under test is the one the single-value path could not give: a
 * stage with one bad value stores **nothing**. Before this existed, a screen
 * saving five fields made five calls, and a failure on the third left two rows
 * behind with no record of the intent.
 *
 * No database. The service takes `db` as an argument precisely so the calls it
 * makes can be inspected — which is where the guarantee lives.
 */

const TENANT = { organizationId: 'org_a' };
const OTHER_TENANT = { organizationId: 'org_b' };

const CONFIGURATION = {
  measurementTypes: [
    { measurementTypeId: 'mt_lactate', role: 'required' as const },
    { measurementTypeId: 'mt_hr', role: 'required' as const },
  ],
  exerciseIds: [],
  passes: 4,
  recordsSide: false,
  dimensions: [],
};

interface QueryArgs {
  where?: Record<string, unknown>;
  data?: Record<string, unknown>;
  orderBy?: unknown;
}

/** The arguments a mocked query was called with. */
const argsOf = (fn: { mock: { calls: [QueryArgs][] } }): QueryArgs => fn.mock.calls[0]?.[0] ?? {};

function fakeDb(over: { valueType?: string; moduleFound?: boolean } = {}) {
  let written = 0;
  const measurement = {
    create: vi.fn<(args: QueryArgs) => Promise<unknown>>().mockImplementation(() => {
      written += 1;

      return Promise.resolve({ id: `m_${String(written)}` });
    }),
  };

  const assessmentModule = {
    findFirst: vi.fn<(args: QueryArgs) => Promise<unknown>>().mockResolvedValue(
      over.moduleFound === false
        ? null
        : {
            id: 'mod_1',
            moduleVersion: 2,
            payload: CONFIGURATION,
            organizationId: 'org_a',
          },
    ),
  };

  const measurementType = {
    findFirst: vi
      .fn<(args: QueryArgs) => Promise<unknown>>()
      .mockResolvedValue({ valueType: over.valueType ?? 'NUMERIC' }),
  };

  const store = {
    measurement,
    assessmentModule,
    measurementType,
    exercise: { findMany: vi.fn<() => Promise<unknown[]>>().mockResolvedValue([]) },
    // The callback runs against the same store: what is modelled here is that
    // the writes happen together, not Postgres' rollback.
    $transaction: <T>(run: (tx: unknown) => Promise<T>): Promise<T> => run(store),
  };

  const db = store as unknown as Parameters<typeof recordMeasurements>[0];

  return { db, measurement, assessmentModule, measurementType };
}

const value = (measurementTypeId: string, raw: number, passIndex = 1) => ({
  moduleId: 'mod_1',
  measurementTypeId,
  value: raw,
  side: 'BILATERAL' as const,
  passIndex,
  source: 'MANUAL' as const,
});

describe('recording a whole stage', () => {
  it('writes every value of the stage', async () => {
    const { db, measurement } = fakeDb();

    const result = await recordMeasurements(db, TENANT, [
      value('mt_lactate', 2.4),
      value('mt_hr', 148),
    ]);

    expect(result.ok).toBe(true);
    expect(measurement.create).toHaveBeenCalledTimes(2);
  });

  it('stamps the workspace onto every row', async () => {
    const { db, measurement } = fakeDb();

    await recordMeasurements(db, TENANT, [value('mt_lactate', 2.4), value('mt_hr', 148)]);

    for (const call of measurement.create.mock.calls) {
      expect(call[0].data).toMatchObject({ organizationId: 'org_a' });
    }
  });

  it('writes nothing at all when one value is wrong', async () => {
    // The point of the batch. A stage is saved whole or not at all, so the
    // coach never has to work out which half went in.
    const { db, measurement } = fakeDb();

    const result = await recordMeasurements(db, TENANT, [
      value('mt_lactate', 2.4),
      value('mt_not_configured', 148),
    ]);

    expect(result.ok).toBe(false);
    expect(measurement.create).not.toHaveBeenCalled();
  });

  it('says which entry failed and why', async () => {
    const { db } = fakeDb();

    const result = await recordMeasurements(db, TENANT, [
      value('mt_lactate', 2.4),
      value('mt_not_configured', 148),
    ]);

    expect(result.ok ? [] : result.failures).toEqual([
      { index: 1, failure: { reason: 'TYPE_NOT_CONFIGURED' } },
    ]);
  });

  it('reports every problem at once, not one save at a time', async () => {
    const { db } = fakeDb();

    const result = await recordMeasurements(db, TENANT, [
      value('mt_wrong_a', 1),
      value('mt_wrong_b', 2),
    ]);

    expect(result.ok ? [] : result.failures.map((entry) => entry.index)).toEqual([0, 1]);
  });

  it('refuses a stage beyond the configured number of passes', async () => {
    // `passes: 4`, so stage five does not exist.
    const { db, measurement } = fakeDb();

    const result = await recordMeasurements(db, TENANT, [value('mt_lactate', 2.4, 9)]);

    expect(result.ok).toBe(false);
    expect(result.ok ? null : result.failures[0]?.failure.reason).toBe('PASS_INVALID');
    expect(measurement.create).not.toHaveBeenCalled();
  });

  it('refuses a value whose type does not match the column', async () => {
    const { db, measurement } = fakeDb({ valueType: 'BOOLEAN' });

    const result = await recordMeasurements(db, TENANT, [value('mt_lactate', 2.4)]);

    expect(result.ok ? null : result.failures[0]?.failure.reason).toBe('VALUE_TYPE_MISMATCH');
    expect(measurement.create).not.toHaveBeenCalled();
  });

  it('never reaches a module outside the workspace', async () => {
    // The module lookup is tenant-scoped; a module belonging to another
    // workspace is indistinguishable from one that does not exist.
    const { db, assessmentModule } = fakeDb();

    await recordMeasurements(db, OTHER_TENANT, [value('mt_lactate', 2.4)]);

    expect(assessmentModule.findFirst.mock.calls[0]?.[0].where).toMatchObject({
      organizationId: 'org_b',
    });
  });

  it('reads measurement types as this workspace or system-wide, never another', async () => {
    const { db, measurementType } = fakeDb();

    await recordMeasurements(db, TENANT, [value('mt_lactate', 2.4)]);

    expect(measurementType.findFirst.mock.calls[0]?.[0].where).toMatchObject({
      OR: [{ organizationId: 'org_a' }, { organizationId: null }],
    });
  });

  it('refuses everything when the module is not reachable', async () => {
    const { db, measurement } = fakeDb({ moduleFound: false });

    const result = await recordMeasurements(db, TENANT, [value('mt_lactate', 2.4)]);

    expect(result.ok ? null : result.failures[0]?.failure.reason).toBe('MODULE_NOT_FOUND');
    expect(measurement.create).not.toHaveBeenCalled();
  });

  it('does nothing for an empty stage rather than opening a transaction', async () => {
    // A skipped stage sends no values at all; that is not an error.
    const { db, measurement } = fakeDb();

    const result = await recordMeasurements(db, TENANT, []);

    expect(result).toEqual({ ok: true, measurements: [] });
    expect(measurement.create).not.toHaveBeenCalled();
  });
});

/**
 * What crosses into the browser.
 *
 * `numericValue` is a Prisma `Decimal` — a class instance, because the column is
 * `Decimal(12,4)` and a float would lose precision. Handing one to a Client
 * Component made React warn on every row and is not something that survives the
 * crossing intact. The real run found it; typecheck could not, because the
 * field is typed `unknown` on both sides.
 */
describe('handing measurements to the browser', () => {
  const decimal = { toString: () => '2.4000', constructor: { name: 'Decimal' } };

  function workspaceDb() {
    const row = {
      id: 'meas_1',
      measurementTypeId: 'mt_lactate',
      side: 'BILATERAL',
      exerciseId: null,
      numericValue: decimal,
      textValue: null,
      booleanValue: null,
      passIndex: 1,
      context: {},
      capturedAt: new Date(),
      ingestedAt: new Date(),
      source: 'MANUAL',
      supersededById: null,
      supersedes: null,
      assessmentModuleId: 'mod_1',
      note: null,
    };

    return {
      db: {
        assessmentModule: {
          findFirst: vi.fn().mockResolvedValue({
            id: 'mod_1',
            moduleKey: 'lactate',
            name: 'Laufen – Laktat',
            moduleVersion: 2,
            status: 'IN_PROGRESS',
            payload: CONFIGURATION,
            createdByCoachId: 'coach_1',
            assessmentId: 'as_1',
            assessment: {
              id: 'as_1',
              question: 'Wo liegt die Schwelle?',
              case: { athleteId: 'ath_1' },
            },
          }),
          findMany: vi.fn().mockResolvedValue([]),
        },
        measurement: { findMany: vi.fn().mockResolvedValue([row]) },
        note: { findMany: vi.fn().mockResolvedValue([]) },
        exercise: { findMany: vi.fn().mockResolvedValue([]) },
        measurementType: { findMany: vi.fn().mockResolvedValue([]) },
      } as unknown as Parameters<typeof moduleWorkspace>[0],
    };
  }

  it('turns a Decimal into a plain string', async () => {
    const { db } = workspaceDb();

    const workspace = await moduleWorkspace(db, TENANT, 'mod_1');

    expect(typeof workspace?.measurements[0]?.numericValue).toBe('string');
  });

  it('keeps the precision the column exists to hold', async () => {
    // A number, not a string, would defeat the point of the Decimal.
    const { db } = workspaceDb();

    const workspace = await moduleWorkspace(db, TENANT, 'mod_1');

    expect(workspace?.measurements[0]?.numericValue).toBe('2.4000');
  });

  it('reads the sibling tests, so finishing one is not a dead end', async () => {
    const { db } = workspaceDb();

    const workspace = await moduleWorkspace(db, TENANT, 'mod_1');

    expect(workspace?.siblings).toEqual([]);
  });
});

/**
 * What counts as the same value over time.
 *
 * The whole point of this function is refusing to put two readings on one line
 * unless every coordinate matches. Each case below is one coordinate being
 * different, and each expects a **separate series** rather than a comparison —
 * an honest set beats a wrong guess (§11).
 *
 * No database. The service takes `db` as an argument precisely so the calls and
 * the grouping can be inspected.
 */

const HISTORY_TENANT = { organizationId: 'org_a' };
const HISTORY_OTHER = { organizationId: 'org_b' };

interface HistoryRow {
  id: string;
  measurementTypeId: string;
  side: string;
  exerciseId: string | null;
  passIndex: number | null;
  context: unknown;
  numericValue: unknown;
  textValue: string | null;
  booleanValue: boolean | null;
  capturedAt: Date;
  assessmentModule: {
    id: string;
    name: string | null;
    status: string;
    assessmentId: string;
    assessment: { question: string };
  };
  measurementType: { name: string; unit: string; valueType: string };
}

const point = (over: Partial<HistoryRow> & { id: string }): HistoryRow => ({
  measurementTypeId: 'mt_lactate',
  side: 'BILATERAL',
  exerciseId: null,
  passIndex: 1,
  context: {},
  numericValue: 2,
  textValue: null,
  booleanValue: null,
  capturedAt: new Date('2026-01-01T10:00:00Z'),
  assessmentModule: {
    id: 'mod_1',
    name: 'Laufen – Laktat',
    status: 'COMPLETED',
    assessmentId: 'as_1',
    assessment: { question: 'Wo liegt die Schwelle?' },
  },
  measurementType: { name: 'Laktat', unit: 'mmol/L', valueType: 'NUMERIC' },
  ...over,
});

/** A module in another assessment, so a delta is allowed to be computed. */
const laterModule = (assessmentId: string, over: Partial<HistoryRow['assessmentModule']> = {}) => ({
  id: `mod_${assessmentId}`,
  name: 'Laufen – Laktat',
  status: 'COMPLETED',
  assessmentId,
  assessment: { question: 'Wo liegt die Schwelle?' },
  ...over,
});

function historyDb(rows: HistoryRow[], over: { moduleFound?: boolean } = {}) {
  const assessmentModule = {
    findFirst: vi.fn<(args: QueryArgs) => Promise<unknown>>().mockResolvedValue(
      over.moduleFound === false
        ? null
        : {
            id: 'mod_1',
            moduleKey: 'lactate',
            assessment: { case: { athleteId: 'ath_1' } },
          },
    ),
  };

  const measurement = {
    findMany: vi.fn<(args: QueryArgs) => Promise<unknown[]>>().mockResolvedValue(rows),
  };

  const exercise = {
    findMany: vi
      .fn<(args: QueryArgs) => Promise<unknown[]>>()
      .mockResolvedValue([{ id: 'ex_1', name: 'Dauerlauf' }]),
  };

  const db = { assessmentModule, measurement, exercise } as unknown as Parameters<
    typeof measurementChart
  >[0];

  return { db, assessmentModule, measurement, exercise };
}

/**
 * The stages of a test as curves.
 *
 * The rule these guard is that the stage number is a *position*, not a demand.
 * A load axis is offered only where every point of every curve can be placed on
 * it — half a curve on a load axis and half on nothing is not a comparison, and
 * the model marks no quantity as "the load", so nothing here may pick one.
 */
describe('drawing the stages of a test', () => {
  const chartFor = async (rows: HistoryRow[]) =>
    (await measurementChart(historyDb(rows).db, HISTORY_TENANT, 'mod_1')) ?? [];

  /** Two stages of one test, plus the pace recorded alongside each. */
  const stage = (
    moduleId: string,
    assessmentId: string,
    passIndex: number,
    lactate: number,
    pace: number | null,
    /** Anything about the test itself the case under test cares about. */
    over: { status?: string; name?: string } = {},
  ): HistoryRow[] => {
    const test = laterModule(assessmentId, {
      id: moduleId,
      name: `Test ${moduleId}`,
      ...over,
    });
    const rows: HistoryRow[] = [
      point({
        id: `${moduleId}-l${String(passIndex)}`,
        passIndex,
        numericValue: lactate,
        assessmentModule: test,
      }),
    ];

    if (pace !== null) {
      rows.push(
        point({
          id: `${moduleId}-p${String(passIndex)}`,
          passIndex,
          measurementTypeId: 'mt_pace',
          numericValue: pace,
          assessmentModule: test,
          measurementType: { name: 'Pace', unit: 'km/h', valueType: 'NUMERIC' },
        }),
      );
    }

    return rows;
  };

  it('joins the stages of one test into a single curve', async () => {
    const charts = await chartFor([
      ...stage('mod_1', 'as_1', 1, 1.8, 10),
      ...stage('mod_1', 'as_1', 2, 2.6, 11),
    ]);

    const lactate = charts.find((chart) => chart.typeName === 'Laktat');

    expect(lactate?.series).toHaveLength(1);
    expect(lactate?.series[0]?.points.map((p) => p.y)).toEqual([1.8, 2.6]);
  });

  it('gives two tests of one type two curves, never one', async () => {
    // §11: no average, and no line through points of different tests.
    const charts = await chartFor([
      ...stage('mod_1', 'as_1', 1, 1.8, 10),
      ...stage('mod_1', 'as_1', 2, 2.6, 11),
      ...stage('mod_2', 'as_2', 1, 1.5, 10),
      ...stage('mod_2', 'as_2', 2, 2.3, 11),
    ]);

    const lactate = charts.find((chart) => chart.typeName === 'Laktat');

    expect(lactate?.series).toHaveLength(2);
    expect(lactate?.series.map((s) => s.points.length)).toEqual([2, 2]);
  });

  it('carries the load recorded at each stage, so equal demand meets equal demand', async () => {
    const charts = await chartFor([
      ...stage('mod_1', 'as_1', 1, 1.8, 10),
      ...stage('mod_1', 'as_1', 2, 2.6, 12),
      ...stage('mod_2', 'as_2', 1, 1.5, 10),
      ...stage('mod_2', 'as_2', 2, 2.3, 12),
    ]);

    const lactate = charts.find((chart) => chart.typeName === 'Laktat');
    const loads = lactate?.series.map((s) => s.points.map((p) => p.loads['mt_pace']));

    expect(loads).toEqual([
      [10, 12],
      [10, 12],
    ]);
  });

  it('does not pretend two differently loaded stages are the same point', async () => {
    // Stage 2 at 12 km/h and stage 2 at 11 km/h share a position and nothing
    // else. The load travels with the point; the axis does the rest.
    const charts = await chartFor([
      ...stage('mod_1', 'as_1', 2, 2.6, 12),
      ...stage('mod_1', 'as_1', 1, 1.8, 10),
      ...stage('mod_2', 'as_2', 2, 2.3, 11),
      ...stage('mod_2', 'as_2', 1, 1.5, 10),
    ]);

    const lactate = charts.find((chart) => chart.typeName === 'Laktat');
    const second = lactate?.series.map((s) => s.points[1]?.loads['mt_pace']);

    expect(second).toEqual([12, 11]);
  });

  it('offers no load axis where a stage did not record one', async () => {
    // Half a curve on a load axis is not a comparison. Without it the stage
    // sequence is all there is, and the screen has to say so.
    const charts = await chartFor([
      ...stage('mod_1', 'as_1', 1, 1.8, 10),
      ...stage('mod_1', 'as_1', 2, 2.6, null),
    ]);

    const lactate = charts.find((chart) => chart.typeName === 'Laktat');

    expect(lactate?.loadCandidates).toEqual([]);
    expect(lactate?.series[0]?.points.map((p) => p.passIndex)).toEqual([1, 2]);
  });

  it('keeps two quantities in two diagrams', async () => {
    const charts = await chartFor([
      ...stage('mod_1', 'as_1', 1, 1.8, 10),
      ...stage('mod_1', 'as_1', 2, 2.6, 11),
    ]);

    expect(charts.map((chart) => chart.typeName).sort()).toEqual(['Laktat', 'Pace']);
  });

  it('draws nothing for a test with a single stage', async () => {
    // One reading is not a curve, and the table above already states it.
    const charts = await chartFor([...stage('mod_1', 'as_1', 1, 1.8, 10)]);

    expect(charts).toEqual([]);
  });

  it('marks which curve is the test being looked at', async () => {
    const charts = await chartFor([
      ...stage('mod_old', 'as_0', 1, 1.8, 10),
      ...stage('mod_old', 'as_0', 2, 2.6, 11),
      ...stage('mod_1', 'as_1', 1, 1.5, 10),
      ...stage('mod_1', 'as_1', 2, 2.3, 11),
    ]);

    const lactate = charts.find((chart) => chart.typeName === 'Laktat');

    expect(lactate?.series.map((s) => [s.moduleId, s.isCurrentModule])).toEqual([
      ['mod_old', false],
      ['mod_1', true],
    ]);
  });

  it('reads the same measurements the table does', async () => {
    // One loader for both, so the diagram cannot show a value the table hides.
    const { db, measurement } = historyDb([]);

    await measurementChart(db, HISTORY_TENANT, 'mod_1');

    expect(argsOf(measurement.findMany).where).toMatchObject({
      organizationId: 'org_a',
      supersededById: null,
      assessmentModule: {
        archivedAt: null,
        moduleKey: 'lactate',
        assessment: { case: { athleteId: 'ath_1' } },
      },
    });
  });

  it('reports a test outside the workspace as missing', async () => {
    const { db } = historyDb([], { moduleFound: false });

    expect(await measurementChart(db, HISTORY_OTHER, 'mod_1')).toBeNull();
  });

  it('never reaches outside the workspace, on either read', async () => {
    // Both queries are scoped, not just the one that returns the values: an
    // unscoped module lookup would already have told the caller a test exists.
    const { db, measurement, assessmentModule } = historyDb([]);

    await measurementChart(db, HISTORY_OTHER, 'mod_1');

    expect(argsOf(assessmentModule.findFirst).where).toMatchObject({ organizationId: 'org_b' });
    expect(argsOf(measurement.findMany).where).toMatchObject({ organizationId: 'org_b' });
  });

  it('draws nothing for a test nobody has recorded anything for', async () => {
    // A planned test drops out by having no rows — no special case needed, and
    // no second query for exercise names either.
    const { db, exercise } = historyDb([]);

    expect(await measurementChart(db, HISTORY_TENANT, 'mod_1')).toEqual([]);
    expect(exercise.findMany).not.toHaveBeenCalled();
  });

  it('includes an aborted test that holds values, and says so', async () => {
    // The schema is explicit that an aborted test may hold enough to be useful.
    // Drawn with its status, never weighed.
    const charts = await chartFor([
      ...stage('mod_ab', 'as_2', 1, 1.4, 10, { status: 'ABORTED', name: 'Laufen – Abbruch' }),
      ...stage('mod_ab', 'as_2', 2, 2.2, 11, { status: 'ABORTED', name: 'Laufen – Abbruch' }),
    ]);

    const lactate = charts.find((chart) => chart.typeName === 'Laktat');

    expect(lactate?.series.map((entry) => [entry.moduleStatus, entry.moduleName])).toContainEqual([
      'ABORTED',
      'Laufen – Abbruch',
    ]);
  });

  it('leaves a non-numeric quantity out of the diagrams', async () => {
    const charts = await chartFor([
      point({
        id: 'm1',
        passIndex: 1,
        numericValue: null,
        textValue: 'auffällig',
        measurementType: { name: 'Bewegungsqualität', unit: '', valueType: 'TEXT' },
      }),
      point({
        id: 'm2',
        passIndex: 2,
        numericValue: null,
        textValue: 'unauffällig',
        measurementType: { name: 'Bewegungsqualität', unit: '', valueType: 'TEXT' },
      }),
    ]);

    expect(charts).toEqual([]);
  });
});

/**
 * The axis a step test opens on.
 *
 * A protocol may name the quantity that says what a stage demanded. Where it
 * does, the diagram starts there rather than on the stage number — but only
 * where every point can actually be placed on it.
 */
describe('the load the protocol declares', () => {
  const stageRows = (loadTypeId: string | undefined, withPace: boolean): HistoryRow[] => {
    const payload = {
      measurementTypes: [
        { measurementTypeId: 'mt_lactate', role: 'required' },
        { measurementTypeId: 'mt_pace', role: 'required' },
      ],
      exerciseIds: [],
      passes: 2,
      recordsSide: false,
      dimensions: [],
      ...(loadTypeId === undefined ? {} : { loadMeasurementTypeId: loadTypeId }),
    };
    const test = {
      id: 'mod_1',
      name: 'Laufen – Laktat',
      status: 'COMPLETED',
      assessmentId: 'as_1',
      payload,
      moduleVersion: 2,
      assessment: { question: 'Wo liegt die Schwelle?' },
    };

    const rows: HistoryRow[] = [];
    for (const [index, pass] of [1, 2].entries()) {
      rows.push(
        point({
          id: `l${String(pass)}`,
          passIndex: pass,
          numericValue: 2 + index,
          assessmentModule: test,
        }),
      );
      if (withPace || pass === 1) {
        rows.push(
          point({
            id: `p${String(pass)}`,
            passIndex: pass,
            measurementTypeId: 'mt_pace',
            numericValue: 10 + index,
            assessmentModule: test,
            measurementType: { name: 'Pace', unit: 'km/h', valueType: 'NUMERIC' },
          }),
        );
      }
    }

    return rows;
  };

  it('starts the diagram on the quantity the protocol names', async () => {
    const { db } = historyDb(stageRows('mt_pace', true));

    const charts = (await measurementChart(db, HISTORY_TENANT, 'mod_1')) ?? [];

    expect(charts.find((chart) => chart.typeName === 'Laktat')?.defaultLoadId).toBe('mt_pace');
  });

  it('names none where the protocol names none', async () => {
    const { db } = historyDb(stageRows(undefined, true));

    const charts = (await measurementChart(db, HISTORY_TENANT, 'mod_1')) ?? [];

    expect(charts.find((chart) => chart.typeName === 'Laktat')?.defaultLoadId).toBeNull();
  });

  it('refuses a declared load that not every stage recorded', async () => {
    // Half a curve on a load axis and half on nothing is not a comparison.
    const { db } = historyDb(stageRows('mt_pace', false));

    const charts = (await measurementChart(db, HISTORY_TENANT, 'mod_1')) ?? [];

    expect(charts.find((chart) => chart.typeName === 'Laktat')?.defaultLoadId).toBeNull();
  });
});
