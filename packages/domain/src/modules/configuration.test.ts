import { describe, expect, it } from 'vitest';

import {
  countedMeasurements,
  expectedMeasurementCount,
  measurementsWithRole,
  measurementTypeIdsOf,
  moduleConfigurationSchema,
  readModuleConfiguration,
  type ModuleConfiguration,
} from './configuration';

const base = { measurementTypes: [{ measurementTypeId: 'mt_1' }] };

describe('module configuration', () => {
  it('requires at least one measurement — otherwise there is no test', () => {
    expect(moduleConfigurationSchema.safeParse({ measurementTypes: [] }).success).toBe(false);
  });

  it('defaults to a single pass, which is the ordinary case', () => {
    expect(moduleConfigurationSchema.parse(base).passes).toBe(1);
  });

  it('records no side, no exercise and no extra dimension unless asked', () => {
    const parsed = moduleConfigurationSchema.parse(base);

    expect(parsed.recordsSide).toBe(false);
    expect(parsed.dimensions).toEqual([]);
    expect(parsed.exerciseIds).toEqual([]);
  });

  it('accepts a stepped test', () => {
    const parsed = moduleConfigurationSchema.parse({
      measurementTypes: [
        { measurementTypeId: 'mt_lactate' },
        { measurementTypeId: 'mt_hr' },
        { measurementTypeId: 'mt_rpe' },
        { measurementTypeId: 'mt_pace' },
      ],
      passes: 6,
    });

    expect(parsed.passes).toBe(6);
    expect(parsed.measurementTypes).toHaveLength(4);
  });

  it('rejects a pass count below one', () => {
    expect(moduleConfigurationSchema.safeParse({ ...base, passes: 0 }).success).toBe(false);
  });

  it('requires a dimension key to be a stable identifier', () => {
    const withLabelAsKey = {
      ...base,
      dimensions: [{ key: 'Joint or region', label: 'Joint' }],
    };

    expect(moduleConfigurationSchema.safeParse(withLabelAsKey).success).toBe(false);
  });

  it('accepts a dimension without a value list — the coach names them', () => {
    const parsed = moduleConfigurationSchema.parse({
      ...base,
      dimensions: [{ key: 'site', label: 'Measurement site' }],
    });

    expect(parsed.dimensions[0]?.values).toBeUndefined();
  });

  /**
   * The configuration is the plan; the Measurements are the record. That
   * separation is what makes "copy the setup, not the results" a copy of one
   * JSON object rather than a filtered deep clone.
   */
  it('holds no recorded values', () => {
    const parsed: ModuleConfiguration = moduleConfigurationSchema.parse(base);

    expect(parsed).not.toHaveProperty('values');
    // The configured entries name a type and a role, never a reading.
    expect(Object.keys(parsed.measurementTypes[0] ?? {}).sort()).toEqual([
      'measurementTypeId',
      'role',
    ]);
  });
});

describe('roles', () => {
  const configuration = moduleConfigurationSchema.parse({
    measurementTypes: [
      { measurementTypeId: 'lac', role: 'required' },
      { measurementTypeId: 'hr', role: 'recommended' },
      { measurementTypeId: 'weight', role: 'optional' },
    ],
  });

  it('defaults an entry without a role to required', () => {
    const parsed = moduleConfigurationSchema.parse(base);

    expect(parsed.measurementTypes[0]?.role).toBe('required');
  });

  it('rejects a role outside the three', () => {
    const invalid = { measurementTypes: [{ measurementTypeId: 'x', role: 'nice_to_have' }] };

    expect(moduleConfigurationSchema.safeParse(invalid).success).toBe(false);
  });

  it('keeps the coach’s order — the entry grid and the analysis follow it', () => {
    expect(measurementTypeIdsOf(configuration)).toEqual(['lac', 'hr', 'weight']);
  });

  it('selects by role', () => {
    expect(
      measurementsWithRole(configuration, 'recommended').map((e) => e.measurementTypeId),
    ).toEqual(['hr']);
  });

  it('counts required and recommended toward completeness, never optional', () => {
    expect(countedMeasurements(configuration).map((e) => e.measurementTypeId)).toEqual([
      'lac',
      'hr',
    ]);
  });
});

/**
 * A module configured before roles existed must stay openable, and must keep
 * meaning what it meant. Version 1 treated every configured type as compulsory
 * — a type with no value made the test INSUFFICIENT — so "all required" is not
 * a choice made here, it is what those payloads already said.
 */
describe('readModuleConfiguration — version 1 payloads', () => {
  const v1 = {
    measurementTypeIds: ['lac', 'hr'],
    passes: 4,
    recordsSide: false,
    dimensions: [],
  };

  it('reads a version 1 payload as all-required', () => {
    const configuration = readModuleConfiguration(v1, 1);

    expect(configuration?.measurementTypes).toEqual([
      { measurementTypeId: 'lac', role: 'required' },
      { measurementTypeId: 'hr', role: 'required' },
    ]);
  });

  it('carries the rest of the version 1 configuration across untouched', () => {
    const configuration = readModuleConfiguration(v1, 1);

    expect(configuration?.passes).toBe(4);
    expect(configuration?.exerciseIds).toEqual([]);
  });

  it('reads a version 2 payload as itself', () => {
    const configuration = readModuleConfiguration(
      { measurementTypes: [{ measurementTypeId: 'lac', role: 'optional' }] },
      2,
    );

    expect(configuration?.measurementTypes[0]?.role).toBe('optional');
  });

  it('recovers a payload whose recorded version disagrees with its shape', () => {
    // A row stamped version 1 that actually holds a version 2 payload, or the
    // reverse. Neither should make an athlete's history unopenable.
    expect(readModuleConfiguration(v1, 2)?.measurementTypes).toHaveLength(2);
    expect(readModuleConfiguration(base, 1)?.measurementTypes).toHaveLength(1);
  });

  it('returns null for a payload of no known shape', () => {
    expect(readModuleConfiguration({ nonsense: true }, 2)).toBeNull();
    expect(readModuleConfiguration(null)).toBeNull();
  });
});

describe('expectedMeasurementCount', () => {
  it('is one per type for a plain single-pass test', () => {
    expect(expectedMeasurementCount(moduleConfigurationSchema.parse(base))).toBe(1);
  });

  it('multiplies types by passes — a four-quantity step test over six stages', () => {
    const configuration = moduleConfigurationSchema.parse({
      measurementTypes: ['a', 'b', 'c', 'd'].map((measurementTypeId) => ({ measurementTypeId })),
      passes: 6,
    });

    expect(expectedMeasurementCount(configuration)).toBe(24);
  });

  it('doubles for a two-sided test', () => {
    const configuration = moduleConfigurationSchema.parse({ ...base, recordsSide: true });

    expect(expectedMeasurementCount(configuration)).toBe(2);
  });

  it('multiplies by a dimension with a declared value list', () => {
    const configuration = moduleConfigurationSchema.parse({
      ...base,
      recordsSide: true,
      dimensions: [{ key: 'joint', label: 'Joint', values: ['knee', 'hip', 'shoulder'] }],
    });

    expect(expectedMeasurementCount(configuration)).toBe(6);
  });

  it('counts an open dimension as one — the total cannot be known in advance', () => {
    const configuration = moduleConfigurationSchema.parse({
      ...base,
      dimensions: [{ key: 'site', label: 'Measurement site' }],
    });

    expect(expectedMeasurementCount(configuration)).toBe(1);
  });

  /** A maximal-strength test over two lifts: load and reps for each. */
  it('multiplies by the exercises the test covers', () => {
    const configuration = moduleConfigurationSchema.parse({
      measurementTypes: [{ measurementTypeId: 'load' }, { measurementTypeId: 'reps' }],
      exerciseIds: ['ex_bench_press', 'ex_deadlift'],
    });

    expect(expectedMeasurementCount(configuration)).toBe(4);
  });

  it('ignores optional quantities — they are never owed', () => {
    const configuration = moduleConfigurationSchema.parse({
      measurementTypes: [
        { measurementTypeId: 'lac', role: 'required' },
        { measurementTypeId: 'weight', role: 'optional' },
      ],
    });

    expect(expectedMeasurementCount(configuration)).toBe(1);
  });
});
