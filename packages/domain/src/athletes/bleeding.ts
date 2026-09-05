import { z } from 'zod';

/**
 * How strong a documented bleeding was.
 *
 * ## Why these four, and why they are not a scale
 *
 * Spotting, light, medium, heavy — the words people use about it, and the ones
 * every paper diary and cycle app asks for. They are **ordered but not
 * measured**: "heavy" is more than "medium" the way a description is more, not
 * the way 8 mL is more than 5 mL. So there is an order here, because a legend
 * has to be laid out in one, and there is no number, because a number would
 * claim a precision nobody observed.
 *
 * Nothing is computed from them. Cycle length, phase, a fertile window, a
 * readiness score — the cycle service refuses all four, and adding a strength
 * to the record changes none of that. What is stored is what was observed.
 *
 * ## Why "unspecified" is an absence and not a value
 *
 * Every entry made before this existed has no answer, and an entry that only
 * names the days still has none. That is `null` on the record, not a fifth
 * member here: a coach who never stated a strength and a coach who stated
 * spotting observed different things, and one enum value for both would make
 * them indistinguishable.
 */

/** Weakest to strongest. The order a legend is drawn in. */
export const BLEEDING_INTENSITIES = ['SPOTTING', 'LIGHT', 'MEDIUM', 'HEAVY'] as const;

export const bleedingIntensitySchema = z.enum(BLEEDING_INTENSITIES);
export type BleedingIntensity = z.infer<typeof bleedingIntensitySchema>;

/** What a coach calls each of them. */
export const BLEEDING_INTENSITY_LABELS_DE: Readonly<Record<BleedingIntensity, string>> = {
  SPOTTING: 'Schmierblutung',
  LIGHT: 'Leicht',
  MEDIUM: 'Mittel',
  HEAVY: 'Stark',
};

/**
 * How strongly a day's mark is filled, from 0 to 1.
 *
 * **The four steps have to differ by more than hue.** The design system is
 * explicit that colour never carries meaning on its own, and a red at four
 * opacities is exactly the failure it warns about — in greyscale, under
 * colour-vision deficiency, or on a projector the four collapse into one. So
 * the mark carries the strength in its *fill* as well, and the legend names
 * each step in words beside the mark it describes.
 *
 * Spotting is deliberately 0: an outline only, which is visibly a different
 * shape rather than a paler version of the same one.
 */
export const BLEEDING_INTENSITY_FILL: Readonly<Record<BleedingIntensity, number>> = {
  SPOTTING: 0,
  LIGHT: 0.35,
  MEDIUM: 0.65,
  HEAVY: 1,
};

/** Reads a stored value. Anything unreadable is no strength, never a guess. */
export function readBleedingIntensity(value: unknown): BleedingIntensity | null {
  const parsed = bleedingIntensitySchema.safeParse(value);

  return parsed.success ? parsed.data : null;
}
