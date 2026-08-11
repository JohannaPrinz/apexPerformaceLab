import type { ModuleConfiguration } from './configuration';

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
  /** Configured types with no measurement at all. */
  readonly missingTypeIds: readonly string[];
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
 * 1. **A configured quantity with no value at all → `INSUFFICIENT`.** Without
 *    lactate there is no lactate curve, however many heart rates were taken.
 * 2. **Every configured slot filled → `COMPLETE`.**
 * 3. **Otherwise `PARTIAL`** — some stages are missing, and an analysis over
 *    what exists may still be worth writing. That call belongs to the coach;
 *    this only reports the state.
 *
 * Open dimensions — a site the coach names as they go — cannot be enumerated in
 * advance and therefore contribute nothing to the expected count. A test whose
 * only incompleteness is "maybe more sites could have been measured" reads as
 * complete, which is the correct answer: there was never a target number.
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
  const closedDimensions = configuration.dimensions.reduce(
    (total, dimension) => total * Math.max(dimension.values?.length ?? 1, 1),
    1,
  );

  const expectedPerSlot = sides * closedDimensions;
  const expected =
    configuration.measurementTypeIds.length * configuredPasses.length * expectedPerSlot;

  const missingTypeIds = configuration.measurementTypeIds.filter(
    (typeId) => !current.some((measurement) => measurement.measurementTypeId === typeId),
  );

  const missingPasses = configuredPasses
    .filter(
      (pass) => pass !== null && !current.some((measurement) => measurement.passIndex === pass),
    )
    .map((pass) => pass!);

  // Count only the slots the configuration actually asks for. A measurement
  // recorded for a type that is no longer configured is kept — it happened —
  // but it does not make the test look more complete than it is.
  const recorded = current.filter((measurement) =>
    configuration.measurementTypeIds.includes(measurement.measurementTypeId),
  ).length;

  if (missingTypeIds.length > 0) {
    return { level: 'INSUFFICIENT', missingTypeIds, missingPasses, expected, recorded };
  }

  return {
    level: recorded >= expected ? 'COMPLETE' : 'PARTIAL',
    missingTypeIds,
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
