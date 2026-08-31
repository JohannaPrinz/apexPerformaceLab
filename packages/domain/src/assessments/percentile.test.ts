import { describe, expect, it } from 'vitest';

import { MIN_COHORT, percentileOf } from './percentile';

/**
 * Where a value sits among the athletes it can honestly be compared with.
 *
 * The rules under test are the refusals. A percentile is the most
 * authoritative-looking number an interface can show, and every one of them here
 * has to be earned: a declared direction, and a group big enough that the
 * arithmetic means something.
 */

const cohort = (count: number, from = 1) =>
  Array.from({ length: count }, (_entry, index) => from + index);

describe('with a declared direction and enough people', () => {
  it('counts how many the value is at least as good as, where higher is wanted', () => {
    // 5 of the ten values are at or below 5.
    expect(percentileOf(5, cohort(10), 'higher')).toEqual({ percentile: 50, cohort: 10 });
  });

  it('reverses the ends where lower is wanted', () => {
    // A running time of 5 beats the six values from 5 upwards.
    expect(percentileOf(5, cohort(10), 'lower')).toEqual({ percentile: 60, cohort: 10 });
  });

  it('puts a value ahead of everybody at the top', () => {
    expect(percentileOf(99, cohort(10), 'higher')?.percentile).toBe(100);
    expect(percentileOf(0, cohort(10), 'lower')?.percentile).toBe(100);
  });

  it('puts a value behind everybody at the bottom', () => {
    expect(percentileOf(0, cohort(10), 'higher')?.percentile).toBe(0);
    expect(percentileOf(99, cohort(10), 'lower')?.percentile).toBe(0);
  });

  it('always reports the group it compared against', () => {
    expect(percentileOf(5, cohort(MIN_COHORT), 'higher')?.cohort).toBe(MIN_COHORT);
  });
});

describe('what it refuses', () => {
  it('says nothing without a declared direction', () => {
    // "Top 10 %" of a body weight could mean either end.
    expect(percentileOf(5, cohort(20), null)).toBeNull();
  });

  it('says nothing for a group too small to mean anything', () => {
    // A percentile from three people is arithmetic dressed as a finding.
    expect(percentileOf(5, cohort(MIN_COHORT - 1), 'higher')).toBeNull();
    expect(percentileOf(5, [], 'higher')).toBeNull();
  });

  it('accepts a group exactly at the floor', () => {
    expect(percentileOf(5, cohort(MIN_COHORT), 'higher')).not.toBeNull();
  });

  it('says nothing about a value that is not a number', () => {
    expect(percentileOf(Number.NaN, cohort(20), 'higher')).toBeNull();
  });
});
