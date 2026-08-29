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
  });

  it('requires what the curves rest on, and proposes the rest', () => {
    // A stage missing its lactate, heart rate or load breaks the pairing the
    // curves are reconstructed from. RPE is a self-report on a scale and is
    // routinely not taken — requiring it left a usable test permanently
    // "partially evaluable".
    const template = findMeasurementTemplate('lactate_step_test');
    const roles = Object.fromEntries(
      (template?.measurements ?? []).map((entry) => [entry.key, entry.role]),
    );

    expect(roles).toEqual({
      lactate: 'required',
      heart_rate: 'required',
      pace: 'required',
      rpe: 'recommended',
    });
  });

  it('names the quantity that says what a stage demanded', () => {
    // Without it a diagram can only put the stage *number* on the x axis, and
    // stage 3 of two tests need not have been the same demand.
    expect(findMeasurementTemplate('lactate_step_test')?.loadKey).toBe('pace');
  });

  it('claims a load quantity only where the test has one', () => {
    // A grip-strength test measures an outcome and nothing else.
    const templates: readonly MeasurementTemplate[] = MEASUREMENT_TEMPLATES;
    const withLoad = templates.filter((template) => template.loadKey !== undefined);

    expect(withLoad.map((template) => template.key)).toEqual(['lactate_step_test']);
  });

  it('only ever names a quantity the template actually records', () => {
    const templates: readonly MeasurementTemplate[] = MEASUREMENT_TEMPLATES;

    for (const template of templates) {
      if (template.loadKey === undefined) continue;

      expect(templateMeasurementKeys(template), template.key).toContain(template.loadKey);
    }
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

  it('proposes a movement only where the movement is the test', () => {
    // The rule that held while every template described a *kind* of test: a
    // strength test covers whichever movement the coach chose, and naming one
    // would have been an opinion. It stops holding for a standardised time
    // trial, where the ergometer and the distance **are** the test.
    const standardised = ['row_1000m', 'ski_1000m'];

    for (const template of MEASUREMENT_TEMPLATES as readonly MeasurementTemplate[]) {
      if (standardised.includes(template.key)) {
        expect(template.exerciseKeys, `${template.key} names no movement`).toBeDefined();
        continue;
      }

      expect(template, `${template.key} presumes an exercise`).not.toHaveProperty('exerciseKeys');
      expect(applyTemplate(template).exerciseIds).toEqual([]);
    }
  });

  it('proposes conditions only for the standardised time trials', () => {
    const withProtocol = (MEASUREMENT_TEMPLATES as readonly MeasurementTemplate[])
      .filter((template) => template.protocol !== undefined)
      .map((template) => template.key);

    // Everything else starts blank: a condition nobody chose is a claim about a
    // test nobody ran.
    expect(withProtocol).toEqual([
      'row_1000m',
      'ski_1000m',
      'run_1km_fresh',
      'run_1km_compromised',
    ]);
  });

  it('gives the two ergometer trials different identities', () => {
    // The same distance on a rower and on a ski ergometer are different
    // measurements of different movements, and must never form one series.
    const row = findMeasurementTemplate('row_1000m')?.protocol;
    const ski = findMeasurementTemplate('ski_1000m')?.protocol;

    expect(row?.key).not.toBe(ski?.key);
    expect(row?.distanceM).toBe(ski?.distanceM);
  });

  it('separates the fresh kilometre from the compromised one', () => {
    // The same kilometre run in two states. Treating them as one series would
    // hide the very thing the second one is run to show.
    expect(findMeasurementTemplate('run_1km_fresh')?.protocol?.key).not.toBe(
      findMeasurementTemplate('run_1km_compromised')?.protocol?.key,
    );
  });

  it('measures the time trials in the one time quantity', () => {
    for (const key of ['row_1000m', 'ski_1000m', 'run_1km_fresh', 'run_1km_compromised']) {
      expect(findMeasurementTemplate(key)?.measurements.map((entry) => entry.key)).toEqual([
        'duration',
      ]);
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
    // Still true for these two: which lift a maximal-strength test covers is a
    // professional decision, unlike the ergometer a 1000 m row is rowed on.
    for (const key of ['max_strength_test', 'force_measurement']) {
      expect(findMeasurementTemplate(key)).not.toHaveProperty('exerciseKeys');
    }
  });
});

/**
 * The three-site method asks for different folds of male and female bodies, and
 * a template is configured long before it is known whose body it is used on.
 * A browser run found what that costs if the roles are wrong: every test read
 * "teilweise auswertbar" for ever, over a fold nobody was ever going to take.
 */
describe('the caliper templates', () => {
  const three = findMeasurementTemplate('body_fat_jackson_pollock_3');
  const seven = findMeasurementTemplate('body_fat_jackson_pollock_7');

  it('offers exactly two of them', () => {
    const caliper = MEASUREMENT_TEMPLATES.filter((template) =>
      template.key.startsWith('body_fat_jackson_pollock'),
    );

    expect(caliper.map((template) => template.key)).toEqual([
      'body_fat_jackson_pollock_3',
      'body_fat_jackson_pollock_7',
    ]);
  });

  it('lets a three-site test be fully recorded whatever the athlete', () => {
    // Only the thigh — the one site both lists share — may block readiness.
    // Anything else would make one of the two site lists permanently
    // incomplete, since only three of the five are ever taken.
    const blocking = (three?.measurements ?? []).filter(
      (entry) => entry.key.startsWith('skinfold_') && entry.role !== 'optional',
    );

    expect(blocking.map((entry) => entry.key)).toEqual(['skinfold_thigh']);
  });

  it('carries all five three-site folds so either list can be taken', () => {
    const folds = (three?.measurements ?? [])
      .filter((entry) => entry.key.startsWith('skinfold_'))
      .map((entry) => entry.key)
      .sort();

    expect(folds).toEqual([
      'skinfold_abdomen',
      'skinfold_chest',
      'skinfold_suprailiac',
      'skinfold_thigh',
      'skinfold_triceps',
    ]);
  });

  it('requires every fold of the seven-site method', () => {
    // Unlike the three-site list, this one does not depend on the athlete: both
    // sexes are measured at the same seven places.
    const folds = (seven?.measurements ?? []).filter((entry) => entry.key.startsWith('skinfold_'));

    expect(folds).toHaveLength(7);
    expect(folds.every((entry) => entry.role === 'required')).toBe(true);
  });

  it('derives the percentage under the method it belongs to', () => {
    expect(three?.derivations).toEqual([{ key: 'body_fat', method: 'jackson_pollock_3' }]);
    expect(seven?.derivations).toEqual([{ key: 'body_fat', method: 'jackson_pollock_7' }]);
  });

  it('asks for no percentage to be typed', () => {
    // It is in `measurements` so the derived value may be attached at all —
    // and in `derivations` so the entry grid leaves the field out.
    for (const template of [three, seven]) {
      const bodyFat = template?.measurements.find((entry) => entry.key === 'body_fat');

      expect(bodyFat?.role, template?.key).toBe('optional');
      expect(template?.derivations?.map((entry) => entry.key)).toContain('body_fat');
    }
  });
});
