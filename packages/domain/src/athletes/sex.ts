import { z } from 'zod';

/**
 * The athlete's sex, as the body-composition formulas need it.
 *
 * ## Why this exists at all
 *
 * Every skinfold body-density equation in use — Jackson & Pollock included —
 * is fitted separately for male and female bodies. Without this field the
 * calculation cannot be performed at all, which is the only reason the platform
 * records it. It is not a profile decoration and nothing else reads it.
 *
 * ## Why `not_specified` is a value and not an absence
 *
 * A nullable column would leave two ways to say the same thing — `null` and a
 * value meaning "unknown" — and every reader would have to handle both. One
 * vocabulary with three members says it once. It is also the **default**: an
 * athlete recorded before this field existed has not declined to answer, they
 * were never asked, and both are `not_specified` until someone says otherwise.
 *
 * `not_specified` never selects a formula. A body-fat calculation on an athlete
 * whose sex is unstated does not happen, and the screen says why — guessing one
 * of the two equations would put a number in a health record that no method
 * produced.
 */
export const ATHLETE_SEXES = ['male', 'female', 'not_specified'] as const;

export const athleteSexSchema = z.enum(ATHLETE_SEXES);
export type AthleteSex = z.infer<typeof athleteSexSchema>;

/** The two the equations are fitted for. */
export type FormulaSex = Extract<AthleteSex, 'male' | 'female'>;

/**
 * The sex a formula may be chosen by, or `null` where there is none.
 *
 * The single place `not_specified` is turned away, so no calculation has to
 * remember to check it.
 */
export function formulaSex(sex: AthleteSex): FormulaSex | null {
  return sex === 'not_specified' ? null : sex;
}
