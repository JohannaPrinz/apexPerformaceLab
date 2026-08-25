import { z } from 'zod';

import type { BodyFatMethod } from '../athletes/body-fat';
import type { SystemMeasurementTypeKey } from '../measurement-types';
import type { ContextDimension, MeasurementRole } from './configuration';
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
 * ## A template is only a starting point
 *
 * It proposes which quantities to record and what each is worth to the test.
 * Once applied, the coach may add or remove quantities, change any role, adjust
 * passes, sides and dimensions, and reorder — for as long as no value has been
 * recorded that the change would misdescribe (`configuration-change.ts`).
 * Editing a template here can never reach a module that already exists.
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
 *
 * **No exercises.** A template configures *what is measured*; which movement a
 * strength test covers is chosen per assessment, and proposing one here would
 * be a professional recommendation the specification did not make. The builder
 * asks for it as its own step.
 */

/** One proposed quantity, with the role the template suggests for it. */
export interface TemplateMeasurement {
  readonly key: SystemMeasurementTypeKey;
  readonly role: MeasurementRole;
}

export interface MeasurementTemplate {
  readonly key: string;
  readonly name: string;
  /** The module this template configures. */
  readonly moduleKey: ModuleKey;
  readonly measurements: readonly TemplateMeasurement[];
  /** Passes proposed. One unless the test is inherently stepped. */
  readonly passes: number;
  /**
   * Which of this test's quantities describes what a stage demanded.
   *
   * Optional, because most tests have no such thing: a grip-strength test
   * measures an outcome and nothing else. Where it is set, the diagram places
   * the points at that value instead of at the stage number — which is what
   * makes two lactate tests comparable at the same speed rather than at the
   * same stage.
   *
   * A property of the **protocol**, not of the quantity. Pace is the demand in
   * a step test and the result in a time trial; a flag on the measurement type
   * could not tell the two apart.
   */
  readonly loadKey?: string;
  /**
   * Quantities this test **computes** rather than asks for.
   *
   * A body-fat percentage from caliper folds is not something a coach types: it
   * follows from the folds, the athlete's sex and their age on the day. Listing
   * the type here keeps it part of the configuration — so the value may be
   * attached to the module at all, and so it appears in the overview and the
   * diagrams like any other — while telling the entry screen not to ask for it.
   *
   * Without this the two statements would contradict: leave the type out and
   * the derived value is refused as not configured; put it in and the coach is
   * shown a field for a number the system is about to calculate.
   */
  readonly derivations?: readonly { readonly key: string; readonly method: BodyFatMethod }[];
  readonly recordsSide: boolean;
  readonly dimensions: readonly ContextDimension[];
}

export const MEASUREMENT_TEMPLATES = [
  {
    key: 'lactate_step_test',
    name: 'Lactate step test',
    moduleKey: 'lactate',
    // Every stage records these quantities together; that is what makes a
    // lactate curve, a heart-rate curve and a perceived-exertion curve
    // reconstructible from one test. Lactate, heart rate and the load are
    // required for exactly that reason — a stage missing its heart rate breaks
    // the pairing the curves rest on.
    //
    // **RPE is recommended, not required.** It is a self-report on a scale, and
    // it is routinely not taken; requiring it left a perfectly usable test
    // reading "teilweise auswertbar" for ever. `recommended` is what that
    // distinction exists for — proposed, never blocking.
    measurements: [
      { key: 'lactate', role: 'required' },
      { key: 'heart_rate', role: 'required' },
      { key: 'rpe', role: 'recommended' },
      { key: 'pace', role: 'required' },
    ],
    // What each stage demanded, as opposed to what it produced. Without it the
    // diagram can only put the stage *number* on the x axis, and stage 3 of two
    // tests need not have been the same demand. `pace` because that is what
    // this template records; a coach working in km/h swaps both to `speed`.
    loadKey: 'pace',
    // A starting point, not a rule — the number of stages is the coach's.
    passes: 4,
    recordsSide: false,
    dimensions: [],
  },
  {
    key: 'body_fat_measurement',
    name: 'Body fat measurement',
    moduleKey: 'body_composition',
    measurements: [
      { key: 'body_fat', role: 'required' },
      // The athlete's **body weight** — never a moved load, which is
      // `external_load` (§12). Recommended rather than required: body fat is a
      // percentage and a valid reading on its own, so a missing body weight must
      // not refuse the analysis. It does make the percentage far more useful to
      // interpret, which is exactly what `recommended` is for — proposed, never
      // blocking. Reasoning in DOMAIN_DECISIONS §11.
      { key: 'weight', role: 'recommended' },
    ],
    passes: 1,
    recordsSide: false,
    dimensions: [],
  },
  /**
   * Caliper skinfolds, three sites, Jackson & Pollock.
   *
   * **Five sites, of which any one athlete needs three.** The method asks for
   * chest, abdomen and thigh on a male body and triceps, suprailiac and thigh
   * on a female one, and a template is configured long before it is known whose
   * body it will be used on. Listing all five is the honest shape: the
   * calculation reads the three its athlete's method calls for and ignores the
   * rest.
   *
   * That is also why only the thigh is `required` — it is the one site both
   * lists share — and why the other four are `optional` rather than
   * `recommended`. A browser run found the difference: `recommended` counts
   * towards readiness, so a male athlete's test read "teilweise auswertbar"
   * for ever over a triceps fold that was never meant to be taken. `optional`
   * is the only role that says "this may legitimately be absent".
   *
   * **Readiness cannot express "three of these five".** It has three roles and
   * none of them is conditional on the athlete, so the honest completeness
   * statement for this test is the calculated value itself — which names
   * exactly which folds it is still waiting for. That limitation is stated
   * here rather than papered over.
   *
   * The percentage itself is derived, never typed. See `derivations`.
   */
  {
    key: 'body_fat_jackson_pollock_3',
    name: 'Body fat, Jackson & Pollock 3-site',
    moduleKey: 'body_composition',
    measurements: [
      { key: 'skinfold_thigh', role: 'required' },
      { key: 'skinfold_chest', role: 'optional' },
      { key: 'skinfold_abdomen', role: 'optional' },
      { key: 'skinfold_triceps', role: 'optional' },
      { key: 'skinfold_suprailiac', role: 'optional' },
      { key: 'body_fat', role: 'optional' },
      // Not part of the equation — body density needs folds, sex and age, and
      // nothing else. Proposed because a percentage is read alongside a weight.
      { key: 'weight', role: 'recommended' },
    ],
    derivations: [{ key: 'body_fat', method: 'jackson_pollock_3' }],
    passes: 1,
    recordsSide: false,
    dimensions: [],
  },

  /**
   * Caliper skinfolds, seven sites, Jackson & Pollock.
   *
   * All seven are `required` because, unlike the three-site method, the site
   * list does not depend on the athlete: both sexes are measured at the same
   * seven places and the equations differ only in their coefficients. A missing
   * fold means no result, so nothing here is optional.
   */
  {
    key: 'body_fat_jackson_pollock_7',
    name: 'Body fat, Jackson & Pollock 7-site',
    moduleKey: 'body_composition',
    measurements: [
      { key: 'skinfold_chest', role: 'required' },
      { key: 'skinfold_triceps', role: 'required' },
      { key: 'skinfold_midaxillary', role: 'required' },
      { key: 'skinfold_subscapular', role: 'required' },
      { key: 'skinfold_suprailiac', role: 'required' },
      { key: 'skinfold_abdomen', role: 'required' },
      { key: 'skinfold_thigh', role: 'required' },
      { key: 'body_fat', role: 'optional' },
      { key: 'weight', role: 'recommended' },
    ],
    derivations: [{ key: 'body_fat', method: 'jackson_pollock_7' }],
    passes: 1,
    recordsSide: false,
    dimensions: [],
  },

  {
    key: 'max_strength_test',
    name: 'Maximal strength test',
    moduleKey: 'strength',
    // A barbell or machine test: what was lifted, and how many times. Both
    // required — a load without a repetition count does not say whether it was
    // a single maximal attempt or a set, and the two are not comparable.
    //
    // The movement is **not** proposed here. Which exercise a strength test
    // covers is chosen per assessment (§12a), and the entry grid records the
    // whole pair per exercise, so one module can cover bench press and deadlift
    // together.
    measurements: [
      { key: 'external_load', role: 'required' },
      { key: 'repetitions', role: 'required' },
    ],
    passes: 1,
    // False, unlike the force measurement below: a barbell is lifted with both
    // sides at once, so left against right is not a distinction this test can
    // make. A coach testing single-leg press turns it on.
    recordsSide: false,
    dimensions: [],
  },
  {
    key: 'force_measurement',
    name: 'Force measurement',
    moduleKey: 'strength',
    // The instrument reading — dynamometer, force plate, isometric rig. A
    // different **test method** from the one above, not a different way of
    // writing it: force in newtons has no repetition count, and a lifted load
    // has no newton value. Which of the two a module records is the question
    // "which test was performed", which is why both templates exist.
    //
    // Named after the quantity, like `body_fat_measurement` and
    // `muscle_activity_measurement`. Deliberately not "isometric strength
    // test": a force plate also measures dynamic force, and naming the method
    // would claim more than the template knows.
    measurements: [{ key: 'force', role: 'required' }],
    passes: 1,
    // Left against right is the comparison this test exists for — asymmetry is
    // one of the commonest insights (§13), and a dynamometer takes each side
    // separately.
    recordsSide: true,
    dimensions: [],
  },
  {
    key: 'muscle_activity_measurement',
    name: 'Muscle activity measurement',
    moduleKey: 'movement',
    measurements: [{ key: 'muscle_activity', role: 'required' }],
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

/** The type keys a template proposes, for resolving them to catalogue ids. */
export function templateMeasurementKeys(
  template: MeasurementTemplate,
): readonly SystemMeasurementTypeKey[] {
  return template.measurements.map((entry) => entry.key);
}
