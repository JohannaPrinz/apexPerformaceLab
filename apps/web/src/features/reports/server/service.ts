import 'server-only';

import type { PrismaClientInstance } from '@apex/database';
import { scoped, withTenant } from '@apex/database/tenant';
import {
  combineReadiness,
  contextOf,
  draftSectionOf,
  emptyReportDraft,
  evaluateReadiness,
  protocolKey,
  readModuleConfiguration,
  REPORT_SNAPSHOT_VERSION,
  readReportDraft,
  selfComparisons,
  withDraftText,
  type ComparableReading,
  type DraftField,
  type DraftTarget,
  type ModuleConfiguration,
  type Readiness,
  type ReadinessLevel,
  type ReportSnapshot,
} from '@apex/domain';
import type { TenantContext } from '@apex/types';

import type { CreateReportInput } from '../schemas';

/**
 * Analyses.
 *
 * An analysis is a `Report` — §16's one object with a scope, not a second
 * conclusion-object beside it. What this slice adds is `ReportModule`: which
 * tests the analysis draws on, and which the coach set aside.
 *
 * **The inclusion decision belongs to the analysis, never to the test.** It is
 * a row keyed by `(reportId, assessmentModuleId)`, so excluding a test from one
 * analysis leaves it untouched in every other — structurally, not by a rule
 * somebody has to remember. The module's own `status` is never written here.
 */

/**
 * How a caliper method is named in the summary.
 *
 * Here rather than in the German label file because a summary sentence is
 * server-rendered text, and the mapping is small, closed and checked against
 * the domain vocabulary by the test beside it.
 */
const BODY_FAT_METHOD_LABELS: Readonly<Record<string, string>> = {
  jackson_pollock_3: 'Jackson & Pollock, 3 Punkte',
  jackson_pollock_7: 'Jackson & Pollock, 7 Punkte',
};

/** How a test type is named. Passed in, so this module holds no vocabulary. */
export interface ModuleLabels {
  readonly module: (moduleKey: string) => string;
}

type ReportDb = Pick<
  PrismaClientInstance,
  'report' | 'reportModule' | 'assessment' | 'assessmentModule' | 'measurement' | 'exercise'
>;

const reportSelect = {
  id: true,
  title: true,
  scope: true,
  status: true,
  version: true,
  publishedAt: true,
  createdAt: true,
  assessmentId: true,
  authorCoachId: true,
} as const;

export interface ReportRecord {
  id: string;
  title: string;
  scope: 'MODULE' | 'ASSESSMENT' | 'CASE';
  status: 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
  version: number;
  publishedAt: Date | null;
  createdAt: Date;
  assessmentId: string | null;
  authorCoachId: string;
}

/**
 * Creates a draft analysis over an assessment.
 *
 * Every **working** test of the assessment starts included: an analysis of an
 * examination naturally covers what was examined, and the coach sets aside what
 * does not belong. Writing the rows explicitly rather than relying on their
 * absence means "excluded" and "not yet decided" stay distinguishable.
 *
 * **An archived test is not included by default.** Archiving is the coach
 * saying a test has left the working view (§13: never the record), and an
 * analysis created afterwards that quietly drew on it again would undo that
 * decision without asking. No row is written for it at all, which leaves it as
 * "not yet decided" — the coach may still add it deliberately through
 * `setReportModuleInclusion`, and that is the point of the distinction.
 *
 * The version is the next free one for this assessment — a partial unique index
 * enforces one version per scope target, so this is the only place that has to
 * count.
 */
export async function createReport(
  db: ReportDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  authorCoachId: string,
  { assessmentId, title }: CreateReportInput,
): Promise<ReportRecord | null> {
  const assessment = await db.assessment.findFirst({
    where: scoped(tenant, { id: assessmentId }),
    select: {
      id: true,
      modules: {
        where: { archivedAt: null },
        select: { id: true },
        orderBy: [{ createdAt: 'asc' }],
      },
    },
  });

  if (!assessment) return null;

  /**
   * An open analysis is the answer to "create one".
   *
   * Idempotent on purpose: completing an assessment asks for an analysis every
   * time, and a coach who presses the button twice must not end up with two
   * drafts of the same examination. A *published* analysis does not stop a new
   * version — that is what versions are for.
   */
  const open = await db.report.findFirst({
    where: scoped(tenant, { assessmentId, status: 'DRAFT' as const }),
    orderBy: [{ version: 'desc' }],
    select: reportSelect,
  });

  if (open) return open;

  const latest = await db.report.findFirst({
    where: scoped(tenant, { assessmentId }),
    orderBy: { version: 'desc' },
    select: { version: true },
  });

  /**
   * Which tests the analysis starts on.
   *
   * **Only those that recorded something.** A test with no standing value has
   * nothing to analyse, and writing an inclusion row for it produced the state
   * this rule exists to end: the selection said "not included" while the
   * analysis text carried a paragraph for it anyway, because the two read
   * different things. One rule, one place.
   *
   * A skipped or aborted test with values is still included — what matters is
   * whether anything was recorded, not how far the coach got (§11).
   */
  const withValues = await db.measurement.groupBy({
    by: ['assessmentModuleId'],
    where: scoped(tenant, {
      assessmentModuleId: { in: assessment.modules.map((entry) => entry.id) },
      supersededById: null,
    }),
  });

  const recorded = new Set(withValues.map((entry) => entry.assessmentModuleId));

  return db.report.create({
    data: withTenant(tenant, {
      assessmentId,
      authorCoachId,
      title,
      scope: 'ASSESSMENT' as const,
      version: (latest?.version ?? 0) + 1,
      // Empty: the facts are rendered from the measurements whenever the
      // analysis is read, and everything else in here is the coach's own words.
      draft: emptyReportDraft(),
      modules: {
        create: assessment.modules
          .filter((entry) => recorded.has(entry.id))
          .map((entry) => ({
            organizationId: tenant.organizationId,
            assessmentModuleId: entry.id,
            included: true,
          })),
      },
    }),
    select: reportSelect,
  });
}

export async function listReportsForAssessment(
  db: ReportDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  assessmentId: string,
): Promise<ReportRecord[]> {
  return db.report.findMany({
    where: scoped(tenant, { assessmentId }),
    select: reportSelect,
    orderBy: [{ version: 'desc' }],
  });
}

/**
 * Includes or excludes one test for this analysis.
 *
 * Upserted, because the row may not exist for a test added after the analysis
 * was created. Nothing about the module is written — its status, its
 * measurements and every other analysis are untouched.
 */
export async function setReportModuleInclusion(
  db: ReportDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  reportId: string,
  moduleId: string,
  included: boolean,
): Promise<boolean> {
  const [report, assessmentModule] = await Promise.all([
    db.report.findFirst({ where: scoped(tenant, { id: reportId }), select: { id: true } }),
    db.assessmentModule.findFirst({
      where: scoped(tenant, { id: moduleId }),
      select: { id: true },
    }),
  ]);

  if (!report || !assessmentModule) return false;

  await db.reportModule.upsert({
    where: { reportId_assessmentModuleId: { reportId, assessmentModuleId: moduleId } },
    update: { included },
    create: withTenant(tenant, { reportId, assessmentModuleId: moduleId, included }),
  });

  return true;
}

export interface ReportReadiness {
  readonly level: ReadinessLevel;
  readonly modules: readonly {
    moduleId: string;
    moduleKey: string;
    included: boolean;
    status: string;
    readiness: Readiness;
  }[];
}

/**
 * Whether an analysis has the data it needs.
 *
 * Three inputs, exactly as required: the test's status, the measurements
 * present, and the coach's inclusion decision. They are combined in that order
 * of independence — **the status does not decide readiness**, it only says how
 * far the coach got; readiness is computed from what was recorded; and an
 * excluded test contributes nothing either way.
 *
 * Nothing is filled in. A gap is reported and named.
 */
export async function reportReadiness(
  db: ReportDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  reportId: string,
): Promise<ReportReadiness | null> {
  const report = await db.report.findFirst({
    where: scoped(tenant, { id: reportId }),
    select: {
      id: true,
      modules: {
        // An archived test is out of the working view, and an analysis must not
        // keep drawing on one behind the coach's back — not even where a row
        // still says `included` because the test was archived after the
        // analysis was created. Filtered in the query rather than afterwards,
        // so no caller can forget it.
        where: { assessmentModule: { archivedAt: null } },
        select: {
          included: true,
          assessmentModule: {
            select: { id: true, moduleKey: true, payload: true, moduleVersion: true, status: true },
          },
        },
      },
    },
  });

  if (!report) return null;

  const measurements = await db.measurement.findMany({
    where: scoped(tenant, {
      assessmentModuleId: { in: report.modules.map((entry) => entry.assessmentModule.id) },
    }),
    select: {
      assessmentModuleId: true,
      measurementTypeId: true,
      passIndex: true,
      supersededById: true,
    },
  });

  const modules = report.modules.map((entry) => {
    // Reads any stored version, so an analysis over a module configured before
    // roles existed still evaluates — and evaluates the way it always did.
    const configuration = readModuleConfiguration(
      entry.assessmentModule.payload,
      entry.assessmentModule.moduleVersion,
    );
    const own = measurements.filter(
      (measurement) => measurement.assessmentModuleId === entry.assessmentModule.id,
    );

    return {
      moduleId: entry.assessmentModule.id,
      moduleKey: entry.assessmentModule.moduleKey,
      included: entry.included,
      status: entry.assessmentModule.status,
      readiness: configuration
        ? evaluateReadiness(configuration, own)
        : {
            level: 'INSUFFICIENT' as const,
            missingTypeIds: [] as readonly string[],
            missingRecommendedTypeIds: [] as readonly string[],
            missingPasses: [] as readonly number[],
            expected: 0,
            recorded: 0,
          },
    };
  });

  return {
    level: combineReadiness(
      modules.filter((entry) => entry.included).map((entry) => entry.readiness),
    ),
    modules,
  };
}

/** One test as the analysis section reads it. */
export interface AnalysisModuleView {
  readonly moduleId: string;
  readonly name: string | null;
  readonly moduleKey: string;
  readonly status: string;
  readonly archived: boolean;
  /** Values that currently stand. The one honest answer to "has results". */
  readonly recorded: number;
  readonly expected: number;
  readonly level: ReadinessLevel;
  /**
   * Whether this test may be drawn on at all.
   *
   * A test nobody has recorded anything for cannot be analysed — there is
   * nothing to analyse. An archived one has left the working view. Neither is
   * hidden: the screen shows both with the reason, because a test that simply
   * vanished would leave the coach looking for it.
   */
  readonly selectable: boolean;
  /** Whether the current draft draws on it. False where there is no draft. */
  readonly included: boolean;
}

export interface AssessmentAnalysisOverview {
  /** The draft being worked on, or `null` while none has been created. */
  readonly draft: {
    readonly id: string;
    readonly title: string;
    readonly version: number;
    readonly createdAt: Date;
  } | null;
  readonly modules: readonly AnalysisModuleView[];
  /** How many tests the analysis would draw on as things stand. */
  readonly includedCount: number;
  /** Tests that are selectable but not yet included. */
  readonly availableCount: number;
  /** Tests nobody has recorded anything for yet. */
  readonly withoutResultsCount: number;
}

/**
 * What an analysis of this assessment could draw on, and what it already does.
 *
 * One read for the whole section, because the three questions it answers are
 * the same question asked three ways: which tests have results, which the
 * current draft includes, and whether an interim analysis is possible at all.
 * Asking them separately would let the screen show a selection that disagrees
 * with the readiness beside it.
 *
 * **Nothing here judges and nothing here writes.** It reports counts and
 * levels; whether an analysis is worth writing over a partly recorded
 * examination is the coach's call, which is exactly why the interim case is
 * offered rather than blocked.
 */
export async function assessmentAnalysisOverview(
  db: ReportDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  assessmentId: string,
): Promise<AssessmentAnalysisOverview | null> {
  const assessment = await db.assessment.findFirst({
    where: scoped(tenant, { id: assessmentId }),
    select: {
      id: true,
      modules: {
        select: {
          id: true,
          name: true,
          moduleKey: true,
          status: true,
          archivedAt: true,
          payload: true,
          moduleVersion: true,
        },
        orderBy: [{ createdAt: 'asc' }],
      },
    },
  });

  if (!assessment) return null;

  // The newest draft, not the newest report: a published analysis is finished
  // and its selection is part of the document (§16).
  const draft = await db.report.findFirst({
    where: scoped(tenant, { assessmentId, status: 'DRAFT' as const }),
    orderBy: [{ version: 'desc' }],
    select: {
      id: true,
      title: true,
      version: true,
      createdAt: true,
      modules: { select: { assessmentModuleId: true, included: true } },
    },
  });

  const inclusion = new Map(
    (draft?.modules ?? []).map((entry) => [entry.assessmentModuleId, entry.included]),
  );

  const measurements =
    assessment.modules.length === 0
      ? []
      : await db.measurement.findMany({
          where: scoped(tenant, {
            assessmentModuleId: { in: assessment.modules.map((entry) => entry.id) },
          }),
          select: {
            assessmentModuleId: true,
            measurementTypeId: true,
            passIndex: true,
            supersededById: true,
          },
        });

  const modules = assessment.modules.map((entry): AnalysisModuleView => {
    const configuration = readModuleConfiguration(entry.payload, entry.moduleVersion);
    const own = measurements.filter((measurement) => measurement.assessmentModuleId === entry.id);
    const readiness = configuration
      ? evaluateReadiness(configuration, own)
      : { level: 'INSUFFICIENT' as const, expected: 0, recorded: 0 };

    const archived = entry.archivedAt !== null;
    // Results, not readiness: a test may be INSUFFICIENT and still hold values
    // worth analysing, and a test with none holds nothing at all.
    const hasResults = readiness.recorded > 0;

    return {
      moduleId: entry.id,
      name: entry.name,
      moduleKey: entry.moduleKey,
      status: entry.status,
      archived,
      recorded: readiness.recorded,
      expected: readiness.expected,
      level: readiness.level,
      selectable: hasResults && !archived,
      // A test the draft says nothing about is not included — neither an
      // archived one, which `createReport` deliberately writes no row for, nor
      // one added after the draft was made.
      included: (inclusion.get(entry.id) ?? false) && hasResults && !archived,
    };
  });

  return {
    draft: draft
      ? { id: draft.id, title: draft.title, version: draft.version, createdAt: draft.createdAt }
      : null,
    modules,
    includedCount: modules.filter((entry) => entry.included).length,
    availableCount: modules.filter((entry) => entry.selectable && !entry.included).length,
    withoutResultsCount: modules.filter((entry) => entry.recorded === 0 && !entry.archived).length,
  };
}

/**
 * The factual summary of what this assessment's included tests recorded.
 *
 * The sentences themselves are built by `summariseAssessment` in the domain
 * package — pure, and tested there against what it must never say. This
 * function's only job is to hand it the numbers, and it hands over exactly what
 * stands: superseded readings are excluded, archived tests never reach it, and
 * a test the coach set aside contributes nothing.
 *
 * `null` where there is no draft: the summary describes a selection, and
 * without a draft there is no selection to describe.
 */
/**
 * The analysis of one assessment, as its own screen reads it.
 *
 * ## One read, and why not five
 *
 * A test's own screen asks `moduleSelfComparison` for its comparison. Doing that
 * once per included test would be one query per test plus one per history. This
 * loads every standing reading of every test type in the assessment **in one
 * query** and hands the domain the same function the test screen uses. Same
 * rule, same code, one round trip.
 *
 * The rule itself is not restated here. `selfComparisons` decides what belongs
 * in a series and what a comparison may say; this only supplies the readings.
 *
 * ## Why the facts are read and never stored
 *
 * They are rendered from the measurements at the moment of reading, so they are
 * always current and there is nothing to overwrite. What *is* stored is what
 * only a person can write — the interpretation and the recommendation — and
 * nothing in this file ever writes into those.
 */

/** One measured series of one test, with what came before it. */
export interface EvaluationSeries {
  readonly key: string;
  readonly typeName: string;
  readonly unit: string;
  readonly side: string;
  readonly exerciseName: string | null;
  readonly passIndex: number | null;
  readonly context: Record<string, string>;
  readonly source: string;
  readonly current: { value: number; capturedAt: Date };
  readonly previous: { value: number; capturedAt: Date } | null;
  readonly difference: number | null;
  readonly highest: { value: number; capturedAt: Date };
  readonly lowest: { value: number; capturedAt: Date };
  readonly best: { value: number; capturedAt: Date } | null;
  readonly count: number;
}

/** Why a test cannot be drawn on. Derivable reasons only — see below. */
export type EvaluationBlock = 'NO_VALUES' | 'ARCHIVED';

export interface EvaluationModule {
  readonly moduleId: string;
  readonly name: string;
  readonly typeLabel: string;
  readonly status: string;
  /**
   * Why this test is not selectable, or `null` where it is.
   *
   * Only reasons the record already knows. A coach's own reason for setting a
   * test aside — "the hall was at 34 °C" — has nowhere to live: `ReportModule`
   * carries a boolean and no text. That is named as a gap rather than faked with
   * a generic sentence.
   */
  readonly blocked: EvaluationBlock | null;
  readonly included: boolean;
  readonly recorded: number;
  readonly expected: number;
  /** Named where the test computes a value rather than asking for it. */
  readonly derivations: readonly string[];
  /** The conditions the test declared, so a comparison can be checked. */
  readonly protocolLabel: string | null;
  readonly series: readonly EvaluationSeries[];
  readonly interpretation: string;
  readonly recommendation: string;
}

export interface AssessmentEvaluation {
  readonly reportId: string;
  readonly version: number;
  readonly title: string;
  readonly assessment: {
    readonly id: string;
    readonly question: string;
    readonly status: string;
    readonly performedAt: Date;
  };
  readonly athlete: { readonly id: string; readonly firstName: string; readonly lastName: string };
  /** Who authored the analysis, for the document and for the message. */
  readonly coachName: string;
  /**
   * The one place the fill state is stated.
   *
   * Three numbers, once. The screen this replaced said it seven times in five
   * different denominators, which left a coach reconciling the page against
   * itself instead of reading it.
   */
  readonly summary: {
    readonly tests: number;
    readonly usable: number;
    readonly included: number;
    readonly values: number;
  };
  readonly modules: readonly EvaluationModule[];
  readonly overall: { readonly interpretation: string; readonly recommendation: string };
}

/**
 * Everything the analysis screen shows, in one read.
 *
 * `null` where the assessment does not exist in this workspace, or where no
 * analysis has been created for it yet — the screen then offers to create one
 * rather than inventing a report that was never asked for.
 */
/**
 * The first of these that actually says something.
 *
 * A blank display name counts as absent, which `??` would not do — it only
 * skips null and undefined, and a document signed with an empty string is worse
 * than one signed by a fallback.
 */
function firstNonEmpty(...values: readonly (string | null | undefined)[]): string {
  for (const value of values) {
    const trimmed = value?.trim() ?? '';
    if (trimmed !== '') return trimmed;
  }

  return '';
}

export async function assessmentEvaluation(
  db: ReportDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  assessmentId: string,
  labels: ModuleLabels,
): Promise<AssessmentEvaluation | null> {
  const assessment = await db.assessment.findFirst({
    where: scoped(tenant, { id: assessmentId }),
    select: {
      id: true,
      question: true,
      status: true,
      performedAt: true,
      case: {
        select: { athlete: { select: { id: true, firstName: true, lastName: true } } },
      },
      modules: {
        where: { archivedAt: null },
        select: {
          id: true,
          name: true,
          moduleKey: true,
          status: true,
          payload: true,
          moduleVersion: true,
        },
        orderBy: [{ createdAt: 'asc' }],
      },
    },
  });

  if (!assessment) return null;

  const report = await db.report.findFirst({
    where: scoped(tenant, { assessmentId, status: 'DRAFT' as const }),
    orderBy: [{ version: 'desc' }],
    select: {
      id: true,
      title: true,
      version: true,
      draft: true,
      authorCoach: { select: { displayName: true, user: { select: { name: true } } } },
      modules: { select: { assessmentModuleId: true, included: true } },
    },
  });

  if (!report) return null;

  const draft = readReportDraft(report.draft) ?? emptyReportDraft();
  const inclusion = new Map(
    report.modules.map((entry) => [entry.assessmentModuleId, entry.included]),
  );

  const athleteId = assessment.case.athlete.id;
  const moduleKeys = [...new Set(assessment.modules.map((entry) => entry.moduleKey))];

  /**
   * Every standing reading of every test type this assessment covers, for this
   * athlete — the assessment's own and everything earlier it may be compared
   * with. One query rather than one per test.
   */
  const readings =
    moduleKeys.length === 0
      ? []
      : await db.measurement.findMany({
          where: scoped(tenant, {
            supersededById: null,
            assessmentModule: {
              moduleKey: { in: moduleKeys },
              archivedAt: null,
              assessment: { case: { athleteId } },
            },
          }),
          select: {
            measurementTypeId: true,
            side: true,
            exerciseId: true,
            passIndex: true,
            context: true,
            numericValue: true,
            capturedAt: true,
            source: true,
            assessmentModule: {
              select: { id: true, moduleKey: true, payload: true, moduleVersion: true },
            },
            measurementType: { select: { name: true, unit: true } },
          },
          orderBy: [{ capturedAt: 'asc' }, { id: 'asc' }],
        });

  const exerciseIds = [...new Set(readings.map((row) => row.exerciseId))].filter(
    (id): id is string => id !== null,
  );
  const exercises =
    exerciseIds.length === 0
      ? []
      : await db.exercise.findMany({
          where: {
            id: { in: exerciseIds },
            OR: [{ organizationId: tenant.organizationId }, { organizationId: null }],
          },
          select: { id: true, name: true },
        });
  const exerciseNames = new Map(exercises.map((exercise) => [exercise.id, exercise.name]));

  /** Each involved test's protocol, read once from its own stored payload. */
  const configurations = new Map<string, ModuleConfiguration | null>();
  const protocolOf = (source: {
    id: string;
    payload: unknown;
    moduleVersion: number;
  }): ModuleConfiguration | null => {
    if (!configurations.has(source.id)) {
      configurations.set(source.id, readModuleConfiguration(source.payload, source.moduleVersion));
    }

    return configurations.get(source.id) ?? null;
  };

  const comparable: ComparableReading[] = [];
  for (const row of readings) {
    const value = row.numericValue === null ? null : Number(row.numericValue.toString());
    if (value === null || !Number.isFinite(value)) continue;

    comparable.push({
      measurementTypeId: row.measurementTypeId,
      side: row.side,
      exerciseId: row.exerciseId,
      passIndex: row.passIndex,
      context: row.context,
      value,
      capturedAt: row.capturedAt,
      moduleId: row.assessmentModule.id,
      protocolKey: protocolKey(protocolOf(row.assessmentModule)?.protocol ?? null),
      source: row.source,
    });
  }

  const named = new Map(
    readings.map((row) => [
      row.measurementTypeId,
      { name: row.measurementType.name, unit: row.measurementType.unit },
    ]),
  );

  const measurementsOf = (moduleId: string) =>
    readings.filter((row) => row.assessmentModule.id === moduleId);

  const modules = assessment.modules.map((entry): EvaluationModule => {
    const configuration = protocolOf(entry);
    const own = measurementsOf(entry.id);
    const readiness = configuration
      ? evaluateReadiness(
          configuration,
          own.map((row) => ({ ...row, supersededById: null })),
        )
      : { level: 'INSUFFICIENT' as const, expected: 0, recorded: 0 };

    const blocked: EvaluationBlock | null = own.length === 0 ? 'NO_VALUES' : null;
    const section = draftSectionOf(draft, entry.id);
    const name = (entry.name ?? '').trim();

    const comparisons =
      blocked !== null
        ? []
        : selfComparisons(comparable, entry.id, configuration?.protocol?.betterDirection ?? null);

    return {
      moduleId: entry.id,
      name: name === '' ? labels.module(entry.moduleKey) : name,
      typeLabel: labels.module(entry.moduleKey),
      status: entry.status,
      blocked,
      included: blocked === null && (inclusion.get(entry.id) ?? false),
      recorded: readiness.recorded,
      expected: readiness.expected,
      derivations: (configuration?.derivations ?? []).map(
        (derivation) => BODY_FAT_METHOD_LABELS[derivation.method] ?? derivation.method,
      ),
      protocolLabel: configuration?.protocol?.label ?? configuration?.protocol?.key ?? null,
      series: comparisons.map((comparison): EvaluationSeries => {
        const type = named.get(comparison.coordinates.measurementTypeId);

        return {
          key: comparison.key,
          typeName: type?.name ?? 'Unbekannte Messgröße',
          unit: type?.unit ?? '',
          side: comparison.coordinates.side,
          exerciseName:
            comparison.coordinates.exerciseId === null
              ? null
              : (exerciseNames.get(comparison.coordinates.exerciseId) ?? null),
          passIndex: comparison.coordinates.passIndex,
          context: contextOf(comparison.coordinates.context),
          source: comparison.source,
          current: comparison.current,
          previous: comparison.previous,
          difference: comparison.difference,
          highest: comparison.highest,
          lowest: comparison.lowest,
          best: comparison.best,
          count: comparison.count,
        };
      }),
      interpretation: section.interpretation,
      recommendation: section.recommendation,
    };
  });

  const usable = modules.filter((entry) => entry.blocked === null);

  return {
    reportId: report.id,
    version: report.version,
    title: report.title,
    assessment: {
      id: assessment.id,
      question: assessment.question,
      status: assessment.status,
      performedAt: assessment.performedAt,
    },
    athlete: assessment.case.athlete,
    // Optional in the record — a coach may never have filled in a display name,
    // and a document signed "null" would be worse than one signed by nobody.
    // An empty display name counts as absent, which is why this is a helper
    // and not `??` — the coalescing operator would keep the blank.
    coachName: firstNonEmpty(
      report.authorCoach.displayName,
      report.authorCoach.user?.name,
      'Ihr Coach',
    ),
    summary: {
      tests: modules.length,
      usable: usable.length,
      included: modules.filter((entry) => entry.included).length,
      values: modules.reduce((total, entry) => total + entry.recorded, 0),
    },
    modules,
    overall: draft.overall,
  };
}

/**
 * Freezes an analysis into a document.
 *
 * ## Why the facts are copied rather than referenced
 *
 * §2: Reports are snapshots. An athlete opening a link a week later must see
 * what the coach signed off — not what the record says today. A correction
 * entered afterwards would otherwise rewrite a document somebody has already
 * read, and a later change is meant to be a **new version**, which is what the
 * version column is for.
 *
 * ## What the document does not carry
 *
 * The assessment's question, which tests were set aside, and how full the
 * examination was. All three are the coach's working notes about their own
 * thoroughness, and the first regularly names an injury. The athlete gets the
 * results and what the coach wrote about them.
 *
 * Refuses an analysis with nothing in it: publishing an empty document would
 * produce a link that opens onto nothing.
 */
export async function publishReport(
  db: ReportDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  reportId: string,
  labels: ModuleLabels,
): Promise<{ ok: true } | { ok: false; reason: 'NOT_FOUND' | 'EMPTY' }> {
  const report = await db.report.findFirst({
    where: scoped(tenant, { id: reportId, status: 'DRAFT' as const }),
    select: { id: true, assessmentId: true },
  });

  if (!report?.assessmentId) return { ok: false, reason: 'NOT_FOUND' };

  const evaluation = await assessmentEvaluation(db, tenant, report.assessmentId, labels);
  if (!evaluation) return { ok: false, reason: 'NOT_FOUND' };

  const included = evaluation.modules.filter((entry) => entry.included);
  if (included.length === 0) return { ok: false, reason: 'EMPTY' };

  const publishedAt = new Date();
  const moment = (point: { value: number; capturedAt: Date }) => ({
    value: point.value,
    capturedAt: point.capturedAt.toISOString(),
  });

  const content: ReportSnapshot = {
    version: REPORT_SNAPSHOT_VERSION,
    publishedAt: publishedAt.toISOString(),
    assessment: { performedAt: evaluation.assessment.performedAt.toISOString() },
    athlete: {
      firstName: evaluation.athlete.firstName,
      lastName: evaluation.athlete.lastName,
    },
    coach: { name: evaluation.coachName },
    modules: included.map((entry) => ({
      moduleId: entry.moduleId,
      name: entry.name,
      typeLabel: entry.typeLabel,
      protocolLabel: entry.protocolLabel,
      derivations: [...entry.derivations],
      series: entry.series.map((row) => ({
        key: row.key,
        typeName: row.typeName,
        unit: row.unit,
        side: row.side,
        exerciseName: row.exerciseName,
        passIndex: row.passIndex,
        context: row.context,
        source: row.source,
        current: moment(row.current),
        previous: row.previous === null ? null : moment(row.previous),
        difference: row.difference,
        best: row.best === null ? null : moment(row.best),
      })),
      interpretation: entry.interpretation,
      recommendation: entry.recommendation,
    })),
    overall: evaluation.overall,
  };

  const { count } = await db.report.updateMany({
    where: scoped(tenant, { id: reportId, status: 'DRAFT' as const }),
    data: { status: 'PUBLISHED', publishedAt, content },
  });

  return count > 0 ? { ok: true } : { ok: false, reason: 'NOT_FOUND' };
}

/**
 * Stores one of the coach's texts.
 *
 * `updateMany` with the tenant in the filter, never `update` by id: a bare
 * update would write the row before anyone checked whose workspace it is in.
 * Only `DRAFT` reports are reachable — a published analysis is immutable (§16),
 * and the filter says so rather than a check somebody has to remember.
 */
export async function updateDraftText(
  db: ReportDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  reportId: string,
  target: DraftTarget,
  field: DraftField,
  text: string,
): Promise<boolean> {
  const report = await db.report.findFirst({
    where: scoped(tenant, { id: reportId, status: 'DRAFT' as const }),
    select: { id: true, draft: true },
  });

  if (!report) return false;

  const stored = readReportDraft(report.draft) ?? emptyReportDraft();

  const { count } = await db.report.updateMany({
    where: scoped(tenant, { id: reportId, status: 'DRAFT' as const }),
    data: { draft: withDraftText(stored, target, field, text) },
  });

  return count > 0;
}
