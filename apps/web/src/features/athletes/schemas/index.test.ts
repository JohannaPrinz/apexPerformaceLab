import { describe, expect, it } from 'vitest';

import { createAthleteSchema, listAthletesSchema, updateAthleteSchema } from './index';

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

/**
 * Height and weight are profile fields, not measurements (§9).
 *
 * The boundary they sit on is the interesting part: a form sends strings, the
 * column is `Decimal(5,2)`, and the product is German — so an emptied field, a
 * decimal comma and an implausible figure all have to be answered here rather
 * than in the service.
 */
describe('body measurements', () => {
  it('accepts a height and weight', () => {
    const parsed = createAthleteSchema.parse({
      firstName: 'Johanna',
      lastName: 'Prinz',
      heightCm: '178',
      weightKg: '64.5',
    });

    expect(parsed.heightCm).toBe(178);
    expect(parsed.weightKg).toBe(64.5);
  });

  it('reads a German decimal comma', () => {
    // The product ships in German, so `64,5` is ordinary input, not a mistake.
    const parsed = createAthleteSchema.parse({
      firstName: 'Johanna',
      lastName: 'Prinz',
      weightKg: '64,5',
    });

    expect(parsed.weightKg).toBe(64.5);
  });

  it('rounds to the two decimals the column stores', () => {
    const parsed = createAthleteSchema.parse({
      firstName: 'Johanna',
      lastName: 'Prinz',
      weightKg: 64.567,
    });

    expect(parsed.weightKg).toBe(64.57);
  });

  it('treats an empty field as absence, never as zero', () => {
    // `Number('')` is 0, which would record a weight of nothing rather than no
    // weight at all — the mistake this exists to prevent.
    const parsed = createAthleteSchema.parse({
      firstName: 'Johanna',
      lastName: 'Prinz',
      heightCm: '',
      weightKg: '',
    });

    expect(parsed.heightCm).toBeUndefined();
    expect(parsed.weightKg).toBeUndefined();
  });

  it('rejects a height typed in metres', () => {
    // 1.82 in a centimetre field is the mistake the bounds actually catch.
    const result = createAthleteSchema.safeParse({
      firstName: 'Johanna',
      lastName: 'Prinz',
      heightCm: '1.82',
    });

    expect(result.success).toBe(false);
  });

  it('rejects text and implausible figures', () => {
    for (const heightCm of ['abc', '0', '900']) {
      expect(
        createAthleteSchema.safeParse({ firstName: 'A', lastName: 'B', heightCm }).success,
      ).toBe(false);
    }
  });

  it('still accepts an athlete with nothing but a name', () => {
    // The ordinary case (§21) must not have become harder by adding fields.
    const result = createAthleteSchema.safeParse({ firstName: 'Johanna', lastName: 'Prinz' });

    expect(result.success).toBe(true);
    expect(result.data?.heightCm).toBeUndefined();
  });
});

/**
 * Clearing, which the previous `createAthleteSchema.partial()` could not express.
 *
 * Create and update need different answers to the same empty string: on create
 * there is nothing to remove, on update an emptied field is an instruction. The
 * service skips `undefined`, so collapsing both made a mistyped value
 * correctable but never removable.
 */
describe('updateAthleteSchema', () => {
  it('leaves an unsent field absent, so the service skips it', () => {
    const parsed = updateAthleteSchema.parse({ athleteId: 'ath_1', firstName: 'Johanna' });

    expect(parsed.email).toBeUndefined();
    expect(parsed.weightKg).toBeUndefined();
    expect('email' in parsed).toBe(false);
  });

  it('turns an emptied field into null, so the service writes it', () => {
    const parsed = updateAthleteSchema.parse({
      athleteId: 'ath_1',
      email: '',
      phone: '',
      dateOfBirth: '',
      weightKg: '',
    });

    expect(parsed.email).toBeNull();
    expect(parsed.phone).toBeNull();
    expect(parsed.dateOfBirth).toBeNull();
    expect(parsed.weightKg).toBeNull();
  });

  it('keeps a name non-empty when it is sent', () => {
    // An athlete without a name is not a state this product has, so clearing is
    // allowed for contact details and figures but not for the two names.
    const result = updateAthleteSchema.safeParse({ athleteId: 'ath_1', firstName: '' });

    expect(result.success).toBe(false);
  });

  it('still rejects a malformed address on update', () => {
    const result = updateAthleteSchema.safeParse({ athleteId: 'ath_1', email: 'not-an-address' });

    expect(result.success).toBe(false);
  });

  it('accepts no organizationId — the tenant comes from the session', () => {
    const parsed = updateAthleteSchema.parse({
      athleteId: 'ath_1',
      organizationId: 'org_other',
    });

    expect(parsed).not.toHaveProperty('organizationId');
  });
});
