import type { MeasurementRole, ModuleConfiguration } from '@apex/domain';

/**
 * The cells a test asks a coach to fill.
 *
 * Derived entirely from the configuration: quantities × passes × sides ×
 * exercises × declared dimension values. **No test type is named here** — a
 * lactate step test and a grip-strength test differ only in what the
 * configuration says, which is what keeps this file free of per-test branches.
 *
 * An open dimension — a site the coach names as they go — produces no fixed
 * cells: there was never a target number, so the screen offers a free row
 * instead of pretending to know how many are coming.
 *
 * Every configured quantity gets a cell, whatever its role. `optional` means
 * "may be left empty", not "hidden" — a coach who wants to record it must be
 * able to see it. The role travels with the slot so the cell can say which
 * values the test is actually waiting for.
 */

export interface MeasurementSlot {
  /** Stable within a pass; used as a React key and to match existing values. */
  readonly key: string;
  readonly measurementTypeId: string;
  readonly role: MeasurementRole;
  readonly side: 'LEFT' | 'RIGHT' | 'BILATERAL';
  /** Which movement this cell is recorded during, when the test covers any. */
  readonly exerciseId: string | null;
  /** Fixed dimension values, when the configuration declares them. */
  readonly context: Record<string, string>;
  /** Dimensions the coach fills in freely. */
  readonly openDimensions: readonly { key: string; label: string }[];
}

/** Every combination of the closed dimensions, in declaration order. */
function closedCombinations(configuration: ModuleConfiguration): readonly Record<string, string>[] {
  return configuration.dimensions.reduce<Record<string, string>[]>(
    (combinations, dimension) => {
      if (!dimension.values || dimension.values.length === 0) return combinations;

      return combinations.flatMap((combination) =>
        dimension.values!.map((value) => ({ ...combination, [dimension.key]: value })),
      );
    },
    [{}],
  );
}

export function slotsForPass(configuration: ModuleConfiguration): readonly MeasurementSlot[] {
  const sides = configuration.recordsSide ? (['LEFT', 'RIGHT'] as const) : (['BILATERAL'] as const);

  // A test that names no exercise still has one cell per quantity. `null` here
  // is the same statement the column makes: this test does not work in
  // movements at all.
  const exerciseIds: readonly (string | null)[] =
    configuration.exerciseIds.length > 0 ? configuration.exerciseIds : [null];

  const openDimensions = configuration.dimensions
    .filter((dimension) => !dimension.values || dimension.values.length === 0)
    .map((dimension) => ({ key: dimension.key, label: dimension.label }));

  return configuration.measurementTypes.flatMap((entry) =>
    exerciseIds.flatMap((exerciseId) =>
      sides.flatMap((side) =>
        closedCombinations(configuration).map((context) => ({
          key: `${entry.measurementTypeId}|${exerciseId ?? ''}|${side}|${JSON.stringify(context)}`,
          measurementTypeId: entry.measurementTypeId,
          role: entry.role,
          side,
          exerciseId,
          context,
          openDimensions,
        })),
      ),
    ),
  );
}

/** `[1, 2, 3]` for a stepped test, `[null]` for a single-pass one. */
export function passesOf(configuration: ModuleConfiguration): readonly (number | null)[] {
  return configuration.passes > 1
    ? Array.from({ length: configuration.passes }, (_, index) => index + 1)
    : [null];
}

export interface RecordedMeasurement {
  id: string;
  measurementTypeId: string;
  side: string;
  exerciseId: string | null;
  passIndex: number | null;
  context: unknown;
  numericValue: unknown;
  textValue: string | null;
  booleanValue: boolean | null;
  note: string | null;
}

/**
 * Finds the value already recorded for a slot, if any.
 *
 * Matching is on the coordinates the slot describes — type, side, pass and the
 * closed dimensions. Open dimensions are not matched: a freely named site
 * cannot be predicted, so those rows are listed separately rather than slotted.
 */
export function findRecorded<TMeasurement extends RecordedMeasurement>(
  measurements: readonly TMeasurement[],
  slot: MeasurementSlot,
  passIndex: number | null,
): TMeasurement | undefined {
  return measurements.find((measurement) => {
    if (measurement.measurementTypeId !== slot.measurementTypeId) return false;
    if (measurement.side !== slot.side) return false;
    if ((measurement.exerciseId ?? null) !== slot.exerciseId) return false;
    if ((measurement.passIndex ?? null) !== passIndex) return false;

    const context = (measurement.context ?? {}) as Record<string, string>;

    return Object.entries(slot.context).every(([key, value]) => context[key] === value);
  });
}

/** Whether a pass holds nothing — a stage the coach skipped, or has yet to reach. */
export function isPassEmpty(
  measurements: readonly RecordedMeasurement[],
  passIndex: number | null,
): boolean {
  return !measurements.some((measurement) => (measurement.passIndex ?? null) === passIndex);
}

/** How many of a pass's cells are filled — for the progress a coach sees. */
export function passProgress(
  configuration: ModuleConfiguration,
  measurements: readonly RecordedMeasurement[],
  passIndex: number | null,
): { filled: number; expected: number } {
  const slots = slotsForPass(configuration);

  return {
    expected: slots.length,
    filled: slots.filter((slot) => findRecorded(measurements, slot, passIndex) !== undefined)
      .length,
  };
}

/**
 * Renders a stored numeric value.
 *
 * `numericValue` arrives as Prisma's `Decimal`, not a `number` — the column is
 * `Decimal(12,4)` precisely so a lactate reading keeps its precision. Passing it
 * to `String()` unnarrowed would stringify an object, which is what the
 * `no-base-to-string` rule is warning about; this narrows first.
 */
export function formatValue(measurement: RecordedMeasurement): string {
  if (measurement.textValue !== null) return measurement.textValue;
  if (measurement.booleanValue !== null) return measurement.booleanValue ? 'Yes' : 'No';

  const numeric: unknown = measurement.numericValue;
  if (numeric === null || numeric === undefined) return '';
  if (typeof numeric === 'number' || typeof numeric === 'string') return String(numeric);

  return (numeric as { toString: () => string }).toString();
}
