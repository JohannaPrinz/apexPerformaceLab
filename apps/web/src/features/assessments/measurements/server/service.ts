import 'server-only';

import type { PrismaClientInstance } from '@apex/database';
import { scoped, withTenant } from '@apex/database/tenant';
import {
  canonicalContext,
  contextOf,
  evaluateReadiness,
  measurementTypeIdsOf,
  movementProfile,
  positionOf,
  protocolKey,
  readModuleConfiguration,
  selfComparisons,
  seriesKey,
  trackOf,
  validateMeasurementContext,
  validatePassIndex,
  type BetterDirection,
  type ComparableReading,
  type ModuleConfiguration,
  type Readiness,
  type TestProtocol,
} from '@apex/domain';
import type { TenantContext } from '@apex/types';

import { refreshDerivedMeasurements } from './derivation';

import type { CorrectMeasurementInput, RecordMeasurementInput } from '../schemas';

/**
 * Recording measurements.
 *
 * Three rules are enforced here rather than trusted:
 *
 * 1. **The value goes in the column its type names.** The database has a CHECK
 *    that exactly one of the three is set; mapping it centrally means no caller
 *    can violate it.
 * 2. **`passIndex` and `context` are validated against the module's own
 *    configuration.** A pass beyond the configured count, or a context key the
 *    test never declared, is rejected before the write.
 * 3. **Nothing is ever overwritten.** A correction is a new row that supersedes
 *    the old one, inside a transaction, so the chain cannot half-exist (§4).
 */

type MeasurementDb = Pick<
  PrismaClientInstance,
  'measurement' | 'assessmentModule' | 'measurementType' | 'exercise' | '$transaction'
>;

const measurementSelect = {
  id: true,
  measurementTypeId: true,
  side: true,
  exerciseId: true,
  numericValue: true,
  textValue: true,
  booleanValue: true,
  passIndex: true,
  context: true,
  capturedAt: true,
  ingestedAt: true,
  source: true,
  supersededById: true,
  // The row this one replaced, if any. Selected as a presence check rather than
  // a value: it is what lets the entry screen mark a corrected reading, which
  // is otherwise indistinguishable from one entered first time.
  supersedes: { select: { id: true } },
  assessmentModuleId: true,
  note: true,
} as const;

export interface MeasurementRecord {
  id: string;
  measurementTypeId: string;
  side: 'LEFT' | 'RIGHT' | 'BILATERAL';
  exerciseId: string | null;
  numericValue: unknown;
  textValue: string | null;
  booleanValue: boolean | null;
  passIndex: number | null;
  context: unknown;
  capturedAt: Date;
  ingestedAt: Date;
  source: 'MANUAL' | 'DEVICE' | 'IMPORT' | 'DERIVED';
  supersededById: string | null;
  /** The reading this one replaced, if it replaced one. */
  supersedes?: { id: string } | null;
  assessmentModuleId: string;
  note: string | null;
}

/** Why a write was refused, in a shape a form can show. */
export type RecordFailure =
  | { reason: 'MODULE_NOT_FOUND' }
  | { reason: 'MEASUREMENT_NOT_FOUND' }
  | { reason: 'TYPE_NOT_AVAILABLE' }
  | { reason: 'TYPE_NOT_CONFIGURED' }
  | { reason: 'MODULE_NOT_CONFIGURED' }
  | { reason: 'VALUE_TYPE_MISMATCH'; expected: string }
  | { reason: 'PASS_INVALID'; passes: number }
  | { reason: 'EXERCISE_NOT_CONFIGURED' }
  | { reason: 'EXERCISE_MISSING' }
  | { reason: 'CONTEXT_INVALID'; errors: Record<string, string> }
  | { reason: 'ALREADY_SUPERSEDED' };

export type RecordResult =
  { ok: true; measurement: MeasurementRecord } | { ok: false; failure: RecordFailure };

/**
 * Maps a value onto the column its type declares.
 *
 * Returns `null` when the value does not match — a text answer for a numeric
 * quantity is a mistake worth naming, not a coercion worth performing.
 */
function toValueColumns(
  valueType: string,
  value: number | string | boolean,
): { numericValue?: number; textValue?: string; booleanValue?: boolean } | null {
  if (valueType === 'NUMERIC') return typeof value === 'number' ? { numericValue: value } : null;
  if (valueType === 'TEXT') return typeof value === 'string' ? { textValue: value } : null;
  if (valueType === 'BOOLEAN') return typeof value === 'boolean' ? { booleanValue: value } : null;

  return null;
}

/**
 * Loads a module with its configuration, scoped to the tenant.
 *
 * The measurement type lookup is `this workspace OR system-wide`, because
 * system types carry `organizationId = null` (§12) — the same catalogue
 * exception documented in the assessments router.
 */
async function loadModule(
  db: MeasurementDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  moduleId: string,
) {
  const row = await db.assessmentModule.findFirst({
    where: scoped(tenant, { id: moduleId }),
    select: { id: true, payload: true, moduleVersion: true, status: true },
  });

  if (!row) return null;

  return { ...row, configuration: readModuleConfiguration(row.payload, row.moduleVersion) };
}

export async function recordMeasurement(
  db: MeasurementDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  input: RecordMeasurementInput,
): Promise<RecordResult> {
  const assessmentModule = await loadModule(db, tenant, input.moduleId);
  if (!assessmentModule) return { ok: false, failure: { reason: 'MODULE_NOT_FOUND' } };

  const configuration = assessmentModule.configuration;
  if (!configuration) return { ok: false, failure: { reason: 'MODULE_NOT_CONFIGURED' } };

  if (!measurementTypeIdsOf(configuration).includes(input.measurementTypeId)) {
    return { ok: false, failure: { reason: 'TYPE_NOT_CONFIGURED' } };
  }

  // The exercise is validated against the module's own configuration, exactly
  // as `passIndex` and `context` are. A test that declares no exercise must not
  // acquire one through the API, and one that declares several must say which.
  if (configuration.exerciseIds.length === 0) {
    if (input.exerciseId) return { ok: false, failure: { reason: 'EXERCISE_NOT_CONFIGURED' } };
  } else if (!input.exerciseId || !configuration.exerciseIds.includes(input.exerciseId)) {
    return { ok: false, failure: { reason: 'EXERCISE_MISSING' } };
  }

  const type = await db.measurementType.findFirst({
    where: {
      id: input.measurementTypeId,
      OR: [{ organizationId: tenant.organizationId }, { organizationId: null }],
    },
    select: { valueType: true },
  });

  if (!type) return { ok: false, failure: { reason: 'TYPE_NOT_AVAILABLE' } };

  const columns = toValueColumns(type.valueType, input.value);
  if (!columns) {
    return { ok: false, failure: { reason: 'VALUE_TYPE_MISMATCH', expected: type.valueType } };
  }

  if (!validatePassIndex(configuration, input.passIndex)) {
    return { ok: false, failure: { reason: 'PASS_INVALID', passes: configuration.passes } };
  }

  const context = validateMeasurementContext(
    configuration,
    input.context,
    assessmentModule.moduleVersion,
  );

  if (!context.success) {
    return { ok: false, failure: { reason: 'CONTEXT_INVALID', errors: context.errors ?? {} } };
  }

  const measurement = await db.measurement.create({
    data: withTenant(tenant, {
      assessmentModuleId: input.moduleId,
      measurementTypeId: input.measurementTypeId,
      side: input.side,
      exerciseId: input.exerciseId ?? null,
      passIndex: input.passIndex ?? null,
      // An empty context is stored as null rather than `{}` — "no dimensions"
      // and "no values for them" are the same thing, and one representation is
      // enough.
      context: Object.keys(context.context ?? {}).length > 0 ? context.context : undefined,
      capturedAt: input.capturedAt ? new Date(input.capturedAt) : new Date(),
      source: input.source,
      note: input.note ?? null,
      externalSystem: input.externalSystem ?? null,
      externalId: input.externalId ?? null,
      ...columns,
    }),
    select: measurementSelect,
  });

  return { ok: true, measurement };
}

/**
 * Corrects a measurement by superseding it.
 *
 * The original keeps its value and gains a pointer to the replacement. Both
 * writes share a transaction: a chain that half-exists would be worse than no
 * correction at all, because the record would show two current values for the
 * same reading.
 *
 * A measurement that has already been superseded cannot be corrected again —
 * the correction belongs on the current value, or the chain forks and "which
 * one counts" stops having an answer.
 */
export async function correctMeasurement(
  db: MeasurementDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  { measurementId, value, note, capturedAt }: CorrectMeasurementInput,
): Promise<RecordResult> {
  const original = await db.measurement.findFirst({
    where: scoped(tenant, { id: measurementId }),
    select: { ...measurementSelect, measurementType: { select: { valueType: true } } },
  });

  if (!original) return { ok: false, failure: { reason: 'MEASUREMENT_NOT_FOUND' } };
  if (original.supersededById) return { ok: false, failure: { reason: 'ALREADY_SUPERSEDED' } };

  const columns = toValueColumns(original.measurementType.valueType, value);
  if (!columns) {
    return {
      ok: false,
      failure: { reason: 'VALUE_TYPE_MISMATCH', expected: original.measurementType.valueType },
    };
  }

  const replacement = await db.$transaction(async (tx) => {
    const created = await tx.measurement.create({
      data: withTenant(tenant, {
        assessmentModuleId: original.assessmentModuleId,
        measurementTypeId: original.measurementTypeId,
        side: original.side,
        // A correction replaces the value, never its coordinates.
        exerciseId: original.exerciseId,
        passIndex: original.passIndex,
        context: original.context ?? undefined,
        capturedAt: capturedAt ? new Date(capturedAt) : original.capturedAt,
        source: original.source,
        // The superseded row keeps its own note: it explains the value that was
        // replaced, and moving it would leave that value unexplained.
        note: note ?? null,
        ...columns,
      }),
      select: measurementSelect,
    });

    await tx.measurement.update({
      where: { id: original.id },
      data: { supersededById: created.id },
    });

    return created;
  });

  return { ok: true, measurement: replacement };
}

/**
 * The measurements of a module.
 *
 * Superseded values are hidden by default and never deleted — an erroneous
 * reading is part of the record (§13), it simply is not the current answer.
 */
export async function listMeasurementsForModule(
  db: MeasurementDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  moduleId: string,
  includeSuperseded = false,
): Promise<MeasurementRecord[]> {
  return db.measurement.findMany({
    where: scoped(tenant, {
      assessmentModuleId: moduleId,
      ...(includeSuperseded ? {} : { supersededById: null }),
    }),
    select: measurementSelect,
    orderBy: [{ passIndex: 'asc' }, { capturedAt: 'asc' }, { id: 'asc' }],
  });
}

/**
 * Readiness of one module.
 *
 * Computed from the configuration and what was recorded — never from the
 * status. A `COMPLETED` test may be missing values and an `ABORTED` one may
 * hold enough.
 */
export async function moduleReadiness(
  db: MeasurementDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  moduleId: string,
): Promise<{ configuration: ModuleConfiguration | null; readiness: Readiness } | null> {
  const assessmentModule = await loadModule(db, tenant, moduleId);
  if (!assessmentModule) return null;

  if (!assessmentModule.configuration) {
    return {
      configuration: null,
      readiness: {
        level: 'INSUFFICIENT',
        missingTypeIds: [],
        missingRecommendedTypeIds: [],
        missingPasses: [],
        expected: 0,
        recorded: 0,
      },
    };
  }

  const measurements = await db.measurement.findMany({
    where: scoped(tenant, { assessmentModuleId: moduleId }),
    select: { measurementTypeId: true, passIndex: true, supersededById: true },
  });

  return {
    configuration: assessmentModule.configuration,
    readiness: evaluateReadiness(assessmentModule.configuration, measurements),
  };
}

/**
 * A general remark about a test, stored as a `Note` on the module (§20).
 *
 * A Note is anchored to an athlete, which is reached through the module's
 * assessment and case — never stored a second time (§26.4). Returns `null` when
 * the module is not in this workspace.
 */
/**
 * Records a remark about a test, or about one stage of it.
 *
 * `passIndex` is what makes a stage note possible: a pass is a structure inside
 * the test and never an entity, so the note points at the module and names the
 * pass rather than at a row that would have to exist for it — the same shape
 * `Measurement.passIndex` uses.
 *
 * Null means the note is about the test as a whole, which is what every note
 * written before stages could be annotated already is.
 */
export async function addModuleNote(
  db: Pick<PrismaClientInstance, 'assessmentModule' | 'note'>,
  tenant: Pick<TenantContext, 'organizationId'>,
  authorCoachId: string,
  moduleId: string,
  body: string,
  passIndex: number | null = null,
): Promise<{ id: string } | null> {
  const assessmentModule = await db.assessmentModule.findFirst({
    where: scoped(tenant, { id: moduleId }),
    select: {
      id: true,
      assessmentId: true,
      assessment: { select: { caseId: true, case: { select: { athleteId: true } } } },
    },
  });

  if (!assessmentModule) return null;

  return db.note.create({
    data: withTenant(tenant, {
      body,
      authorCoachId,
      athleteId: assessmentModule.assessment.case.athleteId,
      caseId: assessmentModule.assessment.caseId,
      assessmentId: assessmentModule.assessmentId,
      assessmentModuleId: assessmentModule.id,
      passIndex,
    }),
    select: { id: true },
  });
}

export interface ModuleNoteRecord {
  id: string;
  body: string;
  /** Which stage it is about. Null for a note about the test as a whole. */
  passIndex: number | null;
  authorCoachId: string | null;
  createdAt: Date;
}

export async function listModuleNotes(
  db: Pick<PrismaClientInstance, 'note'>,
  tenant: Pick<TenantContext, 'organizationId'>,
  moduleId: string,
): Promise<ModuleNoteRecord[]> {
  return db.note.findMany({
    where: scoped(tenant, { assessmentModuleId: moduleId }),
    select: { id: true, body: true, passIndex: true, authorCoachId: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
}

/**
 * Everything the entry screen needs, in one call.
 *
 * The screen is built **from the configuration**, never from the module key:
 * which quantities, how many passes, which sides, which dimensions. A lactate
 * step test and a grip-strength test differ only in what this returns, which is
 * what keeps the screen free of per-test special cases.
 *
 * Readiness comes from the domain service and is passed through untouched — the
 * screen displays it and never decides it.
 */
export interface ModuleWorkspace {
  moduleId: string;
  moduleKey: string;
  /** What the coach called this test; `null` before names existed. */
  moduleName: string | null;
  /** What it is for, in the coach's words. Not the protocol. */
  moduleDescription: string | null;
  moduleVersion: number;
  status: string;
  /** When the test was set up, first called finished, last reopened, put away. */
  createdAt: Date;
  completedAt: Date | null;
  reopenedAt: Date | null;
  archivedAt: Date | null;
  createdByCoachId: string;
  configuration: ModuleConfiguration | null;
  /**
   * Type id → what a coach needs to see and validate against.
   *
   * `key` is the catalogue key (§12). Carried because a caller that has to
   * decide "is this the range-of-motion quantity" cannot do it from a display
   * name — a workspace may define its own type under a system key, and a name
   * is translated text.
   */
  types: Record<string, { key: string; name: string; unit: string; valueType: string }>;
  /**
   * Exercise id → what the movements of this test are.
   *
   * `key` is the catalogue key: it is what resolves a movement profile, and a
   * display name cannot — a workspace may rename an exercise, and the name is
   * translated text.
   */
  exercises: Record<string, { key: string; name: string }>;
  measurements: MeasurementRecord[];
  /** Superseded values, for the correction history. */
  superseded: MeasurementRecord[];
  notes: ModuleNoteRecord[];
  readiness: Readiness;
  assessment: { id: string; question: string; athleteId: string };
  /**
   * The other tests of this examination, in the order they were added.
   *
   * Returned with the workspace so the entry screen can offer "the next test"
   * when this one is finished. Without it, finishing a test is a dead end: the
   * coach goes back to the assessment and finds the next one themselves, which
   * on a tablet mid-session is three taps for something the screen already
   * knows.
   */
  siblings: {
    id: string;
    name: string | null;
    moduleKey: string;
    status: string;
    archivedAt: Date | null;
  }[];
}

/**
 * A row the React boundary can actually carry.
 *
 * `numericValue` is a Prisma `Decimal` — a class instance, because the column is
 * `Decimal(12,4)` and a `number` would lose precision. Handing one to a Client
 * Component makes React warn on every row ("Only plain objects can be passed to
 * Client Components"), and what survives the crossing is not the Decimal.
 *
 * Converted to a **string**, not a number: the point of the Decimal is that the
 * value does not fit a float, and turning it into one here would throw away
 * exactly what the column exists to keep. Everything that displays it already
 * accepts a string.
 *
 * Only the rows that leave for the browser are converted. `evaluateReadiness`
 * keeps the originals.
 */
function plainValue<TRow extends { numericValue: unknown }>(
  row: TRow,
): TRow & { numericValue: string | null } {
  const numeric = row.numericValue;

  return {
    ...row,
    numericValue:
      numeric === null || numeric === undefined
        ? null
        : (numeric as { toString: () => string }).toString(),
  };
}

export async function moduleWorkspace(
  db: MeasurementDb & Pick<PrismaClientInstance, 'note'>,
  tenant: Pick<TenantContext, 'organizationId'>,
  moduleId: string,
): Promise<ModuleWorkspace | null> {
  const row = await db.assessmentModule.findFirst({
    where: scoped(tenant, { id: moduleId }),
    select: {
      id: true,
      moduleKey: true,
      name: true,
      description: true,
      moduleVersion: true,
      status: true,
      payload: true,
      createdByCoachId: true,
      createdAt: true,
      completedAt: true,
      reopenedAt: true,
      archivedAt: true,
      assessmentId: true,
      assessment: {
        select: { id: true, question: true, case: { select: { athleteId: true } } },
      },
    },
  });

  if (!row) return null;

  const configuration = readModuleConfiguration(row.payload, row.moduleVersion);

  const [all, notes, siblings] = await Promise.all([
    db.measurement.findMany({
      where: scoped(tenant, { assessmentModuleId: moduleId }),
      select: { ...measurementSelect },
      orderBy: [{ passIndex: 'asc' }, { capturedAt: 'asc' }, { id: 'asc' }],
    }),
    listModuleNotes(db, tenant, moduleId),
    db.assessmentModule.findMany({
      where: scoped(tenant, { assessmentId: row.assessmentId }),
      select: { id: true, name: true, moduleKey: true, status: true, archivedAt: true },
      orderBy: { createdAt: 'asc' },
    }),
  ]);

  const exercises =
    configuration && configuration.exerciseIds.length > 0
      ? await db.exercise.findMany({
          where: {
            id: { in: configuration.exerciseIds },
            // Same catalogue rule as the measurement types below: a system
            // exercise carries `organizationId = null` and every workspace
            // inherits it.
            OR: [{ organizationId: tenant.organizationId }, { organizationId: null }],
          },
          select: { id: true, key: true, name: true },
        })
      : [];

  const types = configuration
    ? await db.measurementType.findMany({
        where: {
          id: { in: [...measurementTypeIdsOf(configuration)] },
          // Catalogue rule, not an absence of scoping: system types carry
          // `organizationId = null` and every workspace inherits them (§12).
          OR: [{ organizationId: tenant.organizationId }, { organizationId: null }],
        },
        select: { id: true, key: true, name: true, unit: true, valueType: true },
      })
    : [];

  return {
    moduleId: row.id,
    moduleKey: row.moduleKey,
    moduleName: row.name ?? null,
    moduleDescription: row.description ?? null,
    moduleVersion: row.moduleVersion,
    status: row.status,
    createdAt: row.createdAt,
    completedAt: row.completedAt,
    reopenedAt: row.reopenedAt,
    archivedAt: row.archivedAt,
    createdByCoachId: row.createdByCoachId,
    configuration,
    types: Object.fromEntries(
      types.map((type) => [
        type.id,
        { key: type.key, name: type.name, unit: type.unit, valueType: type.valueType },
      ]),
    ),
    exercises: Object.fromEntries(
      exercises.map((exercise) => [exercise.id, { key: exercise.key, name: exercise.name }]),
    ),
    measurements: all.filter((m) => m.supersededById === null).map(plainValue),
    superseded: all.filter((m) => m.supersededById !== null).map(plainValue),
    notes,
    siblings: siblings.map((sibling) => ({
      id: sibling.id,
      name: sibling.name ?? null,
      moduleKey: sibling.moduleKey,
      status: sibling.status,
      archivedAt: sibling.archivedAt,
    })),
    readiness: configuration
      ? evaluateReadiness(configuration, all)
      : {
          level: 'INSUFFICIENT',
          missingTypeIds: [],
          missingRecommendedTypeIds: [],
          missingPasses: [],
          expected: 0,
          recorded: 0,
        },
    assessment: {
      id: row.assessment.id,
      question: row.assessment.question,
      athleteId: row.assessment.case.athleteId,
    },
  };
}

/** Which entry of a batch failed, so the interface can point at the field. */
export interface BatchFailure {
  readonly index: number;
  readonly failure: RecordFailure;
}

export type RecordManyResult =
  { ok: true; measurements: MeasurementRecord[] } | { ok: false; failures: BatchFailure[] };

/**
 * Records a whole stage in one go.
 *
 * ## The gap this closes
 *
 * `recordMeasurement` writes exactly one row. A screen that saves five fields
 * therefore made five independent calls, and a failure on the third left the
 * first two in the database with no record of the intent — the coach would see
 * an error and a half-saved stage, with no way to tell which half.
 *
 * ## Validate everything, then write everything
 *
 * Both phases matter and they are deliberately separate:
 *
 * 1. **Every entry is checked first**, against the module's configuration, the
 *    workspace's measurement types and the stage rules — the same checks
 *    `recordMeasurement` runs, reused rather than restated.
 * 2. **Only then does anything get written**, inside one transaction.
 *
 * So a stage with one bad value writes nothing at all, and the coach is told
 * about *every* problem at once instead of discovering them one save at a time.
 *
 * ## What it deliberately does not do
 *
 * It does not correct. A value that already exists is superseded through
 * `correctMeasurement`, which keeps the original and its chain (§13) — folding
 * that into a batch would put two different meanings behind one button. The
 * caller decides which entries are new and which are corrections.
 */
export async function recordMeasurements(
  db: MeasurementDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  inputs: readonly RecordMeasurementInput[],
): Promise<RecordManyResult> {
  if (inputs.length === 0) return { ok: true, measurements: [] };

  const prepared: { index: number; input: RecordMeasurementInput }[] = [];
  const failures: BatchFailure[] = [];

  // Dry run: every entry goes through the same validation the single-value path
  // uses. `validateOnly` stops short of the write, so nothing is created while
  // a later entry may still turn out to be wrong.
  for (const [index, input] of inputs.entries()) {
    const check = await validateMeasurement(db, tenant, input);

    if (check === null) prepared.push({ index, input });
    else failures.push({ index, failure: check });
  }

  if (failures.length > 0) return { ok: false, failures };

  const measurements = await db.$transaction(async (tx) =>
    Promise.all(
      prepared.map(async ({ input }) => {
        const result = await recordMeasurement(tx, tenant, input);

        // Unreachable: every entry validated a moment ago, inside the same
        // request. Throwing rolls the transaction back rather than returning a
        // half-written stage.
        if (!result.ok) throw new Error('Ein geprüfter Messwert ließ sich nicht speichern.');

        return result.measurement;
      }),
    ),
  );

  return { ok: true, measurements };
}

/**
 * The checks `recordMeasurement` runs, without the write.
 *
 * Returns `null` when the value would be accepted. Extracted so the batch can
 * refuse a whole stage before touching the database — and so the two paths can
 * never disagree about what a valid measurement is.
 */
async function validateMeasurement(
  db: MeasurementDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  input: RecordMeasurementInput,
): Promise<RecordFailure | null> {
  const assessmentModule = await loadModule(db, tenant, input.moduleId);
  if (!assessmentModule) return { reason: 'MODULE_NOT_FOUND' };

  const configuration = assessmentModule.configuration;
  if (!configuration) return { reason: 'MODULE_NOT_CONFIGURED' };

  if (!measurementTypeIdsOf(configuration).includes(input.measurementTypeId)) {
    return { reason: 'TYPE_NOT_CONFIGURED' };
  }

  if (configuration.exerciseIds.length === 0) {
    if (input.exerciseId) return { reason: 'EXERCISE_NOT_CONFIGURED' };
  } else if (!input.exerciseId || !configuration.exerciseIds.includes(input.exerciseId)) {
    return { reason: 'EXERCISE_MISSING' };
  }

  const type = await db.measurementType.findFirst({
    where: {
      id: input.measurementTypeId,
      OR: [{ organizationId: tenant.organizationId }, { organizationId: null }],
    },
    select: { valueType: true },
  });

  if (!type) return { reason: 'TYPE_NOT_AVAILABLE' };

  if (!toValueColumns(type.valueType, input.value)) {
    return { reason: 'VALUE_TYPE_MISMATCH', expected: type.valueType };
  }

  if (!validatePassIndex(configuration, input.passIndex)) {
    return { reason: 'PASS_INVALID', passes: configuration.passes };
  }

  const context = validateMeasurementContext(
    configuration,
    input.context,
    assessmentModule.moduleVersion,
  );

  return context.success ? null : { reason: 'CONTEXT_INVALID', errors: context.errors ?? {} };
}

/**
 * One entry of a stage: either a value not recorded yet, or a correction of one.
 *
 * The two are different acts, not two spellings of one. A new value creates a
 * row; a correction supersedes the original and keeps it (§13). Which of the
 * two applies is decided by whether the slot already holds a measurement, and
 * the caller knows that because it is what it rendered.
 */
export type StageEntry =
  | { readonly kind: 'record'; readonly input: RecordMeasurementInput }
  | { readonly kind: 'correct'; readonly input: CorrectMeasurementInput };

export type SaveStageResult =
  { ok: true; measurements: MeasurementRecord[] } | { ok: false; failures: BatchFailure[] };

/**
 * Saves everything a coach entered on one stage, in one transaction.
 *
 * ## Why both kinds belong in the same call
 *
 * A stage rarely holds only new values. The coach fills three fields, notices
 * the second reading was mistyped, corrects it, and presses "Weiter" once. Two
 * calls behind that button would mean the stage can be half-saved — the new
 * values in, the correction not — and the record would then show a value the
 * coach believes they replaced.
 *
 * `recordMeasurements` closed that gap for new values. This closes it for the
 * mixed case, which is the ordinary one.
 *
 * ## Validate everything, then write everything
 *
 * New values go through the same dry run `recordMeasurements` uses. Corrections
 * cannot be checked without reading the original, so they are attempted inside
 * the transaction — a failure there rolls the whole stage back, which is the
 * same promise by a different route.
 *
 * Failures come back indexed against the entries as given, so a screen can put
 * the message on the field it belongs to rather than above the form.
 */
export async function saveStage(
  db: MeasurementDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  entries: readonly StageEntry[],
): Promise<SaveStageResult> {
  if (entries.length === 0) return { ok: true, measurements: [] };

  const failures: BatchFailure[] = [];

  for (const [index, entry] of entries.entries()) {
    if (entry.kind !== 'record') continue;

    const check = await validateMeasurement(db, tenant, entry.input);
    if (check !== null) failures.push({ index, failure: check });
  }

  if (failures.length > 0) return { ok: false, failures };

  /**
   * A refusal raised from inside the transaction, so the rollback happens.
   *
   * Returning a result would commit what came before it; only a throw undoes
   * the stage. The reason is carried out again on the far side.
   */
  class StageRefused extends Error {
    constructor(readonly entry: BatchFailure) {
      super('Stage refused');
    }
  }

  try {
    const measurements = await db.$transaction(async (tx) => {
      const written: MeasurementRecord[] = [];

      // Sequential on purpose: a correction reads the row it supersedes, and
      // two writes racing for the same slot would fork the chain that §13
      // exists to keep single.
      for (const [index, entry] of entries.entries()) {
        const result =
          entry.kind === 'record'
            ? await recordMeasurement(tx, tenant, entry.input)
            : await correctMeasurement(tx, tenant, entry.input);

        if (!result.ok) throw new StageRefused({ index, failure: result.failure });

        written.push(result.measurement);
      }

      return written;
    });

    // Outside the transaction on purpose. A percentage follows from the folds
    // that stand once they are committed, and computing it inside would read a
    // sheet that may still roll back. It is also not part of the coach's write:
    // if the derivation fails the stage the coach typed is still saved, which is
    // the right order of importance.
    for (const moduleId of new Set(measurements.map((row) => row.assessmentModuleId))) {
      await refreshDerivedMeasurements(db, tenant, moduleId);
    }

    return { ok: true, measurements };
  } catch (error) {
    if (error instanceof StageRefused) return { ok: false, failures: [error.entry] };

    throw error;
  }
}

/**
 * Every standing measurement that may be compared with this test's.
 *
 * The one place the tenant rule, the supersede rule, the archive rule and the
 * "same type, same athlete" rule are stated. Both the table and the diagram
 * read from here, so neither can quietly disagree with the other about what
 * belongs in an evaluation.
 */
async function comparableMeasurements(
  db: MeasurementDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  moduleId: string,
) {
  const current = await db.assessmentModule.findFirst({
    where: scoped(tenant, { id: moduleId }),
    select: {
      id: true,
      moduleKey: true,
      assessment: { select: { case: { select: { athleteId: true } } } },
    },
  });

  if (!current) return null;

  const rows = await db.measurement.findMany({
    where: scoped(tenant, {
      // A superseded reading is history, not a point on the curve (§13).
      supersededById: null,
      assessmentModule: {
        moduleKey: current.moduleKey,
        archivedAt: null,
        assessment: { case: { athleteId: current.assessment.case.athleteId } },
      },
    }),
    select: {
      id: true,
      measurementTypeId: true,
      side: true,
      exerciseId: true,
      passIndex: true,
      context: true,
      numericValue: true,
      textValue: true,
      booleanValue: true,
      capturedAt: true,
      source: true,
      assessmentModule: {
        select: {
          id: true,
          name: true,
          status: true,
          assessmentId: true,
          // The protocol's own answer to "what did this stage demand". Read
          // here so the diagram never has to ask a second time.
          payload: true,
          moduleVersion: true,
          assessment: { select: { question: true } },
        },
      },
      measurementType: { select: { name: true, unit: true, valueType: true } },
    },
    orderBy: [{ capturedAt: 'asc' }, { id: 'asc' }],
  });

  const exerciseIds = [...new Set(rows.map((row) => row.exerciseId))].filter(
    (id): id is string => id !== null,
  );
  const exercises =
    exerciseIds.length > 0
      ? await db.exercise.findMany({
          where: {
            id: { in: exerciseIds },
            // The catalogue rule, not an absence of scoping: a system exercise
            // carries `organizationId = null` and every workspace inherits it.
            OR: [{ organizationId: tenant.organizationId }, { organizationId: null }],
          },
          select: { id: true, name: true },
        })
      : [];
  const exerciseNames = new Map(exercises.map((exercise) => [exercise.id, exercise.name]));

  return { current, rows, exerciseNames };
}

/** One series of a test, as the overview shows it. */
export interface SelfComparisonRow {
  readonly key: string;
  readonly typeName: string;
  readonly unit: string;
  readonly side: string;
  readonly exerciseName: string | null;
  readonly passIndex: number | null;
  readonly context: Record<string, string>;
  /** How the value came about — typed, derived, from a device or an import. */
  readonly source: string;
  readonly current: { value: number; capturedAt: Date };
  readonly previous: { value: number; capturedAt: Date; moduleId: string } | null;
  readonly difference: number | null;
  readonly highest: { value: number; capturedAt: Date; moduleId: string };
  readonly lowest: { value: number; capturedAt: Date; moduleId: string };
  readonly best: { value: number; capturedAt: Date; moduleId: string } | null;
  readonly count: number;
}

export interface ModuleSelfComparison {
  /** The protocol this test declared, for the screen to state outright. */
  readonly protocol: TestProtocol | null;
  /** Whether a direction was declared — decides if `best` can be filled. */
  readonly direction: BetterDirection | null;
  readonly rows: readonly SelfComparisonRow[];
  /**
   * Earlier tests of this type that were excluded because their protocol
   * differs. Named, never silently dropped: "no previous value" and "a previous
   * value under different conditions" are different statements, and the second
   * is the one that tells a coach what to fix.
   */
  readonly mismatchedProtocols: readonly {
    moduleId: string;
    moduleName: string | null;
    /**
     * How that test's conditions are named — the coach's own key, never the
     * canonical comparison string. `null` where it declared none.
     */
    protocolName: string | null;
  }[];
}

/**
 * The same test, earlier — and what the numbers did in between.
 *
 * ## It adds one condition to the existing rule and no more
 *
 * `comparableMeasurements` already finds every standing reading of this test
 * type for this athlete, and `comparisonKey` already decides which of them are
 * the same quantity. This adds the protocol: two readings are only put beside
 * each other when the tests that produced them were carried out the same way.
 * That is the whole extension — the sameness rule itself is untouched.
 *
 * ## Why the mismatches are reported rather than dropped
 *
 * A coach who changed the distance between two tests has not lost a comparison,
 * they have made one. The screen can only say so if this hands the excluded
 * tests over instead of filtering them into silence.
 */
export async function moduleSelfComparison(
  db: MeasurementDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  moduleId: string,
): Promise<ModuleSelfComparison | null> {
  const loaded = await comparableMeasurements(db, tenant, moduleId);
  if (loaded === null) return null;

  const { rows, exerciseNames } = loaded;

  /** Each involved test's protocol, read once from its own stored payload. */
  const protocols = new Map<string, TestProtocol | null>();
  for (const row of rows) {
    const source = row.assessmentModule;
    if (protocols.has(source.id)) continue;

    const configuration = readModuleConfiguration(source.payload, source.moduleVersion);
    protocols.set(source.id, configuration?.protocol ?? null);
  }

  const own = protocols.get(moduleId) ?? null;
  const ownKey = protocolKey(own);

  const readings: ComparableReading[] = [];
  for (const row of rows) {
    const value = numberOf(row.numericValue);
    if (value === null) continue;

    readings.push({
      measurementTypeId: row.measurementTypeId,
      side: row.side,
      exerciseId: row.exerciseId,
      passIndex: row.passIndex,
      context: row.context,
      value,
      capturedAt: row.capturedAt,
      moduleId: row.assessmentModule.id,
      protocolKey: protocolKey(protocols.get(row.assessmentModule.id) ?? null),
      source: row.source,
    });
  }

  const direction = own?.betterDirection ?? null;
  const comparisons = selfComparisons(readings, moduleId, direction);

  const named = new Map(
    rows.map((row) => [
      row.measurementTypeId,
      { name: row.measurementType.name, unit: row.measurementType.unit },
    ]),
  );

  const mismatched = [...protocols.entries()]
    .filter(([id, protocol]) => id !== moduleId && protocolKey(protocol) !== ownKey)
    .map(([id, protocol]) => ({
      moduleId: id,
      moduleName: rows.find((row) => row.assessmentModule.id === id)?.assessmentModule.name ?? null,
      protocolName: protocol?.label ?? protocol?.key ?? null,
    }));

  return {
    protocol: own,
    direction,
    mismatchedProtocols: mismatched,
    rows: comparisons.map((entry): SelfComparisonRow => {
      const type = named.get(entry.coordinates.measurementTypeId);

      return {
        key: entry.key,
        typeName: type?.name ?? 'Unbekannte Messgröße',
        unit: type?.unit ?? '',
        side: entry.coordinates.side,
        exerciseName:
          entry.coordinates.exerciseId === null
            ? null
            : (exerciseNames.get(entry.coordinates.exerciseId) ?? null),
        passIndex: entry.coordinates.passIndex,
        context: contextOf(entry.coordinates.context),
        source: entry.source,
        current: entry.current,
        previous: entry.previous,
        difference: entry.difference,
        highest: entry.highest,
        lowest: entry.lowest,
        best: entry.best,
        count: entry.count,
      };
    }),
  };
}

/**
 * A stored numeric value as a number, or `null` when there is none.
 *
 * The `null` check is load-bearing: a text or boolean reading has no
 * `numericValue`, and running the empty string through `Number()` yields 0 —
 * which would put a difference of ±0 on two movement-quality notes.
 */
function numberOf(value: unknown): number | null {
  if (value === null || value === undefined) return null;

  const parsed = Number((value as { toString: () => string }).toString());

  return Number.isFinite(parsed) ? parsed : null;
}

/**
 * One point of a curve: a stage of one test.
 *
 * `loads` carries every **other** numeric quantity this test recorded at the
 * same stage. That is where a load axis comes from: the load of a stage is
 * itself a measurement of that stage — a lactate stage "holds one Lactate, one
 * Heart Rate, one RPE and one Pace".
 *
 * Which of them counts as the load **is** recorded, in the configuration's
 * `loadMeasurementTypeId`. Every other quantity is still offered, because a
 * coach may want to read the curve against a different axis than the protocol
 * declared, and because older configurations declare none.
 */
export interface ChartPoint {
  readonly passIndex: number | null;
  readonly y: number;
  readonly loads: Record<string, number>;
}

/** One curve: the stages of one test, in stage order. */
export interface ChartSeries {
  readonly moduleId: string;
  readonly moduleName: string | null;
  readonly moduleStatus: string;
  readonly isCurrentModule: boolean;
  readonly points: readonly ChartPoint[];
}

/** One diagram: one quantity, at one set of coordinates, across tests. */
export interface ChartGroup {
  readonly key: string;
  readonly typeName: string;
  readonly unit: string;
  readonly side: string;
  readonly exerciseName: string | null;
  readonly context: Record<string, string>;
  /** The quantities that could serve as an x axis, as recorded by these tests. */
  readonly loadCandidates: readonly { id: string; name: string; unit: string }[];
  /**
   * The one the protocol names as the demand, when it names one.
   *
   * The diagram starts on it instead of on the stage number. `null` where the
   * test declares none, or where it declares one that not every point carries —
   * half a curve on a load axis is not a comparison.
   */
  readonly defaultLoadId: string | null;
  readonly series: readonly ChartSeries[];
}

/**
 * The stages of a test as curves, and the same test type over time beside them.
 *
 * ## The x axis is not the stage number
 *
 * Stage 3 of one test and stage 3 of another are the same *position*, not the
 * same demand: a coach who moved the protocol from 10 km/h to 11 km/h has not
 * made the athlete faster. So the stage number is offered only as a fallback,
 * labelled as a sequence, and a real load quantity is preferred wherever the
 * test recorded one.
 *
 * **The model does not mark which quantity is the load.** There is no field for
 * it, no category and no flag — see `ChartPoint.loads`. Inventing one would be
 * inventing domain logic, so every other numeric quantity of the test is
 * offered and the coach picks. Nothing is assumed.
 *
 * ## What is never done
 *
 * Two tests are never merged into an average curve, and no curve is drawn
 * through points of different tests. Each test is its own series (§11), named,
 * with the one being looked at marked.
 *
 * ## Which quantity gets its own diagram
 *
 * Grouped by measurement type, side, exercise and dimension values — the same
 * coordinates the table uses, minus the stage, because the stages are what the
 * curve is made of. Two units never share an axis.
 *
 * Only groups where some test recorded at least two stages: a single point is
 * not a curve, and the table above already states it.
 */
export async function measurementChart(
  db: MeasurementDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  moduleId: string,
): Promise<ChartGroup[] | null> {
  const loaded = await comparableMeasurements(db, tenant, moduleId);
  if (loaded === null) return null;

  const { current, rows, exerciseNames } = loaded;

  /** Every value of one test at one stage, so the other quantities are reachable. */
  const atStage = new Map<string, Map<string, number>>();
  for (const row of rows) {
    const at = stageKey(row);
    const value = numberOf(row.numericValue);
    if (value === null) continue;

    const found = atStage.get(at);
    if (found) found.set(row.measurementTypeId, value);
    else atStage.set(at, new Map([[row.measurementTypeId, value]]));
  }

  const groups = new Map<string, (typeof rows)[number][]>();
  for (const row of rows) {
    const key = seriesKey(row);
    const found = groups.get(key);
    if (found) found.push(row);
    else groups.set(key, [row]);
  }

  const charts: ChartGroup[] = [];

  for (const [key, points] of groups) {
    const seed = points[0]!;
    if (seed.measurementType.valueType !== 'NUMERIC') continue;

    const byModule = new Map<string, (typeof points)[number][]>();
    for (const row of points) {
      const found = byModule.get(row.assessmentModule.id);
      if (found) found.push(row);
      else byModule.set(row.assessmentModule.id, [row]);
    }

    const series: ChartSeries[] = [];
    const candidates = new Map<string, { id: string; name: string; unit: string }>();

    for (const [id, rowsOfModule] of byModule) {
      const ordered = [...rowsOfModule].sort(
        (a, b) =>
          (a.passIndex ?? 0) - (b.passIndex ?? 0) ||
          a.capturedAt.getTime() - b.capturedAt.getTime(),
      );

      const built: ChartPoint[] = [];
      for (const row of ordered) {
        const y = numberOf(row.numericValue);
        if (y === null) continue;

        const others = atStage.get(stageKey(row));
        const loads: Record<string, number> = {};
        for (const [typeId, value] of others ?? []) {
          if (typeId === row.measurementTypeId) continue;
          loads[typeId] = value;
        }

        built.push({ passIndex: row.passIndex, y, loads });
      }

      if (built.length === 0) continue;

      const first = ordered[0]!;
      series.push({
        moduleId: id,
        moduleName: first.assessmentModule.name,
        moduleStatus: first.assessmentModule.status,
        isCurrentModule: id === current.id,
        points: built,
      });
    }

    // A curve needs two points. One reading is a number, and the table says it.
    if (!series.some((entry) => entry.points.length > 1)) continue;

    // Offered only where *every* series can place its points on that axis —
    // half a curve on a load axis and half on nothing is not a comparison.
    for (const row of rows) {
      if (row.measurementTypeId === seed.measurementTypeId) continue;
      if (row.measurementType.valueType !== 'NUMERIC') continue;
      candidates.set(row.measurementTypeId, {
        id: row.measurementTypeId,
        name: row.measurementType.name,
        unit: row.measurementType.unit,
      });
    }

    const usable = [...candidates.values()].filter((candidate) =>
      series.every((entry) => entry.points.every((point) => candidate.id in point.loads)),
    );

    // The protocol's own answer, used only if every point can actually be
    // placed on it.
    const declared = readModuleConfiguration(
      seed.assessmentModule.payload,
      seed.assessmentModule.moduleVersion,
    )?.loadMeasurementTypeId;
    const defaultLoadId =
      declared !== undefined && usable.some((candidate) => candidate.id === declared)
        ? declared
        : null;

    charts.push({
      key,
      defaultLoadId,
      typeName: seed.measurementType.name,
      unit: seed.measurementType.unit,
      side: seed.side,
      exerciseName: seed.exerciseId === null ? null : (exerciseNames.get(seed.exerciseId) ?? null),
      /**
       * The axis values in the coach's words.
       *
       * A video-analysis test stores the profile's own keys — `hip`, `flexed` —
       * because those are stable and translatable. Drawn straight onto a chart
       * they read as "Gelenkwinkel · Rechts · hip · gebeugt", half German and
       * half implementation. The same translation the readings already get.
       */
      context: readableAxes(
        contextOf(seed.context),
        readModuleConfiguration(seed.assessmentModule.payload, seed.assessmentModule.moduleVersion),
      ),
      loadCandidates: usable,
      series,
    });
  }

  return charts;
}

/**
 * Axis values translated back through the movement profile that wrote them.
 *
 * Anything the profile does not recognise is left exactly as it stands: a
 * coach's own axis value is already their language.
 */
function readableAxes(
  context: Record<string, string>,
  configuration: ModuleConfiguration | null,
): Record<string, string> {
  const profile = movementProfile(configuration?.movement?.profileKey);
  if (profile === null) return context;

  return Object.fromEntries(
    Object.entries(context).map(([axis, value]) => [
      axis,
      trackOf(profile, value)?.label ?? positionOf(profile, value)?.label ?? value,
    ]),
  );
}

/** One stage of one test, so the quantities recorded together are reachable. */
function stageKey(row: {
  assessmentModule: { id: string };
  side: string;
  exerciseId: string | null;
  passIndex: number | null;
  context: unknown;
}): string {
  return [
    row.assessmentModule.id,
    row.side,
    row.exerciseId ?? '',
    row.passIndex === null ? '' : String(row.passIndex),
    canonicalContext(row.context),
  ].join('|');
}
