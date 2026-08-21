import { describe, expect, it, vi } from 'vitest';

import { moduleWorkspace, recordMeasurements } from './service';

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
}

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
