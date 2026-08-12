import { describe, expect, it } from 'vitest';

import { moduleConfigurationSchema } from './configuration';
import {
  canApplyConfigurationChange,
  configurationChangeViolations,
  NO_RECORDED_FACTS,
  type RecordedFacts,
} from './configuration-change';

const configure = (overrides: Record<string, unknown> = {}) =>
  moduleConfigurationSchema.parse({
    measurementTypes: [{ measurementTypeId: 'lac' }, { measurementTypeId: 'hr' }],
    ...overrides,
  });

const recorded = (facts: Partial<RecordedFacts>): RecordedFacts => ({
  ...NO_RECORDED_FACTS,
  ...facts,
});

/**
 * A template is a starting point; the configuration belongs to the module from
 * the moment it is copied. Editing it is free until values exist — after that,
 * a change that would misdescribe those values is refused.
 */
describe('an empty test is freely editable', () => {
  it('allows removing a quantity when nothing was recorded', () => {
    const violations = configurationChangeViolations(
      configure(),
      configure({ measurementTypes: [{ measurementTypeId: 'lac' }] }),
      NO_RECORDED_FACTS,
    );

    expect(violations).toEqual([]);
  });

  it('allows switching side mode when nothing was recorded', () => {
    expect(
      canApplyConfigurationChange(configure(), configure({ recordsSide: true }), NO_RECORDED_FACTS),
    ).toBe(true);
  });

  it('allows reducing the pass count when no stage holds anything', () => {
    expect(
      canApplyConfigurationChange(
        configure({ passes: 6 }),
        configure({ passes: 2 }),
        NO_RECORDED_FACTS,
      ),
    ).toBe(true);
  });
});

describe('a recorded value cannot be misdescribed', () => {
  it('refuses removing a quantity that has values', () => {
    const violations = configurationChangeViolations(
      configure(),
      configure({ measurementTypes: [{ measurementTypeId: 'hr' }] }),
      recorded({ measurementTypeIds: ['lac', 'hr'] }),
    );

    expect(violations).toEqual([{ kind: 'MEASUREMENT_TYPE_REMOVED', measurementTypeId: 'lac' }]);
  });

  it('refuses reducing the passes below a recorded stage', () => {
    const violations = configurationChangeViolations(
      configure({ passes: 6 }),
      configure({ passes: 3 }),
      recorded({ passIndexes: [1, 2, 5] }),
    );

    expect(violations).toEqual([{ kind: 'PASSES_REDUCED', passes: 3, recordedPass: 5 }]);
  });

  it('allows reducing the passes to exactly the highest recorded stage', () => {
    expect(
      canApplyConfigurationChange(
        configure({ passes: 6 }),
        configure({ passes: 3 }),
        recorded({ passIndexes: [1, 2, 3] }),
      ),
    ).toBe(true);
  });

  it('refuses switching side mode once values carry a side', () => {
    const violations = configurationChangeViolations(
      configure(),
      configure({ recordsSide: true }),
      recorded({ sides: ['BILATERAL'] }),
    );

    expect(violations).toEqual([{ kind: 'SIDE_MODE_CHANGED' }]);
  });

  it('refuses removing a dimension that recorded values were taken along', () => {
    const violations = configurationChangeViolations(
      configure({ dimensions: [{ key: 'site', label: 'Site' }] }),
      configure(),
      recorded({ contexts: [{ site: 'vastus medialis' }] }),
    );

    expect(violations).toEqual([{ kind: 'DIMENSION_REMOVED', key: 'site' }]);
  });

  it('refuses narrowing a dimension past a value already recorded', () => {
    const violations = configurationChangeViolations(
      configure({ dimensions: [{ key: 'joint', label: 'Joint', values: ['knee', 'hip'] }] }),
      configure({ dimensions: [{ key: 'joint', label: 'Joint', values: ['knee'] }] }),
      recorded({ contexts: [{ joint: 'hip' }] }),
    );

    expect(violations).toEqual([{ kind: 'DIMENSION_VALUE_REMOVED', key: 'joint', value: 'hip' }]);
  });

  it('refuses removing an exercise that has values', () => {
    const violations = configurationChangeViolations(
      configure({ exerciseIds: ['ex_bench', 'ex_deadlift'] }),
      configure({ exerciseIds: ['ex_bench'] }),
      recorded({ exerciseIds: ['ex_bench', 'ex_deadlift'] }),
    );

    expect(violations).toEqual([{ kind: 'EXERCISE_REMOVED', exerciseId: 'ex_deadlift' }]);
  });

  it('reports every obstacle at once rather than one per attempt', () => {
    const violations = configurationChangeViolations(
      configure({ passes: 4 }),
      configure({ measurementTypes: [{ measurementTypeId: 'hr' }], passes: 1 }),
      recorded({ measurementTypeIds: ['lac', 'hr'], passIndexes: [1, 2] }),
    );

    expect(violations.map((violation) => violation.kind).sort()).toEqual([
      'MEASUREMENT_TYPE_REMOVED',
      'PASSES_REDUCED',
    ]);
  });
});

describe('changes that only concern the future stay allowed', () => {
  // A four-stage test with values in the first two — the ordinary situation a
  // coach is in when they notice the setup needs adjusting.
  const started = configure({ passes: 4 });
  const facts = recorded({
    measurementTypeIds: ['lac', 'hr'],
    passIndexes: [1, 2],
    sides: ['BILATERAL'],
  });

  it('allows adding a quantity to a test already under way', () => {
    expect(
      canApplyConfigurationChange(
        started,
        configure({
          passes: 4,
          measurementTypes: [
            { measurementTypeId: 'lac' },
            { measurementTypeId: 'hr' },
            { measurementTypeId: 'rpe' },
          ],
        }),
        facts,
      ),
    ).toBe(true);
  });

  it('allows raising the pass count mid-test', () => {
    expect(canApplyConfigurationChange(started, configure({ passes: 8 }), facts)).toBe(true);
  });

  /**
   * Roles decide readiness, and readiness is derived from the current
   * configuration by design. Loosening one changes the verdict, which is the
   * honest outcome — no recorded value is touched or reinterpreted.
   */
  it('allows changing a role mid-test', () => {
    const relaxed = configure({
      passes: 4,
      measurementTypes: [
        { measurementTypeId: 'lac', role: 'required' },
        { measurementTypeId: 'hr', role: 'optional' },
      ],
    });

    expect(canApplyConfigurationChange(started, relaxed, facts)).toBe(true);
  });

  it('allows reordering', () => {
    const reordered = configure({
      passes: 4,
      measurementTypes: [{ measurementTypeId: 'hr' }, { measurementTypeId: 'lac' }],
    });

    expect(canApplyConfigurationChange(started, reordered, facts)).toBe(true);
  });

  it('allows renaming a dimension’s label without touching its key', () => {
    expect(
      canApplyConfigurationChange(
        configure({ dimensions: [{ key: 'site', label: 'Site' }] }),
        configure({ dimensions: [{ key: 'site', label: 'Measurement site' }] }),
        recorded({ contexts: [{ site: 'vastus medialis' }] }),
      ),
    ).toBe(true);
  });

  /**
   * An open dimension accepts whatever the coach named, so there is no list to
   * narrow and nothing to refuse.
   */
  it('allows an open dimension to keep accepting anything', () => {
    expect(
      canApplyConfigurationChange(
        configure({ dimensions: [{ key: 'site', label: 'Site' }] }),
        configure({ dimensions: [{ key: 'site', label: 'Site' }] }),
        recorded({ contexts: [{ site: 'anything at all' }] }),
      ),
    ).toBe(true);
  });
});

/**
 * A corrected reading is still part of the record (§13). A configuration change
 * that made it unreadable would destroy history exactly as thoroughly as one
 * that hit the current value, so the caller passes superseded rows in too.
 */
describe('superseded values are protected as well', () => {
  it('refuses removing a quantity whose only values were corrected away', () => {
    const violations = configurationChangeViolations(
      configure(),
      configure({ measurementTypes: [{ measurementTypeId: 'hr' }] }),
      recorded({ measurementTypeIds: ['lac'] }),
    );

    expect(violations).toEqual([{ kind: 'MEASUREMENT_TYPE_REMOVED', measurementTypeId: 'lac' }]);
  });
});
