import type { BetterDirection } from '../modules/self-comparison';

/**
 * Where a value sits among the people it can honestly be compared with.
 *
 * ## Why the workspace and not a norm
 *
 * Apex OS carries no reference values, and inventing them would be the worst
 * thing this file could do: a percentile against a population nobody can name is
 * a number with the shape of evidence and none of the substance. What a
 * workspace *does* have is its own athletes, measured by the same coach on the
 * same protocol — a small group, but a real one.
 *
 * So the comparison group is named, its size is reported, and the statement is
 * always "among these n athletes" rather than "among athletes".
 *
 * ## Why there is a floor
 *
 * "75th percentile" computed from three people is arithmetic dressed as a
 * finding. Below `MIN_COHORT` this answers `null` and the interface says the
 * group is too small — which is information, where a number would be noise.
 *
 * ## What it does not do
 *
 * It does not rank, it does not grade, and it does not say whether a value is
 * good. Where the test declares no direction there is no percentile at all: with
 * nothing saying which way is wanted, "top 10 %" could mean either end.
 */

/** Fewer comparable athletes than this and no percentile is stated. */
export const MIN_COHORT = 8;

export interface Percentile {
  /** 0–100, rounded. The share of the group this value is at least as good as. */
  readonly percentile: number;
  /** How many other athletes it was compared against. Always shown with it. */
  readonly cohort: number;
}

/**
 * The percentile of `value` within `others`, or `null` where none may be stated.
 *
 * `others` are one comparable value per other athlete — never several readings
 * of the same person, which would weight whoever was tested most often.
 *
 * The direction decides which end counts as ahead: for a running time, lower is
 * ahead; for a load, higher is. Without a declared direction this returns
 * `null`, because the question has no answer.
 */
export function percentileOf(
  value: number,
  others: readonly number[],
  direction: BetterDirection | null,
): Percentile | null {
  if (direction === null || others.length < MIN_COHORT) return null;
  if (!Number.isFinite(value)) return null;

  const behind = others.filter((other) =>
    direction === 'lower' ? other >= value : other <= value,
  ).length;

  return {
    percentile: Math.round((behind / others.length) * 100),
    cohort: others.length,
  };
}
