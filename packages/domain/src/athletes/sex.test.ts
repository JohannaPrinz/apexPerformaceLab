import { describe, expect, it } from 'vitest';

import { ATHLETE_SEXES, athleteSexSchema, formulaSex } from './sex';

describe('the athlete sex vocabulary', () => {
  it('holds exactly the three the product knows', () => {
    expect(ATHLETE_SEXES).toEqual(['male', 'female', 'not_specified']);
  });

  it('rejects anything outside it', () => {
    expect(athleteSexSchema.safeParse('divers').success).toBe(false);
    expect(athleteSexSchema.safeParse('').success).toBe(false);
  });

  it('offers the two a formula is fitted for', () => {
    expect(formulaSex('male')).toBe('male');
    expect(formulaSex('female')).toBe('female');
  });

  it('turns the unstated one away rather than choosing', () => {
    // The single place this is decided, so no calculation has to remember.
    expect(formulaSex('not_specified')).toBeNull();
  });
});
