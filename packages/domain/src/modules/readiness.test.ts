import { describe, expect, it } from 'vitest';

import { moduleConfigurationSchema } from './configuration';
import { combineReadiness, evaluateReadiness, type ReadinessInput } from './readiness';

const configure = (overrides: Record<string, unknown> = {}) =>
  moduleConfigurationSchema.parse({ measurementTypeIds: ['lac', 'hr'], ...overrides });

const measured = (
  measurementTypeId: string,
  passIndex: number | null = null,
  supersededById: string | null = null,
): ReadinessInput => ({ measurementTypeId, passIndex, supersededById });

/**
 * Readiness is computed, never stored and never read from the status. These
 * tests pin the three rules that decide it.
 */
describe('evaluateReadiness', () => {
  it('is insufficient when a configured quantity has no value at all', () => {
    // Every heart rate in the world does not make a lactate curve.
    const result = evaluateReadiness(configure({ passes: 3 }), [
      measured('hr', 1),
      measured('hr', 2),
      measured('hr', 3),
    ]);

    expect(result.level).toBe('INSUFFICIENT');
    expect(result.missingTypeIds).toEqual(['lac']);
  });

  it('is insufficient when nothing was recorded', () => {
    expect(evaluateReadiness(configure(), []).level).toBe('INSUFFICIENT');
  });

  it('is complete when every configured slot is filled', () => {
    const configuration = configure({ passes: 2 });

    const result = evaluateReadiness(configuration, [
      measured('lac', 1),
      measured('hr', 1),
      measured('lac', 2),
      measured('hr', 2),
    ]);

    expect(result.level).toBe('COMPLETE');
    expect(result.expected).toBe(4);
    expect(result.recorded).toBe(4);
  });

  it('is partial when a stage is missing but every quantity appears', () => {
    const result = evaluateReadiness(configure({ passes: 3 }), [
      measured('lac', 1),
      measured('hr', 1),
      measured('lac', 2),
      measured('hr', 2),
    ]);

    expect(result.level).toBe('PARTIAL');
    expect(result.missingPasses).toEqual([3]);
  });

  it('ignores superseded values — the correction replaced them (§13)', () => {
    const configuration = configure({ measurementTypeIds: ['lac'] });

    const stillInsufficient = evaluateReadiness(configuration, [
      measured('lac', null, 'measurement_that_replaced_it'),
    ]);

    expect(stillInsufficient.level).toBe('INSUFFICIENT');

    const corrected = evaluateReadiness(configuration, [
      measured('lac', null, 'newer'),
      measured('lac'),
    ]);

    expect(corrected.level).toBe('COMPLETE');
  });

  it('counts both sides when the test records them', () => {
    const configuration = configure({ measurementTypeIds: ['grip'], recordsSide: true });

    expect(evaluateReadiness(configuration, [measured('grip')]).level).toBe('PARTIAL');
    expect(evaluateReadiness(configuration, [measured('grip'), measured('grip')]).level).toBe(
      'COMPLETE',
    );
  });

  it('multiplies by a dimension that declares its values', () => {
    const configuration = configure({
      measurementTypeIds: ['rom'],
      dimensions: [{ key: 'joint', label: 'Joint', values: ['knee', 'hip'] }],
    });

    expect(evaluateReadiness(configuration, [measured('rom')]).expected).toBe(2);
  });

  /**
   * A site the coach names as they go has no target number, so "maybe more
   * sites could have been measured" must not read as incomplete forever.
   */
  it('expects nothing extra from an open dimension', () => {
    const configuration = configure({
      measurementTypeIds: ['emg'],
      dimensions: [{ key: 'site', label: 'Site' }],
    });

    expect(evaluateReadiness(configuration, [measured('emg')]).level).toBe('COMPLETE');
  });

  it('does not let a value of an unconfigured type inflate progress', () => {
    const configuration = configure({ measurementTypeIds: ['lac'] });

    const result = evaluateReadiness(configuration, [measured('lac'), measured('something_else')]);

    expect(result.recorded).toBe(1);
    expect(result.level).toBe('COMPLETE');
  });

  it('fills nothing in — a gap is reported, never invented', () => {
    const result = evaluateReadiness(configure({ passes: 4 }), [
      measured('lac', 1),
      measured('hr', 1),
    ]);

    expect(result.recorded).toBe(2);
    expect(result.expected).toBe(8);
    expect(result.missingPasses).toEqual([2, 3, 4]);
  });
});

describe('combineReadiness — an analysis is as good as its weakest included test', () => {
  const complete = { level: 'COMPLETE' } as const;
  const partial = { level: 'PARTIAL' } as const;
  const insufficient = { level: 'INSUFFICIENT' } as const;
  const asReadiness = (level: { level: 'COMPLETE' | 'PARTIAL' | 'INSUFFICIENT' }) => ({
    ...level,
    missingTypeIds: [],
    missingPasses: [],
    expected: 0,
    recorded: 0,
  });

  it('is insufficient with no test at all', () => {
    expect(combineReadiness([])).toBe('INSUFFICIENT');
  });

  it('is insufficient if any included test is', () => {
    expect(combineReadiness([complete, insufficient].map(asReadiness))).toBe('INSUFFICIENT');
  });

  it('is partial if any included test is, and none is insufficient', () => {
    expect(combineReadiness([complete, partial].map(asReadiness))).toBe('PARTIAL');
  });

  it('is complete only when every included test is', () => {
    expect(combineReadiness([complete, complete].map(asReadiness))).toBe('COMPLETE');
  });
});
