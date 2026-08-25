import { z } from 'zod';

import { ageAt } from './age';
import { formulaSex, type AthleteSex, type FormulaSex } from './sex';

/**
 * Body fat from caliper skinfolds, after Jackson & Pollock.
 *
 * ## The method is the whole point
 *
 * A skinfold sum means nothing on its own. It becomes a body-density estimate
 * only through the equation that was fitted to *that* set of sites, and body
 * density becomes a percentage only through a conversion. Three steps, in this
 * order, none of them interchangeable:
 *
 * 1. the sum of the folds, in millimetres
 * 2. body density, from the equation for this method **and** this sex
 * 3. the percentage, from Siri
 *
 * ## The coefficients are never mixed
 *
 * The three-site and seven-site equations are different regressions fitted to
 * different site sets. Feeding a seven-site sum into the three-site equation is
 * not an approximation, it is a different number with no meaning — and it would
 * look entirely plausible in a health record. Each method therefore carries its
 * own coefficients, the tests assert they differ, and nothing in this file can
 * reach the other method's constants.
 *
 * ## What it refuses
 *
 * No age, no sex, or a missing fold — no result, and a reason. The alternative
 * is a percentage nobody measured, which is the one outcome worth ruling out by
 * construction.
 *
 * ## Provenance
 *
 * The three-site coefficients are the ones the specification stated. The
 * seven-site coefficients are the published Jackson & Pollock seven-site
 * equations; they were reported back before this was built precisely because
 * the specification named the three-site constants for both methods.
 */

/** The seven caliper sites, by the catalogue key of the measurement type. */
export const SKINFOLD_SITE_KEYS = [
  'skinfold_chest',
  'skinfold_triceps',
  'skinfold_midaxillary',
  'skinfold_subscapular',
  'skinfold_suprailiac',
  'skinfold_abdomen',
  'skinfold_thigh',
] as const;

export type SkinfoldSiteKey = (typeof SKINFOLD_SITE_KEYS)[number];

export const BODY_FAT_METHODS = ['jackson_pollock_3', 'jackson_pollock_7'] as const;
export const bodyFatMethodSchema = z.enum(BODY_FAT_METHODS);
export type BodyFatMethod = z.infer<typeof bodyFatMethodSchema>;

/**
 * Which folds each method needs, per sex.
 *
 * The three-site method asks for different sites of male and female bodies —
 * that is part of the method, not a preference. The seven-site method asks for
 * all seven of both.
 */
export const SKINFOLD_SITES: Readonly<
  Record<BodyFatMethod, Readonly<Record<FormulaSex, readonly SkinfoldSiteKey[]>>>
> = {
  jackson_pollock_3: {
    male: ['skinfold_chest', 'skinfold_abdomen', 'skinfold_thigh'],
    female: ['skinfold_triceps', 'skinfold_suprailiac', 'skinfold_thigh'],
  },
  jackson_pollock_7: {
    male: SKINFOLD_SITE_KEYS,
    female: SKINFOLD_SITE_KEYS,
  },
} as const;

/**
 * The body-density regressions, one per method and sex.
 *
 * Written as data rather than as four functions so that a test can assert the
 * four sets are distinct — the failure this guards against is a copy-paste
 * between methods, which no amount of care in a formula body would catch.
 */
const BODY_DENSITY_COEFFICIENTS: Readonly<
  Record<
    BodyFatMethod,
    Readonly<
      Record<FormulaSex, { intercept: number; sum: number; sumSquared: number; age: number }>
    >
  >
> = {
  jackson_pollock_3: {
    male: { intercept: 1.10938, sum: 0.0008267, sumSquared: 0.0000016, age: 0.0002574 },
    female: { intercept: 1.0994921, sum: 0.0009929, sumSquared: 0.0000023, age: 0.0001392 },
  },
  jackson_pollock_7: {
    male: { intercept: 1.112, sum: 0.00043499, sumSquared: 0.00000055, age: 0.00028826 },
    female: { intercept: 1.097, sum: 0.00046971, sumSquared: 0.00000056, age: 0.00012828 },
  },
} as const;

/** Why no percentage could be produced. Never a number, never a guess. */
export type BodyFatRefusal =
  | { readonly reason: 'SEX_NOT_SPECIFIED' }
  | { readonly reason: 'DATE_OF_BIRTH_MISSING' }
  | { readonly reason: 'AGE_NOT_PLAUSIBLE' }
  | { readonly reason: 'SITES_MISSING'; readonly missing: readonly SkinfoldSiteKey[] };

export interface BodyFatResult {
  readonly method: BodyFatMethod;
  /** The sites this athlete's method actually used, in the order summed. */
  readonly sites: readonly SkinfoldSiteKey[];
  /** Millimetres. Stated because a coach checks the sum before the result. */
  readonly sum: number;
  readonly age: number;
  readonly bodyDensity: number;
  /** Per cent. Rounded to one decimal — a caliper does not justify more. */
  readonly bodyFatPercent: number;
}

export type BodyFatOutcome =
  | { readonly ok: true; readonly value: BodyFatResult }
  | { readonly ok: false; readonly refusal: BodyFatRefusal };

/**
 * Siri's conversion from body density to per cent.
 *
 * Separate and named because it is a distinct published step: every equation
 * above produces a density, and this is what turns any of them into the number
 * a coach reads.
 */
export function siriBodyFatPercent(bodyDensity: number): number {
  return 495 / bodyDensity - 450;
}

/**
 * The percentage, or the reason there is none.
 *
 * `folds` is keyed by catalogue key and holds millimetres. Only the sites this
 * method and sex call for are read — a seven-site sheet filled in for a
 * three-site test contributes its three, and nothing else leaks into the sum.
 */
export function calculateBodyFat(input: {
  readonly method: BodyFatMethod;
  readonly sex: AthleteSex;
  readonly dateOfBirth: Date | null;
  /** The day the folds were taken. Age is always read on that day. */
  readonly measuredAt: Date;
  readonly folds: Readonly<Partial<Record<SkinfoldSiteKey, number>>>;
}): BodyFatOutcome {
  const sex = formulaSex(input.sex);
  if (sex === null) return { ok: false, refusal: { reason: 'SEX_NOT_SPECIFIED' } };

  if (input.dateOfBirth === null) {
    return { ok: false, refusal: { reason: 'DATE_OF_BIRTH_MISSING' } };
  }

  const age = ageAt(input.dateOfBirth, input.measuredAt);
  if (age === null) return { ok: false, refusal: { reason: 'AGE_NOT_PLAUSIBLE' } };

  const sites = SKINFOLD_SITES[input.method][sex];
  const missing = sites.filter((site) => {
    const value = input.folds[site];

    return value === undefined || !Number.isFinite(value);
  });

  if (missing.length > 0) return { ok: false, refusal: { reason: 'SITES_MISSING', missing } };

  const sum = sites.reduce((total, site) => total + (input.folds[site] ?? 0), 0);
  const coefficients = BODY_DENSITY_COEFFICIENTS[input.method][sex];

  const bodyDensity =
    coefficients.intercept -
    coefficients.sum * sum +
    coefficients.sumSquared * sum * sum -
    coefficients.age * age;

  return {
    ok: true,
    value: {
      method: input.method,
      sites,
      sum,
      age,
      bodyDensity,
      bodyFatPercent: Math.round(siriBodyFatPercent(bodyDensity) * 10) / 10,
    },
  };
}
