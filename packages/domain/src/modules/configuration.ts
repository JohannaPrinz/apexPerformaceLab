import { z } from 'zod';

/**
 * What a Module is configured to record.
 *
 * A Module is a single **test** inside an Assessment (§11). Before performing
 * it, the coach decides which quantities to record, how many passes are needed,
 * and along which further dimensions each value is taken. That configuration is
 * this object, and it is stored in `AssessmentModule.payload` — the column
 * documented for exactly this purpose, versioned by `moduleVersion` so a
 * published Report stays re-renderable against the shape it was written with.
 *
 * **No new entity.** A pass is a structure *inside* the module, not a domain
 * object: it has no lifecycle, no author and no identity beyond its position.
 * Introducing a table for it would add a level to the canonical hierarchy that
 * §3 does not have, and every query about an assessment would grow a join for
 * something that is, in the ordinary case, always exactly one.
 *
 * ## Why "pass" and not "run"
 *
 * `running` is a module key. A field called `run` on a measurement inside a
 * running module would read as the activity, not the repetition. "Pass" carries
 * the lactate step, the strength attempt and the repeated reading equally
 * without claiming to be any of them.
 *
 * ## What this does not hold
 *
 * Values. This is the plan; the Measurements are the record. Copying a module
 * as a template copies this object and nothing else — which is precisely what
 * makes "copy the configuration, not the results" a one-line operation rather
 * than a filtered deep clone.
 */

/**
 * An extra axis along which the same quantity is recorded several times —
 * a joint, a muscle site, a body region.
 *
 * Side is deliberately **not** one of these: it has a typed column on
 * `Measurement` and a fixed enum (§12, §26.10). Use `recordsSide` below.
 *
 * `values` is optional and stays empty in the shipped templates. Filling it
 * would mean inventing an anatomical vocabulary, which is a professional
 * decision, not a technical one.
 */
export const contextDimensionSchema = z.object({
  /** Stable identifier, used as the key on the measurement's context. */
  key: z
    .string()
    .regex(/^[a-z][a-z0-9_]*$/, 'Use a lowercase identifier, e.g. "joint".')
    .max(40),
  label: z.string().trim().min(1).max(80),
  /** The permitted values, when the coach wants a closed list. */
  values: z.array(z.string().trim().min(1).max(80)).optional(),
});

export type ContextDimension = z.infer<typeof contextDimensionSchema>;

/**
 * `AssessmentModule.payload`, version 1.
 *
 * Measurement types are referenced by **id**, not by key. A workspace may define
 * its own type under a key that a system type already uses — the partial unique
 * index permits it — so a key alone does not identify a type. The templates in
 * `templates.ts` name keys, because ids do not exist until the catalogue is
 * seeded; resolving keys to ids happens when the module is created.
 */
export const moduleConfigurationSchema = z.object({
  /** The quantities this test records. At least one, or there is no test. */
  measurementTypeIds: z.array(z.string().min(1)).min(1, 'Select at least one measurement.'),

  /**
   * How many times the whole set is recorded.
   *
   * One is the ordinary case and the default. A lactate step test sets it to
   * the number of stages; each stage then holds one Lactate, one Heart Rate,
   * one RPE and one Pace — which is what makes a lactate curve reconstructible.
   */
  passes: z.number().int().min(1).max(50).default(1),

  /** Whether each value is taken per side — left, right or bilateral. */
  recordsSide: z.boolean().default(false),

  /** Further axes, e.g. joint or muscle site. */
  dimensions: z.array(contextDimensionSchema).default([]),

  /** Free-form protocol notes: load steps, device settings, conditions. */
  notes: z.string().trim().max(4000).optional(),
});

export type ModuleConfiguration = z.infer<typeof moduleConfigurationSchema>;

/** The `moduleVersion` this contract corresponds to. */
export const MODULE_CONFIGURATION_VERSION = 1;

/**
 * How many Measurements a fully recorded module holds.
 *
 * `types × passes × sides × dimension values`. Useful for showing progress
 * during data entry and for telling a half-finished module from a complete one
 * — the model has no "complete" flag, and should not gain one: completeness is
 * derivable, and a stored flag would be one more thing that can disagree with
 * the data.
 *
 * A dimension without a declared value list contributes a factor of one: the
 * coach adds rows as needed, and the expected count cannot be known in advance.
 */
export function expectedMeasurementCount(configuration: ModuleConfiguration): number {
  const sides = configuration.recordsSide ? 2 : 1;
  const dimensions = configuration.dimensions.reduce(
    (total, dimension) => total * Math.max(dimension.values?.length ?? 1, 1),
    1,
  );

  return configuration.measurementTypeIds.length * configuration.passes * sides * dimensions;
}
