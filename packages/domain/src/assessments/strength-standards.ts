import type { AthleteSex } from '../athletes/sex';

/**
 * A one-repetition maximum, and where it sits against the coach's own standards.
 *
 * ## Why the estimate is named after its formula
 *
 * A single heavy set is not a 1RM; it is a load and a repetition count, and
 * turning the two into a maximum is an *estimate* by a published rule. Epley's
 * is the one this carries, it is named wherever the number is shown, and no
 * other is applied silently — two formulas answering the same question with
 * different numbers is exactly how a record stops meaning anything.
 *
 * The estimate degrades honestly at the edges: at one repetition it returns the
 * load unchanged, which is right, and it is not offered at all above the range
 * where the formula holds.
 *
 * ## Why the standards are the coach's and not the platform's
 *
 * Apex OS ships **no reference values** (§12) and this file does not change
 * that. What it holds is a table the coach supplied, for three barbell lifts, as
 * multiples of body weight — an orientation they already work with. It is
 * transcribed exactly as given, it is attributed wherever it appears, and it
 * produces a band name, never a verdict about a person.
 *
 * Where anything the table needs is missing — no body weight on file, a sex not
 * stated, an exercise the table does not cover — nothing is claimed at all.
 */

/** How the estimate was arrived at. Shown wherever the number is. */
export const ONE_REP_MAX_FORMULA = 'Epley';

/**
 * The repetition count above which the estimate is not offered.
 *
 * Epley is a linear extrapolation and it drifts as the set gets longer. Ten is
 * where the formula is commonly held to stop being useful, so beyond it this
 * answers `null` rather than a number nobody should act on.
 */
export const ONE_REP_MAX_MAX_REPS = 10;

/**
 * `Gewicht × (1 + Wiederholungen / 30)`, or `null` where it does not apply.
 *
 * A set of one returns the load itself: the athlete lifted it once, so it *is*
 * the maximum for that day, and running it through the formula would inflate a
 * measured number into an estimated one.
 */
export function epleyOneRepMax(loadKg: number, repetitions: number): number | null {
  if (!Number.isFinite(loadKg) || !Number.isFinite(repetitions)) return null;
  if (loadKg <= 0 || repetitions < 1 || repetitions > ONE_REP_MAX_MAX_REPS) return null;

  return loadKg * (1 + repetitions / 30);
}

export const STRENGTH_LEVELS = ['beginner', 'intermediate', 'elite'] as const;
export type StrengthLevel = (typeof STRENGTH_LEVELS)[number];

export const STRENGTH_LEVEL_LABELS_DE: Readonly<Record<StrengthLevel, string>> = {
  beginner: 'Anfänger',
  intermediate: 'Fortgeschritten',
  elite: 'Profi',
};

/** The exercises the table covers, by catalogue key. */
export const STANDARD_EXERCISE_KEYS = ['squat', 'bench_press', 'deadlift'] as const;
export type StandardExerciseKey = (typeof STANDARD_EXERCISE_KEYS)[number];

/**
 * The table, as multiples of body weight.
 *
 * Each entry is the band's **lower bound** — the point from which the level is
 * reached. The source table also names an upper bound for the first two levels
 * and leaves gaps between the bands; reading it by its lower bounds is what
 * makes every value classifiable without inventing a fourth level to hold the
 * gaps. The bands themselves travel with the entry so the interface can show
 * what the table actually says.
 */
export interface StrengthBand {
  readonly level: StrengthLevel;
  /** From this multiple of body weight upwards. */
  readonly from: number;
  /** The band's upper end where the table names one. `null` for the top band. */
  readonly to: number | null;
}

type BandsBySex = Readonly<Record<'male' | 'female', readonly StrengthBand[]>>;

export const STRENGTH_STANDARDS: Readonly<Record<StandardExerciseKey, BandsBySex>> = {
  squat: {
    male: [
      { level: 'beginner', from: 0.75, to: 1.0 },
      { level: 'intermediate', from: 1.2, to: 1.5 },
      { level: 'elite', from: 2.0, to: null },
    ],
    female: [
      { level: 'beginner', from: 0.5, to: 0.7 },
      { level: 'intermediate', from: 0.9, to: 1.1 },
      { level: 'elite', from: 1.5, to: null },
    ],
  },
  bench_press: {
    male: [
      { level: 'beginner', from: 0.6, to: 0.8 },
      { level: 'intermediate', from: 1.0, to: 1.2 },
      { level: 'elite', from: 1.5, to: null },
    ],
    female: [
      { level: 'beginner', from: 0.3, to: 0.4 },
      { level: 'intermediate', from: 0.5, to: 0.7 },
      { level: 'elite', from: 1.0, to: null },
    ],
  },
  deadlift: {
    male: [
      { level: 'beginner', from: 1.0, to: 1.2 },
      { level: 'intermediate', from: 1.5, to: 1.8 },
      { level: 'elite', from: 2.3, to: null },
    ],
    female: [
      { level: 'beginner', from: 0.6, to: 0.8 },
      { level: 'intermediate', from: 1.2, to: 1.4 },
      { level: 'elite', from: 1.8, to: null },
    ],
  },
} as const;

export function isStandardExercise(key: string): key is StandardExerciseKey {
  return (STANDARD_EXERCISE_KEYS as readonly string[]).includes(key);
}

export interface StrengthStanding {
  /** The estimated maximum as a multiple of body weight. */
  readonly factor: number;
  /**
   * The band it falls in, or `null` below the first one.
   *
   * Below the beginner threshold the table says nothing, and inventing a band
   * under it would be the platform grading somebody the coach's own standards
   * decline to grade.
   */
  readonly level: StrengthLevel | null;
  /** The bands themselves, so the interface can show what the table says. */
  readonly bands: readonly StrengthBand[];
}

/**
 * Where an estimated maximum sits in the coach's table.
 *
 * `null` wherever the question cannot be answered: no body weight on file, a sex
 * the table does not distinguish, or a lift it does not cover. Nothing is
 * approximated — a standing computed from a guessed body weight would be a
 * number with the shape of a finding and none of the substance.
 */
export function strengthStanding({
  oneRepMaxKg,
  bodyWeightKg,
  exerciseKey,
  sex,
}: {
  readonly oneRepMaxKg: number;
  readonly bodyWeightKg: number;
  readonly exerciseKey: string;
  readonly sex: AthleteSex;
}): StrengthStanding | null {
  if (!isStandardExercise(exerciseKey)) return null;
  if (sex !== 'male' && sex !== 'female') return null;
  if (!Number.isFinite(oneRepMaxKg) || !Number.isFinite(bodyWeightKg)) return null;
  if (oneRepMaxKg <= 0 || bodyWeightKg <= 0) return null;

  const bands = STRENGTH_STANDARDS[exerciseKey][sex];
  const factor = oneRepMaxKg / bodyWeightKg;

  // The highest band whose entry point the factor has reached. Read from the
  // top so a value above every threshold lands in the top band rather than the
  // first one it happens to clear.
  const reached = [...bands].reverse().find((band) => factor >= band.from) ?? null;

  return { factor, level: reached?.level ?? null, bands };
}
