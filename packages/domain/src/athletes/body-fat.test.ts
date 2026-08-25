import { describe, expect, it } from 'vitest';

import {
  BODY_FAT_METHODS,
  calculateBodyFat,
  siriBodyFatPercent,
  SKINFOLD_SITES,
  SKINFOLD_SITE_KEYS,
  type BodyFatMethod,
  type SkinfoldSiteKey,
} from './body-fat';

/**
 * The caliper calculation.
 *
 * Two things are being guarded. First that the arithmetic is the published
 * method — checked against values worked through by hand rather than against
 * whatever the code happens to produce. Second, and more important, that the
 * three-site and seven-site coefficients can never meet: a seven-site sum run
 * through the three-site equation yields a plausible-looking number that no
 * method produced, and it would land in a health record.
 */
const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);
const BIRTH = day('1990-01-01');
const MEASURED = day('2026-01-01'); // exactly 36

const folds = (over: Partial<Record<SkinfoldSiteKey, number>> = {}) => ({
  skinfold_chest: 12,
  skinfold_triceps: 10,
  skinfold_midaxillary: 9,
  skinfold_subscapular: 14,
  skinfold_suprailiac: 16,
  skinfold_abdomen: 22,
  skinfold_thigh: 18,
  ...over,
});

describe('the three steps of the method', () => {
  it('sums only the folds the method and sex call for', () => {
    // Male three-site: chest 12 + abdomen 22 + thigh 18. The other four are on
    // the sheet and must not reach the sum.
    const outcome = calculateBodyFat({
      method: 'jackson_pollock_3',
      sex: 'male',
      dateOfBirth: BIRTH,
      measuredAt: MEASURED,
      folds: folds(),
    });

    expect(outcome.ok && outcome.value.sum).toBe(52);
  });

  it('sums the female three-site folds instead', () => {
    // Triceps 10 + suprailiac 16 + thigh 18.
    const outcome = calculateBodyFat({
      method: 'jackson_pollock_3',
      sex: 'female',
      dateOfBirth: BIRTH,
      measuredAt: MEASURED,
      folds: folds(),
    });

    expect(outcome.ok && outcome.value.sum).toBe(44);
  });

  it('sums all seven for the seven-site method', () => {
    const outcome = calculateBodyFat({
      method: 'jackson_pollock_7',
      sex: 'male',
      dateOfBirth: BIRTH,
      measuredAt: MEASURED,
      folds: folds(),
    });

    expect(outcome.ok && outcome.value.sum).toBe(101);
  });

  it('computes the male three-site body density by the published equation', () => {
    // 1.10938 − 0.0008267·52 + 0.0000016·52² − 0.0002574·36
    const expected = 1.10938 - 0.0008267 * 52 + 0.0000016 * 52 * 52 - 0.0002574 * 36;

    const outcome = calculateBodyFat({
      method: 'jackson_pollock_3',
      sex: 'male',
      dateOfBirth: BIRTH,
      measuredAt: MEASURED,
      folds: folds(),
    });

    expect(outcome.ok && outcome.value.bodyDensity).toBeCloseTo(expected, 10);
  });

  it('computes the female three-site body density by its own equation', () => {
    const expected = 1.0994921 - 0.0009929 * 44 + 0.0000023 * 44 * 44 - 0.0001392 * 36;

    const outcome = calculateBodyFat({
      method: 'jackson_pollock_3',
      sex: 'female',
      dateOfBirth: BIRTH,
      measuredAt: MEASURED,
      folds: folds(),
    });

    expect(outcome.ok && outcome.value.bodyDensity).toBeCloseTo(expected, 10);
  });

  it('computes the seven-site body density by the seven-site equation', () => {
    const expected = 1.112 - 0.00043499 * 101 + 0.00000055 * 101 * 101 - 0.00028826 * 36;

    const outcome = calculateBodyFat({
      method: 'jackson_pollock_7',
      sex: 'male',
      dateOfBirth: BIRTH,
      measuredAt: MEASURED,
      folds: folds(),
    });

    expect(outcome.ok && outcome.value.bodyDensity).toBeCloseTo(expected, 10);
  });

  it('turns density into per cent by Siri', () => {
    expect(siriBodyFatPercent(1.05)).toBeCloseTo(495 / 1.05 - 450, 10);
  });

  it('reports the percentage to one decimal', () => {
    // A caliper does not justify more, and a stored 17.34918 would imply it.
    const outcome = calculateBodyFat({
      method: 'jackson_pollock_3',
      sex: 'male',
      dateOfBirth: BIRTH,
      measuredAt: MEASURED,
      folds: folds(),
    });

    expect(outcome.ok && String(outcome.value.bodyFatPercent)).toMatch(/^\d+(\.\d)?$/);
  });

  it('states the sites it used, so the sum can be checked', () => {
    const outcome = calculateBodyFat({
      method: 'jackson_pollock_3',
      sex: 'female',
      dateOfBirth: BIRTH,
      measuredAt: MEASURED,
      folds: folds(),
    });

    expect(outcome.ok && outcome.value.sites).toEqual([
      'skinfold_triceps',
      'skinfold_suprailiac',
      'skinfold_thigh',
    ]);
  });
});

/**
 * The failure this file exists to make impossible.
 */
describe('the two methods never share coefficients', () => {
  const densityFor = (method: BodyFatMethod, sex: 'male' | 'female', sum: number) => {
    // One sum, forced through both methods by filling every site the method
    // asks for with an equal share — what matters is that the *equations*
    // differ, so the sum is held constant.
    const sites = SKINFOLD_SITES[method][sex];
    const each = sum / sites.length;
    const sheet = Object.fromEntries(sites.map((site) => [site, each]));

    const outcome = calculateBodyFat({
      method,
      sex,
      dateOfBirth: BIRTH,
      measuredAt: MEASURED,
      folds: sheet,
    });

    return outcome.ok ? outcome.value.bodyDensity : null;
  };

  it('gives a different density for the same sum under each method', () => {
    expect(densityFor('jackson_pollock_3', 'male', 90)).not.toBe(
      densityFor('jackson_pollock_7', 'male', 90),
    );
  });

  it('gives a different density for each sex under one method', () => {
    for (const method of BODY_FAT_METHODS) {
      expect(densityFor(method, 'male', 90), method).not.toBe(densityFor(method, 'female', 90));
    }
  });

  it('asks the three-site method for exactly three folds', () => {
    expect(SKINFOLD_SITES.jackson_pollock_3.male).toHaveLength(3);
    expect(SKINFOLD_SITES.jackson_pollock_3.female).toHaveLength(3);
  });

  it('asks the seven-site method for exactly seven, the same for both', () => {
    expect(SKINFOLD_SITES.jackson_pollock_7.male).toEqual(SKINFOLD_SITE_KEYS);
    expect(SKINFOLD_SITES.jackson_pollock_7.female).toEqual(SKINFOLD_SITE_KEYS);
    expect(SKINFOLD_SITE_KEYS).toHaveLength(7);
  });

  it('names every three-site fold among the seven', () => {
    // The seven-site sheet is a superset, which is what lets one catalogue of
    // sites serve both methods.
    for (const sex of ['male', 'female'] as const) {
      for (const site of SKINFOLD_SITES.jackson_pollock_3[sex]) {
        expect(SKINFOLD_SITE_KEYS, site).toContain(site);
      }
    }
  });
});

describe('when no percentage may be produced', () => {
  const base = {
    method: 'jackson_pollock_3' as const,
    dateOfBirth: BIRTH,
    measuredAt: MEASURED,
    folds: folds(),
  };

  it('refuses an athlete whose sex is not stated', () => {
    // Both equations are fitted by sex. Picking one would be inventing a
    // method, and the number would look entirely ordinary.
    const outcome = calculateBodyFat({ ...base, sex: 'not_specified' });

    expect(outcome).toEqual({ ok: false, refusal: { reason: 'SEX_NOT_SPECIFIED' } });
  });

  it('refuses an athlete with no date of birth', () => {
    const outcome = calculateBodyFat({ ...base, sex: 'male', dateOfBirth: null });

    expect(outcome).toEqual({ ok: false, refusal: { reason: 'DATE_OF_BIRTH_MISSING' } });
  });

  it('refuses a date of birth after the measurement', () => {
    const outcome = calculateBodyFat({
      ...base,
      sex: 'male',
      dateOfBirth: day('2030-01-01'),
    });

    expect(outcome).toEqual({ ok: false, refusal: { reason: 'AGE_NOT_PLAUSIBLE' } });
  });

  it('names the folds it is still waiting for', () => {
    const outcome = calculateBodyFat({
      ...base,
      sex: 'male',
      folds: { skinfold_chest: 12 },
    });

    expect(outcome).toEqual({
      ok: false,
      refusal: { reason: 'SITES_MISSING', missing: ['skinfold_abdomen', 'skinfold_thigh'] },
    });
  });

  it('is not satisfied by folds from the other site list', () => {
    // A female sheet on a male athlete: three folds present, none of them the
    // three this calculation needs.
    const outcome = calculateBodyFat({
      ...base,
      sex: 'male',
      folds: { skinfold_triceps: 10, skinfold_suprailiac: 16, skinfold_thigh: 18 },
    });

    expect(outcome).toEqual({
      ok: false,
      refusal: { reason: 'SITES_MISSING', missing: ['skinfold_chest', 'skinfold_abdomen'] },
    });
  });

  it('treats a fold that is not a number as missing', () => {
    const outcome = calculateBodyFat({
      ...base,
      sex: 'male',
      folds: { ...folds(), skinfold_thigh: Number.NaN },
    });

    expect(outcome.ok).toBe(false);
  });

  it('waits for all seven before calculating a seven-site test', () => {
    const outcome = calculateBodyFat({
      ...base,
      method: 'jackson_pollock_7',
      sex: 'female',
      folds: { ...folds(), skinfold_subscapular: undefined },
    });

    expect(outcome).toEqual({
      ok: false,
      refusal: { reason: 'SITES_MISSING', missing: ['skinfold_subscapular'] },
    });
  });

  it('never returns a number and a refusal together', () => {
    const outcome = calculateBodyFat({ ...base, sex: 'not_specified' });

    expect('value' in outcome).toBe(false);
  });
});
