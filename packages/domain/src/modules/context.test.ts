import { describe, expect, it } from 'vitest';

import { moduleConfigurationSchema } from './configuration';
import { measurementContextSchema, validateMeasurementContext, validatePassIndex } from './context';

const configure = (overrides: Record<string, unknown> = {}) =>
  moduleConfigurationSchema.parse({
    measurementTypes: [{ measurementTypeId: 'mt_1' }],
    ...overrides,
  });

/**
 * `Measurement.context` is a JSON column, which would ordinarily mean anything
 * can be written to it. These tests are the reason it does not.
 */
describe('measurement context', () => {
  it('accepts nothing when the test declares no dimensions', () => {
    const configuration = configure();

    expect(validateMeasurementContext(configuration, {}).success).toBe(true);
    expect(validateMeasurementContext(configuration, null).success).toBe(true);
    expect(validateMeasurementContext(configuration, { site: 'anywhere' }).success).toBe(false);
  });

  it('rejects a key the test never declared', () => {
    const configuration = configure({ dimensions: [{ key: 'site', label: 'Site' }] });

    const result = validateMeasurementContext(configuration, {
      site: 'vastus lateralis',
      smuggled: 'value',
    });

    expect(result.success).toBe(false);
  });

  it('accepts any non-empty value for an open dimension', () => {
    const configuration = configure({ dimensions: [{ key: 'site', label: 'Site' }] });

    expect(validateMeasurementContext(configuration, { site: 'vastus lateralis' })).toMatchObject({
      success: true,
      context: { site: 'vastus lateralis' },
    });
  });

  it('rejects an empty value for an open dimension', () => {
    const configuration = configure({ dimensions: [{ key: 'site', label: 'Site' }] });

    const result = validateMeasurementContext(configuration, { site: '   ' });

    expect(result.success).toBe(false);
    expect(result.errors?.['site']).toContain('Site');
  });

  it('restricts a dimension that declares its values', () => {
    const configuration = configure({
      dimensions: [{ key: 'joint', label: 'Joint', values: ['knee', 'hip'] }],
    });

    expect(validateMeasurementContext(configuration, { joint: 'knee' }).success).toBe(true);
    expect(validateMeasurementContext(configuration, { joint: 'elbow' }).success).toBe(false);
  });

  it('requires every declared dimension — a value without its axis is ambiguous', () => {
    const configuration = configure({
      dimensions: [
        { key: 'site', label: 'Site' },
        { key: 'position', label: 'Position' },
      ],
    });

    expect(validateMeasurementContext(configuration, { site: 'quadriceps' }).success).toBe(false);
  });

  it('never carries side — that has its own typed column (§26.10)', () => {
    const configuration = configure({ recordsSide: true });

    expect(validateMeasurementContext(configuration, { side: 'LEFT' }).success).toBe(false);
  });

  it('reports errors keyed by dimension, ready for a form', () => {
    const configuration = configure({
      dimensions: [{ key: 'joint', label: 'Joint', values: ['knee'] }],
    });

    const result = validateMeasurementContext(configuration, { joint: 'elbow' });

    expect(Object.keys(result.errors ?? {})).toEqual(['joint']);
  });

  it('refuses a version it has no definition for', () => {
    expect(() => measurementContextSchema(configure(), 99)).toThrow(/version 99/);
  });
});

describe('pass index', () => {
  it('is absent on a single-pass module rather than a constant 1', () => {
    const configuration = configure();

    expect(validatePassIndex(configuration, null)).toBe(true);
    expect(validatePassIndex(configuration, undefined)).toBe(true);
    expect(validatePassIndex(configuration, 1)).toBe(false);
  });

  it('is 1-based and bounded by the configured pass count', () => {
    const configuration = configure({ passes: 4 });

    expect(validatePassIndex(configuration, 1)).toBe(true);
    expect(validatePassIndex(configuration, 4)).toBe(true);
    expect(validatePassIndex(configuration, 0)).toBe(false);
    expect(validatePassIndex(configuration, 5)).toBe(false);
  });

  it('is required once a module records several passes', () => {
    const configuration = configure({ passes: 4 });

    expect(validatePassIndex(configuration, null)).toBe(false);
  });

  it('rejects a fractional pass', () => {
    expect(validatePassIndex(configure({ passes: 4 }), 1.5)).toBe(false);
  });
});
