import 'server-only';

import type { PrismaClientInstance } from '@apex/database';
import { scoped, withTenant } from '@apex/database/tenant';
import {
  evaluateReadiness,
  measurementTypeIdsOf,
  readModuleConfiguration,
  validateMeasurementContext,
  validatePassIndex,
  type ModuleConfiguration,
  type Readiness,
} from '@apex/domain';
import type { TenantContext } from '@apex/types';

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
export async function addModuleNote(
  db: Pick<PrismaClientInstance, 'assessmentModule' | 'note'>,
  tenant: Pick<TenantContext, 'organizationId'>,
  authorCoachId: string,
  moduleId: string,
  body: string,
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
    }),
    select: { id: true },
  });
}

export interface ModuleNoteRecord {
  id: string;
  body: string;
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
    select: { id: true, body: true, authorCoachId: true, createdAt: true },
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
  moduleVersion: number;
  status: string;
  createdByCoachId: string;
  configuration: ModuleConfiguration | null;
  /** Type id → what a coach needs to see and validate against. */
  types: Record<string, { name: string; unit: string; valueType: string }>;
  /** Exercise id → display name, for the movements this test covers. */
  exercises: Record<string, string>;
  measurements: MeasurementRecord[];
  /** Superseded values, for the correction history. */
  superseded: MeasurementRecord[];
  notes: ModuleNoteRecord[];
  readiness: Readiness;
  assessment: { id: string; question: string; athleteId: string };
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
      moduleVersion: true,
      status: true,
      payload: true,
      createdByCoachId: true,
      assessment: {
        select: { id: true, question: true, case: { select: { athleteId: true } } },
      },
    },
  });

  if (!row) return null;

  const configuration = readModuleConfiguration(row.payload, row.moduleVersion);

  const [all, notes] = await Promise.all([
    db.measurement.findMany({
      where: scoped(tenant, { assessmentModuleId: moduleId }),
      select: { ...measurementSelect },
      orderBy: [{ passIndex: 'asc' }, { capturedAt: 'asc' }, { id: 'asc' }],
    }),
    listModuleNotes(db, tenant, moduleId),
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
          select: { id: true, name: true },
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
        select: { id: true, name: true, unit: true, valueType: true },
      })
    : [];

  return {
    moduleId: row.id,
    moduleKey: row.moduleKey,
    moduleVersion: row.moduleVersion,
    status: row.status,
    createdByCoachId: row.createdByCoachId,
    configuration,
    types: Object.fromEntries(
      types.map((type) => [
        type.id,
        { name: type.name, unit: type.unit, valueType: type.valueType },
      ]),
    ),
    exercises: Object.fromEntries(exercises.map((exercise) => [exercise.id, exercise.name])),
    measurements: all.filter((measurement) => measurement.supersededById === null),
    superseded: all.filter((measurement) => measurement.supersededById !== null),
    notes,
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
