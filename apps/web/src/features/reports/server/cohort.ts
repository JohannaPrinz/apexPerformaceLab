import { seriesIdentity } from '@apex/domain';

/**
 * The workspace's other athletes, reduced to what a percentile needs (§16).
 *
 * ## What it answers
 *
 * One pair of extremes per other athlete, per series: the lowest and the highest
 * standing value they hold. Which of the two counts as their *best* is decided
 * later, by the direction of the series being compared — so both are kept.
 *
 * ## Why the database hands over groups and not readings
 *
 * The cohort used to be read as rows, capped at 5000 with no order of its own.
 * Beyond that cap whole athletes went missing and others were cut in half, and a
 * percentile published from such a read is frozen into the document for good.
 *
 * So the extremes are aggregated where the rows are, grouped by the test they
 * belong to and by the reading's own coordinates. That grouping is **finer**
 * than the series identity, never coarser:
 *
 * - a test belongs to exactly one athlete and carries exactly one protocol, so
 *   grouping by the test cannot merge two athletes or two protocols;
 * - two contexts that are equal as JSONB are equal after `canonicalContext`, so
 *   grouping by the stored context cannot merge two series either. Where JSONB
 *   tells apart what `canonicalContext` treats as one — `{"a": 1}` beside
 *   `{"a": "1"}` — the groups arrive separately and are merged here.
 *
 * Extremes merge exactly: the lowest of the groups' lowest values is the lowest
 * of all their readings. That is the whole reason this is a correct answer and
 * not an approximation of one.
 */

/** A stored decimal, as Prisma hands it back. */
interface DecimalLike {
  toString(): string;
}

/** One `measurement.groupBy` row: a test's readings of one coordinate. */
export interface CohortGroup {
  readonly assessmentModuleId: string;
  readonly measurementTypeId: string;
  readonly side: string;
  readonly exerciseId: string | null;
  readonly passIndex: number | null;
  readonly context: unknown;
  readonly _min: { readonly numericValue: DecimalLike | null } | null;
  readonly _max: { readonly numericValue: DecimalLike | null } | null;
}

/** What a cohort test contributes beyond its readings: whose, and under which protocol. */
export interface CohortTest {
  readonly athleteId: string;
  /** From the test's own stored configuration, exactly as for this athlete's readings. */
  readonly protocolKey: string | null;
}

export interface Extremes {
  readonly lowest: number;
  readonly highest: number;
}

/** Series identity → other athlete → their extremes in that series. */
export type Cohort = ReadonlyMap<string, ReadonlyMap<string, Extremes>>;

/**
 * `seriesIdentity` reads the coordinates and the protocol and nothing else. A
 * group carries no single value or moment, so these two only complete the type.
 */
const NO_MOMENT = new Date(0);

/** A decimal as a number, or `null` where there is none a percentile could use. */
function numberOf(value: DecimalLike | null | undefined): number | null {
  if (value === null || value === undefined) return null;

  const parsed = Number(value.toString());

  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * Merges the groups into one set of extremes per athlete and series.
 *
 * A group whose test is not among `tests` is left out: the two reads run side by
 * side, and a test archived between them is not part of the cohort.
 */
export function cohortOf(
  groups: readonly CohortGroup[],
  tests: ReadonlyMap<string, CohortTest>,
): Cohort {
  const cohort = new Map<string, Map<string, Extremes>>();

  for (const group of groups) {
    const test = tests.get(group.assessmentModuleId);
    if (test === undefined) continue;

    const lowest = numberOf(group._min?.numericValue);
    const highest = numberOf(group._max?.numericValue);
    if (lowest === null || highest === null) continue;

    const identity = seriesIdentity({
      measurementTypeId: group.measurementTypeId,
      side: group.side,
      exerciseId: group.exerciseId,
      passIndex: group.passIndex,
      context: group.context,
      protocolKey: test.protocolKey,
      moduleId: group.assessmentModuleId,
      value: lowest,
      capturedAt: NO_MOMENT,
    });

    const byAthlete = cohort.get(identity) ?? new Map<string, Extremes>();
    const held = byAthlete.get(test.athleteId);

    byAthlete.set(
      test.athleteId,
      held === undefined
        ? { lowest, highest }
        : { lowest: Math.min(held.lowest, lowest), highest: Math.max(held.highest, highest) },
    );
    cohort.set(identity, byAthlete);
  }

  return cohort;
}
