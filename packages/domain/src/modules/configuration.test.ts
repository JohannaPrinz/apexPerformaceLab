import { describe, expect, it } from 'vitest';

import {
  expectedMeasurementCount,
  moduleConfigurationSchema,
  type ModuleConfiguration,
} from './configuration';

const base = { measurementTypeIds: ['mt_1'] };

describe('module configuration', () => {
  it('requires at least one measurement — otherwise there is no test', () => {
    expect(moduleConfigurationSchema.safeParse({ measurementTypeIds: [] }).success).toBe(false);
  });

  it('defaults to a single pass, which is the ordinary case', () => {
    expect(moduleConfigurationSchema.parse(base).passes).toBe(1);
  });

  it('records no side and no extra dimension unless asked', () => {
    const parsed = moduleConfigurationSchema.parse(base);

    expect(parsed.recordsSide).toBe(false);
    expect(parsed.dimensions).toEqual([]);
  });

  it('accepts a stepped test', () => {
    const parsed = moduleConfigurationSchema.parse({
      measurementTypeIds: ['mt_lactate', 'mt_hr', 'mt_rpe', 'mt_pace'],
      passes: 6,
    });

    expect(parsed.passes).toBe(6);
    expect(parsed.measurementTypeIds).toHaveLength(4);
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
  it('holds no values', () => {
    const parsed: ModuleConfiguration = moduleConfigurationSchema.parse(base);

    expect(parsed).not.toHaveProperty('measurements');
    expect(parsed).not.toHaveProperty('values');
  });
});

describe('expectedMeasurementCount', () => {
  it('is one per type for a plain single-pass test', () => {
    expect(expectedMeasurementCount(moduleConfigurationSchema.parse(base))).toBe(1);
  });

  it('multiplies types by passes — a four-quantity step test over six stages', () => {
    const configuration = moduleConfigurationSchema.parse({
      measurementTypeIds: ['a', 'b', 'c', 'd'],
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
});
