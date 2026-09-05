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
  'nutrition',
  'biofeedback',
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
  nutrition: 'Ernährung',
  biofeedback: 'Biofeedback',
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
  /**
   * Which end of this scale is *more of the quantity* — where the quantity
   * itself answers that, and only there.
   *
   * This is **not** a verdict. It says that 140 kg lifted is more load than
   * 120 kg, the way 8 N is more force than 6 N: a statement about the unit, not
   * about the athlete. Whether more is wanted is a professional judgement, and
   * it stays with the coach on the protocol (`betterDirection` there).
   *
   * It exists because a percentile has no meaning without an end to count from,
   * and a coach who set up a maximal strength test without filling in a
   * protocol direction still asked a question with an unambiguous answer. Left
   * undefined on every quantity where the direction is genuinely a judgement —
   * body fat, heart rate, lactate, RPE, range of motion, muscle activity.
   */
  readonly scaleDirection?: 'lower' | 'higher';
}

/**
 * The MVP catalogue.
 *
 * Ordered by category, then as listed in the specification — not
 * alphabetically, which would separate Lactate from Heart Rate.
 */
export const SYSTEM_MEASUREMENT_TYPES = [
  // ── Body composition ──────────────────────────────────────────────────────
  {
    key: 'weight',
    name: 'Körpergewicht',
    // **The athlete's body weight**, and nothing else. The load moved during a
    // test is `external_load` under `strength` — a separate quantity in a
    // separate category, deliberately not this one. Reusing `weight` for both
    // would make "weight over time" a chart of two different things, and no
    // later query could tell them apart.
    unit: 'kg',
    valueType: 'NUMERIC',
    category: 'body_composition',
  },
  {
    key: 'body_fat',
    name: 'Körperfett',
    unit: '%',
    valueType: 'NUMERIC',
    category: 'body_composition',
  },

  // ── Caliper skinfolds ─────────────────────────────────────────────────────
  // Seven sites, seven types, one per site — deliberately not one "skinfold"
  // type with the site as a dimension. A body-density equation names its sites
  // by name, and matching a published formula against a free-text dimension
  // label would make the calculation depend on a word a coach typed. A stable
  // catalogue key is what a formula can be written against.
  //
  // The seven are the Jackson & Pollock seven-site list; the two three-site
  // lists are subsets of it, which is what lets one set of types serve both
  // methods. Millimetres, because that is what a caliper reads.
  {
    key: 'skinfold_chest',
    name: 'Hautfalte Brust',
    unit: 'mm',
    valueType: 'NUMERIC',
    category: 'body_composition',
  },
  {
    key: 'skinfold_triceps',
    name: 'Hautfalte Trizeps',
    unit: 'mm',
    valueType: 'NUMERIC',
    category: 'body_composition',
  },
  {
    key: 'skinfold_midaxillary',
    name: 'Hautfalte Mittelaxillar',
    unit: 'mm',
    valueType: 'NUMERIC',
    category: 'body_composition',
  },
  {
    key: 'skinfold_subscapular',
    name: 'Hautfalte Subscapular',
    unit: 'mm',
    valueType: 'NUMERIC',
    category: 'body_composition',
  },
  {
    key: 'skinfold_suprailiac',
    name: 'Hautfalte Suprailiacal',
    unit: 'mm',
    valueType: 'NUMERIC',
    category: 'body_composition',
  },
  {
    key: 'skinfold_abdomen',
    name: 'Hautfalte Bauch',
    unit: 'mm',
    valueType: 'NUMERIC',
    category: 'body_composition',
  },
  {
    key: 'skinfold_thigh',
    name: 'Hautfalte Oberschenkel',
    unit: 'mm',
    valueType: 'NUMERIC',
    category: 'body_composition',
  },

  // ── Cardiovascular / endurance ────────────────────────────────────────────
  {
    key: 'heart_rate',
    name: 'Herzfrequenz',
    unit: 'bpm',
    valueType: 'NUMERIC',
    category: 'cardiovascular',
  },
  { key: 'lactate', name: 'Laktat', unit: 'mmol/L', valueType: 'NUMERIC', category: 'endurance' },
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
  {
    key: 'pace',
    name: 'Pace',
    // Minutes per kilometre — how runners talk about the road. The same demand
    // expressed as `speed` below; which of the two a test records is the
    // coach's choice, and a treadmill is usually set in km/h while a race is
    // planned in min/km.
    unit: 'min/km',
    valueType: 'NUMERIC',
    category: 'endurance',
  },
  {
    key: 'speed',
    name: 'Geschwindigkeit',
    // Kilometres per hour — how a treadmill is set. Deliberately **not** derived
    // from `pace`: the two are the same demand under a reciprocal, but a
    // measurement is what was recorded, and converting one into the other would
    // put a number in the record that nobody read off an instrument. A test
    // records whichever the coach actually worked in.
    unit: 'km/h',
    valueType: 'NUMERIC',
    category: 'endurance',
  },

  // ── Strength ──────────────────────────────────────────────────────────────
  {
    key: 'grip_strength',
    name: 'Griffkraft',
    unit: 'kg',
    valueType: 'NUMERIC',
    category: 'strength',
    scaleDirection: 'higher',
  },
  {
    key: 'force',
    name: 'Kraft',
    unit: 'N',
    valueType: 'NUMERIC',
    category: 'strength',
    scaleDirection: 'higher',
  },
  {
    key: 'external_load',
    name: 'Externe Last',
    // The load moved in an attempt — the bar, the stack, the added weight.
    // **Never the athlete's body weight**, which is `weight` under
    // `body_composition`. Two quantities that happen to share a unit are still
    // two quantities: one describes the person, the other what they moved.
    //
    // Which movement the load belongs to is the Exercise on the Measurement, not
    // part of this type (§12a). "Bench press load" as a type would mean one type
    // per movement, and the catalogue would grow with the exercise catalogue.
    unit: 'kg',
    valueType: 'NUMERIC',
    category: 'strength',
    scaleDirection: 'higher',
  },
  {
    key: 'repetitions',
    name: 'Wiederholungen',
    // A count, so the unit names what is counted. Numeric rather than an
    // integer type because the model has three value columns and no fourth —
    // the column is `Decimal(12,4)` and a whole number stores exactly.
    unit: 'Wdh.',
    valueType: 'NUMERIC',
    category: 'strength',
  },

  // ── Muscle activity ───────────────────────────────────────────────────────
  // The quantity, not the device. Myoact is a possible source, recorded on the
  // Measurement — never in the type.
  {
    key: 'muscle_activity',
    name: 'Muskelaktivität',
    unit: '%',
    valueType: 'NUMERIC',
    category: 'muscle_activity',
    // A percentage of activation: 40 % is more activation than 30 %, the way
    // 8 N is more force than 6 N. That is what the unit says and all this
    // claims — whether more is wanted at a given site is the coach's judgement,
    // and it stays on the protocol.
    scaleDirection: 'higher',
  },

  // ── Mobility ──────────────────────────────────────────────────────────────
  {
    key: 'range_of_motion',
    name: 'Bewegungsumfang',
    unit: '°',
    valueType: 'NUMERIC',
    category: 'mobility',
  },
  {
    key: 'joint_angle',
    name: 'Gelenkwinkel',
    // **A joint angle at a moment**, not the arc between two moments — that is
    // `range_of_motion` above, and the two are a difference apart. A squat is
    // read by the angle at the bottom; a range of 95° reached from 130° instead
    // of 175° is not the same movement, and only this quantity can tell them
    // apart.
    //
    // Which joint, which side and which moment are coordinates on the
    // Measurement — the side has its own column, the joint and the position are
    // context dimensions the test declares. A type per joint would grow the
    // catalogue with the skeleton (§12).
    unit: '°',
    valueType: 'NUMERIC',
    category: 'mobility',
  },

  // ── Performance ───────────────────────────────────────────────────────────
  {
    key: 'jump_height',
    name: 'Sprunghöhe',
    unit: 'cm',
    valueType: 'NUMERIC',
    category: 'performance',
    scaleDirection: 'higher',
  },
  {
    key: 'duration',
    name: 'Dauer',
    // **The one time quantity.** A run, a station, a hold, a single repetition
    // and a whole race are all durations; what a given one *is* comes from the
    // exercise it names, the pass it belongs to and its context — never from a
    // second type. A `station_time` beside a `run_time` would grow the catalogue
    // with the protocol and make "every duration of this athlete" unanswerable
    // (§12, the same rule that keeps `external_load` from becoming one type per
    // movement).
    //
    // Seconds, not minutes and not a formatted clock: one unit that arithmetic
    // works on. How it is shown — 4:38 or 278 s — is the interface's business.
    //
    // Deliberately no reference range, like every other type here.
    unit: 's',
    valueType: 'NUMERIC',
    // Category is a filter, never a binding (§12): a duration belongs just as
    // much to a strength test as to an endurance one, and the coach adds it to
    // whichever test they want it in.
    category: 'performance',
  },
  {
    key: 'running_cadence',
    name: 'Schrittfrequenz',
    unit: 'Schritte/min',
    valueType: 'NUMERIC',
    category: 'performance',
  },

  // ── Nutrition ─────────────────────────────────────────────────────────────
  //
  // What was eaten and drunk over one day. Grams for the three macronutrients
  // and for fibre, because that is the unit every food label and every
  // nutrition app states them in; litres for fluid.
  //
  // **No reference values and no direction on any of them**, for the same
  // reason as everywhere else in this file: how much protein a person needs
  // depends on their body, their training and their goal, and a catalogue that
  // shipped one number would produce "too little" markers that do not hold up.
  // The coach reads the figures.
  {
    key: 'protein',
    name: 'Eiweiß',
    unit: 'g',
    valueType: 'NUMERIC',
    category: 'nutrition',
  },
  {
    key: 'carbohydrates',
    name: 'Kohlenhydrate',
    unit: 'g',
    valueType: 'NUMERIC',
    category: 'nutrition',
  },
  {
    key: 'fat',
    name: 'Fette',
    // Deliberately not `body_fat`, and deliberately not sharing a key with it.
    // One is what a person ate, the other is what their body is made of; a
    // chart that put the two on one axis would be a chart of two different
    // things, which is the same rule `weight` and `external_load` follow.
    unit: 'g',
    valueType: 'NUMERIC',
    category: 'nutrition',
  },
  {
    key: 'fibre',
    name: 'Ballaststoffe',
    unit: 'g',
    valueType: 'NUMERIC',
    category: 'nutrition',
  },
  {
    key: 'fluid_intake',
    name: 'Trinkmenge',
    // Litres, not millilitres: a day's drinking is read as 2,8 — writing it as
    // 2800 puts four digits in a column that holds one-decimal figures
    // everywhere else.
    unit: 'L',
    valueType: 'NUMERIC',
    category: 'nutrition',
  },
  {
    key: 'energy_intake',
    name: 'Gesamtkalorien',
    // Kilocalories, because that is what the coach and the athlete both speak
    // in. Never typed — computed from protein, carbohydrate and fat; see
    // `assessments/energy.ts`.
    unit: 'kcal',
    valueType: 'NUMERIC',
    category: 'nutrition',
  },

  // ── Biofeedback ───────────────────────────────────────────────────────────
  //
  // What an athlete reports about their own day. Every one of these is a
  // **self-report on a scale the person sets for themselves** — a 7 for stress
  // means what this athlete and this coach have agreed it means, and the
  // platform holds no definition of it. That is why there is no reference
  // range, no direction and no verdict anywhere near them: the scale is
  // subjective by construction, and a number the platform interpreted would be
  // interpreting something it did not define.
  //
  // `1–10` as the unit, matching `rpe` — the one scale already in the
  // catalogue, so two self-reports are written the same way.
  //
  // Sleep is the exception and deliberately two quantities: **how long** is
  // hours and measurable, **how well** is a rating. Collapsing them would make
  // "6" ambiguous between a duration and a judgement.
  {
    key: 'sleep_duration',
    name: 'Schlaf',
    unit: 'h',
    valueType: 'NUMERIC',
    category: 'biofeedback',
  },
  {
    key: 'sleep_quality',
    name: 'Schlafqualität',
    unit: '1–10',
    valueType: 'NUMERIC',
    category: 'biofeedback',
  },
  {
    key: 'hunger',
    name: 'Hunger',
    unit: '1–10',
    valueType: 'NUMERIC',
    category: 'biofeedback',
  },
  {
    key: 'digestion',
    name: 'Verdauung',
    unit: '1–10',
    valueType: 'NUMERIC',
    category: 'biofeedback',
  },
  {
    key: 'stress',
    name: 'Stress',
    unit: '1–10',
    valueType: 'NUMERIC',
    category: 'biofeedback',
  },
  {
    key: 'cycle_rating',
    name: 'Zyklus',
    // `_rating`, and not `cycle`, for two reasons that both matter. The trend
    // card that lists bleeding episodes is keyed `cycle`, and a measurement type
    // of that key would collide with it in the same namespace. And the two are
    // different things: the card records **when a bleeding was**, as episodes,
    // computing no phase and no prediction; this is a daily self-report on a
    // scale, like every other row of the biofeedback table. Neither replaces the
    // other.
    unit: '1–10',
    valueType: 'NUMERIC',
    category: 'biofeedback',
  },
  {
    key: 'energy_level',
    name: 'Energielevel',
    unit: '1–10',
    valueType: 'NUMERIC',
    category: 'biofeedback',
  },
  {
    key: 'training_rating',
    name: 'Training',
    // Not `rpe`, which it would otherwise be mistaken for. RPE is how hard one
    // effort felt, recorded inside a test beside the load that produced it; this
    // is how the day's training went, written down at the end of it. Sharing a
    // key would put a diagnostic reading and a diary entry on one axis.
    unit: '1–10',
    valueType: 'NUMERIC',
    category: 'biofeedback',
  },
] as const satisfies readonly SystemMeasurementType[];

export type SystemMeasurementTypeKey = (typeof SYSTEM_MEASUREMENT_TYPES)[number]['key'];

/** Catalogue lookup by key. */
/**
 * The direction the quantity itself names, or `null` where it names none.
 *
 * Read only where a protocol declares nothing — see `scaleDirection`. A coach's
 * declared direction always wins, including where it contradicts this one.
 */
export function scaleDirectionOf(key: string): 'lower' | 'higher' | null {
  return findSystemMeasurementType(key)?.scaleDirection ?? null;
}

export function findSystemMeasurementType(key: string): SystemMeasurementType | undefined {
  return SYSTEM_MEASUREMENT_TYPES.find((type) => type.key === key);
}

/** The catalogue filtered by professional area — the primary browse axis (§12). */
export function systemMeasurementTypesByCategory(
  category: MeasurementCategory,
): readonly SystemMeasurementType[] {
  return SYSTEM_MEASUREMENT_TYPES.filter((type) => type.category === category);
}
