import { z } from 'zod';

/**
 * The system measurement type catalogue.
 *
 * These are the types every Workspace inherits — `MeasurementType` rows with a
 * null `organizationId` (§12). A workspace may add its own; it never edits
 * these.
 *
 * The catalogue lives here rather than in a seed file because it is a **domain
 * decision, not data**: which quantities the platform knows how to record is a
 * professional statement, and it belongs where the module registry is, under
 * review, in one diff. The seed reads from here.
 *
 * Three rules this file holds:
 *
 * - **No reference ranges.** `referenceMin`/`referenceMax` stay null for the
 *   MVP. A single global range for "grip strength" — identical for a
 *   25-year-old runner and a 55-year-old recreational athlete — produces
 *   "outside normal" markers that do not hold up, and a platform that calls
 *   itself scientific is devalued precisely by those.
 * - **No device or vendor coupling.** Muscle Activity is a quantity, not a
 *   Myoact reading. VALD, Myoact, Garmin and Polar are *sources* recorded on
 *   the Measurement (§11, §13); a type never names one.
 * - **No module binding.** A type is not tied to a module. The coach chooses,
 *   inside an assessment, which types belong there — see the note on `category`
 *   below.
 */

/**
 * Value types, mirroring the Prisma enum `MeasurementValueType`.
 *
 * Restated rather than imported: this package is pure and must not depend on
 * the database layer. A divergence surfaces at the seed, which is the only
 * place the two meet.
 */
export const MEASUREMENT_VALUE_TYPES = ['NUMERIC', 'TEXT', 'BOOLEAN'] as const;
export type MeasurementValueType = (typeof MEASUREMENT_VALUE_TYPES)[number];

/**
 * Categories classify a type by professional area.
 *
 * **Category is a filter, not a binding.** §12 is explicit that it is
 * independent of the module a measurement is recorded in: a coach running a
 * `lactate` module may well record a heart rate, and a `strength` module may
 * include a jump height. The catalogue is filtered by category; nothing is
 * restricted by it.
 *
 * Several keys here also exist as module keys — `strength`, `mobility`,
 * `body_composition`. That overlap is expected and not a violation: modules and
 * categories are separate namespaces describing different things. §11's naming
 * rule constrains *presets* against *modules*, nothing else.
 */
export const MEASUREMENT_CATEGORIES = [
  'body_composition',
  'cardiovascular',
  'endurance',
  'strength',
  'muscle_activity',
  'mobility',
  'performance',
] as const;

export const measurementCategorySchema = z.enum(MEASUREMENT_CATEGORIES);
export type MeasurementCategory = z.infer<typeof measurementCategorySchema>;

export const MEASUREMENT_CATEGORY_LABELS: Readonly<Record<MeasurementCategory, string>> = {
  body_composition: 'Body Composition',
  cardiovascular: 'Cardiovascular',
  endurance: 'Endurance',
  strength: 'Strength',
  muscle_activity: 'Muscle Activity',
  mobility: 'Mobility',
  performance: 'Performance',
} as const;

/**
 * One entry of the system catalogue.
 *
 * Shaped after the `MeasurementType` model, minus the fields the database owns
 * (`id`, timestamps) and minus the reference range, which stays null.
 *
 * **Side is deliberately absent** (§12, §26.10). "Grip Strength" is the same
 * type on both sides; only the recorded value differs, so side belongs to the
 * Measurement.
 */
export interface SystemMeasurementType {
  /** Stable identifier. Unique among system types; never renamed once shipped. */
  readonly key: string;
  readonly name: string;
  /** Display unit. Required by the model even where a quantity is dimensionless. */
  readonly unit: string;
  readonly valueType: MeasurementValueType;
  readonly category: MeasurementCategory;
}

/**
 * The MVP catalogue.
 *
 * Ordered by category, then as listed in the specification — not
 * alphabetically, which would separate Lactate from Heart Rate.
 */
export const SYSTEM_MEASUREMENT_TYPES = [
  // ── Body composition ──────────────────────────────────────────────────────
  { key: 'weight', name: 'Weight', unit: 'kg', valueType: 'NUMERIC', category: 'body_composition' },
  {
    key: 'body_fat',
    name: 'Body Fat',
    unit: '%',
    valueType: 'NUMERIC',
    category: 'body_composition',
  },

  // ── Cardiovascular / endurance ────────────────────────────────────────────
  {
    key: 'heart_rate',
    name: 'Heart Rate',
    unit: 'bpm',
    valueType: 'NUMERIC',
    category: 'cardiovascular',
  },
  { key: 'lactate', name: 'Lactate', unit: 'mmol/L', valueType: 'NUMERIC', category: 'endurance' },
  {
    key: 'rpe',
    name: 'RPE',
    // A dimensionless scale, but `unit` is required by the model. The bounds are
    // deliberately *not* a reference range: 1–10 defines the scale itself,
    // whereas a reference range would claim what is normal.
    unit: '1–10',
    valueType: 'NUMERIC',
    category: 'endurance',
  },
  { key: 'pace', name: 'Pace', unit: 'min/km', valueType: 'NUMERIC', category: 'endurance' },

  // ── Strength ──────────────────────────────────────────────────────────────
  {
    key: 'grip_strength',
    name: 'Grip Strength',
    unit: 'kg',
    valueType: 'NUMERIC',
    category: 'strength',
  },
  { key: 'force', name: 'Force', unit: 'N', valueType: 'NUMERIC', category: 'strength' },

  // ── Muscle activity ───────────────────────────────────────────────────────
  // The quantity, not the device. Myoact is a possible source, recorded on the
  // Measurement — never in the type.
  {
    key: 'muscle_activity',
    name: 'Muscle Activity',
    unit: '%',
    valueType: 'NUMERIC',
    category: 'muscle_activity',
  },

  // ── Mobility ──────────────────────────────────────────────────────────────
  {
    key: 'range_of_motion',
    name: 'Range of Motion',
    unit: '°',
    valueType: 'NUMERIC',
    category: 'mobility',
  },

  // ── Performance ───────────────────────────────────────────────────────────
  {
    key: 'jump_height',
    name: 'Jump Height',
    unit: 'cm',
    valueType: 'NUMERIC',
    category: 'performance',
  },
  {
    key: 'running_cadence',
    name: 'Running Cadence',
    unit: 'steps/min',
    valueType: 'NUMERIC',
    category: 'performance',
  },
] as const satisfies readonly SystemMeasurementType[];

export type SystemMeasurementTypeKey = (typeof SYSTEM_MEASUREMENT_TYPES)[number]['key'];

/** Catalogue lookup by key. */
export function findSystemMeasurementType(key: string): SystemMeasurementType | undefined {
  return SYSTEM_MEASUREMENT_TYPES.find((type) => type.key === key);
}

/** The catalogue filtered by professional area — the primary browse axis (§12). */
export function systemMeasurementTypesByCategory(
  category: MeasurementCategory,
): readonly SystemMeasurementType[] {
  return SYSTEM_MEASUREMENT_TYPES.filter((type) => type.category === category);
}
