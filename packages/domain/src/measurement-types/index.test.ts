import { describe, expect, it } from 'vitest';

import { MODULE_KEYS } from '../modules';

import {
  findSystemMeasurementType,
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
  it('holds the twelve MVP types', () => {
    expect(SYSTEM_MEASUREMENT_TYPES).toHaveLength(12);
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
});

describe('category is a filter, not a module binding (§12)', () => {
  it('filters the catalogue', () => {
    expect(systemMeasurementTypesByCategory('strength').map((type) => type.key)).toEqual([
      'grip_strength',
      'force',
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
