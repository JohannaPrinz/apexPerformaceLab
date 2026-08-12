import { countedMeasurements, type ModuleConfiguration } from './configuration';

/**
 * Whether the data present supports an analysis.
 *
 * **Status does not decide this.** A `COMPLETED` test may be missing values,
 * and an `ABORTED` one may hold enough to be useful — so the question is
 * answered from what was actually recorded, against what the test was
 * configured to record.
 *
 * Nothing is filled in. A missing value stays missing; the result says so and
 * names what is absent, which is the only honest thing a scientific record can
 * do with a gap.
 *
 * ## What each role means here
 *
 * | Role          | Missing entirely | Partially recorded |
 * | ------------- | ---------------- | ------------------ |
 * | `required`    | `INSUFFICIENT`   | `PARTIAL`          |
 * | `recommended` | `PARTIAL`        | `PARTIAL`          |
 * | `optional`    | no effect        | no effect          |
 *
 * A required quantity with no value at all sinks the test: without lactate
 * there is no lactate curve, however many heart rates were taken. A
 * recommended one that is absent leaves the test evaluable but not complete —
 * which is the distinction that makes `recommended` more than a synonym for
 * `optional`. An optional quantity never counts: a coach who records it adds
 * information, and one who does not has left nothing out.
 */

export type ReadinessLevel = 'COMPLETE' | 'PARTIAL' | 'INSUFFICIENT';

export interface ReadinessInput {
  readonly measurementTypeId: string;
  readonly passIndex: number | null;
  /** Superseded values do not count — the correction replaced them (§13). */
  readonly supersededById: string | null;
}

export interface Readiness {
  readonly level: ReadinessLevel;
  /** Required quantities with no measurement at all — the reason for `INSUFFICIENT`. */
  readonly missingTypeIds: readonly string[];
  /** Recommended quantities with no measurement at all. Never sink the test. */
  readonly missingRecommendedTypeIds: readonly string[];
  /** Passes that are configured but hold nothing. */
  readonly missingPasses: readonly number[];
  /** Slots configured, slots filled — for a progress indicator. */
  readonly expected: number;
  readonly recorded: number;
}

/**
 * Computes readiness from a module's configuration and its measurements.
 *
 * The rules, in the order they decide:
 *
 * 1. **A required quantity with no value at all → `INSUFFICIENT`.**
 * 2. **Every counted slot filled → `COMPLETE`.**
 * 3. **Otherwise `PARTIAL`** — some stages or recommended values are missing,
 *    and an analysis over what exists may still be worth writing. That call
 *    belongs to the coach; this only reports the state.
 *
 * Open dimensions — a site the coach names as they go — cannot be enumerated in
 * advance and therefore contribute nothing to the expected count. A test whose
 * only incompleteness is "maybe more sites could have been measured" reads as
 * complete, which is the correct answer: there was never a target number.
 *
 * The configuration passed in is always the module's **own stored**
 * configuration, never a template — which is why a template edited later cannot
 * change the verdict on a test performed months ago.
 */
export function evaluateReadiness(
  configuration: ModuleConfiguration,
  measurements: readonly ReadinessInput[],
): Readiness {
  const current = measurements.filter((measurement) => measurement.supersededById === null);

  const configuredPasses =
    configuration.passes > 1
      ? Array.from({ length: configuration.passes }, (_, index) => index + 1)
      : [null];

  const sides = configuration.recordsSide ? 2 : 1;
  const exercises = Math.max(configuration.exerciseIds.length, 1);
  const closedDimensions = configuration.dimensions.reduce(
    (total, dimension) => total * Math.max(dimension.values?.length ?? 1, 1),
    1,
  );

  const counted = countedMeasurements(configuration);
  const expectedPerSlot = sides * exercises * closedDimensions;
  const expected = counted.length * configuredPasses.length * expectedPerSlot;

  const hasAnyValue = (typeId: string) =>
    current.some((measurement) => measurement.measurementTypeId === typeId);

  const missingTypeIds = configuration.measurementTypes
    .filter((entry) => entry.role === 'required' && !hasAnyValue(entry.measurementTypeId))
    .map((entry) => entry.measurementTypeId);

  const missingRecommendedTypeIds = configuration.measurementTypes
    .filter((entry) => entry.role === 'recommended' && !hasAnyValue(entry.measurementTypeId))
    .map((entry) => entry.measurementTypeId);

  const missingPasses = configuredPasses
    .filter(
      (pass) => pass !== null && !current.some((measurement) => measurement.passIndex === pass),
    )
    .map((pass) => pass!);

  // Count only the slots the configuration actually asks for. A measurement
  // recorded for a type that is no longer configured, or for an optional one,
  // is kept — it happened — but it does not make the test look more complete
  // than it is.
  const countedTypeIds = new Set(counted.map((entry) => entry.measurementTypeId));
  const recorded = current.filter((measurement) =>
    countedTypeIds.has(measurement.measurementTypeId),
  ).length;

  if (missingTypeIds.length > 0) {
    return {
      level: 'INSUFFICIENT',
      missingTypeIds,
      missingRecommendedTypeIds,
      missingPasses,
      expected,
      recorded,
    };
  }

  return {
    level: recorded >= expected ? 'COMPLETE' : 'PARTIAL',
    missingTypeIds,
    missingRecommendedTypeIds,
    missingPasses,
    expected,
    recorded,
  };
}

/**
 * Readiness across the tests an analysis draws on.
 *
 * An analysis is as good as its weakest included test: one insufficient test
 * makes the whole analysis insufficient, because the conclusion would rest on a
 * quantity nobody measured. Excluded tests are not passed in — the decision to
 * set one aside belongs to the analysis, and by the time this runs it has
 * already been taken.
 */
export function combineReadiness(parts: readonly Readiness[]): ReadinessLevel {
  if (parts.length === 0) return 'INSUFFICIENT';
  if (parts.some((part) => part.level === 'INSUFFICIENT')) return 'INSUFFICIENT';
  if (parts.some((part) => part.level === 'PARTIAL')) return 'PARTIAL';

  return 'COMPLETE';
}
