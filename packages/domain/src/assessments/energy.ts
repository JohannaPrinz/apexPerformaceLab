/**
 * The energy a day's food carried, from what it was made of.
 *
 * ## Why this is a calculation and not a field
 *
 * Nobody measures kilocalories. A food label states grams of protein,
 * carbohydrate and fat and derives the energy figure from them, and a coach
 * writing down what an athlete ate has the same three numbers. Asking for a
 * fourth would be asking them to do the arithmetic and to be wrong about it
 * differently each time.
 *
 * ## The basis
 *
 * The general energy conversion factors of EU Regulation (EU) No 1169/2011,
 * Annex XIV — the ones every nutrition label in Europe is calculated with:
 *
 *   protein 4 kcal/g · carbohydrate 4 kcal/g · fat 9 kcal/g
 *
 * These are the classical Atwater factors, and they are a **statement about
 * the nutrients**, not about the athlete. Nothing here judges the number, ranks
 * it, or compares it with a requirement: how much a person should eat depends
 * on their body, their training and their goal, and the platform holds no basis
 * for any of that (§12 — no reference ranges).
 *
 * ## What is deliberately not counted
 *
 * **Fibre.** Annex XIV does give it 2 kcal/g, and leaving it out is a decision,
 * not an oversight: fibre is recorded as an optional quantity, so counting it
 * would make the same three-macronutrient day come out at two different
 * energies depending on whether somebody happened to fill the field in. A total
 * that changes when an unrelated optional field is completed is not a total a
 * coach can compare across days. Protein, carbohydrate and fat are the required
 * three, and the total is exactly those three.
 *
 * **Alcohol and polyols.** Annex XIV lists factors for both. Neither is a
 * quantity this platform records, and inventing catalogue entries to complete a
 * table nobody asked for would put fields in front of coaches for no reason.
 */

/** The macronutrients the total is built from, by catalogue key. */
export const ENERGY_NUTRIENT_KEYS = ['protein', 'carbohydrates', 'fat'] as const;

export type EnergyNutrientKey = (typeof ENERGY_NUTRIENT_KEYS)[number];

/**
 * Kilocalories per gram, per nutrient.
 *
 * Written as data rather than inline in the sum so a test can assert the three
 * factors against the regulation, which is the one thing about this file that
 * must not drift.
 */
export const ENERGY_FACTORS_KCAL_PER_G: Readonly<Record<EnergyNutrientKey, number>> = {
  protein: 4,
  carbohydrates: 4,
  fat: 9,
} as const;

/** Why no total could be produced. Never a number, never a guess. */
export interface EnergyRefusal {
  readonly reason: 'NUTRIENTS_MISSING';
  /** Which of the three are still absent, so the screen can name them. */
  readonly missing: readonly EnergyNutrientKey[];
}

export interface EnergyResult {
  /** What each nutrient contributed, in kilocalories. */
  readonly parts: Readonly<Record<EnergyNutrientKey, number>>;
  /** Kilocalories, rounded to whole ones — grams to a decimal justify no more. */
  readonly energyKcal: number;
}

export type EnergyOutcome =
  | { readonly ok: true; readonly value: EnergyResult }
  | { readonly ok: false; readonly refusal: EnergyRefusal };

/**
 * The total, or the reason there is none.
 *
 * All three are required. A day missing its fat is not a day with less energy,
 * it is a day nobody finished writing down, and a total computed from two of
 * three would read as a complete figure while understating it by a third.
 */
export function calculateEnergyIntake(
  grams: Readonly<Partial<Record<EnergyNutrientKey, number>>>,
): EnergyOutcome {
  const missing = ENERGY_NUTRIENT_KEYS.filter((key) => {
    const value = grams[key];

    return value === undefined || !Number.isFinite(value) || value < 0;
  });

  if (missing.length > 0) return { ok: false, refusal: { reason: 'NUTRIENTS_MISSING', missing } };

  const parts = {
    protein: (grams.protein ?? 0) * ENERGY_FACTORS_KCAL_PER_G.protein,
    carbohydrates: (grams.carbohydrates ?? 0) * ENERGY_FACTORS_KCAL_PER_G.carbohydrates,
    fat: (grams.fat ?? 0) * ENERGY_FACTORS_KCAL_PER_G.fat,
  } as const;

  return {
    ok: true,
    value: {
      parts,
      energyKcal: Math.round(parts.protein + parts.carbohydrates + parts.fat),
    },
  };
}
