/**
 * When two readings are the same value.
 *
 * ## Why this is a domain rule and not a query detail
 *
 * "Has this got bigger since March" is only answerable if both numbers measure
 * the same thing. Two grip-strength readings are comparable; a left hand and a
 * right hand are not, nor are stage 2 of one lactate test and stage 4 of
 * another, nor the same quantity taken at two different sites. Every screen
 * that puts values beside each other — the diagram on a test, the trend over an
 * athlete's season, a summary that states a difference — has to agree about
 * this, and three copies of it would eventually disagree.
 *
 * The coordinates are exactly the columns a `Measurement` carries beyond its
 * value: the measurement type (which brings the unit and the value type with
 * it, so neither needs a separate check), the side, the exercise, the stage,
 * and the dimension values. Anything differing in one of them is a different
 * series.
 *
 * ## Two keys, because two questions
 *
 * `comparisonKey` includes the stage: stage 3 of two tests is one series, and a
 * whole stepped test is therefore several. `seriesKey` leaves the stage out,
 * for the reads that group a test's stages into one curve.
 */

/** The coordinates a reading carries beyond its value. */
export interface ComparisonCoordinates {
  readonly measurementTypeId: string;
  readonly side: string;
  readonly exerciseId: string | null;
  readonly passIndex: number | null;
  readonly context: unknown;
}

/** Sorted, so two equal contexts written in a different order are one key. */
export function canonicalContext(value: unknown): string {
  const context = contextOf(value);

  return Object.keys(context)
    .sort()
    .map((name) => `${name}=${context[name] ?? ''}`)
    .join(',');
}

/** A stored context as a plain record. Anything unreadable is no context. */
export function contextOf(value: unknown): Record<string, string> {
  return value === null || typeof value !== 'object' ? {} : (value as Record<string, string>);
}

/**
 * Every coordinate that has to match for two readings to be the same value.
 *
 * The stage is part of it. Two lactate tests are compared stage against stage,
 * never as wholes — a wrong pairing is worse than an honest set (§11).
 */
export function comparisonKey(
  row: Omit<ComparisonCoordinates, 'passIndex'> & {
    readonly passIndex: number | null;
  },
): string {
  return [
    row.measurementTypeId,
    row.side,
    row.exerciseId ?? '',
    row.passIndex === null ? '' : String(row.passIndex),
    canonicalContext(row.context),
  ].join('|');
}

/**
 * The same, without the stage.
 *
 * For reads that draw one curve per test rather than one point per stage: the
 * stages are the curve, so they must not split it.
 */
export function seriesKey(row: Omit<ComparisonCoordinates, 'passIndex'>): string {
  return [
    row.measurementTypeId,
    row.side,
    row.exerciseId ?? '',
    canonicalContext(row.context),
  ].join('|');
}
