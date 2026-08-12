import 'server-only';

import type { PrismaClientInstance } from '@apex/database';
import { scoped, withTenant } from '@apex/database/tenant';
import {
  canRemove,
  canTransition,
  configurationChangeViolations,
  findMeasurementTemplate,
  measurementTypeIdsOf,
  MODULE_CONFIGURATION_VERSION,
  moduleConfigurationSchema,
  readModuleConfiguration,
  templateMeasurementKeys,
  type AssessmentModuleStatus,
  type ConfigurationChangeViolation,
  type ModuleConfiguration,
  type ModuleKey,
  type RecordedFacts,
} from '@apex/domain';
import type { TenantContext } from '@apex/types';

import { ensureOpenCase } from '@/services/case-provisioning';

import type { AddModuleInput, CopyAssessmentInput, CreateAssessmentInput } from '../schemas';

/**
 * Assessment and module data access.
 *
 * The chain this slice completes:
 *
 *   Assessment → Module (a test) → configured measurement types → passes
 *
 * A module's configuration lives in `AssessmentModule.payload` and is validated
 * against `moduleConfigurationSchema` for its `moduleVersion`. The version is
 * stored on the row, not only in the registry, so a published Report stays
 * re-renderable against the shape it was written with (§16).
 */

type AssessmentDb = Pick<
  PrismaClientInstance,
  'assessment' | 'assessmentModule' | 'performanceCase' | 'athlete'
>;

/** The catalogues the builder offers and validates a submitted configuration against. */
type CatalogueDb = Pick<PrismaClientInstance, 'measurementType' | 'exercise'>;

const moduleSelect = {
  id: true,
  moduleKey: true,
  moduleVersion: true,
  payload: true,
  status: true,
  createdByCoachId: true,
  createdAt: true,
} as const;

const assessmentSelect = {
  id: true,
  question: true,
  type: true,
  performedAt: true,
  createdAt: true,
  caseId: true,
  // The athlete is reached through the Case and never stored twice (§26.4).
  // Selected here so a screen can offer this athlete's other assessments — for
  // instance as the target of a copied test.
  case: { select: { athleteId: true } },
  modules: { select: moduleSelect, orderBy: { createdAt: 'asc' } },
} as const;

export interface AssessmentModuleRecord {
  id: string;
  moduleKey: string;
  moduleVersion: number;
  /** The stored configuration, or null on a module created before one existed. */
  configuration: ModuleConfiguration | null;
  status: AssessmentModuleStatus;
  /** Recorded, not yet enforced — see the schema comment and §26.24. */
  createdByCoachId: string;
  createdAt: Date;
}

export interface AssessmentRecord {
  id: string;
  question: string;
  type: 'INITIAL' | 'RE_ASSESSMENT' | 'FOLLOW_UP';
  performedAt: Date;
  createdAt: Date;
  caseId: string;
  /** Derived through the Case, never a second column on the Assessment. */
  athleteId: string;
  modules: AssessmentModuleRecord[];
}

/**
 * Parses a stored payload back into a configuration.
 *
 * Delegates to `@apex/domain`, which dispatches on the recorded `moduleVersion`
 * and upgrades a version 1 payload — a flat list of type ids — into the current
 * shape with every quantity `required`. That is what version 1 already meant,
 * so no verdict changes.
 *
 * Returns `null` rather than throwing on a payload that matches no known shape.
 * A module written under an older form must still be *readable* — the
 * alternative is that one malformed row makes an athlete's whole history
 * unopenable.
 */
function readConfiguration(payload: unknown, moduleVersion?: number): ModuleConfiguration | null {
  return readModuleConfiguration(payload, moduleVersion);
}

function toRecord(row: {
  id: string;
  question: string;
  type: string;
  performedAt: Date;
  createdAt: Date;
  caseId: string;
  case: { athleteId: string };
  modules: {
    id: string;
    moduleKey: string;
    moduleVersion: number;
    payload: unknown;
    status: string;
    createdByCoachId: string;
    createdAt: Date;
  }[];
}): AssessmentRecord {
  return {
    ...row,
    type: row.type as AssessmentRecord['type'],
    athleteId: row.case.athleteId,
    modules: row.modules.map((entry) => ({
      id: entry.id,
      moduleKey: entry.moduleKey,
      moduleVersion: entry.moduleVersion,
      configuration: readConfiguration(entry.payload, entry.moduleVersion),
      status: entry.status as AssessmentModuleStatus,
      createdByCoachId: entry.createdByCoachId,
      createdAt: entry.createdAt,
    })),
  };
}

/** The assessments of one athlete, newest first, reached through their cases. */
export async function listAssessmentsForAthlete(
  db: AssessmentDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  athleteId: string,
): Promise<AssessmentRecord[]> {
  const rows = await db.assessment.findMany({
    // The athlete is reached through the Case and never stored twice
    // (§26.4) — this is that relation expressed as a filter.
    where: scoped(tenant, { case: { athleteId } }),
    select: assessmentSelect,
    orderBy: [{ performedAt: 'desc' }, { id: 'desc' }],
  });

  return rows.map(toRecord);
}

export async function getAssessment(
  db: AssessmentDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  assessmentId: string,
): Promise<AssessmentRecord | null> {
  const row = await db.assessment.findFirst({
    where: scoped(tenant, { id: assessmentId }),
    select: assessmentSelect,
  });

  return row ? toRecord(row) : null;
}

/**
 * Creates an assessment for an athlete.
 *
 * The Case is found or created automatically (§8) — the coach never picks one.
 * Returns `null` when the athlete is not in this workspace, which
 * `ensureOpenCase` establishes before anything is written.
 */
export async function createAssessment(
  db: AssessmentDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  createdByCoachId: string,
  { athleteId, question, type, performedAt }: CreateAssessmentInput,
): Promise<AssessmentRecord | null> {
  const performanceCase = await ensureOpenCase(db, tenant, createdByCoachId, athleteId, question);

  if (!performanceCase) return null;

  const created = await db.assessment.create({
    data: withTenant(tenant, {
      caseId: performanceCase.id,
      question,
      type,
      performedAt: performedAt ? new Date(performedAt) : new Date(),
    }),
    select: assessmentSelect,
  });

  return toRecord(created);
}

/**
 * Adds a module — one test — to an assessment.
 *
 * A template is a starting point and nothing more: its configuration is copied
 * in and then belongs to this module. No reference to the template is stored,
 * so editing a template never changes a test that has already been performed.
 *
 * Returns `null` when the assessment is not in this workspace.
 */
export type ModuleCreation =
  | { ok: true; module: AssessmentModuleRecord }
  // Each reason is its own member so a caller that handles one can narrow to
  // the rest — a shared `reason: 'A' | 'B'` member would keep the whole variant
  // alive after both are checked.
  | { ok: false; reason: 'ASSESSMENT_NOT_FOUND' }
  | { ok: false; reason: 'NO_CONFIGURATION' }
  | { ok: false; reason: 'UNAVAILABLE_REFERENCES'; unavailable: UnavailableReferences };

export async function addModule(
  db: AssessmentDb & CatalogueDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  createdByCoachId: string,
  { assessmentId, moduleKey, templateKey, configuration }: AddModuleInput,
  resolveTemplateTypeIds: (keys: readonly string[]) => Promise<string[]>,
): Promise<ModuleCreation> {
  const assessment = await db.assessment.findFirst({
    where: scoped(tenant, { id: assessmentId }),
    select: { id: true },
  });

  if (!assessment) return { ok: false, reason: 'ASSESSMENT_NOT_FOUND' };

  const resolved =
    configuration ?? (await configurationFromTemplate(templateKey, resolveTemplateTypeIds));

  if (!resolved) return { ok: false, reason: 'NO_CONFIGURATION' };

  // A configuration assembled in the browser names ids. They are verified here
  // against this workspace's catalogues — a type or exercise belonging to
  // another tenant must not become part of a test, and the client is not the
  // place that decides it (docs/SECURITY.md §4).
  const unavailable = await unavailableReferences(db, tenant, resolved);
  if (unavailable) return { ok: false, reason: 'UNAVAILABLE_REFERENCES', unavailable };

  const created = await db.assessmentModule.create({
    data: withTenant(tenant, {
      assessmentId,
      moduleKey,
      moduleVersion: MODULE_CONFIGURATION_VERSION,
      payload: resolved,
      createdByCoachId,
    }),
    select: moduleSelect,
  });

  return { ok: true, module: toModuleRecord(created) };
}

function toModuleRecord(row: {
  id: string;
  moduleKey: string;
  moduleVersion: number;
  payload: unknown;
  status: string;
  createdByCoachId: string;
  createdAt: Date;
}): AssessmentModuleRecord {
  return {
    id: row.id,
    moduleKey: row.moduleKey,
    moduleVersion: row.moduleVersion,
    configuration: readConfiguration(row.payload, row.moduleVersion),
    status: row.status as AssessmentModuleStatus,
    createdByCoachId: row.createdByCoachId,
    createdAt: row.createdAt,
  };
}

/**
 * Turns a template into a configuration.
 *
 * Templates name measurement types by **key**; the configuration stores **ids**.
 * A workspace may define its own type under a key a system type already uses,
 * so a key alone does not identify a type — the resolution happens here, once.
 */
async function configurationFromTemplate(
  templateKey: string | undefined,
  resolveTemplateTypeIds: (keys: readonly string[]) => Promise<string[]>,
): Promise<ModuleConfiguration | null> {
  if (!templateKey) return null;

  const template = findMeasurementTemplate(templateKey);
  if (!template) return null;

  const keys = templateMeasurementKeys(template);
  const measurementTypeIds = await resolveTemplateTypeIds(keys);
  if (measurementTypeIds.length === 0) return null;

  // The template's roles travel with it. Resolution is positional, so a key the
  // catalogue does not hold would silently shift every role after it — the
  // length check below refuses that outright rather than storing a
  // configuration whose roles belong to different quantities.
  if (measurementTypeIds.length !== keys.length) return null;

  return moduleConfigurationSchema.parse({
    measurementTypes: measurementTypeIds.map((measurementTypeId, index) => ({
      measurementTypeId,
      role: template.measurements[index]?.role ?? 'required',
    })),
    // A template proposes what is measured, never which movement — that is
    // chosen per assessment.
    exerciseIds: [],
    passes: template.passes,
    recordsSide: template.recordsSide,
    dimensions: template.dimensions,
  });
}

export type ConfigurationUpdate =
  | { ok: true }
  | { ok: false; reason: 'NOT_FOUND' }
  | { ok: false; reason: 'UNREADABLE' }
  | { ok: false; reason: 'UNAVAILABLE_REFERENCES'; unavailable: UnavailableReferences }
  | {
      ok: false;
      reason: 'WOULD_ALTER_RECORDED_VALUES';
      violations: readonly ConfigurationChangeViolation[];
    };

/**
 * Replaces a module's configuration.
 *
 * Free while the test holds nothing — quantities added or removed, roles
 * changed, passes and sides adjusted, dimensions configured, order rearranged.
 * Once values exist, a change that would misdescribe them is **refused**, and
 * the refusal names every obstacle rather than the first.
 *
 * The check runs against what was actually recorded, not against the status.
 * Recording a value does not itself move a module out of `PLANNED`, so a
 * status-based lock would leave exactly that gap; and there is no transition
 * back to `PLANNED`, so it would also trap a coach who started a test and
 * immediately noticed a wrong setting with no data at risk. See
 * `configuration-change.ts` for the full reasoning.
 *
 * **Superseded values count.** A corrected reading is still part of the record
 * (§13), and a configuration change that made it unreadable would destroy
 * history just as thoroughly as one that hit the current value.
 */
export async function updateModuleConfiguration(
  db: AssessmentDb & CatalogueDb & Pick<PrismaClientInstance, 'measurement'>,
  tenant: Pick<TenantContext, 'organizationId'>,
  moduleId: string,
  configuration: ModuleConfiguration,
): Promise<ConfigurationUpdate> {
  const current = await db.assessmentModule.findFirst({
    where: scoped(tenant, { id: moduleId }),
    select: { id: true, payload: true, moduleVersion: true },
  });

  if (!current) return { ok: false, reason: 'NOT_FOUND' };

  const existing = readConfiguration(current.payload, current.moduleVersion);
  if (!existing) return { ok: false, reason: 'UNREADABLE' };

  // Ids arrive from the browser and are verified here, exactly as on creation.
  // Types and exercises the test **already** names stay permitted even if they
  // were archived meanwhile — otherwise archiving one would freeze every test
  // that uses it, which is the opposite of what archiving is for.
  const unavailable = await unavailableReferences(db, tenant, configuration, [
    ...measurementTypeIdsOf(existing),
    ...existing.exerciseIds,
  ]);

  if (unavailable) return { ok: false, reason: 'UNAVAILABLE_REFERENCES', unavailable };

  const recorded = await db.measurement.findMany({
    where: scoped(tenant, { assessmentModuleId: moduleId }),
    select: {
      measurementTypeId: true,
      exerciseId: true,
      passIndex: true,
      side: true,
      context: true,
    },
  });

  const facts: RecordedFacts = {
    measurementTypeIds: recorded.map((measurement) => measurement.measurementTypeId),
    exerciseIds: recorded
      .map((measurement) => measurement.exerciseId)
      .filter((exerciseId): exerciseId is string => exerciseId !== null),
    passIndexes: recorded
      .map((measurement) => measurement.passIndex)
      .filter((passIndex): passIndex is number => passIndex !== null),
    sides: recorded.map((measurement) => measurement.side),
    // `context` is Prisma's `JsonValue`, so the narrowing happens here rather
    // than at the type boundary: the column is validated on write against the
    // module's declared dimensions, and anything that is not an object could
    // only have arrived outside the service.
    contexts: recorded.flatMap((measurement) => {
      const context: unknown = measurement.context;

      return context !== null && typeof context === 'object' && !Array.isArray(context)
        ? [{ ...(context as Record<string, string>) }]
        : [];
    }),
  };

  const violations = configurationChangeViolations(existing, configuration, facts);
  if (violations.length > 0) {
    return { ok: false, reason: 'WOULD_ALTER_RECORDED_VALUES', violations };
  }

  await db.assessmentModule.updateMany({
    where: scoped(tenant, { id: moduleId }),
    data: { payload: configuration, moduleVersion: MODULE_CONFIGURATION_VERSION },
  });

  return { ok: true };
}

/**
 * Moves a test through its lifecycle.
 *
 * Only the transitions `@apex/domain` declares legal are performed. A refused
 * one is reported rather than silently ignored — a coach who presses "complete"
 * on a skipped test deserves to know why nothing happened.
 *
 * **The status never creates or removes a Measurement.** Skipping and aborting
 * are statements about the test, not about its values: what was recorded stays,
 * and what was never taken has no row (requirement 7).
 */
export type StatusChange =
  | { ok: true; status: AssessmentModuleStatus }
  | { ok: false; reason: 'NOT_FOUND' | 'ILLEGAL_TRANSITION'; from?: AssessmentModuleStatus };

export async function setModuleStatus(
  db: AssessmentDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  moduleId: string,
  status: AssessmentModuleStatus,
): Promise<StatusChange> {
  const current = await db.assessmentModule.findFirst({
    where: scoped(tenant, { id: moduleId }),
    select: { id: true, status: true },
  });

  if (!current) return { ok: false, reason: 'NOT_FOUND' };

  const from = current.status;
  if (from === status) return { ok: true, status };
  if (!canTransition(from, status)) return { ok: false, reason: 'ILLEGAL_TRANSITION', from };

  await db.assessmentModule.updateMany({
    where: scoped(tenant, { id: moduleId }),
    data: { status },
  });

  return { ok: true, status };
}

/**
 * Removes a test from an assessment.
 *
 * Allowed only for one that was never started and holds nothing — there is no
 * history to preserve. A started test is `ABORTED` instead, and a skipped one
 * stays: "we decided not to run this" is a statement about the examination, and
 * losing it would make the assessment look like the test was never considered.
 */
export type RemovalResult =
  | { ok: true }
  | { ok: false; reason: 'NOT_FOUND' | 'HAS_HISTORY'; status?: AssessmentModuleStatus };

export async function removeModule(
  db: AssessmentDb & Pick<PrismaClientInstance, 'measurement'>,
  tenant: Pick<TenantContext, 'organizationId'>,
  moduleId: string,
): Promise<RemovalResult> {
  const current = await db.assessmentModule.findFirst({
    where: scoped(tenant, { id: moduleId }),
    select: { id: true, status: true },
  });

  if (!current) return { ok: false, reason: 'NOT_FOUND' };

  const measurementCount = await db.measurement.count({
    where: scoped(tenant, { assessmentModuleId: moduleId }),
  });

  const status = current.status;
  if (!canRemove(status, measurementCount)) {
    return { ok: false, reason: 'HAS_HISTORY', status };
  }

  await db.assessmentModule.deleteMany({ where: scoped(tenant, { id: moduleId }) });

  return { ok: true };
}

/**
 * Copies an assessment as a template.
 *
 * **Configuration only.** Question, type and every module's `moduleKey`,
 * `moduleVersion` and `payload` are carried over; **no Measurement is copied**.
 * The new assessment is an independent examination — copying the values would
 * fabricate a record of a test that was never performed, which §4 forbids more
 * plainly than any constraint could.
 *
 * That this is a shallow copy of one JSON column rather than a filtered deep
 * clone is the whole point of keeping the configuration out of the
 * measurements.
 */
export async function copyAssessment(
  db: AssessmentDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  createdByCoachId: string,
  { assessmentId, athleteId, question, performedAt }: CopyAssessmentInput,
): Promise<AssessmentRecord | null> {
  const source = await db.assessment.findFirst({
    where: scoped(tenant, { id: assessmentId }),
    select: assessmentSelect,
  });

  if (!source) return null;

  const targetAthleteId = athleteId ?? source.case.athleteId;
  const targetQuestion = question ?? source.question;

  const performanceCase = await ensureOpenCase(
    db,
    tenant,
    createdByCoachId,
    targetAthleteId,
    targetQuestion,
  );

  if (!performanceCase) return null;

  const created = await db.assessment.create({
    data: withTenant(tenant, {
      caseId: performanceCase.id,
      question: targetQuestion,
      // A copy is a fresh examination, so it starts as a re-assessment rather
      // than inheriting `INITIAL` from something performed months ago.
      type: 'RE_ASSESSMENT' as const,
      performedAt: performedAt ? new Date(performedAt) : new Date(),
      modules: {
        // The copy is a fresh examination: every test starts PLANNED, and the
        // coach making the copy is its author. Carrying the source's status
        // across would claim work that has not happened.
        create: source.modules.map((entry) => ({
          organizationId: tenant.organizationId,
          moduleKey: entry.moduleKey,
          moduleVersion: entry.moduleVersion,
          payload: entry.payload ?? undefined,
          createdByCoachId,
        })),
      },
    }),
    select: assessmentSelect,
  });

  return toRecord(created);
}

/** Modules of an assessment, for the configuration screens. */
export function moduleKeysOf(assessment: AssessmentRecord): ModuleKey[] {
  return assessment.modules.map((module) => module.moduleKey as ModuleKey);
}

/**
 * Resolves the measurement type ids in a configuration to display names.
 *
 * **Deliberately not `scoped()`.** System measurement types carry
 * `organizationId = null` (§12) and every workspace inherits them, so a strict
 * tenant filter would return nothing and every configured test would render as
 * "unknown measurement". The filter is `this workspace OR system-wide`, which
 * is the tenant rule for a catalogue rather than an absence of one.
 */
export async function measurementTypeNames(
  db: Pick<PrismaClientInstance, 'measurementType'>,
  organizationId: string,
  ids: readonly string[],
): Promise<Record<string, string>> {
  if (ids.length === 0) return {};

  const rows = await db.measurementType.findMany({
    where: {
      id: { in: [...ids] },
      OR: [{ organizationId }, { organizationId: null }],
    },
    select: { id: true, name: true, unit: true },
  });

  return Object.fromEntries(rows.map((row) => [row.id, `${row.name} (${row.unit})`]));
}

/**
 * Resolves the exercise ids in a configuration to display names.
 *
 * **Deliberately not `scoped()`,** for the same reason as `measurementTypeNames`
 * above: a system exercise carries `organizationId = null` and every workspace
 * inherits it, so a strict tenant filter would render every configured movement
 * as "unknown". The filter is `this workspace OR system-wide`.
 */
export async function exerciseNames(
  db: Pick<PrismaClientInstance, 'exercise'>,
  organizationId: string,
  ids: readonly string[],
): Promise<Record<string, string>> {
  if (ids.length === 0) return {};

  const rows = await db.exercise.findMany({
    where: {
      id: { in: [...ids] },
      OR: [{ organizationId }, { organizationId: null }],
    },
    select: { id: true, name: true },
  });

  return Object.fromEntries(rows.map((row) => [row.id, row.name]));
}

/**
 * The measurement types a workspace may configure a test with.
 *
 * **`this workspace OR system-wide`, not `scoped()`** — the catalogue rule §12
 * prescribes: a system type carries `organizationId = null` and every workspace
 * inherits it. A strict tenant filter would return an empty catalogue and the
 * builder would have nothing to offer.
 *
 * Archived types are excluded: they stay resolvable for tests that already
 * reference them, but a coach must not add one to a new test.
 *
 * A workspace type wins over the system type of the same key — the coach's own
 * definition is the more specific one, and the partial unique index permits the
 * pair to exist precisely so it can.
 */
export interface MeasurementTypeOption {
  id: string;
  key: string;
  name: string;
  unit: string;
  valueType: string;
  category: string;
  /** True when this workspace defined it; false for the system catalogue. */
  ownedByWorkspace: boolean;
}

export async function availableMeasurementTypes(
  db: Pick<PrismaClientInstance, 'measurementType'>,
  organizationId: string,
): Promise<MeasurementTypeOption[]> {
  const rows = await db.measurementType.findMany({
    where: {
      archivedAt: null,
      OR: [{ organizationId }, { organizationId: null }],
    },
    select: {
      id: true,
      key: true,
      name: true,
      unit: true,
      valueType: true,
      category: true,
      organizationId: true,
    },
    orderBy: [{ category: 'asc' }, { name: 'asc' }],
  });

  const byKey = new Map<string, (typeof rows)[number]>();
  for (const row of rows) {
    const existing = byKey.get(row.key);
    // The workspace's own definition wins over the system one.
    if (!existing || row.organizationId !== null) byKey.set(row.key, row);
  }

  return [...byKey.values()].map((row) => ({
    id: row.id,
    key: row.key,
    name: row.name,
    unit: row.unit,
    valueType: row.valueType,
    category: row.category,
    ownedByWorkspace: row.organizationId !== null,
  }));
}

export interface UnavailableReferences {
  readonly measurementTypeIds: readonly string[];
  readonly exerciseIds: readonly string[];
}

/**
 * Checks that every id a configuration names is available to this workspace.
 *
 * Returns `null` when everything resolves. The check exists because a
 * configuration is assembled in the browser and arrives as ids: without it, a
 * request could hang another tenant's measurement type or exercise off a test —
 * the module row itself would be correctly scoped and the leak would be the
 * *reference*, which no column constraint catches. Same shape of hole the cases
 * service closes for its athlete.
 *
 * Archived rows count as unavailable for a new configuration, and as available
 * for one that already names them — which is why the caller passes the
 * configuration being written, not the one being replaced.
 */
export async function unavailableReferences(
  db: CatalogueDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  configuration: ModuleConfiguration,
  allowArchived: readonly string[] = [],
): Promise<UnavailableReferences | null> {
  const wantedTypes = [...new Set(measurementTypeIdsOf(configuration))];
  const wantedExercises = [...new Set(configuration.exerciseIds)];

  const [types, exercises] = await Promise.all([
    wantedTypes.length === 0
      ? Promise.resolve([])
      : db.measurementType.findMany({
          where: {
            id: { in: wantedTypes },
            OR: [{ organizationId: tenant.organizationId }, { organizationId: null }],
          },
          select: { id: true, archivedAt: true },
        }),
    wantedExercises.length === 0
      ? Promise.resolve([])
      : db.exercise.findMany({
          where: {
            id: { in: wantedExercises },
            OR: [{ organizationId: tenant.organizationId }, { organizationId: null }],
          },
          select: { id: true, archivedAt: true },
        }),
  ]);

  const usable = (rows: { id: string; archivedAt: Date | null }[], id: string): boolean => {
    const row = rows.find((entry) => entry.id === id);

    return Boolean(row) && (row?.archivedAt === null || allowArchived.includes(id));
  };

  const measurementTypeIds = wantedTypes.filter((id) => !usable(types, id));
  const exerciseIds = wantedExercises.filter((id) => !usable(exercises, id));

  return measurementTypeIds.length > 0 || exerciseIds.length > 0
    ? { measurementTypeIds, exerciseIds }
    : null;
}

/**
 * Copies one test inside its assessment.
 *
 * **Configuration only.** `moduleKey`, `moduleVersion` and `payload` are carried
 * across; no Measurement is. The copy starts `PLANNED` and belongs to the coach
 * making it — carrying the source's status or author would claim work that has
 * not happened.
 *
 * That this is a copy of one JSON column rather than a filtered deep clone is
 * the whole point of keeping the configuration out of the measurements.
 *
 * A copy into the **same** assessment collides with `@@unique([assessmentId,
 * moduleKey])`, which is deliberate: an assessment holds each module once. The
 * copy therefore targets another assessment in the same workspace, and the
 * caller says which.
 */
export type ModuleCopy =
  | { ok: true; module: AssessmentModuleRecord }
  | { ok: false; reason: 'NOT_FOUND' | 'TARGET_NOT_FOUND' | 'ALREADY_PRESENT' };

export async function copyModule(
  db: AssessmentDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  createdByCoachId: string,
  moduleId: string,
  targetAssessmentId?: string,
): Promise<ModuleCopy> {
  const source = await db.assessmentModule.findFirst({
    where: scoped(tenant, { id: moduleId }),
    select: { ...moduleSelect, assessmentId: true },
  });

  if (!source) return { ok: false, reason: 'NOT_FOUND' };

  const assessmentId = targetAssessmentId ?? source.assessmentId;

  const target = await db.assessment.findFirst({
    where: scoped(tenant, { id: assessmentId }),
    select: { id: true },
  });

  if (!target) return { ok: false, reason: 'TARGET_NOT_FOUND' };

  const clash = await db.assessmentModule.findFirst({
    where: scoped(tenant, { assessmentId, moduleKey: source.moduleKey }),
    select: { id: true },
  });

  // Reported rather than left to the unique constraint, so the coach reads a
  // sentence instead of a database error.
  if (clash) return { ok: false, reason: 'ALREADY_PRESENT' };

  const created = await db.assessmentModule.create({
    data: withTenant(tenant, {
      assessmentId,
      moduleKey: source.moduleKey,
      moduleVersion: source.moduleVersion,
      payload: source.payload ?? undefined,
      createdByCoachId,
    }),
    select: moduleSelect,
  });

  return { ok: true, module: toModuleRecord(created) };
}
