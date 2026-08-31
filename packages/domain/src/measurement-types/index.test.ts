import { describe, expect, it } from 'vitest';

import { MODULE_KEYS } from '../modules';

import {
  findSystemMeasurementType,
  scaleDirectionOf,
  MEASUREMENT_CATEGORIES,
  MEASUREMENT_CATEGORY_LABELS,
  measurementCategorySchema,
  SYSTEM_MEASUREMENT_TYPES,
  systemMeasurementTypesByCategory,
} from './index';

/**
 * The catalogue is data, which is exactly why it needs tests: a plausible-
 * looking edit — a renamed key, a filled-in reference range, a vendor name
 * sneaking into a type — breaks a domain decision without breaking anything
 * that would fail on its own.
 */
describe('system measurement type catalogue', () => {
  it('holds the shipped types', () => {
    // The number is pinned so that growing the catalogue is a decision somebody
    // took, not a side effect. Fourteen at the MVP, plus `speed`, the seven
    // caliper sites, `joint_angle` for video analysis and `duration` for
    // anything measured in time.
    expect(SYSTEM_MEASUREMENT_TYPES).toHaveLength(24);
  });

  /**
   * The catalogue is append-only in practice: a key is the identity of a system
   * type and a renamed one silently orphans every measurement that referenced
   * it. This pins the full set, so an edit to any existing entry has to be
   * deliberate.
   */
  it('keeps every previously shipped key', () => {
    expect(SYSTEM_MEASUREMENT_TYPES.map((type) => type.key)).toEqual([
      'weight',
      'body_fat',
      // The seven Jackson & Pollock sites. Both three-site lists are subsets,
      // so one catalogue serves both methods.
      'skinfold_chest',
      'skinfold_triceps',
      'skinfold_midaxillary',
      'skinfold_subscapular',
      'skinfold_suprailiac',
      'skinfold_abdomen',
      'skinfold_thigh',
      'heart_rate',
      'lactate',
      'rpe',
      'pace',
      // The same demand as `pace` under a reciprocal, recorded rather than
      // converted: a treadmill is set in km/h, a race is planned in min/km.
      'speed',
      'grip_strength',
      'force',
      'external_load',
      'repetitions',
      'muscle_activity',
      'range_of_motion',
      'joint_angle',
      'jump_height',
      'duration',
      'running_cadence',
    ]);
  });

  it('uses unique keys — they are the identity of a system type', () => {
    const keys = SYSTEM_MEASUREMENT_TYPES.map((type) => type.key);

    expect(new Set(keys).size).toBe(keys.length);
  });

  it('uses stable snake_case keys, never display text', () => {
    for (const { key } of SYSTEM_MEASUREMENT_TYPES) {
      expect(key, `"${key}" is not a stable identifier`).toMatch(/^[a-z][a-z0-9_]*$/);
    }
  });

  it('gives every type a name, a unit and a value type', () => {
    for (const type of SYSTEM_MEASUREMENT_TYPES) {
      expect(type.name, `${type.key} has no name`).toBeTruthy();
      expect(type.unit, `${type.key} has no unit`).toBeTruthy();
      expect(type.valueType, `${type.key} has no value type`).toBeTruthy();
    }
  });

  it('classifies every type into a declared category', () => {
    for (const type of SYSTEM_MEASUREMENT_TYPES) {
      expect(measurementCategorySchema.safeParse(type.category).success).toBe(true);
    }
  });

  it('labels every category', () => {
    for (const category of MEASUREMENT_CATEGORIES) {
      expect(MEASUREMENT_CATEGORY_LABELS[category], `missing label for "${category}"`).toBeTruthy();
    }
  });

  /**
   * The MVP ships no reference ranges (§6 of the catalogue decision). A global
   * range that is identical for a 25-year-old runner and a 55-year-old
   * recreational athlete produces "outside normal" markers that do not hold up.
   */
  it('carries no reference range', () => {
    for (const type of SYSTEM_MEASUREMENT_TYPES) {
      expect(type, `${type.key} must not ship a reference range`).not.toHaveProperty(
        'referenceMin',
      );
      expect(type).not.toHaveProperty('referenceMax');
    }
  });

  /**
   * A device is a *source*, recorded on the Measurement (§11, §13). Muscle
   * Activity is the quantity; Myoact is one way of obtaining it.
   */
  it('names no device or vendor', () => {
    const vendors = ['myoact', 'vald', 'garmin', 'polar', 'whoop', 'oura'];

    for (const type of SYSTEM_MEASUREMENT_TYPES) {
      const haystack = `${type.key} ${type.name}`.toLowerCase();
      for (const vendor of vendors) {
        expect(haystack, `${type.key} names a vendor`).not.toContain(vendor);
      }
    }
  });

  /**
   * Side belongs to the Measurement, not the type (§12, §26.10) — "Grip
   * Strength" is one type recorded twice, not two types.
   */
  it('never splits a type by side', () => {
    for (const type of SYSTEM_MEASUREMENT_TYPES) {
      const haystack = `${type.key} ${type.name}`.toLowerCase();
      for (const side of ['left', 'right', 'links', 'rechts']) {
        expect(haystack, `${type.key} encodes a side`).not.toContain(side);
      }
    }
  });

  it('supports the lactate step test types', () => {
    // The four quantities a stepped lactate test records at every stage.
    for (const key of ['lactate', 'heart_rate', 'rpe', 'pace']) {
      expect(findSystemMeasurementType(key), `${key} is missing`).toBeDefined();
    }
  });

  it('supports both force quantities', () => {
    expect(findSystemMeasurementType('grip_strength')?.unit).toBe('kg');
    expect(findSystemMeasurementType('force')?.unit).toBe('N');
  });

  /**
   * A maximal-strength attempt is three separate facts: which movement (the
   * Exercise, §12a), how much was moved, and how many times. The first is a
   * reference on the Measurement; the other two are quantities here.
   */
  it('supports a maximal strength attempt', () => {
    expect(findSystemMeasurementType('external_load')?.unit).toBe('kg');
    expect(findSystemMeasurementType('repetitions')?.unit).toBe('Wdh.');
  });

  /**
   * `weight` is the athlete's body weight; `external_load` is what they moved.
   * They share a unit and nothing else — separate keys, separate categories.
   * Collapsing them would make "weight over time" a chart of two different
   * things that no later query could separate again.
   */
  it('keeps body weight and moved load apart', () => {
    const bodyWeight = findSystemMeasurementType('weight');
    const load = findSystemMeasurementType('external_load');

    expect(bodyWeight?.category).toBe('body_composition');
    expect(load?.category).toBe('strength');
    expect(bodyWeight?.key).not.toBe(load?.key);
  });

  /**
   * A load belongs to a movement, but the movement is the Exercise on the
   * Measurement — not part of the type. "Bench press load" as a type would mean
   * one type per movement, and the catalogue would grow with the exercise
   * catalogue.
   */
  it('names no exercise', () => {
    const movements = ['bench', 'squat', 'deadlift', 'press', 'pull', 'row'];

    for (const type of SYSTEM_MEASUREMENT_TYPES) {
      const haystack = `${type.key} ${type.name}`.toLowerCase();
      for (const movement of movements) {
        expect(haystack, `${type.key} names a movement`).not.toContain(movement);
      }
    }
  });
});

describe('category is a filter, not a module binding (§12)', () => {
  it('filters the catalogue', () => {
    expect(systemMeasurementTypesByCategory('strength').map((type) => type.key)).toEqual([
      'grip_strength',
      'force',
      'external_load',
      'repetitions',
    ]);
  });

  it('binds no type to a module', () => {
    for (const type of SYSTEM_MEASUREMENT_TYPES) {
      expect(type, `${type.key} must not name a module`).not.toHaveProperty('moduleKey');
    }
  });

  /**
   * Some category keys are also module keys — `strength`, `mobility`,
   * `body_composition`. That is expected: they are separate namespaces
   * describing different things, and §12 states the independence outright. This
   * test records the overlap so nobody "fixes" it.
   */
  it('may share names with module keys, deliberately', () => {
    const shared = MEASUREMENT_CATEGORIES.filter((category) =>
      (MODULE_KEYS as readonly string[]).includes(category),
    );

    expect(shared).toEqual(['body_composition', 'strength', 'mobility']);
  });
});

/**
 * A scale direction is a statement about the unit, never about the athlete.
 *
 * It exists so a percentile has an end to count from where the coach declared
 * none. Every quantity whose direction is genuinely a professional judgement
 * must stay without one — that is the whole point of the distinction, and it is
 * the half that would be quietly lost if somebody filled the field in
 * everywhere.
 */
describe('the direction a quantity names by itself', () => {
  it('answers for quantities where more is more of the quantity', () => {
    expect(scaleDirectionOf('external_load')).toBe('higher');
    expect(scaleDirectionOf('force')).toBe('higher');
    expect(scaleDirectionOf('grip_strength')).toBe('higher');
    expect(scaleDirectionOf('jump_height')).toBe('higher');
    // A percentage of activation, read the same way as a force in newtons.
    expect(scaleDirectionOf('muscle_activity')).toBe('higher');
  });

  it('stays silent wherever the direction is a judgement about a person', () => {
    for (const key of [
      'body_fat',
      'weight',
      'heart_rate',
      'lactate',
      'rpe',
      'range_of_motion',
      'joint_angle',
    ]) {
      expect(scaleDirectionOf(key)).toBeNull();
    }
  });

  it('answers null for a key it does not know', () => {
    expect(scaleDirectionOf('not_a_type')).toBeNull();
  });
});
