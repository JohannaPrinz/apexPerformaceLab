import 'server-only';

import type { PrismaClientInstance } from '@apex/database';
import { scoped, withTenant } from '@apex/database/tenant';
import {
  canRemove,
  canTransition,
  configurationChangeViolations,
  findMeasurementTemplate,
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
export async function addModule(
  db: AssessmentDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  createdByCoachId: string,
  { assessmentId, moduleKey, templateKey, configuration }: AddModuleInput,
  resolveTemplateTypeIds: (keys: readonly string[]) => Promise<string[]>,
): Promise<AssessmentModuleRecord | null> {
  const assessment = await db.assessment.findFirst({
    where: scoped(tenant, { id: assessmentId }),
    select: { id: true },
  });

  if (!assessment) return null;

  const resolved =
    configuration ?? (await configurationFromTemplate(templateKey, resolveTemplateTypeIds));

  if (!resolved) return null;

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

  return {
    id: created.id,
    moduleKey: created.moduleKey,
    moduleVersion: created.moduleVersion,
    configuration: readConfiguration(created.payload, created.moduleVersion),
    status: created.status,
    createdByCoachId: created.createdByCoachId,
    createdAt: created.createdAt,
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
  db: AssessmentDb & Pick<PrismaClientInstance, 'measurement'>,
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
    select: { ...assessmentSelect, case: { select: { athleteId: true } } },
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
