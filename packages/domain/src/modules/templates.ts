import { z } from 'zod';

import type { SystemMeasurementTypeKey } from '../measurement-types';
import type { ContextDimension } from './configuration';
import type { ModuleKey } from './index';

/**
 * Measurement templates — preconfigured tests.
 *
 * A template proposes a module's configuration: which quantities to record, how
 * many passes, along which dimensions. **It is not a domain object and not a
 * level in the hierarchy** — it is configuration, exactly like an assessment
 * preset (§11), and the coach edits it freely before performing the test. What
 * ends up stored is the resulting `ModuleConfiguration`, never a reference to
 * the template.
 *
 * Three namespaces now exist and must not collide, because the interface offers
 * them near one another: **module keys** (`lactate`), **assessment presets**
 * (`lactate_test`, which selects *modules*) and **measurement templates**
 * (`lactate_step_test`, which configures *one* module). `templates.test.ts`
 * asserts the separation.
 *
 * Types are named by **key**. Ids do not exist until the catalogue is seeded,
 * and a template must survive being applied in any workspace.
 *
 * ## What is deliberately not here
 *
 * No vendor names. "Myoact" was named as an example of a muscle activity
 * device; the template is called `muscle_activity_measurement` because the test
 * is the quantity, not the instrument (§11, DOMAIN_RULES #8). Myoact is a
 * source recorded on the Measurement.
 *
 * No dimension value lists. Naming joints, muscle sites or body regions is a
 * professional decision that has not been taken.
 */

export interface MeasurementTemplate {
  readonly key: string;
  readonly name: string;
  /** The module this template configures. */
  readonly moduleKey: ModuleKey;
  readonly measurementTypeKeys: readonly SystemMeasurementTypeKey[];
  /** Passes proposed. One unless the test is inherently stepped. */
  readonly passes: number;
  readonly recordsSide: boolean;
  readonly dimensions: readonly ContextDimension[];
}

export const MEASUREMENT_TEMPLATES = [
  {
    key: 'lactate_step_test',
    name: 'Lactate step test',
    moduleKey: 'lactate',
    // Every stage records the same four quantities together; that is what makes
    // a lactate curve, a heart-rate curve and a perceived-exertion curve
    // reconstructible from one test.
    measurementTypeKeys: ['lactate', 'heart_rate', 'rpe', 'pace'],
    // A starting point, not a rule — the number of stages is the coach's.
    passes: 4,
    recordsSide: false,
    dimensions: [],
  },
  {
    key: 'body_fat_measurement',
    name: 'Body fat measurement',
    moduleKey: 'body_composition',
    measurementTypeKeys: ['body_fat'],
    passes: 1,
    recordsSide: false,
    dimensions: [],
  },
  {
    key: 'max_strength_test',
    name: 'Maximal strength test',
    moduleKey: 'strength',
    measurementTypeKeys: ['force'],
    passes: 1,
    // Left against right is the comparison a strength test exists for —
    // asymmetry is one of the commonest insights (§13).
    recordsSide: true,
    dimensions: [],
  },
  {
    key: 'muscle_activity_measurement',
    name: 'Muscle activity measurement',
    moduleKey: 'movement',
    measurementTypeKeys: ['muscle_activity'],
    passes: 1,
    recordsSide: true,
    // The site is an axis, but which sites exist is a professional decision.
    // Declared without values so the coach names them.
    dimensions: [{ key: 'site', label: 'Measurement site' }],
  },
] as const satisfies readonly MeasurementTemplate[];

export type MeasurementTemplateKey = (typeof MEASUREMENT_TEMPLATES)[number]['key'];

export const measurementTemplateKeySchema = z.enum(
  MEASUREMENT_TEMPLATES.map((template) => template.key) as [
    MeasurementTemplateKey,
    ...MeasurementTemplateKey[],
  ],
);

export function findMeasurementTemplate(key: string): MeasurementTemplate | undefined {
  return MEASUREMENT_TEMPLATES.find((template) => template.key === key);
}

/** The templates offered when configuring a module of a given kind. */
export function templatesForModule(moduleKey: ModuleKey): readonly MeasurementTemplate[] {
  return MEASUREMENT_TEMPLATES.filter((template) => template.moduleKey === moduleKey);
}
