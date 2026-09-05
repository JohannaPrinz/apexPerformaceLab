import { describe, expect, it, vi } from 'vitest';

import { derivedValues, refreshDerivedMeasurements } from './derivation';

/**
 * The values a test computes for itself — a body-fat percentage, an energy
 * total.
 *
 * Three guarantees are under test, and the third is the reason this file is
 * separate from the screen that shows the number:
 *
 * 1. Nothing is written until the method has every fold it asks for, and until
 *    the athlete's sex and date of birth are known.
 * 2. What is written is a Measurement like any other — `source: DERIVED`, on
 *    this module, of the configured type — so it reaches the record, the
 *    overview and the diagrams without a second path.
 * 3. **The workspace boundary holds here too.** A derivation reads an athlete's
 *    sex and date of birth, which is exactly the sort of read that must not
 *    cross a tenant. Asserted on the queries, not through the UI.
 */

const TENANT = { organizationId: 'org_a' } as const;
const OTHER = { organizationId: 'org_b' } as const;

const CONFIGURATION = {
  measurementTypes: [
    { measurementTypeId: 'mt_chest', role: 'recommended' },
    { measurementTypeId: 'mt_abdomen', role: 'recommended' },
    { measurementTypeId: 'mt_thigh', role: 'required' },
    { measurementTypeId: 'mt_body_fat', role: 'optional' },
  ],
  exerciseIds: [],
  passes: 1,
  recordsSide: false,
  dimensions: [],
  derivations: [{ measurementTypeId: 'mt_body_fat', method: 'jackson_pollock_3' }],
};

const FOLD_TAKEN_AT = new Date('2026-01-01T09:00:00.000Z');

interface Row {
  id: string;
  measurementTypeId: string;
  numericValue: number | null;
  capturedAt: Date;
  source: string;
  measurementType: { key: string };
}

const fold = (key: string, measurementTypeId: string, value: number): Row => ({
  id: `m_${key}`,
  measurementTypeId,
  numericValue: value,
  capturedAt: FOLD_TAKEN_AT,
  source: 'MANUAL',
  measurementType: { key },
});

/** A male athlete, three folds, everything the three-site method needs. */
const completeSheet = (): Row[] => [
  fold('skinfold_chest', 'mt_chest', 12),
  fold('skinfold_abdomen', 'mt_abdomen', 22),
  fold('skinfold_thigh', 'mt_thigh', 18),
];

function derivationDb(
  rows: Row[],
  options: {
    athlete?: { sex: string; dateOfBirth: Date | null } | undefined;
    moduleFound?: boolean | undefined;
    configuration?: unknown;
  } = {},
) {
  const created: Record<string, unknown>[] = [];
  const updated: Record<string, unknown>[] = [];

  const assessmentModule = {
    findFirst: vi.fn(() =>
      Promise.resolve(
        options.moduleFound === false
          ? null
          : {
              id: 'mod_1',
              payload: options.configuration ?? CONFIGURATION,
              moduleVersion: 2,
              assessment: {
                case: {
                  athlete: options.athlete ?? {
                    sex: 'male',
                    dateOfBirth: new Date('1990-01-01T00:00:00.000Z'),
                  },
                },
              },
            },
      ),
    ),
  };

  const measurement = {
    findMany: vi.fn(() => Promise.resolve(rows)),
    findFirst: vi.fn((args: { where: { id?: string } }) =>
      Promise.resolve(rows.find((row) => row.id === args.where.id) ?? null),
    ),
    create: vi.fn((args: { data: Record<string, unknown> }) => {
      created.push(args.data);

      return Promise.resolve({ id: 'm_derived_new' });
    }),
    updateMany: vi.fn((args: Record<string, unknown>) => {
      updated.push(args);

      return Promise.resolve({ count: 1 });
    }),
  };

  const db = {
    assessmentModule,
    measurement,
    measurementType: {},
    $transaction: vi.fn((run: (tx: unknown) => Promise<unknown>) => run({ measurement })),
  } as unknown as Parameters<typeof derivedValues>[0];

  return { db, assessmentModule, measurement, created, updated };
}

const argsOf = (spy: { mock: { calls: unknown[][] } }) =>
  (spy.mock.calls[0]?.[0] ?? {}) as { where?: Record<string, unknown> };

describe('what the calculation waits for', () => {
  it('writes nothing while a fold is missing', async () => {
    const { db, created } = derivationDb([
      fold('skinfold_chest', 'mt_chest', 12),
      fold('skinfold_thigh', 'mt_thigh', 18),
    ]);

    await refreshDerivedMeasurements(db, TENANT, 'mod_1');

    expect(created).toEqual([]);
  });

  it('names the fold it is waiting for', async () => {
    const { db } = derivationDb([fold('skinfold_chest', 'mt_chest', 12)]);

    const [state] = await derivedValues(db, TENANT, 'mod_1');

    expect(state?.outcome).toEqual({
      ok: false,
      refusal: { reason: 'SITES_MISSING', missing: ['skinfold_abdomen', 'skinfold_thigh'] },
    });
  });

  it('writes nothing for an athlete whose sex is unstated', async () => {
    // Both equations are fitted by sex; picking one would invent a method.
    const { db, created } = derivationDb(completeSheet(), {
      athlete: { sex: 'not_specified', dateOfBirth: new Date('1990-01-01T00:00:00.000Z') },
    });

    await refreshDerivedMeasurements(db, TENANT, 'mod_1');

    expect(created).toEqual([]);
  });

  it('says so rather than falling silent', async () => {
    const { db } = derivationDb(completeSheet(), {
      athlete: { sex: 'not_specified', dateOfBirth: new Date('1990-01-01T00:00:00.000Z') },
    });

    const [state] = await derivedValues(db, TENANT, 'mod_1');

    expect(state?.outcome).toEqual({ ok: false, refusal: { reason: 'SEX_NOT_SPECIFIED' } });
  });

  it('writes nothing without a date of birth', async () => {
    const { db, created } = derivationDb(completeSheet(), {
      athlete: { sex: 'male', dateOfBirth: null },
    });

    await refreshDerivedMeasurements(db, TENANT, 'mod_1');

    expect(created).toEqual([]);
  });

  it('does nothing at all for a test that computes nothing', async () => {
    const { db, measurement } = derivationDb(completeSheet(), {
      configuration: { ...CONFIGURATION, derivations: [] },
    });

    await refreshDerivedMeasurements(db, TENANT, 'mod_1');

    expect(measurement.findMany).not.toHaveBeenCalled();
  });
});

describe('what it writes once the sheet is complete', () => {
  it('records the percentage as a measurement of the configured type', async () => {
    const { db, created } = derivationDb(completeSheet());

    await refreshDerivedMeasurements(db, TENANT, 'mod_1');

    expect(created[0]).toMatchObject({
      assessmentModuleId: 'mod_1',
      measurementTypeId: 'mt_body_fat',
      organizationId: 'org_a',
      source: 'DERIVED',
    });
  });

  it('computes the value the domain computes, and nothing of its own', async () => {
    // Sum 52, age 36 on the day of the folds; the arithmetic itself is pinned
    // in the domain package against the published equation.
    const { db, created } = derivationDb(completeSheet());

    await refreshDerivedMeasurements(db, TENANT, 'mod_1');
    const [state] = await derivedValues(db, TENANT, 'mod_1');

    expect(state?.outcome.ok && created[0]?.['numericValue']).toBe(
      state?.outcome.ok ? state.outcome.value : null,
    );
  });

  it('dates the value the day the folds were taken', async () => {
    // Not today: recalculating an old test must reproduce its own number.
    const { db, created } = derivationDb(completeSheet());

    await refreshDerivedMeasurements(db, TENANT, 'mod_1');

    expect(created[0]?.['capturedAt']).toEqual(FOLD_TAKEN_AT);
  });

  it('says in the note what the number was computed from', async () => {
    const { db, created } = derivationDb(completeSheet());

    await refreshDerivedMeasurements(db, TENANT, 'mod_1');

    expect(created[0]?.['note']).toContain('Jackson & Pollock, 3 Punkte');
    expect(created[0]?.['note']).toContain('52 mm');
    expect(created[0]?.['note']).toContain('36');
  });

  it('reads the age on the day of the folds, not today', async () => {
    const { db } = derivationDb(completeSheet());

    const [state] = await derivedValues(db, TENANT, 'mod_1');

    // Stated in the line the screen shows beside the value — the age is one of
    // the two inputs a coach cannot read off the folds.
    expect(state?.outcome.ok && state.outcome.inputs).toContain('Alter 36');
  });
});

describe('recomputing', () => {
  const derived = (value: number): Row => ({
    id: 'm_derived',
    measurementTypeId: 'mt_body_fat',
    numericValue: value,
    capturedAt: FOLD_TAKEN_AT,
    source: 'DERIVED',
    measurementType: { key: 'body_fat' },
  });

  it('leaves an unchanged percentage exactly as it is', async () => {
    // Saving a stage twice must not fill the record with a chain of identical
    // numbers.
    const { db } = derivationDb(completeSheet());
    const [first] = await derivedValues(db, TENANT, 'mod_1');
    const value = first?.outcome.ok ? first.outcome.value : 0;

    const second = derivationDb([...completeSheet(), derived(value)]);
    await refreshDerivedMeasurements(second.db, TENANT, 'mod_1');

    expect(second.created).toEqual([]);
    expect(second.updated).toEqual([]);
  });

  it('supersedes a percentage that no longer follows from the folds', async () => {
    // §13: a measurement is never edited. The old number stays readable as
    // history, which is what an audit of a health record needs.
    const { db, created, updated } = derivationDb([...completeSheet(), derived(99)]);

    await refreshDerivedMeasurements(db, TENANT, 'mod_1');

    expect(created).toHaveLength(1);
    expect(updated[0]).toMatchObject({
      where: { id: 'm_derived', supersededById: null, organizationId: 'org_a' },
      data: { supersededById: 'm_derived_new' },
    });
  });

  it('erases nothing when the athlete profile stops supporting the method', async () => {
    // A percentage already in the record was computed from what stood at the
    // time. An unstated sex today is a reason not to produce a new number, not
    // a licence to delete a finding.
    const { db, created, updated } = derivationDb([...completeSheet(), derived(17.3)], {
      athlete: { sex: 'not_specified', dateOfBirth: null },
    });

    await refreshDerivedMeasurements(db, TENANT, 'mod_1');

    expect(created).toEqual([]);
    expect(updated).toEqual([]);
  });

  it('reports the stored value and the refusal side by side', async () => {
    // The screen shows both: a refusal must not hide a finding that is in the
    // record.
    const { db } = derivationDb([...completeSheet(), derived(17.3)], {
      athlete: { sex: 'not_specified', dateOfBirth: null },
    });

    const [state] = await derivedValues(db, TENANT, 'mod_1');

    expect(state?.measurementId).toBe('m_derived');
    expect(state?.storedValue).toBe(17.3);
    expect(state?.outcome.ok).toBe(false);
  });

  it('reports no stored value where nothing was ever computed', async () => {
    const { db } = derivationDb(completeSheet());

    const [state] = await derivedValues(db, TENANT, 'mod_1');

    expect(state?.storedValue).toBeNull();
  });
});

/**
 * A day's food, through the same mechanism.
 *
 * The point of these is not the arithmetic — that is pinned in the domain
 * package against the published factors — but that a second derived quantity
 * acquires no second set of rules: the same refusal-before-writing, the same
 * `DERIVED` measurement, the same note naming what the equation consumed.
 */
describe('the energy total of a nutrition test', () => {
  const NUTRITION = {
    measurementTypes: [
      { measurementTypeId: 'mt_protein', role: 'required' },
      { measurementTypeId: 'mt_carbs', role: 'required' },
      { measurementTypeId: 'mt_fat', role: 'required' },
      { measurementTypeId: 'mt_energy', role: 'optional' },
    ],
    exerciseIds: [],
    passes: 1,
    recordsSide: false,
    dimensions: [],
    derivations: [{ measurementTypeId: 'mt_energy', method: 'atwater_energy' }],
  };

  const day = (): Row[] => [
    fold('protein', 'mt_protein', 150),
    fold('carbohydrates', 'mt_carbs', 300),
    fold('fat', 'mt_fat', 80),
  ];

  const nutritionDb = (rows: Row[]) => derivationDb(rows, { configuration: NUTRITION });

  it('writes the total once all three macronutrients stand', async () => {
    const { db, created } = nutritionDb(day());

    await refreshDerivedMeasurements(db, TENANT, 'mod_1');

    expect(created).toHaveLength(1);
    expect(created[0]?.['numericValue']).toBe(2520);
    expect(created[0]?.['source']).toBe('DERIVED');
    expect(created[0]?.['assessmentModuleId']).toBe('mod_1');
  });

  it('writes nothing while one of the three is missing', async () => {
    const { db, created } = nutritionDb([
      fold('protein', 'mt_protein', 150),
      fold('carbohydrates', 'mt_carbs', 300),
    ]);

    await refreshDerivedMeasurements(db, TENANT, 'mod_1');

    expect(created).toEqual([]);
  });

  it('names the macronutrient it is waiting for', async () => {
    const { db } = nutritionDb([fold('protein', 'mt_protein', 150)]);

    const [state] = await derivedValues(db, TENANT, 'mod_1');

    expect(state?.outcome.ok).toBe(false);
    expect(state?.outcome.ok === false && state.outcome.refusal.missing).toEqual([
      'carbohydrates',
      'fat',
    ]);
  });

  it('needs neither a sex nor a date of birth', async () => {
    // Unlike a skinfold method — and the reason the branch exists rather than
    // one calculation with optional inputs.
    const { db, created } = derivationDb(day(), {
      configuration: NUTRITION,
      athlete: { sex: 'not_specified', dateOfBirth: null },
    });

    await refreshDerivedMeasurements(db, TENANT, 'mod_1');

    expect(created).toHaveLength(1);
  });

  it('says in the note which factors produced the number', async () => {
    const { db, created } = nutritionDb(day());

    await refreshDerivedMeasurements(db, TENANT, 'mod_1');

    const note = String(created[0]?.['note']);
    expect(note).toContain('Atwater');
    expect(note).toContain('Eiweiß 150 g × 4');
    expect(note).toContain('Fette 80 g × 9');
  });

  it('leaves fibre and fluid out of the total', async () => {
    // Both are optional, so counting them would make the same three-macro day
    // come out at two different energies depending on an unrelated field.
    const { db, created } = nutritionDb([
      ...day(),
      fold('fibre', 'mt_fibre', 40),
      fold('fluid_intake', 'mt_fluid', 3),
    ]);

    await refreshDerivedMeasurements(db, TENANT, 'mod_1');

    expect(created[0]?.['numericValue']).toBe(2520);
  });
});

/**
 * A derivation reads an athlete's sex and date of birth. That read must not
 * cross a workspace, and the guarantee is asserted where it lives — on the
 * queries, never through a mocked screen.
 */
describe('the workspace boundary', () => {
  it('scopes the module read', async () => {
    const { db, assessmentModule } = derivationDb(completeSheet());

    await derivedValues(db, OTHER, 'mod_1');

    expect(argsOf(assessmentModule.findFirst).where).toMatchObject({ organizationId: 'org_b' });
  });

  it('scopes the read of the folds', async () => {
    const { db, measurement } = derivationDb(completeSheet());

    await derivedValues(db, OTHER, 'mod_1');

    expect(argsOf(measurement.findMany).where).toMatchObject({
      organizationId: 'org_b',
      assessmentModuleId: 'mod_1',
      supersededById: null,
    });
  });

  it('writes the value into the workspace it was read from', async () => {
    const { db, created } = derivationDb(completeSheet());

    await refreshDerivedMeasurements(db, OTHER, 'mod_1');

    expect(created[0]).toMatchObject({ organizationId: 'org_b' });
  });

  it('computes nothing for a test in another workspace', async () => {
    const { db, measurement } = derivationDb(completeSheet(), { moduleFound: false });

    expect(await derivedValues(db, OTHER, 'mod_1')).toEqual([]);
    expect(measurement.findMany).not.toHaveBeenCalled();
  });

  it('supersedes only within the workspace', async () => {
    const { db, updated } = derivationDb([
      ...completeSheet(),
      {
        id: 'm_derived',
        measurementTypeId: 'mt_body_fat',
        numericValue: 99,
        capturedAt: FOLD_TAKEN_AT,
        source: 'DERIVED',
        measurementType: { key: 'body_fat' },
      },
    ]);

    await refreshDerivedMeasurements(db, OTHER, 'mod_1');

    expect(updated[0]).toMatchObject({ where: { organizationId: 'org_b' } });
  });
});
