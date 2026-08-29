import { comparisonKey, type ComparisonCoordinates } from './comparison';

/**
 * The same test, again — what the numbers did in between.
 *
 * ## What this answers, and what it refuses to
 *
 * A coach who repeats a test wants four things: what it says now, what it said
 * last time, how far apart the two are, and where the extremes of the series
 * lie. All four are arithmetic. **None of them is a judgement**, and this module
 * produces none: no "better", no "worse", no percentage of a target, no verdict.
 *
 * ## Why it is not a second comparison rule
 *
 * Whether two readings are the same quantity is already decided, once, by
 * `comparisonKey` — measurement type, side, exercise, stage and dimensions. This
 * composes with it rather than restating it: a series here is a `comparisonKey`
 * **plus** the protocol its test was carried out under. Two rules that both
 * claimed to define sameness would eventually disagree, and the disagreement
 * would look like a change in the athlete.
 *
 * The protocol is not folded into `comparisonKey` itself because it lives on the
 * module, not on the reading. Every caller of `comparisonKey` would then have to
 * load a configuration to compare two numbers, and most of them have no reason
 * to.
 *
 * ## Why "best" needs permission
 *
 * The highest duration is the best one in a plank hold and the worst one in a
 * time trial. Nothing in the catalogue says which — deliberately, because the
 * same quantity points both ways in different tests. So the extremes are always
 * reported as what they are, and **only** a protocol that states a direction
 * turns one of them into a best value. A "best" the platform picked on its own
 * would be an invented direction, and an invented direction reads exactly like a
 * measured one.
 */

/** One standing reading, as the caller already holds it. */
export interface ComparableReading extends ComparisonCoordinates {
  readonly value: number;
  readonly capturedAt: Date;
  /** Which test it came from — so the interface can link back to it. */
  readonly moduleId: string;
  /**
   * The comparison identity of that test's protocol, or `null` where it
   * declared none. Readings whose protocols differ are different series.
   */
  readonly protocolKey: string | null;
  /**
   * How the value came about, carried straight through.
   *
   * A reading the video analysis derived and one the coach typed are both facts
   * — but a screen that showed them identically would be hiding which is which.
   */
  readonly source?: string;
}

/** One reading, named. */
export interface SeriesPoint {
  readonly value: number;
  readonly capturedAt: Date;
  readonly moduleId: string;
}

export interface SelfComparison {
  /** `comparisonKey` plus the protocol — the identity of this series. */
  readonly key: string;
  readonly comparisonKey: string;
  readonly protocolKey: string | null;
  /** The coordinates, carried through so the interface can label the row. */
  readonly coordinates: ComparisonCoordinates;
  /** The reading being looked at. */
  readonly current: SeriesPoint;
  /** The most recent comparable reading before it. `null` where it is the first. */
  readonly previous: SeriesPoint | null;
  /**
   * Current minus previous, in the measurement's own unit.
   *
   * Signed, never absolute: the sign is half the information. It is stated as a
   * number and nothing else — which of the two directions is wanted is not
   * something this knows.
   */
  readonly difference: number | null;
  /** The largest reading of the series, and the smallest. Always both. */
  readonly highest: SeriesPoint;
  readonly lowest: SeriesPoint;
  /**
   * The extreme the protocol calls best — `null` unless it says which.
   *
   * Never guessed. A series with no declared direction has a highest and a
   * lowest value and no opinion about them.
   */
  readonly best: SeriesPoint | null;
  /** How many comparable readings the series holds, this one included. */
  readonly count: number;
  /** The source of the current reading. */
  readonly source: string;
}

/** Which extreme a test is working towards, where the coach has said. */
export type BetterDirection = 'lower' | 'higher';

/** The series identity: the same quantity, under the same conditions. */
export function seriesIdentity(reading: ComparableReading): string {
  return `${comparisonKey(reading)}#${reading.protocolKey ?? ''}`;
}

const olderFirst = (a: ComparableReading, b: ComparableReading) =>
  a.capturedAt.getTime() - b.capturedAt.getTime();

const pointOf = (reading: ComparableReading): SeriesPoint => ({
  value: reading.value,
  capturedAt: reading.capturedAt,
  moduleId: reading.moduleId,
});

/**
 * Builds one comparison per series, for the readings of **one** test.
 *
 * `current` is chosen from `moduleId`: the series may well continue past the
 * test being looked at — a coach reading an old test should see what that test
 * said and what came before it, not what happened afterwards. Readings later
 * than the current one still count towards the extremes, because a highest value
 * is a fact about the series and not about the moment.
 *
 * A series the current test contributes nothing to is left out entirely: this
 * describes one test, not the athlete's whole record.
 */
export function selfComparisons(
  readings: readonly ComparableReading[],
  moduleId: string,
  direction: BetterDirection | null = null,
): readonly SelfComparison[] {
  const series = new Map<string, ComparableReading[]>();

  for (const reading of readings) {
    const key = seriesIdentity(reading);
    const found = series.get(key);
    if (found) found.push(reading);
    else series.set(key, [reading]);
  }

  const results: SelfComparison[] = [];

  for (const [key, entries] of series) {
    const sorted = [...entries].sort(olderFirst);

    // The current test's own reading. Where it recorded the same series twice —
    // a repeated attempt corrected into a second row — the later one stands.
    const own = sorted.filter((entry) => entry.moduleId === moduleId);
    const current = own.at(-1);
    if (current === undefined) continue;

    const before = sorted.filter(
      (entry) =>
        entry.moduleId !== moduleId && entry.capturedAt.getTime() <= current.capturedAt.getTime(),
    );
    const previous = before.at(-1) ?? null;

    let highest = sorted[0]!;
    let lowest = sorted[0]!;
    for (const entry of sorted) {
      if (entry.value > highest.value) highest = entry;
      if (entry.value < lowest.value) lowest = entry;
    }

    results.push({
      key,
      comparisonKey: comparisonKey(current),
      protocolKey: current.protocolKey,
      coordinates: {
        measurementTypeId: current.measurementTypeId,
        side: current.side,
        exerciseId: current.exerciseId,
        passIndex: current.passIndex,
        context: current.context,
      },
      current: pointOf(current),
      previous: previous === null ? null : pointOf(previous),
      difference: previous === null ? null : round(current.value - previous.value),
      highest: pointOf(highest),
      lowest: pointOf(lowest),
      best: direction === null ? null : pointOf(direction === 'lower' ? lowest : highest),
      count: sorted.length,
      source: current.source ?? 'MANUAL',
    });
  }

  return results;
}

/**
 * Four decimals, matching what the database stores.
 *
 * A difference of two stored values must not acquire floating-point noise on the
 * way to the screen — `0.30000000000000004` in a record is a number nobody
 * measured.
 */
function round(value: number): number {
  return Math.round(value * 10_000) / 10_000;
}
