import { describe, expect, it } from 'vitest';

import { calculateEnergyIntake, ENERGY_FACTORS_KCAL_PER_G, ENERGY_NUTRIENT_KEYS } from './energy';

/**
 * The energy total.
 *
 * Two things are worth pinning: the factors, because they come from a published
 * table and a drift in one of them is invisible in the result; and the refusal,
 * because the alternative to refusing is a plausible-looking number that
 * understates the day.
 */

describe('the conversion factors', () => {
  it('are the ones Annex XIV names', () => {
    // Protein and carbohydrate at 4, fat at 9. Asserted against literals rather
    // than against the exported record, so a change to the record fails here
    // instead of being confirmed by a test that reads from it.
    expect(ENERGY_FACTORS_KCAL_PER_G.protein).toBe(4);
    expect(ENERGY_FACTORS_KCAL_PER_G.carbohydrates).toBe(4);
    expect(ENERGY_FACTORS_KCAL_PER_G.fat).toBe(9);
  });

  it('cover the three required macronutrients and nothing else', () => {
    // Fibre has a factor in the regulation and is deliberately not counted; see
    // the header. A fourth key here would silently change every stored total.
    expect([...ENERGY_NUTRIENT_KEYS]).toEqual(['protein', 'carbohydrates', 'fat']);
  });
});

describe('the total', () => {
  it('adds the three contributions', () => {
    const outcome = calculateEnergyIntake({ protein: 150, carbohydrates: 300, fat: 80 });

    // 600 + 1200 + 720
    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.energyKcal).toBe(2520);
    expect(outcome.value.parts).toEqual({ protein: 600, carbohydrates: 1200, fat: 720 });
  });

  it('rounds to whole kilocalories', () => {
    const outcome = calculateEnergyIntake({ protein: 120.4, carbohydrates: 210.7, fat: 65.3 });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    // 481.6 + 842.8 + 587.7 = 1912.1
    expect(outcome.value.energyKcal).toBe(1912);
  });

  it('counts a nutrient recorded as zero', () => {
    // Zero fat is a statement; absent fat is not. The two must not collapse.
    const outcome = calculateEnergyIntake({ protein: 100, carbohydrates: 100, fat: 0 });

    expect(outcome.ok).toBe(true);
    if (!outcome.ok) return;
    expect(outcome.value.energyKcal).toBe(800);
  });
});

describe('what it refuses', () => {
  it('names every macronutrient it is still waiting for', () => {
    const outcome = calculateEnergyIntake({ protein: 150 });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.refusal.missing).toEqual(['carbohydrates', 'fat']);
  });

  it('refuses a negative gram figure rather than subtracting energy', () => {
    const outcome = calculateEnergyIntake({ protein: 150, carbohydrates: -10, fat: 80 });

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.refusal.missing).toEqual(['carbohydrates']);
  });

  it('ignores fibre and fluid entirely', () => {
    const withExtras = calculateEnergyIntake({
      protein: 150,
      carbohydrates: 300,
      fat: 80,
      // Not part of the shape; passed to prove the total does not move.
      ...({ fibre: 40, fluid_intake: 3 } as Record<string, number>),
    });
    const without = calculateEnergyIntake({ protein: 150, carbohydrates: 300, fat: 80 });

    expect(withExtras.ok && without.ok).toBe(true);
    if (!withExtras.ok || !without.ok) return;
    expect(withExtras.value.energyKcal).toBe(without.value.energyKcal);
  });
});
