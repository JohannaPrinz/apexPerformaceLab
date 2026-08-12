import { describe, expect, it } from 'vitest';

import { findSystemMeasurementType } from '../measurement-types';

import { moduleConfigurationSchema } from './configuration';
import {
  findMeasurementTemplate,
  MEASUREMENT_TEMPLATES,
  templateMeasurementKeys,
  templatesForModule,
  type MeasurementTemplate,
} from './templates';

import { ASSESSMENT_PRESETS, isModuleKey, MODULE_KEYS } from './index';

describe('measurement templates', () => {
  it('names only measurement types that exist in the catalogue', () => {
    for (const template of MEASUREMENT_TEMPLATES) {
      for (const key of templateMeasurementKeys(template)) {
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
        measurementTypes: template.measurements.map((entry) => ({
          measurementTypeId: `mt_${entry.key}`,
          role: entry.role,
        })),
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

    expect(template && templateMeasurementKeys(template)).toEqual([
      'lactate',
      'heart_rate',
      'rpe',
      'pace',
    ]);
    expect(template?.passes).toBeGreaterThan(1);
    // All four required: a stage missing its heart rate breaks the pairing the
    // curves rest on.
    expect(template?.measurements.every((entry) => entry.role === 'required')).toBe(true);
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

/**
 * The separation §2 of the specification asks for, asserted rather than
 * assumed:
 *
 *   Template   — the global professional starting point
 *   Module     — the concrete configuration, copied and thereafter independent
 *   Type       — a quantity that may be recorded
 *   Measurement— a value that was recorded
 *
 * The structural guarantee is that a configuration holds **no reference back to
 * the template it came from**. These tests pin that: a template can be changed,
 * replaced or deleted entirely and no configuration derived from it moves.
 */
describe('a template is a starting point, never a live link', () => {
  // Typed as the general shape, not `(typeof MEASUREMENT_TEMPLATES)[number]`:
  // `as const` narrows each entry to its own literal type, so the tuple element
  // type would only accept the first template.
  const applyTemplate = (template: MeasurementTemplate) =>
    moduleConfigurationSchema.parse({
      measurementTypes: template.measurements.map((entry) => ({
        measurementTypeId: `mt_${entry.key}`,
        role: entry.role,
      })),
      passes: template.passes,
      recordsSide: template.recordsSide,
      dimensions: template.dimensions,
    });

  it('stores no template key in the resulting configuration', () => {
    const configuration = applyTemplate(MEASUREMENT_TEMPLATES[0]);

    expect(configuration).not.toHaveProperty('templateKey');
    expect(configuration).not.toHaveProperty('template');
    expect(JSON.stringify(configuration)).not.toContain('lactate_step_test');
  });

  it('carries the template’s roles into the configuration', () => {
    const bodyFat = findMeasurementTemplate('body_fat_measurement');
    const configuration = applyTemplate(bodyFat!);

    expect(configuration.measurementTypes).toEqual([
      { measurementTypeId: 'mt_body_fat', role: 'required' },
      { measurementTypeId: 'mt_weight', role: 'recommended' },
    ]);
  });

  /**
   * The copy is a plain value. Mutating it — which is what a coach editing the
   * test does — cannot reach back into the registry, and the next module
   * created from the same template starts from the template again.
   */
  it('is independent of the template once applied', () => {
    const template = findMeasurementTemplate('lactate_step_test')!;
    const first = applyTemplate(template);

    const edited = { ...first, passes: 9, measurementTypes: first.measurementTypes.slice(0, 1) };

    expect(edited.passes).toBe(9);
    expect(template.passes).toBe(4);
    expect(templateMeasurementKeys(template)).toHaveLength(4);

    const second = applyTemplate(template);
    expect(second.passes).toBe(4);
    expect(second.measurementTypes).toHaveLength(4);
  });

  it('proposes no exercise — which movement a test covers is chosen per assessment', () => {
    for (const template of MEASUREMENT_TEMPLATES) {
      expect(template, `${template.key} presumes an exercise`).not.toHaveProperty('exerciseKeys');
      expect(applyTemplate(template).exerciseIds).toEqual([]);
    }
  });
});

/**
 * A strength test is recorded one of two ways, and the two are **test methods,
 * not preferences**: an instrument reads a force in newtons, a barbell test
 * records a load and a repetition count. Neither converts to the other, so both
 * templates exist and the coach picks the one matching the test performed.
 *
 * Nothing binds either set to the `strength` module — §12 keeps types
 * independent of modules — so a coach may also combine them freely in the
 * builder. The templates only propose.
 */
describe('the two strength test methods', () => {
  it('offers both for the strength module', () => {
    expect(templatesForModule('strength').map((template) => template.key)).toEqual([
      'max_strength_test',
      'force_measurement',
    ]);
  });

  it('records load and repetitions for the barbell test', () => {
    const template = findMeasurementTemplate('max_strength_test');

    expect(template && templateMeasurementKeys(template)).toEqual(['external_load', 'repetitions']);
    // Both required: a load without a repetition count does not say whether it
    // was one maximal attempt or a set.
    expect(template?.measurements.every((entry) => entry.role === 'required')).toBe(true);
  });

  it('records force alone for the instrument reading', () => {
    const template = findMeasurementTemplate('force_measurement');

    expect(template && templateMeasurementKeys(template)).toEqual(['force']);
  });

  it('never mixes the two methods in one template', () => {
    for (const template of MEASUREMENT_TEMPLATES) {
      const keys = templateMeasurementKeys(template) as readonly string[];
      const hasForce = keys.includes('force');
      const hasLoad = keys.includes('external_load');

      expect(hasForce && hasLoad, `${template.key} mixes newtons with a lifted load`).toBe(false);
    }
  });

  /**
   * A barbell is lifted with both sides at once; a dynamometer takes each side
   * separately. The side setting follows the instrument, not a house style.
   */
  it('records sides only where the method can distinguish them', () => {
    expect(findMeasurementTemplate('max_strength_test')?.recordsSide).toBe(false);
    expect(findMeasurementTemplate('force_measurement')?.recordsSide).toBe(true);
  });

  it('proposes no exercise for either — the movement is chosen per assessment', () => {
    for (const key of ['max_strength_test', 'force_measurement']) {
      expect(findMeasurementTemplate(key)).not.toHaveProperty('exerciseKeys');
    }
  });
});
