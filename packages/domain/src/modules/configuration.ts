import { z } from 'zod';

/**
 * What a Module is configured to record.
 *
 * A Module is a single **test** inside an Assessment (§11). Before performing
 * it, the coach decides which quantities to record, what each one is worth to
 * the test, how many passes are needed, which exercises it covers, and along
 * which further dimensions each value is taken. That configuration is this
 * object, and it is stored in `AssessmentModule.payload` — the column
 * documented for exactly this purpose, versioned by `moduleVersion` so a
 * published Report stays re-renderable against the shape it was written with.
 *
 * ## This is the only configuration source
 *
 * A template (`templates.ts`) proposes a starting point and is copied in. **No
 * reference to the template is stored**, which is what makes "editing a global
 * template never changes an assessment that already exists" a structural
 * property rather than a rule someone has to remember. Readiness, the entry
 * grid and the analysis all read this object and never the registry.
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
 * What a measurement is worth to the test.
 *
 * - `required` — must be recorded for the test to count as complete
 * - `recommended` — proposed, not compulsory; its absence leaves the test
 *   evaluable but not complete
 * - `optional` — available to record when the coach wants it; never affects
 *   whether the test is complete
 *
 * The distinction is a **professional** one and belongs to the concrete test,
 * not to the measurement type: lactate is required in a step test and optional
 * in a strength test, and the type itself has no opinion about either.
 *
 * How each role affects evaluability is in `readiness.ts`, in one place.
 */
export const MEASUREMENT_ROLES = ['required', 'recommended', 'optional'] as const;

export const measurementRoleSchema = z.enum(MEASUREMENT_ROLES);
export type MeasurementRole = z.infer<typeof measurementRoleSchema>;

export const MEASUREMENT_ROLE_LABELS: Readonly<Record<MeasurementRole, string>> = {
  required: 'Required',
  recommended: 'Recommended',
  optional: 'Optional',
} as const;

/**
 * One quantity this test records, and what it is worth.
 *
 * Referenced by **id**, not by key. A workspace may define its own type under a
 * key that a system type already uses — the partial unique index permits it —
 * so a key alone does not identify a type. The templates name keys, because ids
 * do not exist until the catalogue is seeded; resolving keys to ids happens when
 * the module is created.
 */
export const configuredMeasurementSchema = z.object({
  measurementTypeId: z.string().min(1),
  /**
   * `required` is the default, and deliberately so: it is what version 1 meant
   * for every configured type, and a configuration that omits the role has not
   * expressed an opinion about lowering the bar.
   */
  role: measurementRoleSchema.default('required'),
});

export type ConfiguredMeasurement = z.infer<typeof configuredMeasurementSchema>;

/**
 * An extra axis along which the same quantity is recorded several times —
 * a joint, a muscle site, a body region.
 *
 * Side is deliberately **not** one of these: it has a typed column on
 * `Measurement` and a fixed enum (§12, §26.10). Use `recordsSide` below.
 * Exercise is not one either: it is a real reference to a catalogue row, and
 * `exerciseIds` below carries it so that deleting a used exercise can be
 * refused by a foreign key rather than by hope.
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
 * `AssessmentModule.payload`, version 2.
 *
 * Version 2 replaces version 1's flat `measurementTypeIds: string[]` with
 * entries that carry a role, and adds `exerciseIds`. Version 1 payloads are
 * still readable — see `readModuleConfiguration`.
 */
export const moduleConfigurationSchema = z.object({
  /**
   * The quantities this test records, in the order the coach arranged them.
   * At least one, or there is no test.
   *
   * Order is configuration: it is the order of the entry grid and of the
   * analysis, which is why this is an array rather than a map.
   */
  measurementTypes: z.array(configuredMeasurementSchema).min(1, 'Select at least one measurement.'),

  /**
   * The exercises this test covers, referenced by catalogue id.
   *
   * Empty for tests where the notion does not apply — a lactate step test has no
   * exercise, and an empty list says exactly that rather than forcing a
   * placeholder. When the list is non-empty, every value recorded names which
   * exercise it belongs to, and the whole set of quantities is recorded per
   * exercise: a maximal-strength test covering bench press and deadlift holds a
   * load and a repetition count for each.
   *
   * **Ids, never names.** "Bench press" as free text in a measurement would make
   * the catalogue decorative and every later analysis a string comparison
   * (§26 — Exercise is context, not a Measurement Type).
   */
  exerciseIds: z.array(z.string().min(1)).default([]),

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
export const MODULE_CONFIGURATION_VERSION = 2;

/**
 * Version 1: a flat list of type ids, no roles, no exercises.
 *
 * Kept as a schema rather than as a comment because it is still the shape of
 * every module configured before roles existed, and those tests must stay
 * openable.
 */
const moduleConfigurationSchemaV1 = z.object({
  measurementTypeIds: z.array(z.string().min(1)).min(1),
  passes: z.number().int().min(1).max(50).default(1),
  recordsSide: z.boolean().default(false),
  dimensions: z.array(contextDimensionSchema).default([]),
  notes: z.string().trim().max(4000).optional(),
});

/**
 * Reads a stored payload of any known version into the current shape.
 *
 * **The version-1 upgrade is derived, not invented.** Version 1's readiness
 * treated every configured type as compulsory — a type with no value made the
 * whole test `INSUFFICIENT`. "All required" is therefore what those payloads
 * already meant, and reading them that way changes no existing verdict.
 *
 * Returns `null` when the payload matches no known version. A module written
 * under a shape that can no longer be read must still fail *locally*: the
 * alternative is that one malformed row makes an athlete's whole history
 * unopenable.
 *
 * The recorded `moduleVersion` selects the reader; an unrecognised or missing
 * version falls back to trying each shape, because a row whose version column
 * disagrees with its payload should still be recoverable.
 */
export function readModuleConfiguration(
  payload: unknown,
  moduleVersion?: number,
): ModuleConfiguration | null {
  const asV2 = () => {
    const parsed = moduleConfigurationSchema.safeParse(payload);

    return parsed.success ? parsed.data : null;
  };

  const asV1 = () => {
    const parsed = moduleConfigurationSchemaV1.safeParse(payload);
    if (!parsed.success) return null;

    const { measurementTypeIds, ...rest } = parsed.data;

    return moduleConfigurationSchema.parse({
      ...rest,
      measurementTypes: measurementTypeIds.map((measurementTypeId) => ({
        measurementTypeId,
        role: 'required' as const,
      })),
      exerciseIds: [],
    });
  };

  if (moduleVersion === 1) return asV1() ?? asV2();

  return asV2() ?? asV1();
}

/** The configured type ids, in order — the common read, without the roles. */
export function measurementTypeIdsOf(configuration: ModuleConfiguration): readonly string[] {
  return configuration.measurementTypes.map((entry) => entry.measurementTypeId);
}

/** The entries carrying a given role. */
export function measurementsWithRole(
  configuration: ModuleConfiguration,
  role: MeasurementRole,
): readonly ConfiguredMeasurement[] {
  return configuration.measurementTypes.filter((entry) => entry.role === role);
}

/**
 * The quantities that decide whether a test is complete.
 *
 * `required` and `recommended`; `optional` is excluded by definition — a coach
 * who records it adds information, and one who does not has left nothing out.
 */
export function countedMeasurements(
  configuration: ModuleConfiguration,
): readonly ConfiguredMeasurement[] {
  return configuration.measurementTypes.filter((entry) => entry.role !== 'optional');
}

/**
 * How many Measurements a fully recorded module holds.
 *
 * `counted types × passes × sides × exercises × dimension values`. Useful for
 * showing progress during data entry and for telling a half-finished module
 * from a complete one — the model has no "complete" flag, and should not gain
 * one: completeness is derivable, and a stored flag would be one more thing
 * that can disagree with the data.
 *
 * A dimension without a declared value list contributes a factor of one: the
 * coach adds rows as needed, and the expected count cannot be known in advance.
 * An empty exercise list contributes a factor of one for the same reason it is
 * empty — the test does not work in exercises at all.
 */
export function expectedMeasurementCount(configuration: ModuleConfiguration): number {
  const sides = configuration.recordsSide ? 2 : 1;
  const exercises = Math.max(configuration.exerciseIds.length, 1);
  const dimensions = configuration.dimensions.reduce(
    (total, dimension) => total * Math.max(dimension.values?.length ?? 1, 1),
    1,
  );

  return (
    countedMeasurements(configuration).length *
    configuration.passes *
    sides *
    exercises *
    dimensions
  );
}
