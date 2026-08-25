import 'server-only';

import type { PrismaClientInstance } from '@apex/database';
import { scoped, withTenant } from '@apex/database/tenant';
import {
  combineReadiness,
  draftBasisChange,
  draftFromFacts,
  evaluateReadiness,
  generatedTextOf,
  readModuleConfiguration,
  readReportDraft,
  summariseAssessment,
  summariseAssessmentOverall,
  withDraftText,
  withRegeneratedText,
  type DraftTarget,
  type Readiness,
  type ReadinessLevel,
  type ReportDraft,
  type SummaryModule,
  type SummarySection,
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
  'report' | 'reportModule' | 'assessment' | 'assessmentModule' | 'measurement'
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
  labels: ModuleLabels,
): Promise<ReportRecord | null> {
  const assessment = await db.assessment.findFirst({
    where: scoped(tenant, { id: assessmentId }),
    select: {
      id: true,
      modules: {
        where: { archivedAt: null },
        // Enough to word the draft in the same call: an analysis that had to be
        // re-read to describe itself could describe a different set of tests
        // than the one it was created over.
        select: {
          id: true,
          name: true,
          moduleKey: true,
          payload: true,
          moduleVersion: true,
        },
        orderBy: [{ createdAt: 'asc' }],
      },
    },
  });

  if (!assessment) return null;

  const latest = await db.report.findFirst({
    where: scoped(tenant, { assessmentId }),
    orderBy: { version: 'desc' },
    select: { version: true },
  });

  // The factual text, written now rather than on first read: a draft is a
  // document, and a document that only exists while somebody is looking at it
  // is not one. Nothing here judges — `summariseAssessment` states what was
  // recorded and the domain tests pin the words it may not use.
  const modules = await factModules(db, tenant, assessment.modules, labels);
  const sections = summariseAssessment(modules);
  const draft = draftFromFacts(
    summariseAssessmentOverall(modules),
    sections.map((section, index) => ({
      moduleId: assessment.modules[index]?.id ?? '',
      text: generatedTextOf(section),
    })),
  );

  return db.report.create({
    data: withTenant(tenant, {
      assessmentId,
      authorCoachId,
      title,
      scope: 'ASSESSMENT' as const,
      version: (latest?.version ?? 0) + 1,
      draft,
      modules: {
        create: assessment.modules.map((entry) => ({
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
export async function assessmentSummary(
  db: ReportDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  assessmentId: string,
  labels: ModuleLabels,
): Promise<readonly SummarySection[] | null> {
  const draft = await db.report.findFirst({
    where: scoped(tenant, { assessmentId, status: 'DRAFT' as const }),
    orderBy: [{ version: 'desc' }],
    select: {
      modules: {
        where: { included: true, assessmentModule: { archivedAt: null } },
        select: {
          assessmentModule: {
            select: {
              id: true,
              name: true,
              moduleKey: true,
              payload: true,
              moduleVersion: true,
            },
          },
        },
      },
    },
  });

  if (!draft) return null;

  return factsFor(
    db,
    tenant,
    draft.modules.map((entry) => entry.assessmentModule),
    labels,
  );
}

/** What a draft's included tests look like, as a row this module can read. */
interface FactModule {
  id: string;
  name: string | null;
  moduleKey: string;
  payload: unknown;
  moduleVersion: number;
}

/**
 * The facts of a set of tests, worded by the domain.
 *
 * One place, because the same numbers are needed twice over: when an analysis
 * is created and its text is written, and every time the screen asks whether
 * those numbers have moved since. Two readers would eventually disagree, and
 * the disagreement would look like a change of basis that never happened.
 */
async function factsFor(
  db: ReportDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  moduleRows: readonly FactModule[],
  labels: ModuleLabels,
): Promise<readonly SummarySection[]> {
  const modules = await factModules(db, tenant, moduleRows, labels);

  return summariseAssessment(modules);
}

/** The same, stopping one step earlier — the assessment-wide text needs these. */
async function factModules(
  db: ReportDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  moduleRows: readonly FactModule[],
  labels: ModuleLabels,
): Promise<readonly SummaryModule[]> {
  const moduleIds = moduleRows.map((entry) => entry.id);
  if (moduleIds.length === 0) return [];

  const measurements = await db.measurement.findMany({
    where: scoped(tenant, {
      assessmentModuleId: { in: moduleIds },
      // What stands. A corrected reading is history (§13).
      supersededById: null,
    }),
    select: {
      assessmentModuleId: true,
      measurementTypeId: true,
      numericValue: true,
      passIndex: true,
      supersededById: true,
      source: true,
      measurementType: { select: { name: true, unit: true } },
    },
    orderBy: [{ capturedAt: 'asc' }, { id: 'asc' }],
  });

  return moduleRows.map((assessmentModule) => {
    const configuration = readModuleConfiguration(
      assessmentModule.payload,
      assessmentModule.moduleVersion,
    );
    const own = measurements.filter((row) => row.assessmentModuleId === assessmentModule.id);
    const readiness = configuration
      ? evaluateReadiness(configuration, own)
      : { expected: 0, recorded: 0 };

    // The method each computed quantity was produced by, from the configuration
    // rather than from the sentence stored beside the value: parsing a stored
    // note back into data would make the summary depend on its own wording.
    const methods = new Map(
      (configuration?.derivations ?? []).map((derivation) => [
        derivation.measurementTypeId,
        BODY_FAT_METHOD_LABELS[derivation.method] ?? derivation.method,
      ]),
    );

    // Grouped by quantity in the order the configuration asks for them, so the
    // summary reads in the order the test was carried out (§16: order is
    // configuration).
    const quantities = (configuration?.measurementTypes ?? []).flatMap((configured) => {
      const rows = own.filter((row) => row.measurementTypeId === configured.measurementTypeId);
      const first = rows[0];
      if (!first) return [];

      const method = methods.get(configured.measurementTypeId);

      return [
        {
          name: first.measurementType.name,
          unit: first.measurementType.unit,
          values: rows.flatMap((row) => {
            const parsed = Number(row.numericValue);

            return row.numericValue === null || !Number.isFinite(parsed) ? [] : [parsed];
          }),
          ...(method === undefined ? {} : { derivation: { method } }),
        },
      ];
    });

    const name = assessmentModule.name?.trim() ?? '';

    return {
      name: name === '' ? labels.module(assessmentModule.moduleKey) : name,
      typeLabel: labels.module(assessmentModule.moduleKey),
      passes: configuration?.passes ?? 1,
      recorded: readiness.recorded,
      expected: readiness.expected,
      quantities,
    };
  });
}

/** What the analysis section shows and edits. */
export interface AssessmentDraftView {
  readonly reportId: string;
  readonly title: string;
  readonly version: number;
  readonly overall: { readonly text: string; readonly generated: boolean };
  readonly sections: readonly {
    readonly moduleId: string;
    /** The test's name, so the screen never has to look one up. */
    readonly name: string;
    readonly typeLabel: string;
    readonly text: string;
    readonly generated: boolean;
    /** Whether the values behind it have moved since it was written. */
    readonly basisChanged: boolean;
  }[];
  /** Tests taken into the analysis that have no text yet. */
  readonly addedModuleNames: readonly string[];
  /** Sections whose test is no longer drawn on. */
  readonly removedModuleIds: readonly string[];
}

/**
 * The draft as the screen needs it: the stored text, plus what has moved.
 *
 * The change flags are computed by comparing what the facts word **today**
 * against what each text was generated from. Nothing is rewritten by asking —
 * that is the whole point. A value that arrived after the analysis was written
 * changes what the screen says, never what the coach typed.
 */
export async function assessmentDraftView(
  db: ReportDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  assessmentId: string,
  labels: ModuleLabels,
): Promise<AssessmentDraftView | null> {
  const report = await db.report.findFirst({
    where: scoped(tenant, { assessmentId, status: 'DRAFT' as const }),
    orderBy: [{ version: 'desc' }],
    select: {
      id: true,
      title: true,
      version: true,
      draft: true,
      modules: {
        where: { included: true, assessmentModule: { archivedAt: null } },
        select: {
          assessmentModule: {
            select: { id: true, name: true, moduleKey: true, payload: true, moduleVersion: true },
          },
        },
      },
    },
  });

  if (!report) return null;

  const moduleRows = report.modules.map((entry) => entry.assessmentModule);
  const modules = await factModules(db, tenant, moduleRows, labels);
  const summaries = summariseAssessment(modules);

  const fresh = moduleRows.map((row, index) => ({
    moduleId: row.id,
    text: generatedTextOf(summaries[index] ?? { name: '', typeLabel: '', sentences: [] }),
  }));

  // A report created before drafts existed, or one whose payload cannot be
  // read, is described from the facts rather than left blank — and still not
  // written back, because writing on a read is how a draft loses an edit.
  const stored: ReportDraft =
    readReportDraft(report.draft) ?? draftFromFacts(summariseAssessmentOverall(modules), fresh);

  const change = draftBasisChange(stored, fresh);
  const changed = new Set(change.changedModuleIds);
  const named = new Map(modules.map((entry, index) => [moduleRows[index]?.id ?? '', entry]));

  return {
    reportId: report.id,
    title: report.title,
    version: report.version,
    overall: { text: stored.overall.text, generated: stored.overall.generated },
    sections: stored.sections.flatMap((section) => {
      const described = named.get(section.moduleId);
      // A section whose test is no longer included keeps its text in the record
      // but leaves the screen: the analysis does not draw on it any more.
      if (!described) return [];

      return [
        {
          moduleId: section.moduleId,
          name: described.name,
          typeLabel: described.typeLabel,
          text: section.text,
          generated: section.generated,
          basisChanged: changed.has(section.moduleId),
        },
      ];
    }),
    addedModuleNames: change.addedModuleIds.map(
      (moduleId) => named.get(moduleId)?.name ?? 'Ein Test',
    ),
    removedModuleIds: change.removedModuleIds,
  };
}

/** Loads a draft for writing, with the facts needed to regenerate from. */
async function draftForWriting(
  db: ReportDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  reportId: string,
  labels: ModuleLabels,
) {
  const report = await db.report.findFirst({
    where: scoped(tenant, { id: reportId, status: 'DRAFT' as const }),
    select: {
      id: true,
      draft: true,
      modules: {
        where: { included: true, assessmentModule: { archivedAt: null } },
        select: {
          assessmentModule: {
            select: { id: true, name: true, moduleKey: true, payload: true, moduleVersion: true },
          },
        },
      },
    },
  });

  if (!report) return null;

  const moduleRows = report.modules.map((entry) => entry.assessmentModule);
  const modules = await factModules(db, tenant, moduleRows, labels);
  const summaries = summariseAssessment(modules);

  const fresh = moduleRows.map((row, index) => ({
    moduleId: row.id,
    text: generatedTextOf(summaries[index] ?? { name: '', typeLabel: '', sentences: [] }),
  }));

  return {
    id: report.id,
    stored:
      readReportDraft(report.draft) ?? draftFromFacts(summariseAssessmentOverall(modules), fresh),
    fresh,
    overall: summariseAssessmentOverall(modules),
  };
}

/**
 * Stores what the coach wrote.
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
  text: string,
  labels: ModuleLabels,
): Promise<boolean> {
  const loaded = await draftForWriting(db, tenant, reportId, labels);
  if (!loaded) return false;

  const { count } = await db.report.updateMany({
    where: scoped(tenant, { id: reportId, status: 'DRAFT' as const }),
    data: { draft: withDraftText(loaded.stored, target, text) },
  });

  return count > 0;
}

/**
 * Regenerates one text, and only that one.
 *
 * The single path in this slice that replaces something a coach may have
 * written, and it runs because they asked for it. Every other text in the draft
 * is carried through untouched.
 */
export async function regenerateDraftText(
  db: ReportDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  reportId: string,
  target: DraftTarget,
  labels: ModuleLabels,
): Promise<boolean> {
  const loaded = await draftForWriting(db, tenant, reportId, labels);
  if (!loaded) return false;

  const text =
    target.kind === 'overall'
      ? loaded.overall
      : loaded.fresh.find((section) => section.moduleId === target.moduleId)?.text;

  // Nothing to regenerate from: the test is not part of this analysis.
  if (text === undefined) return false;

  const { count } = await db.report.updateMany({
    where: scoped(tenant, { id: reportId, status: 'DRAFT' as const }),
    data: { draft: withRegeneratedText(loaded.stored, target, text) },
  });

  return count > 0;
}
