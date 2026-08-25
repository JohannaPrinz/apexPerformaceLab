import { describe, expect, it } from 'vitest';

import { ageAt } from './age';

/**
 * Age is derived, never stored — and always read on the day of the measurement.
 *
 * The defect these rule out is the quiet one: a body-fat percentage that
 * changes when an old test is recalculated, because the athlete has had a
 * birthday since.
 */
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

describe('how old someone was on a given day', () => {
  it('counts whole years', () => {
    expect(ageAt(day('1990-05-20'), day('2026-05-20'))).toBe(36);
  });

  it('has not counted the birthday the day before it', () => {
    expect(ageAt(day('1990-05-20'), day('2026-05-19'))).toBe(35);
  });

  it('counts it on the day itself', () => {
    expect(ageAt(day('1990-05-20'), day('2026-05-20'))).toBe(36);
  });

  it('reads the day of the measurement, not today', () => {
    // The same test recalculated later must reproduce its own number.
    const birth = day('1990-05-20');

    expect(ageAt(birth, day('2020-06-01'))).toBe(30);
    expect(ageAt(birth, day('2026-06-01'))).toBe(36);
  });

  it('gets a leap-day birthday right in a common year', () => {
    // Born 29 February: on 28 February 2027 the birthday has not come round.
    expect(ageAt(day('2000-02-29'), day('2027-02-28'))).toBe(26);
    expect(ageAt(day('2000-02-29'), day('2027-03-01'))).toBe(27);
  });

  it('says nothing where there is no date of birth', () => {
    expect(ageAt(null, day('2026-05-20'))).toBeNull();
  });

  it('refuses a date of birth after the day asked about', () => {
    // Not an age of −1: a record that cannot be right, and nothing may be
    // calculated from it.
    expect(ageAt(day('2030-01-01'), day('2026-05-20'))).toBeNull();
  });

  it('is zero in the first year of life, not null', () => {
    expect(ageAt(day('2026-01-01'), day('2026-06-01'))).toBe(0);
  });
});
