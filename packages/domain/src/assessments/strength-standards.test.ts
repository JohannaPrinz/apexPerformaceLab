import { describe, expect, it } from 'vitest';

import {
  epleyOneRepMax,
  ONE_REP_MAX_MAX_REPS,
  strengthStanding,
  STRENGTH_STANDARDS,
} from './strength-standards';

/**
 * The estimate and the table.
 *
 * What is pinned here is the restraint on both: the formula refuses outside the
 * range it holds in, and the table classifies nobody it cannot classify —
 * without a body weight, without a stated sex, or for a lift it does not cover
 * there is no standing at all.
 */

describe('estimating a one-repetition maximum', () => {
  it('is the load itself for a single repetition', () => {
    // Lifted once, so it is the maximum for that day. Running a measured number
    // through the formula would turn it into an estimated one.
    expect(epleyOneRepMax(100, 1)).toBeCloseTo(100 + 100 / 30, 6);
  });

  it('follows Epley for the sets it applies to', () => {
    // 132,5 kg × (1 + 5/30)
    expect(epleyOneRepMax(132.5, 5)).toBeCloseTo(154.5833, 3);
  });

  it('refuses a set longer than the formula holds for', () => {
    expect(epleyOneRepMax(60, ONE_REP_MAX_MAX_REPS)).not.toBeNull();
    expect(epleyOneRepMax(60, ONE_REP_MAX_MAX_REPS + 1)).toBeNull();
  });

  it('refuses what is not a set at all', () => {
    expect(epleyOneRepMax(0, 3)).toBeNull();
    expect(epleyOneRepMax(-10, 3)).toBeNull();
    expect(epleyOneRepMax(100, 0)).toBeNull();
    expect(epleyOneRepMax(Number.NaN, 3)).toBeNull();
  });
});

describe('reading the standards table', () => {
  const base = { bodyWeightKg: 80, exerciseKey: 'squat', sex: 'male' as const };

  it('names the highest band the factor has reached', () => {
    // 2,0× is the elite entry for a male squat.
    expect(strengthStanding({ ...base, oneRepMaxKg: 160 })?.level).toBe('elite');
    expect(strengthStanding({ ...base, oneRepMaxKg: 100 })?.level).toBe('intermediate');
    expect(strengthStanding({ ...base, oneRepMaxKg: 70 })?.level).toBe('beginner');
  });

  it('classifies the gaps between the bands by the band below', () => {
    // 1,1× sits between the beginner band's top (1,0) and the intermediate
    // entry (1,2). The table names no level there, and the honest reading is
    // the last one actually reached rather than a fourth band nobody wrote.
    expect(strengthStanding({ ...base, oneRepMaxKg: 88 })?.level).toBe('beginner');
  });

  it('says nothing below the first threshold', () => {
    const under = strengthStanding({ ...base, oneRepMaxKg: 40 });

    expect(under?.level).toBeNull();
    expect(under?.factor).toBeCloseTo(0.5, 6);
  });

  it('distinguishes the sexes the table distinguishes', () => {
    const load = { oneRepMaxKg: 80, bodyWeightKg: 80, exerciseKey: 'squat' };

    expect(strengthStanding({ ...load, sex: 'male' })?.level).toBe('beginner');
    expect(strengthStanding({ ...load, sex: 'female' })?.level).toBe('intermediate');
  });

  it('claims nothing where the table cannot answer', () => {
    expect(strengthStanding({ ...base, oneRepMaxKg: 160, sex: 'not_specified' })).toBeNull();
    expect(strengthStanding({ ...base, oneRepMaxKg: 160, exerciseKey: 'leg_press' })).toBeNull();
    expect(strengthStanding({ ...base, oneRepMaxKg: 160, bodyWeightKg: 0 })).toBeNull();
  });

  it('carries the bands so the interface can show what the table says', () => {
    expect(strengthStanding({ ...base, oneRepMaxKg: 160 })?.bands).toEqual(
      STRENGTH_STANDARDS.squat.male,
    );
  });
});

describe('the table as it was given', () => {
  it('holds the three lifts and their entry points unchanged', () => {
    // Transcribed from the coach's own orientation table. Asserted so a later
    // edit to it is a deliberate one and not a typo nobody notices.
    expect(STRENGTH_STANDARDS.squat.male.map((band) => band.from)).toEqual([0.75, 1.2, 2.0]);
    expect(STRENGTH_STANDARDS.squat.female.map((band) => band.from)).toEqual([0.5, 0.9, 1.5]);
    expect(STRENGTH_STANDARDS.bench_press.male.map((band) => band.from)).toEqual([0.6, 1.0, 1.5]);
    expect(STRENGTH_STANDARDS.bench_press.female.map((band) => band.from)).toEqual([0.3, 0.5, 1.0]);
    expect(STRENGTH_STANDARDS.deadlift.male.map((band) => band.from)).toEqual([1.0, 1.5, 2.3]);
    expect(STRENGTH_STANDARDS.deadlift.female.map((band) => band.from)).toEqual([0.6, 1.2, 1.8]);
  });
});
