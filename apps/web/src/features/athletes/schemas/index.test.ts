import { describe, expect, it } from 'vitest';

import { createAthleteSchema, listAthletesSchema } from './index';

/**
 * The form boundary.
 *
 * A browser submits an untouched optional field as `''`, not as absence. If
 * that reaches the database, an athlete ends up with an email of `""` — which
 * is neither a valid address nor a missing one, and every later "has an email?"
 * check gets it wrong. Normalising at the schema is what keeps the service free
 * of that third state.
 */
describe('createAthleteSchema', () => {
  it('requires both names', () => {
    const result = createAthleteSchema.safeParse({ firstName: '', lastName: '' });

    expect(result.success).toBe(false);
    expect(result.error?.issues.map((issue) => issue.path[0])).toEqual(['firstName', 'lastName']);
  });

  it('accepts an athlete with nothing but a name — the ordinary case (§21)', () => {
    const result = createAthleteSchema.safeParse({ firstName: 'Ida', lastName: 'Nowak' });

    expect(result.success).toBe(true);
    expect(result.data).toEqual({ firstName: 'Ida', lastName: 'Nowak' });
  });

  it('turns an untouched optional field into absence, not an empty string', () => {
    const result = createAthleteSchema.safeParse({
      firstName: 'Ida',
      lastName: 'Nowak',
      email: '',
      phone: '',
      dateOfBirth: '',
    });

    expect(result.success).toBe(true);
    expect(result.data?.email).toBeUndefined();
    expect(result.data?.phone).toBeUndefined();
    expect(result.data?.dateOfBirth).toBeUndefined();
  });

  it('still rejects a malformed address once one is given', () => {
    const result = createAthleteSchema.safeParse({
      firstName: 'Ida',
      lastName: 'Nowak',
      email: 'not-an-address',
    });

    expect(result.success).toBe(false);
  });

  it('trims surrounding whitespace from names', () => {
    const result = createAthleteSchema.safeParse({
      firstName: '  Ida  ',
      lastName: '  Nowak  ',
    });

    expect(result.data).toMatchObject({ firstName: 'Ida', lastName: 'Nowak' });
  });

  it('accepts no organizationId — the tenant comes from the session, never the request', () => {
    const result = createAthleteSchema.safeParse({
      firstName: 'Ida',
      lastName: 'Nowak',
      organizationId: 'org_somebody_elses',
    });

    expect(result.success).toBe(true);
    expect(result.data).not.toHaveProperty('organizationId');
  });
});

describe('listAthletesSchema', () => {
  it('hides deactivated athletes unless asked', () => {
    expect(listAthletesSchema.parse({}).includeArchived).toBe(false);
  });

  it('caps the page size', () => {
    expect(listAthletesSchema.safeParse({ limit: 500 }).success).toBe(false);
  });
});
