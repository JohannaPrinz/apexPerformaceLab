import { describe, expect, it } from 'vitest';

import { findSystemMeasurementType } from '../measurement-types';

import { moduleConfigurationSchema } from './configuration';
import { findMeasurementTemplate, MEASUREMENT_TEMPLATES, templatesForModule } from './templates';

import { ASSESSMENT_PRESETS, isModuleKey, MODULE_KEYS } from './index';

describe('measurement templates', () => {
  it('names only measurement types that exist in the catalogue', () => {
    for (const template of MEASUREMENT_TEMPLATES) {
      for (const key of template.measurementTypeKeys) {
        expect(
          findSystemMeasurementType(key),
          `${template.key} → "${key}" is unknown`,
        ).toBeDefined();
      }
    }
  });

  it('targets a real module', () => {
    for (const template of MEASUREMENT_TEMPLATES) {
      expect(isModuleKey(template.moduleKey), `${template.key} targets an unknown module`).toBe(
        true,
      );
    }
  });

  it('produces a valid module configuration once type keys are resolved', () => {
    for (const template of MEASUREMENT_TEMPLATES) {
      const result = moduleConfigurationSchema.safeParse({
        // Ids are resolved when the module is created; the shape is what matters.
        measurementTypeIds: template.measurementTypeKeys.map((key) => `mt_${key}`),
        passes: template.passes,
        recordsSide: template.recordsSide,
        dimensions: template.dimensions,
      });

      expect(result.success, `${template.key} is not a valid configuration`).toBe(true);
    }
  });

  it('proposes several passes only where the test is inherently stepped', () => {
    const stepped = MEASUREMENT_TEMPLATES.filter((template) => template.passes > 1);

    expect(stepped.map((template) => template.key)).toEqual(['lactate_step_test']);
  });

  it('records the four quantities a lactate stage needs, together', () => {
    const template = findMeasurementTemplate('lactate_step_test');

    expect(template?.measurementTypeKeys).toEqual(['lactate', 'heart_rate', 'rpe', 'pace']);
    expect(template?.passes).toBeGreaterThan(1);
  });

  /**
   * A device is a source, never the definition of a test (§11,
   * DOMAIN_RULES #8). Myoact was named as an example instrument for muscle
   * activity; the template is the quantity.
   */
  it('names no vendor or device', () => {
    const vendors = ['myoact', 'vald', 'garmin', 'polar', 'whoop', 'oura'];

    for (const template of MEASUREMENT_TEMPLATES) {
      const haystack = `${template.key} ${template.name}`.toLowerCase();
      for (const vendor of vendors) {
        expect(haystack, `${template.key} names a vendor`).not.toContain(vendor);
      }
    }
  });

  it('declares no dimension values — naming anatomy is a professional decision', () => {
    for (const template of MEASUREMENT_TEMPLATES) {
      for (const dimension of template.dimensions) {
        // `not.toHaveProperty` rather than reading `.values`: `as const` narrows
        // each declared dimension to exactly the keys it has, so the absent
        // property is absent from the type too.
        expect(dimension, `${template.key} presumes a vocabulary`).not.toHaveProperty('values');
      }
    }
  });

  it('offers the templates that fit a module', () => {
    expect(templatesForModule('lactate').map((template) => template.key)).toEqual([
      'lactate_step_test',
    ]);
    expect(templatesForModule('sleep')).toEqual([]);
  });
});

/**
 * Three namespaces sit near one another in the interface: module keys,
 * assessment presets (which select modules) and measurement templates (which
 * configure one module). An overlap makes "choose lactate" ambiguous — the same
 * reason §11 forbids a preset name equalling a module key.
 */
describe('the three namespaces stay separate', () => {
  const templateKeys = MEASUREMENT_TEMPLATES.map((template) => template.key);

  it('no template key is a module key', () => {
    for (const key of templateKeys) {
      expect(MODULE_KEYS, `template "${key}" collides with a module`).not.toContain(key);
    }
  });

  it('no template key is an assessment preset', () => {
    for (const key of templateKeys) {
      expect(Object.keys(ASSESSMENT_PRESETS), `template "${key}" collides`).not.toContain(key);
    }
  });

  it('template keys are unique', () => {
    expect(new Set(templateKeys).size).toBe(templateKeys.length);
  });
});
