import { describe, expect, it } from 'vitest';

import { moduleConfigurationSchema } from './configuration';
import { combineReadiness, evaluateReadiness, type ReadinessInput } from './readiness';

const configure = (overrides: Record<string, unknown> = {}) =>
  moduleConfigurationSchema.parse({
    measurementTypes: [{ measurementTypeId: 'lac' }, { measurementTypeId: 'hr' }],
    ...overrides,
  });

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
    const configuration = configure({ measurementTypes: [{ measurementTypeId: 'lac' }] });

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
    const configuration = configure({
      measurementTypes: [{ measurementTypeId: 'grip' }],
      recordsSide: true,
    });

    expect(evaluateReadiness(configuration, [measured('grip')]).level).toBe('PARTIAL');
    expect(evaluateReadiness(configuration, [measured('grip'), measured('grip')]).level).toBe(
      'COMPLETE',
    );
  });

  it('multiplies by a dimension that declares its values', () => {
    const configuration = configure({
      measurementTypes: [{ measurementTypeId: 'rom' }],
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
      measurementTypes: [{ measurementTypeId: 'emg' }],
      dimensions: [{ key: 'site', label: 'Site' }],
    });

    expect(evaluateReadiness(configuration, [measured('emg')]).level).toBe('COMPLETE');
  });

  it('does not let a value of an unconfigured type inflate progress', () => {
    const configuration = configure({ measurementTypes: [{ measurementTypeId: 'lac' }] });

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
    missingRecommendedTypeIds: [],
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

/**
 * The three roles are what make a template more than a checklist. These tests
 * pin the difference between them, which is precisely the difference between
 * "the test cannot be evaluated" and "the test is evaluable but not complete".
 */
describe('evaluateReadiness — roles', () => {
  const roled = (...entries: [string, 'required' | 'recommended' | 'optional'][]) =>
    moduleConfigurationSchema.parse({
      measurementTypes: entries.map(([measurementTypeId, role]) => ({ measurementTypeId, role })),
    });

  it('sinks the test when a required quantity is missing entirely', () => {
    const result = evaluateReadiness(roled(['lac', 'required'], ['hr', 'recommended']), [
      measured('hr'),
    ]);

    expect(result.level).toBe('INSUFFICIENT');
    expect(result.missingTypeIds).toEqual(['lac']);
  });

  it('leaves the test evaluable but incomplete when a recommended one is missing', () => {
    const result = evaluateReadiness(roled(['lac', 'required'], ['hr', 'recommended']), [
      measured('lac'),
    ]);

    expect(result.level).toBe('PARTIAL');
    expect(result.missingTypeIds).toEqual([]);
    expect(result.missingRecommendedTypeIds).toEqual(['hr']);
  });

  it('is unaffected by a missing optional quantity', () => {
    const result = evaluateReadiness(roled(['lac', 'required'], ['weight', 'optional']), [
      measured('lac'),
    ]);

    expect(result.level).toBe('COMPLETE');
    expect(result.expected).toBe(1);
  });

  it('does not let an optional value inflate progress past the expected count', () => {
    const result = evaluateReadiness(roled(['lac', 'required'], ['weight', 'optional']), [
      measured('lac'),
      measured('weight'),
    ]);

    expect(result.recorded).toBe(1);
    expect(result.expected).toBe(1);
  });

  /**
   * A test whose every quantity is optional owes nothing and is complete with
   * no values at all. That is the honest reading — nothing was ever demanded —
   * and it is the reason `optional` must not be the default role.
   */
  it('is complete for an all-optional test with nothing recorded', () => {
    expect(evaluateReadiness(roled(['weight', 'optional']), []).level).toBe('COMPLETE');
  });
});

describe('evaluateReadiness — exercises', () => {
  it('expects every quantity once per exercise the test covers', () => {
    const configuration = moduleConfigurationSchema.parse({
      measurementTypes: [{ measurementTypeId: 'load' }, { measurementTypeId: 'reps' }],
      exerciseIds: ['ex_bench', 'ex_deadlift'],
    });

    const result = evaluateReadiness(configuration, [measured('load'), measured('reps')]);

    expect(result.expected).toBe(4);
    expect(result.level).toBe('PARTIAL');
  });
});
