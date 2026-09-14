import { describe, expect, it } from 'vitest';

import { seriesIdentity } from '@apex/domain';

import { cohortOf, type CohortGroup, type CohortTest } from './cohort';

/**
 * Turning the database's groups back into athletes and series (§16).
 *
 * The groups arrive finer than the series identity — per test, per stored
 * context — and this is the step that makes the aggregation exact rather than
 * approximately right. Every case below is one way the merge could go wrong
 * without anything on the screen looking broken: a percentile is a plausible
 * number whichever athletes happened to go into it.
 */

const decimal = (value: string) => ({ toString: () => value });

const group = (over: Partial<CohortGroup> & { min: string; max: string }): CohortGroup => {
  const { min, max, ...rest } = over;

  return {
    assessmentModuleId: 'mod_a1',
    measurementTypeId: 'mt_grip',
    side: 'LEFT',
    exerciseId: null,
    passIndex: null,
    context: null,
    _min: { numericValue: decimal(min) },
    _max: { numericValue: decimal(max) },
    ...rest,
  };
};

const TESTS: ReadonlyMap<string, CohortTest> = new Map([
  ['mod_a1', { athleteId: 'ath_a', protocolKey: 'grip||||' }],
  ['mod_a2', { athleteId: 'ath_a', protocolKey: 'grip||||' }],
  ['mod_b1', { athleteId: 'ath_b', protocolKey: 'grip||||' }],
  ['mod_a_other', { athleteId: 'ath_a', protocolKey: 'grip_dyno||||' }],
  ['mod_a_none', { athleteId: 'ath_a', protocolKey: null }],
]);

/** The key the comparison table looks the cohort up by, built the way it builds it. */
const keyOf = (over: { protocolKey?: string | null; context?: unknown } = {}) =>
  seriesIdentity({
    measurementTypeId: 'mt_grip',
    side: 'LEFT',
    exerciseId: null,
    passIndex: null,
    context: over.context ?? null,
    protocolKey: over.protocolKey === undefined ? 'grip||||' : over.protocolKey,
    moduleId: 'irrelevant',
    value: 0,
    capturedAt: new Date(),
  });

describe('merging the groups into athletes', () => {
  it('keys the cohort exactly as the comparison looks it up', () => {
    const cohort = cohortOf([group({ min: '40', max: '44' })], TESTS);

    expect([...cohort.keys()]).toEqual([keyOf()]);
  });

  it('merges one athlete’s tests into one pair of extremes', () => {
    // Two tests of the same athlete, same series: the lowest of the lows and
    // the highest of the highs — never one test's pair standing for the other.
    const cohort = cohortOf(
      [
        group({ assessmentModuleId: 'mod_a1', min: '40', max: '44' }),
        group({ assessmentModuleId: 'mod_a2', min: '38', max: '42' }),
      ],
      TESTS,
    );

    expect(cohort.get(keyOf())?.get('ath_a')).toEqual({ lowest: 38, highest: 44 });
  });

  it('keeps two athletes apart', () => {
    const cohort = cohortOf(
      [
        group({ assessmentModuleId: 'mod_a1', min: '40', max: '44' }),
        group({ assessmentModuleId: 'mod_b1', min: '50', max: '52' }),
      ],
      TESTS,
    );

    expect(cohort.get(keyOf())?.size).toBe(2);
    expect(cohort.get(keyOf())?.get('ath_b')).toEqual({ lowest: 50, highest: 52 });
  });

  it('keeps two protocols apart', () => {
    const cohort = cohortOf(
      [
        group({ assessmentModuleId: 'mod_a1', min: '40', max: '44' }),
        group({ assessmentModuleId: 'mod_a_other', min: '60', max: '61' }),
      ],
      TESTS,
    );

    expect(cohort.get(keyOf())?.get('ath_a')).toEqual({ lowest: 40, highest: 44 });
    expect(cohort.get(keyOf({ protocolKey: 'grip_dyno||||' }))?.get('ath_a')).toEqual({
      lowest: 60,
      highest: 61,
    });
  });

  it('keeps "no protocol" as its own class', () => {
    const cohort = cohortOf(
      [group({ assessmentModuleId: 'mod_a_none', min: '30', max: '31' })],
      TESTS,
    );

    expect(cohort.get(keyOf({ protocolKey: null }))?.get('ath_a')).toEqual({
      lowest: 30,
      highest: 31,
    });
    expect(cohort.has(keyOf())).toBe(false);
  });

  it('keeps side, exercise and stage apart', () => {
    const cohort = cohortOf(
      [
        group({ min: '1', max: '1' }),
        group({ side: 'RIGHT', min: '2', max: '2' }),
        group({ exerciseId: 'ex_1', min: '3', max: '3' }),
        group({ passIndex: 2, min: '4', max: '4' }),
      ],
      TESTS,
    );

    expect(cohort.size).toBe(4);
  });
});

describe('what the stored context does to a series', () => {
  it('treats two key orders as one series', () => {
    // JSONB already groups these together; should two ever arrive apart they
    // still end up as one.
    const cohort = cohortOf(
      [
        group({
          assessmentModuleId: 'mod_a1',
          context: { joint: 'knee', position: 'flexed' },
          min: '10',
          max: '12',
        }),
        group({
          assessmentModuleId: 'mod_a2',
          context: { position: 'flexed', joint: 'knee' },
          min: '9',
          max: '11',
        }),
      ],
      TESTS,
    );

    expect(cohort.size).toBe(1);
    expect(
      cohort.get(keyOf({ context: { joint: 'knee', position: 'flexed' } }))?.get('ath_a'),
    ).toEqual({ lowest: 9, highest: 12 });
  });

  it('merges what JSONB tells apart and the series identity does not', () => {
    // `1` and `"1"` are two JSONB values and one `canonicalContext`; so are an
    // empty object and no context at all. The groups arrive separately and must
    // become one series, or one athlete would count as two.
    const cohort = cohortOf(
      [
        group({ assessmentModuleId: 'mod_a1', context: { stage: 1 }, min: '10', max: '10' }),
        group({ assessmentModuleId: 'mod_a2', context: { stage: '1' }, min: '20', max: '20' }),
        group({ assessmentModuleId: 'mod_b1', context: {}, min: '5', max: '5' }),
        group({ assessmentModuleId: 'mod_b1', context: null, min: '7', max: '7' }),
      ],
      TESTS,
    );

    expect(cohort.get(keyOf({ context: { stage: '1' } }))?.get('ath_a')).toEqual({
      lowest: 10,
      highest: 20,
    });
    expect(cohort.get(keyOf({ context: null }))?.get('ath_b')).toEqual({ lowest: 5, highest: 7 });
  });

  it('keeps apart what the series identity tells apart', () => {
    const cohort = cohortOf(
      [
        group({ context: { position: 'flexed' }, min: '1', max: '1' }),
        group({ context: { position: 'extended' }, min: '2', max: '2' }),
      ],
      TESTS,
    );

    expect(cohort.size).toBe(2);
  });
});

describe('what never enters the cohort', () => {
  it('a group whose test the module read did not return', () => {
    // An archived test, or one of this athlete's own: the module read decides
    // who is in the cohort, and a group without a test has no owner.
    const cohort = cohortOf(
      [group({ assessmentModuleId: 'mod_unknown', min: '1', max: '1' })],
      TESTS,
    );

    expect(cohort.size).toBe(0);
  });

  it('a group without a number', () => {
    const cohort = cohortOf(
      [{ ...group({ min: '1', max: '1' }), _min: { numericValue: null }, _max: null }],
      TESTS,
    );

    expect(cohort.size).toBe(0);
  });
});
