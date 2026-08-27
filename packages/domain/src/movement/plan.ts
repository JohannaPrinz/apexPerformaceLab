import { seriesKeyOf, type MovementProfile, type MovementSide } from './profile';

import type { AngleTargetConfig } from './analysis-config';
import type { MovementResult } from './engine';
import type { ModuleConfiguration } from '../modules/configuration';

/**
 * Turning a measurement into rows the existing model already holds.
 *
 * ## Why nothing new is invented here
 *
 * Which quantities the platform knows how to record is decided by the
 * measurement type catalogue (§12) and by what the coach configured this test to
 * record — not by this file. Every value the engine produced is carried through,
 * and each one is either matched to a configured quantity or **refused with a
 * reason**. A value that cannot be stored is shown and not stored; it is never
 * quietly dropped, and no new quantity is conjured to receive it.
 *
 * ## The two axes
 *
 * A knee angle and a hip angle are both `joint_angle` in degrees; the flexed and
 * the extended one are the same again. Stored without something to tell them
 * apart they would be one series, and every later comparison would average a
 * knee at the bottom of a squat with a hip at the top. The module configuration
 * already has the mechanism: context dimensions. This fills a `joint` axis and a
 * `position` axis where the test declares them, and refuses the value where it
 * does not.
 */

/**
 * The context dimension keys recognised as "which joint".
 *
 * A **closed list of exact keys**, not a pattern: matching loosely — anything
 * containing "joint", anything starting with "gel" — would eventually write a
 * knee angle into an axis that meant something else entirely.
 *
 * German is here because the interface is: the builder derives the key from the
 * label the coach types (`toDimensionKey`), so a coach who writes "Gelenk" gets
 * `gelenk`. Recognising only the English key would make the feature refuse every
 * test configured in the language the product is written in — while looking, on
 * screen, like the coach had done something wrong.
 *
 * The first entry is what gets **written** when the axis has no closed value
 * list; the rest are only recognised.
 */
export const JOINT_DIMENSION_KEYS = ['joint', 'gelenk'] as const;
export const JOINT_DIMENSION_KEY = JOINT_DIMENSION_KEYS[0];

export function isJointDimension(key: string): boolean {
  return (JOINT_DIMENSION_KEYS as readonly string[]).includes(key);
}

/** The same, for "at which point of the movement". */
export const POSITION_DIMENSION_KEYS = ['position'] as const;
export const POSITION_DIMENSION_KEY = POSITION_DIMENSION_KEYS[0];

export function isPositionDimension(key: string): boolean {
  return (POSITION_DIMENSION_KEYS as readonly string[]).includes(key);
}

/** A catalogue key this maps onto. */
export type MovementMeasurementKey = 'repetitions' | 'range_of_motion' | 'joint_angle';

/** One number the analysis produced. */
export interface MovementValue {
  /** Stable within one analysis — a React key, and how a decision finds it. */
  readonly id: string;
  readonly label: string;
  readonly value: number;
  readonly unit: string;
  /** The catalogue quantity this is, or `null` where none exists. */
  readonly measurementKey: MovementMeasurementKey | null;
  readonly side: 'LEFT' | 'RIGHT' | 'BILATERAL';
  /** The track this describes — the value written to the joint axis. */
  readonly track: string | null;
  /** Which end of the movement, for quantities describing one moment. */
  readonly position: string | null;
  /** What gets written to the position axis. The profile's own label. */
  readonly positionLabel: string | null;
}

export type PlanRefusal =
  /** No measurement type exists for this quantity. */
  | 'NO_CATALOGUE_TYPE'
  /** The catalogue has it; this test does not record it. */
  | 'TYPE_NOT_CONFIGURED'
  /** Several tracks, and no declared axis to tell them apart. */
  | 'JOINT_NOT_DISTINGUISHABLE'
  /** The joint axis declares a closed list and nothing was chosen from it. */
  | 'JOINT_VALUE_MISSING'
  /** An angle at one moment, in a test with no axis saying which moment. */
  | 'POSITION_NOT_DISTINGUISHABLE'
  /** The position axis declares a closed list and nothing was chosen from it. */
  | 'POSITION_VALUE_MISSING'
  /** The test declares an axis the analysis knows nothing about. */
  | 'DIMENSION_UNFILLABLE'
  /** Left and right, in a test that records neither. */
  | 'SIDE_NOT_RECORDED'
  /** The test works in exercises and none was chosen. */
  | 'EXERCISE_MISSING'
  /** The test has several stages and none was chosen. */
  | 'PASS_MISSING';

/** What only the coach can decide. Nothing here is guessed. */
export interface PlanDecisions {
  readonly exerciseId: string | null;
  readonly passIndex: number | null;
  /** Values for every declared dimension other than the two recognised axes. */
  readonly dimensionValues: Readonly<Record<string, string>>;
  /** What to write into the joint axis per track, where it is a closed list. */
  readonly trackValues: Readonly<Record<string, string>>;
  /** The same for the position axis. */
  readonly positionValues: Readonly<Record<string, string>>;
  /** Values the coach changed. Keyed by `MovementValue.id`. */
  readonly edited: Readonly<Record<string, number>>;
  /** Values the coach chose not to store. */
  readonly excluded: readonly string[];
}

export const NO_DECISIONS: PlanDecisions = {
  exerciseId: null,
  passIndex: null,
  dimensionValues: {},
  trackValues: {},
  positionValues: {},
  edited: {},
  excluded: [],
};

/** What will be written for one value — the shape `recordMany` takes. */
export interface PlannedMeasurement {
  readonly measurementTypeId: string;
  readonly value: number;
  readonly side: 'LEFT' | 'RIGHT' | 'BILATERAL';
  readonly exerciseId: string | null;
  readonly passIndex: number | null;
  readonly context: Record<string, string> | null;
  readonly note: string | null;
}

export type PlanEntry =
  | { readonly kind: 'storable'; readonly value: MovementValue; readonly write: PlannedMeasurement }
  | { readonly kind: 'excluded'; readonly value: MovementValue }
  | { readonly kind: 'refused'; readonly value: MovementValue; readonly refusal: PlanRefusal };

const SIDE_LABELS: Readonly<Record<MovementSide, string>> = { left: 'links', right: 'rechts' };
const SIDE_ENUM: Readonly<Record<MovementSide, 'LEFT' | 'RIGHT'>> = {
  left: 'LEFT',
  right: 'RIGHT',
};

/** The id a track's angle at a position carries. */
export function angleValueId(track: string, side: MovementSide, position: string): string {
  return `angle_${position}_${seriesKeyOf(track, side)}`;
}

/** The id a track's range carries. */
export function rangeValueId(track: string, side: MovementSide): string {
  return `rom_${seriesKeyOf(track, side)}`;
}

/**
 * The numbers a measurement produced, in the order a coach reads them.
 *
 * Every value the analysis names is here, including the ones that cannot be
 * stored — showing a duration and silently omitting it from the plan would be
 * the dishonest half of this.
 */
export function movementValues(
  result: MovementResult,
  profile: MovementProfile,
): readonly MovementValue[] {
  const values: MovementValue[] = [];

  if (profile.counting.kind === 'hysteresis') {
    values.push({
      id: 'repetitions',
      label: 'Wiederholungen',
      value: result.repetitions,
      unit: 'Wdh.',
      measurementKey: 'repetitions',
      side: 'BILATERAL',
      track: null,
      position: null,
      positionLabel: null,
    });
  }

  for (const track of profile.tracks) {
    for (const side of profile.sides) {
      const measurement = result.tracks[seriesKeyOf(track.key, side)];
      if (measurement === undefined) continue;

      // The angle at each named position first: that is the order a coach reads
      // them in — where the movement started, where it got to, and only then
      // how far that was.
      for (const position of profile.positions) {
        const degrees = measurement.positions[position.key];
        if (degrees === undefined) continue;

        values.push({
          id: angleValueId(track.key, side, position.key),
          label: `${track.label} — ${position.label} ${SIDE_LABELS[side]}`,
          value: degrees,
          unit: '°',
          measurementKey: 'joint_angle',
          side: SIDE_ENUM[side],
          track: track.key,
          position: position.key,
          positionLabel: position.label,
        });
      }

      values.push({
        id: rangeValueId(track.key, side),
        label: `${track.label} — Bewegungsumfang ${SIDE_LABELS[side]}`,
        value: measurement.range,
        unit: '°',
        measurementKey: 'range_of_motion',
        side: SIDE_ENUM[side],
        track: track.key,
        position: null,
        positionLabel: null,
      });
    }
  }

  if (profile.counting.kind === 'hysteresis' && result.repetitions > 0) {
    // The two the catalogue has no home for. Carried so the screen can show them
    // and the plan can say, in one place, exactly why they are not stored.
    values.push({
      id: 'rep_duration_mean',
      label: 'Ø Dauer je Wiederholung',
      value: Math.round(result.meanRepDurationMs) / 1000,
      unit: 's',
      measurementKey: null,
      side: 'BILATERAL',
      track: null,
      position: null,
      positionLabel: null,
    });

    values.push({
      id: 'tempo',
      label: 'Ø Tempo',
      value: Math.round((60_000 / Math.max(1, result.meanRepDurationMs)) * 10) / 10,
      unit: 'Wdh./min',
      measurementKey: null,
      side: 'BILATERAL',
      track: null,
      position: null,
      positionLabel: null,
    });
  }

  return values;
}

/**
 * Matches each value against the test, and says what will be written.
 *
 * `typeKeys` maps the configured measurement type ids to their catalogue keys —
 * the configuration references ids, the analysis knows keys, and a workspace may
 * define its own type under a system key, so the mapping has to come from the
 * caller rather than be assumed.
 */
export function planMeasurements(
  values: readonly MovementValue[],
  configuration: ModuleConfiguration,
  typeKeys: Readonly<Record<string, string>>,
  decisions: PlanDecisions = NO_DECISIONS,
  note: string | null = null,
): readonly PlanEntry[] {
  const configuredIds = new Set(
    configuration.measurementTypes.map((entry) => entry.measurementTypeId),
  );

  const idFor = (key: MovementMeasurementKey): string | null =>
    Object.entries(typeKeys).find(([id, value]) => value === key && configuredIds.has(id))?.[0] ??
    null;

  const jointDimension = configuration.dimensions.find((dimension) =>
    isJointDimension(dimension.key),
  );
  const positionDimension = configuration.dimensions.find((dimension) =>
    isPositionDimension(dimension.key),
  );
  const otherDimensions = configuration.dimensions.filter(
    (dimension) => !isJointDimension(dimension.key) && !isPositionDimension(dimension.key),
  );

  const tracksPresent = new Set(
    values.filter((value) => value.track !== null).map((value) => value.track),
  );

  return values.map((value): PlanEntry => {
    if (decisions.excluded.includes(value.id)) return { kind: 'excluded', value };

    if (value.measurementKey === null) {
      return { kind: 'refused', value, refusal: 'NO_CATALOGUE_TYPE' };
    }

    const measurementTypeId = idFor(value.measurementKey);
    if (measurementTypeId === null) {
      return { kind: 'refused', value, refusal: 'TYPE_NOT_CONFIGURED' };
    }

    if (value.side !== 'BILATERAL' && !configuration.recordsSide) {
      return { kind: 'refused', value, refusal: 'SIDE_NOT_RECORDED' };
    }

    if (configuration.exerciseIds.length > 0 && decisions.exerciseId === null) {
      return { kind: 'refused', value, refusal: 'EXERCISE_MISSING' };
    }

    if (configuration.passes > 1 && decisions.passIndex === null) {
      return { kind: 'refused', value, refusal: 'PASS_MISSING' };
    }

    const context: Record<string, string> = {};

    for (const dimension of otherDimensions) {
      const chosen = decisions.dimensionValues[dimension.key];
      // Every declared dimension is required (see `measurementContextSchema`),
      // so an axis nobody filled makes the value unstorable — not partially
      // stored, which would be an ambiguous row.
      if (chosen === undefined || chosen.trim() === '') {
        return { kind: 'refused', value, refusal: 'DIMENSION_UNFILLABLE' };
      }
      context[dimension.key] = chosen;
    }

    if (value.track !== null) {
      if (jointDimension === undefined) {
        // One track alone is unambiguous even without an axis; two are not.
        if (tracksPresent.size > 1) {
          return { kind: 'refused', value, refusal: 'JOINT_NOT_DISTINGUISHABLE' };
        }
      } else {
        const allowed = jointDimension.values ?? [];
        const chosen =
          decisions.trackValues[value.track] ?? (allowed.length === 0 ? value.track : undefined);

        if (chosen === undefined || (allowed.length > 0 && !allowed.includes(chosen))) {
          return { kind: 'refused', value, refusal: 'JOINT_VALUE_MISSING' };
        }

        context[jointDimension.key] = chosen;
      }
    } else if (jointDimension !== undefined) {
      // A repetition count is not a reading of one joint. There is no honest
      // value for the axis, so the count cannot be stored in a test that
      // demands one.
      return { kind: 'refused', value, refusal: 'DIMENSION_UNFILLABLE' };
    }

    if (value.position !== null) {
      // An angle without a position is ambiguous: 78° at the bottom of a squat
      // and 78° standing describe different people.
      if (positionDimension === undefined) {
        return { kind: 'refused', value, refusal: 'POSITION_NOT_DISTINGUISHABLE' };
      }

      const allowed = positionDimension.values ?? [];
      const chosen =
        decisions.positionValues[value.position] ??
        (allowed.length === 0 ? (value.positionLabel ?? value.position) : undefined);

      if (chosen === undefined || (allowed.length > 0 && !allowed.includes(chosen))) {
        return { kind: 'refused', value, refusal: 'POSITION_VALUE_MISSING' };
      }

      context[positionDimension.key] = chosen;
    } else if (positionDimension !== undefined) {
      // A range spans both ends of the movement, so it has no position — and a
      // test that demands one cannot hold it. Same limit as the count above.
      return { kind: 'refused', value, refusal: 'DIMENSION_UNFILLABLE' };
    }

    return {
      kind: 'storable',
      value,
      write: {
        measurementTypeId,
        value: decisions.edited[value.id] ?? value.value,
        side: value.side,
        exerciseId: configuration.exerciseIds.length > 0 ? decisions.exerciseId : null,
        passIndex: configuration.passes > 1 ? decisions.passIndex : null,
        context: Object.keys(context).length > 0 ? context : null,
        note,
      },
    };
  });
}

/** Only the entries that will actually be written. */
export function storableOf(entries: readonly PlanEntry[]): readonly PlannedMeasurement[] {
  return entries.flatMap((entry) => (entry.kind === 'storable' ? [entry.write] : []));
}

/**
 * The value a target speaks about, per side.
 *
 * Read from the same `MovementValue` list the table renders and the plan writes,
 * including the coach's edits — so a corrected number changes the target outcome
 * without anything having to remember to recompute it.
 */
export function measuredForTarget(
  values: readonly MovementValue[],
  target: AngleTargetConfig,
  edited: Readonly<Record<string, number>> = {},
): readonly { readonly side: 'LEFT' | 'RIGHT' | 'BILATERAL'; readonly degrees: number }[] {
  return values
    .filter((value) => value.track === target.track && value.position === target.position)
    .map((value) => ({ side: value.side, degrees: edited[value.id] ?? value.value }));
}
