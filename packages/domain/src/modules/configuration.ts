import { z } from 'zod';

import { BODY_FAT_METHODS } from '../athletes/body-fat';
import {
  EQUALS_TOLERANCE_DEGREES,
  movementAnalysisConfigSchema,
  type AngleTargetConfig,
} from '../movement/analysis-config';
import { movementProfile, positionOf } from '../movement/profile';

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

/**
 * Which side a value was taken on.
 *
 * Here rather than in one slice's label file because three of them name it now —
 * the entry grid, the analysis and the shared document — and a vocabulary with
 * three callers is a vocabulary, not a screen's private wording.
 */
export const SIDE_LABELS_DE: Readonly<Record<string, string>> = {
  LEFT: 'Links',
  RIGHT: 'Rechts',
  BILATERAL: 'Beidseitig',
};

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
/**
 * What a test was carried out under, structured.
 *
 * ## Why this is not the notes field
 *
 * `notes` already holds "load steps, device settings, conditions" — as prose,
 * for a person. This holds the same kind of information for a **comparison**:
 * whether two tests may be put beside each other at all. A coach who reads
 * "1 km, Bahn, frisch" understands it; a query cannot.
 *
 * ## Why nothing here is a catalogue
 *
 * Every value is entered by the coach. The platform ships **no** distances, no
 * loads and no repetition counts — not for HYROX and not for anything else.
 * Those belong to a rulebook this software does not own, and a wrong constant
 * shipped as a default would be copied into every test that used it. What the
 * platform contributes is the *shape*: that a distance is a number of metres and
 * that two tests with different ones are not the same test.
 *
 * ## Comparability is exact or absent
 *
 * Two protocols match when every field matches. There is no "close enough": a
 * sled time on one hall floor and the same sled on another are different
 * numbers, and the whole point of recording the venue is to stop them being
 * subtracted from each other.
 *
 * A test **without** a protocol block compares to other tests without one,
 * exactly as before this existed. Nothing that already works changes.
 */
export const testProtocolSchema = z.object({
  /**
   * The stable name of this exact setup, e.g. `1km_bahn_frisch`.
   *
   * The coach's own word, not a key from a list the platform maintains. It is
   * what makes "the same test again" expressible before anything else about it
   * is filled in.
   */
  key: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9_]+$/, 'Nur Kleinbuchstaben, Ziffern und Unterstriche.'),
  /**
   * What the coach reads — "1000 m Rudern", not `row_erg_1000m`.
   *
   * Separate from `key` because the two answer different questions: the key
   * decides which tests belong to one series and must survive being typed
   * twice; the label is a sentence on a screen and may be reworded at any time.
   * Renaming must never cut a series in half, which is why it is **not** part of
   * `protocolKey`.
   *
   * Absent on a protocol written before this existed — the key is then shown,
   * which is what those screens already did.
   */
  label: z.string().trim().min(1).max(80).optional(),
  /** How far, in metres. Absent where the test has no distance. */
  distanceM: z.number().positive().max(1_000_000).optional(),
  /**
   * Which class the test was performed in, e.g. a competition division.
   *
   * A property of the **protocol**, not of the athlete: it decides the loads and
   * repetition counts that were prescribed. An athlete who moves up a class has
   * not retroactively performed their old tests in the new one.
   */
  division: z.string().trim().min(1).max(40).optional(),
  /**
   * The instrument, where the instrument changes the number.
   *
   * A rowing ergometer and a ski ergometer over the same distance are different
   * measurements; two dynamometer models disagree systematically.
   */
  device: z.string().trim().min(1).max(80).optional(),
  /**
   * Where it happened, **only** where the place changes the number.
   *
   * A sled time is a statement about a floor as much as about an athlete.
   * A grip-strength reading is not, and filling this in there would split a
   * series for no reason.
   */
  venue: z.string().trim().min(1).max(80).optional(),
  /**
   * Which end of the scale the coach is working towards, per this test.
   *
   * **The only place a direction is ever set, and a person sets it.** Without it
   * the comparison reports the highest and the lowest value and stops; with it,
   * one of the two may be called the best. It stays here rather than on the
   * measurement type because the same quantity points both ways in different
   * tests — a duration is better shorter in a time trial and longer in a hold.
   *
   * It never produces "improved" or "worsened": a difference stays a signed
   * number. It decides one thing only — which extreme is worth naming.
   */
  betterDirection: z.enum(['lower', 'higher']).optional(),
});

export type TestProtocol = z.infer<typeof testProtocolSchema>;

/**
 * The comparison identity of a protocol.
 *
 * Every field, in a fixed order, so two configurations written in a different
 * key order produce the same string — the same reasoning as `canonicalContext`.
 * `null` where no protocol was declared, which is its own comparison class and
 * not a wildcard.
 *
 * `label` and `betterDirection` are deliberately **not** part of it: one is a
 * wording, the other says how to read the numbers. Neither changes what was
 * measured, and a coach who edits either must not thereby cut their own series
 * in half.
 */
export function protocolKey(protocol: TestProtocol | null | undefined): string | null {
  if (!protocol) return null;

  return [
    protocol.key,
    protocol.distanceM === undefined ? '' : String(protocol.distanceM),
    protocol.division ?? '',
    protocol.device ?? '',
    protocol.venue ?? '',
  ].join('|');
}

/**
 * The ways a test computes a value instead of asking for one.
 *
 * A superset of the body-fat methods, and deliberately one flat list rather
 * than a per-quantity union: what a configuration has to record is "which
 * published procedure produced this number", and that question has the same
 * shape whether the answer is a skinfold regression or an energy conversion.
 *
 * Adding to the end keeps every stored payload readable — a configuration
 * written before `atwater_energy` existed simply never names it.
 */
export const DERIVATION_METHODS = [...BODY_FAT_METHODS, 'atwater_energy'] as const;

export const derivationMethodSchema = z.enum(DERIVATION_METHODS);
export type DerivationMethod = z.infer<typeof derivationMethodSchema>;

export const moduleConfigurationSchema = z
  .object({
    /**
     * The quantities this test records, in the order the coach arranged them.
     * At least one, or there is no test.
     *
     * Order is configuration: it is the order of the entry grid and of the
     * analysis, which is why this is an array rather than a map.
     */
    measurementTypes: z
      .array(configuredMeasurementSchema)
      .min(1, 'Bitte mindestens eine Messgröße wählen.'),

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

    /**
     * Which of this test's quantities says what a stage demanded.
     *
     * Optional, and absent for most tests: a grip-strength test measures an
     * outcome and nothing else. Where it is set, an evaluation places the stages
     * at that value rather than at their number — which is what makes two lactate
     * tests comparable at the same speed instead of at the same stage.
     *
     * A property of the **protocol**, not of the quantity. Pace is the demand in a
     * step test and the result in a time trial, so a flag on the measurement type
     * could not tell the two apart.
     *
     * Optional also means old payloads stay readable: a configuration written
     * before this existed simply has no load quantity, which is the truth about
     * it.
     */
    loadMeasurementTypeId: z.string().min(1).optional(),

    /**
     * Quantities this test **computes** rather than asks for.
     *
     * A body-fat percentage from caliper folds follows from the folds, the
     * athlete's sex and their age on the day — there is nothing for a coach to
     * type. The type stays in `measurementTypes` so the derived value may be
     * attached to the module at all and appears wherever measurements appear; it
     * is named here so the entry screen leaves the field out.
     *
     * Every id here must also be in `measurementTypes` — a test cannot compute a
     * quantity it does not record. Checked below rather than left to the caller.
     */
    derivations: z
      .array(
        z.object({
          measurementTypeId: z.string().min(1),
          /**
           * **Stored, not inferred.** Three-site and seven-site Jackson & Pollock
           * are different regressions, and guessing which one a test meant from
           * the folds it happens to hold would pick the wrong equation the moment
           * a coach adds a site.
           */
          method: derivationMethodSchema,
        }),
      )
      .optional(),

    /** Free-form protocol notes: load steps, device settings, conditions. */
    notes: z.string().trim().max(4000).optional(),

    /**
     * The structured conditions this test was carried out under.
     *
     * Optional, and absent on every configuration written before it existed —
     * which is the truth about those tests, not a gap to fill in.
     */
    protocol: testProtocolSchema.optional(),

    /**
     * The movement analysis this test was judged under.
     *
     * Written by the automatically created video-analysis test since that
     * screen existed — and, until now, **silently dropped on read**: the key was
     * never declared here, and a Zod object strips what it does not know. So the
     * comment promising that opening a test later shows what it was judged
     * against was not true of the code. Declaring it is the fix.
     *
     * Absent on every test without a video behind it, which is most of them.
     */
    movement: movementAnalysisConfigSchema.optional(),
  })
  .superRefine((configuration, ctx) => {
    // A test cannot compute a quantity it does not record: the derived value is
    // stored as a measurement of that type on this module, and a type outside
    // `measurementTypes` would be refused at the moment of writing — long after
    // the configuration that promised it was saved.
    const recorded = new Set(
      configuration.measurementTypes.map((entry) => entry.measurementTypeId),
    );

    for (const [index, derivation] of (configuration.derivations ?? []).entries()) {
      if (!recorded.has(derivation.measurementTypeId)) {
        ctx.addIssue({
          code: 'custom',
          path: ['derivations', index, 'measurementTypeId'],
          message: 'Eine berechnete Messgröße muss auch erfasst werden.',
        });
      }
    }

    // The load axis is a quantity of this test as well, for the same reason: an
    // axis nothing was recorded on cannot be drawn.
    if (
      configuration.loadMeasurementTypeId !== undefined &&
      !recorded.has(configuration.loadMeasurementTypeId)
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['loadMeasurementTypeId'],
        message: 'Die Belastungsgröße muss zu den erfassten Messgrößen gehören.',
      });
    }
  });

export type ModuleConfiguration = z.infer<typeof moduleConfigurationSchema>;
export type AngleTarget = AngleTargetConfig;

/**
 * The target that judges one reading, or `null` where none can be matched.
 *
 * ## Why this needs the profile
 *
 * A target names a track and a position by their **profile keys** — `knee`,
 * `flexed`. The measurement beside it names them with whatever the test's axes
 * were filled with, and the video-analysis test fills them with the track key
 * for the joint and the position's *label* for the position. Nothing records
 * that mapping, so it is reconstructed here from the profile the analysis
 * declared.
 *
 * ## Why `null` is a normal answer
 *
 * A coach's own test may declare its own values for those axes — "linkes Knie",
 * "unten" — and nothing relates those to a profile. Then no target can be
 * matched, and the honest answer is that this reading is not judged, rather
 * than a verdict against a threshold that may have meant something else.
 */
export function targetForReading(
  configuration: ModuleConfiguration | null | undefined,
  reading: {
    readonly measurementTypeId: string;
    readonly side: string;
    readonly context: Record<string, string>;
  },
): AngleTarget | null {
  const movement = configuration?.movement;
  if (movement === undefined || movement.targets.length === 0) return null;

  const profile = movementProfile(movement.profileKey);
  if (profile === null) return null;

  const joint = reading.context['joint'];
  const position = reading.context['position'];
  if (position === undefined) return null;

  return (
    movement.targets.find((target) => {
      // One track needs no joint axis to be unambiguous; two do.
      if (joint !== undefined && target.track !== joint) return false;
      if (joint === undefined && profile.tracks.length > 1) return false;

      const declared = positionOf(profile, target.position);

      return declared !== null && (declared.label === position || declared.key === position);
    }) ?? null
  );
}

/** Whether a reading meets its target. The one arithmetic, in one place. */
export function meetsAngleTarget(degrees: number, target: AngleTarget): boolean {
  if (target.comparison === 'at_most') return degrees <= target.degrees;
  if (target.comparison === 'at_least') return degrees >= target.degrees;

  return Math.abs(degrees - target.degrees) <= EQUALS_TOLERANCE_DEGREES;
}

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
