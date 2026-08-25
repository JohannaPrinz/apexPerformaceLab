import { describe, expect, it, vi } from 'vitest';

import {
  assessmentAnalysisOverview,
  assessmentDraftView,
  assessmentSummary,
  createReport,
  regenerateDraftText,
  updateDraftText,
  listReportsForAssessment,
  reportReadiness,
  setReportModuleInclusion,
} from './service';

/**
 * The analysis over an assessment.
 *
 * Three guarantees are under test, and the middle one is the reason this file
 * exists at all:
 *
 * 1. **The workspace boundary**, asserted on the queries themselves. An
 *    analysis reads an athlete's measurements; that read must not cross a
 *    tenant, and no screen test could prove it.
 * 2. **Selecting a test for an analysis never touches the test.** The whole
 *    point of `ReportModule` is that the decision belongs to the analysis, and
 *    the cheapest way for that to break is a write that reaches one field too
 *    far.
 * 3. **An archived test is not drawn on by default.** Archiving is the coach
 *    saying a test has left the working view; an analysis that quietly used it
 *    again would undo that decision without asking.
 */

const TENANT = { organizationId: 'org_a' } as const;
const OTHER = { organizationId: 'org_b' } as const;

/** The vocabulary the service is handed; it holds none of its own. */
const LABELS = { module: (key: string) => (key === 'lactate' ? 'Laktat' : key) };

const CONFIGURATION = {
  measurementTypes: [{ measurementTypeId: 'mt_lactate', role: 'required' }],
  exerciseIds: [],
  passes: 2,
  recordsSide: false,
  dimensions: [],
};

interface ModuleRow {
  id: string;
  moduleKey: string;
  payload: unknown;
  moduleVersion: number;
  status: string;
}

const moduleRow = (over: Partial<ModuleRow> = {}): ModuleRow => ({
  id: 'mod_1',
  moduleKey: 'lactate',
  payload: CONFIGURATION,
  moduleVersion: 2,
  status: 'COMPLETED',
  ...over,
});

interface MeasurementRow {
  assessmentModuleId: string;
  measurementTypeId: string;
  passIndex: number | null;
  supersededById: string | null;
}

const value = (over: Partial<MeasurementRow> = {}): MeasurementRow => ({
  assessmentModuleId: 'mod_1',
  measurementTypeId: 'mt_lactate',
  passIndex: 1,
  supersededById: null,
  ...over,
});

function reportDb(
  options: {
    assessmentModules?: { id: string }[] | undefined;
    assessmentFound?: boolean;
    reportModules?: { included: boolean; assessmentModule: ModuleRow }[] | undefined;
    reportFound?: boolean;
    moduleFound?: boolean;
    measurements?: MeasurementRow[];
  } = {},
) {
  const created: Record<string, unknown>[] = [];
  const upserted: Record<string, unknown>[] = [];

  const assessment = {
    findFirst: vi.fn(() =>
      Promise.resolve(
        options.assessmentFound === false
          ? null
          : { id: 'ass_1', modules: options.assessmentModules ?? [{ id: 'mod_1' }] },
      ),
    ),
  };

  const report = {
    findFirst: vi.fn((args: { select?: Record<string, unknown> }) => {
      if (options.reportFound === false) return Promise.resolve(null);
      // The version lookup and the readiness read share one spy; they are told
      // apart by what they select.
      if (args.select && 'version' in args.select) return Promise.resolve({ version: 2 });

      return Promise.resolve({
        id: 'rep_1',
        modules: options.reportModules ?? [{ included: true, assessmentModule: moduleRow() }],
      });
    }),
    findMany: vi.fn(() => Promise.resolve([])),
    create: vi.fn((args: { data: Record<string, unknown> }) => {
      created.push(args.data);

      return Promise.resolve({ id: 'rep_new', ...args.data });
    }),
  };

  const reportModule = {
    upsert: vi.fn((args: Record<string, unknown>) => {
      upserted.push(args);

      return Promise.resolve({});
    }),
  };

  const assessmentModule = {
    findFirst: vi.fn(() => Promise.resolve(options.moduleFound === false ? null : { id: 'mod_1' })),
  };

  const measurement = {
    findMany: vi.fn(() => Promise.resolve(options.measurements ?? [])),
  };

  const db = {
    report,
    reportModule,
    assessment,
    assessmentModule,
    measurement,
  } as unknown as Parameters<typeof createReport>[0];

  return { db, report, reportModule, assessment, assessmentModule, measurement, created, upserted };
}

const argsOf = (spy: { mock: { calls: unknown[][] } }, call = 0) =>
  (spy.mock.calls[call]?.[0] ?? {}) as {
    where?: Record<string, unknown>;
    data?: Record<string, unknown>;
    select?: Record<string, unknown>;
    orderBy?: unknown;
  };

describe('creating an analysis', () => {
  it('is a Report of scope ASSESSMENT, not an object of its own', () => {
    // §16: one object with a scope. A second conclusion-object beside it would
    // carry status, versioning, export and sharing a second time.
    const { db, created } = reportDb();

    return createReport(
      db,
      TENANT,
      'coach_1',
      {
        assessmentId: 'ass_1',
        title: 'Auswertung',
      },
      LABELS,
    ).then(() => {
      expect(created[0]).toMatchObject({ scope: 'ASSESSMENT', assessmentId: 'ass_1' });
    });
  });

  it('starts as a draft', async () => {
    const { db, created } = reportDb();

    await createReport(db, TENANT, 'coach_1', { assessmentId: 'ass_1', title: 'A' }, LABELS);

    // The column default is DRAFT, so nothing here may set a status at all.
    expect(created[0]?.['status']).toBeUndefined();
  });

  it('takes the next free version', async () => {
    const { db, created } = reportDb();

    await createReport(db, TENANT, 'coach_1', { assessmentId: 'ass_1', title: 'A' }, LABELS);

    expect(created[0]?.['version']).toBe(3);
  });

  it('starts at version one where there is no earlier analysis', async () => {
    const { db, report, created } = reportDb();
    report.findFirst.mockImplementationOnce(() => Promise.resolve(null));

    await createReport(db, TENANT, 'coach_1', { assessmentId: 'ass_1', title: 'A' }, LABELS);

    expect(created[0]?.['version']).toBe(1);
  });

  it('takes authorship from the signed-in coach, never from the request', async () => {
    const { db, created } = reportDb();

    await createReport(db, TENANT, 'coach_1', { assessmentId: 'ass_1', title: 'A' }, LABELS);

    expect(created[0]?.['authorCoachId']).toBe('coach_1');
  });

  it('includes every working test to begin with', async () => {
    // An analysis of an examination naturally covers what was examined.
    const { db, created } = reportDb({ assessmentModules: [{ id: 'mod_1' }, { id: 'mod_2' }] });

    await createReport(db, TENANT, 'coach_1', { assessmentId: 'ass_1', title: 'A' }, LABELS);

    const modules = created[0]?.['modules'] as { create: Record<string, unknown>[] };

    expect(modules.create.map((entry) => entry['assessmentModuleId'])).toEqual(['mod_1', 'mod_2']);
    expect(modules.create.every((entry) => entry['included'] === true)).toBe(true);
  });

  it('writes the rows rather than relying on their absence', async () => {
    // "Excluded" and "not yet decided" have to stay distinguishable.
    const { db, created } = reportDb();

    await createReport(db, TENANT, 'coach_1', { assessmentId: 'ass_1', title: 'A' }, LABELS);

    expect(created[0]).toHaveProperty('modules');
  });

  it('leaves an archived test out of the query entirely', async () => {
    // Archiving is the coach saying a test has left the working view. An
    // analysis created afterwards must not quietly draw on it again.
    const { db, assessment } = reportDb();

    await createReport(db, TENANT, 'coach_1', { assessmentId: 'ass_1', title: 'A' }, LABELS);

    const select = argsOf(assessment.findFirst).select as {
      modules: { where: Record<string, unknown> };
    };

    expect(select.modules.where).toEqual({ archivedAt: null });
  });

  it('refuses an assessment of another workspace', async () => {
    const { db, report } = reportDb({ assessmentFound: false });

    expect(
      await createReport(db, OTHER, 'coach_1', { assessmentId: 'ass_1', title: 'A' }, LABELS),
    ).toBeNull();
    expect(report.create).not.toHaveBeenCalled();
  });
});

describe('choosing which tests an analysis draws on', () => {
  it('writes only the analysis row', async () => {
    // The guarantee `ReportModule` exists for: the test, its status and its
    // measurements are untouched.
    const { db, reportModule, upserted } = reportDb();

    await setReportModuleInclusion(db, TENANT, 'rep_1', 'mod_1', false);

    expect(reportModule.upsert).toHaveBeenCalledTimes(1);
    expect(Object.keys(upserted[0] ?? {}).sort()).toEqual(['create', 'update', 'where']);
    expect(upserted[0]?.['update']).toEqual({ included: false });
  });

  it('never touches the assessment module', async () => {
    const { db, assessmentModule } = reportDb();

    await setReportModuleInclusion(db, TENANT, 'rep_1', 'mod_1', false);

    // Read to prove it exists in this workspace, and nothing else.
    expect(Object.keys(assessmentModule)).toEqual(['findFirst']);
  });

  it('keys the row on the pair, so one analysis cannot speak for another', async () => {
    const { db, upserted } = reportDb();

    await setReportModuleInclusion(db, TENANT, 'rep_1', 'mod_1', true);

    expect(upserted[0]?.['where']).toEqual({
      reportId_assessmentModuleId: { reportId: 'rep_1', assessmentModuleId: 'mod_1' },
    });
  });

  it('creates the row for a test added after the analysis was made', async () => {
    const { db, upserted } = reportDb();

    await setReportModuleInclusion(db, TENANT, 'rep_1', 'mod_1', true);

    expect(upserted[0]?.['create']).toMatchObject({
      reportId: 'rep_1',
      assessmentModuleId: 'mod_1',
      included: true,
      organizationId: 'org_a',
    });
  });

  it('refuses an analysis of another workspace', async () => {
    const { db, reportModule } = reportDb({ reportFound: false });

    expect(await setReportModuleInclusion(db, OTHER, 'rep_1', 'mod_1', true)).toBe(false);
    expect(reportModule.upsert).not.toHaveBeenCalled();
  });

  it('refuses a test of another workspace', async () => {
    const { db, reportModule } = reportDb({ moduleFound: false });

    expect(await setReportModuleInclusion(db, OTHER, 'rep_1', 'mod_1', true)).toBe(false);
    expect(reportModule.upsert).not.toHaveBeenCalled();
  });

  it('checks both sides inside the tenant', async () => {
    const { db, report, assessmentModule } = reportDb();

    await setReportModuleInclusion(db, OTHER, 'rep_1', 'mod_1', true);

    expect(argsOf(report.findFirst).where).toMatchObject({ organizationId: 'org_b' });
    expect(argsOf(assessmentModule.findFirst).where).toMatchObject({ organizationId: 'org_b' });
  });
});

describe('whether an analysis has what it needs', () => {
  it('reports each test with its own readiness', async () => {
    const { db } = reportDb({ measurements: [value({ passIndex: 1 }), value({ passIndex: 2 })] });

    const readiness = await reportReadiness(db, TENANT, 'rep_1');

    expect(readiness?.modules[0]).toMatchObject({
      moduleId: 'mod_1',
      moduleKey: 'lactate',
      included: true,
      status: 'COMPLETED',
    });
    expect(readiness?.modules[0]?.readiness.level).toBe('COMPLETE');
  });

  it('is as good as its weakest included test', async () => {
    const { db } = reportDb({
      reportModules: [
        { included: true, assessmentModule: moduleRow({ id: 'mod_1' }) },
        { included: true, assessmentModule: moduleRow({ id: 'mod_2' }) },
      ],
      measurements: [value({ passIndex: 1 }), value({ passIndex: 2 })],
    });

    // `mod_2` has no values at all, so its required quantity is missing.
    expect((await reportReadiness(db, TENANT, 'rep_1'))?.level).toBe('INSUFFICIENT');
  });

  it('lets an excluded test contribute nothing either way', async () => {
    const { db } = reportDb({
      reportModules: [
        { included: true, assessmentModule: moduleRow({ id: 'mod_1' }) },
        { included: false, assessmentModule: moduleRow({ id: 'mod_2' }) },
      ],
      measurements: [value({ passIndex: 1 }), value({ passIndex: 2 })],
    });

    const readiness = await reportReadiness(db, TENANT, 'rep_1');

    expect(readiness?.level).toBe('COMPLETE');
    // Still reported, so the screen can show what was set aside.
    expect(readiness?.modules).toHaveLength(2);
  });

  it('is insufficient where nothing at all is included', async () => {
    const { db } = reportDb({
      reportModules: [{ included: false, assessmentModule: moduleRow() }],
    });

    expect((await reportReadiness(db, TENANT, 'rep_1'))?.level).toBe('INSUFFICIENT');
  });

  it('ignores an archived test', async () => {
    // Filtered in the query, so no caller can forget it — including the case
    // where the row still says `included` because the test was archived after
    // the analysis was created.
    const { db, report } = reportDb();

    await reportReadiness(db, TENANT, 'rep_1');

    const select = argsOf(report.findFirst).select as {
      modules: { where: Record<string, unknown> };
    };

    expect(select.modules.where).toEqual({ assessmentModule: { archivedAt: null } });
  });

  it('does not let the status decide readiness', async () => {
    // §13: a COMPLETED test may be missing values, and a PLANNED one may hold
    // every one of them. Readiness is computed from what was recorded.
    const { db } = reportDb({
      reportModules: [{ included: true, assessmentModule: moduleRow({ status: 'PLANNED' }) }],
      measurements: [value({ passIndex: 1 }), value({ passIndex: 2 })],
    });

    const readiness = await reportReadiness(db, TENANT, 'rep_1');

    expect(readiness?.modules[0]?.status).toBe('PLANNED');
    expect(readiness?.level).toBe('COMPLETE');
  });

  it('counts a superseded value as history, not as a reading', async () => {
    const { db } = reportDb({
      measurements: [value({ passIndex: 1 }), value({ passIndex: 2, supersededById: 'm_new' })],
    });

    expect((await reportReadiness(db, TENANT, 'rep_1'))?.modules[0]?.readiness.level).toBe(
      'PARTIAL',
    );
  });

  it('calls a test with an unreadable configuration insufficient rather than guessing', async () => {
    const { db } = reportDb({
      reportModules: [{ included: true, assessmentModule: moduleRow({ payload: null }) }],
    });

    const readiness = await reportReadiness(db, TENANT, 'rep_1');

    expect(readiness?.modules[0]?.readiness).toMatchObject({
      level: 'INSUFFICIENT',
      expected: 0,
      recorded: 0,
    });
  });

  it('reports an analysis of another workspace as missing', async () => {
    const { db, measurement } = reportDb({ reportFound: false });

    expect(await reportReadiness(db, OTHER, 'rep_1')).toBeNull();
    expect(measurement.findMany).not.toHaveBeenCalled();
  });

  it('scopes both reads', async () => {
    const { db, report, measurement } = reportDb();

    await reportReadiness(db, OTHER, 'rep_1');

    expect(argsOf(report.findFirst).where).toMatchObject({ organizationId: 'org_b' });
    expect(argsOf(measurement.findMany).where).toMatchObject({ organizationId: 'org_b' });
  });
});

describe('listing the analyses of an assessment', () => {
  it('returns the newest version first', async () => {
    const { db, report } = reportDb();

    await listReportsForAssessment(db, TENANT, 'ass_1');

    expect(argsOf(report.findMany).orderBy).toEqual([{ version: 'desc' }]);
  });

  it('never reaches outside the workspace', async () => {
    const { db, report } = reportDb();

    await listReportsForAssessment(db, OTHER, 'ass_1');

    expect(argsOf(report.findMany).where).toMatchObject({
      organizationId: 'org_b',
      assessmentId: 'ass_1',
    });
  });
});

/**
 * What the analysis section reads.
 *
 * One read for three questions, so a selection can never disagree with the
 * readiness shown beside it.
 */
describe('what an analysis could draw on', () => {
  interface OverviewModule {
    id: string;
    name: string | null;
    moduleKey: string;
    status: string;
    archivedAt: Date | null;
    payload: unknown;
    moduleVersion: number;
  }

  const overviewModule = (over: Partial<OverviewModule> = {}): OverviewModule => ({
    id: 'mod_1',
    name: 'Laufband Mai',
    moduleKey: 'lactate',
    status: 'COMPLETED',
    archivedAt: null,
    payload: CONFIGURATION,
    moduleVersion: 2,
    ...over,
  });

  function overviewDb(options: {
    modules?: OverviewModule[];
    draft?: { modules: { assessmentModuleId: string; included: boolean }[] } | null;
    measurements?: MeasurementRow[];
    assessmentFound?: boolean;
  }) {
    const assessment = {
      findFirst: vi.fn(() =>
        Promise.resolve(
          options.assessmentFound === false
            ? null
            : { id: 'ass_1', modules: options.modules ?? [overviewModule()] },
        ),
      ),
    };

    const report = {
      findFirst: vi.fn(() =>
        Promise.resolve(
          options.draft === null || options.draft === undefined
            ? null
            : {
                id: 'rep_1',
                title: 'Auswertung',
                version: 1,
                createdAt: new Date('2026-08-24T10:00:00Z'),
                ...options.draft,
              },
        ),
      ),
      findMany: vi.fn(() => Promise.resolve([])),
      create: vi.fn(() => Promise.resolve({})),
    };

    const measurement = { findMany: vi.fn(() => Promise.resolve(options.measurements ?? [])) };

    const db = {
      assessment,
      report,
      measurement,
      reportModule: {},
      assessmentModule: {},
    } as unknown as Parameters<typeof assessmentAnalysisOverview>[0];

    return { db, assessment, report, measurement };
  }

  it('offers a test that holds values', async () => {
    const { db } = overviewDb({ measurements: [value({ passIndex: 1 })] });

    const overview = await assessmentAnalysisOverview(db, TENANT, 'ass_1');

    expect(overview?.modules[0]).toMatchObject({ recorded: 1, selectable: true });
  });

  it('does not offer a test nobody has recorded anything for', async () => {
    // There is nothing to analyse. Shown, but never selectable.
    const { db } = overviewDb({ measurements: [] });

    const overview = await assessmentAnalysisOverview(db, TENANT, 'ass_1');

    expect(overview?.modules[0]).toMatchObject({ recorded: 0, selectable: false, included: false });
    expect(overview?.withoutResultsCount).toBe(1);
  });

  it('keeps a test without values in the list rather than hiding it', async () => {
    const { db } = overviewDb({ measurements: [] });

    expect((await assessmentAnalysisOverview(db, TENANT, 'ass_1'))?.modules).toHaveLength(1);
  });

  it('does not offer an archived test', async () => {
    const { db } = overviewDb({
      modules: [overviewModule({ archivedAt: new Date('2026-08-01T00:00:00Z') })],
      measurements: [value({ passIndex: 1 })],
    });

    const overview = await assessmentAnalysisOverview(db, TENANT, 'ass_1');

    expect(overview?.modules[0]).toMatchObject({ archived: true, selectable: false });
    // Nor counted as one still awaiting values.
    expect(overview?.withoutResultsCount).toBe(0);
  });

  it('reports what the draft draws on', async () => {
    const { db } = overviewDb({
      draft: { modules: [{ assessmentModuleId: 'mod_1', included: true }] },
      measurements: [value({ passIndex: 1 })],
    });

    const overview = await assessmentAnalysisOverview(db, TENANT, 'ass_1');

    expect(overview?.draft).toMatchObject({ id: 'rep_1', version: 1 });
    expect(overview?.includedCount).toBe(1);
  });

  it('honours an exclusion the coach made', async () => {
    const { db } = overviewDb({
      draft: { modules: [{ assessmentModuleId: 'mod_1', included: false }] },
      measurements: [value({ passIndex: 1 })],
    });

    const overview = await assessmentAnalysisOverview(db, TENANT, 'ass_1');

    expect(overview?.modules[0]?.included).toBe(false);
    expect(overview?.includedCount).toBe(0);
    expect(overview?.availableCount).toBe(1);
  });

  it('includes nothing while there is no draft', async () => {
    const { db } = overviewDb({ measurements: [value({ passIndex: 1 })] });

    const overview = await assessmentAnalysisOverview(db, TENANT, 'ass_1');

    expect(overview?.draft).toBeNull();
    expect(overview?.includedCount).toBe(0);
  });

  it('reads the newest draft, never a published analysis', async () => {
    // A published analysis is finished, and its selection is part of the
    // document (§16).
    const { db, report } = overviewDb({ measurements: [] });

    await assessmentAnalysisOverview(db, TENANT, 'ass_1');

    expect(argsOf(report.findFirst).where).toMatchObject({ status: 'DRAFT' });
    expect(argsOf(report.findFirst).orderBy).toEqual([{ version: 'desc' }]);
  });

  it('never includes an archived test even where a row says so', async () => {
    // The test may have been archived after the analysis was created.
    const { db } = overviewDb({
      modules: [overviewModule({ archivedAt: new Date('2026-08-01T00:00:00Z') })],
      draft: { modules: [{ assessmentModuleId: 'mod_1', included: true }] },
      measurements: [value({ passIndex: 1 })],
    });

    expect((await assessmentAnalysisOverview(db, TENANT, 'ass_1'))?.includedCount).toBe(0);
  });

  it('reports an assessment of another workspace as missing', async () => {
    const { db, measurement } = overviewDb({ assessmentFound: false });

    expect(await assessmentAnalysisOverview(db, OTHER, 'ass_1')).toBeNull();
    expect(measurement.findMany).not.toHaveBeenCalled();
  });

  it('scopes every read', async () => {
    const { db, assessment, report, measurement } = overviewDb({ measurements: [] });

    await assessmentAnalysisOverview(db, OTHER, 'ass_1');

    for (const spy of [assessment.findFirst, report.findFirst, measurement.findMany]) {
      expect(argsOf(spy).where).toMatchObject({ organizationId: 'org_b' });
    }
  });
});

/**
 * The factual summary, at the seam between the database and the pure function
 * that words it.
 */
describe('summarising what was recorded', () => {
  const labels = { module: (key: string) => (key === 'lactate' ? 'Laktat' : key) };

  interface SummaryReading {
    assessmentModuleId: string;
    measurementTypeId: string;
    numericValue: number | null;
    passIndex: number | null;
    supersededById: string | null;
    source: string;
    measurementType: { name: string; unit: string };
  }

  function summaryDb(options: {
    draft?: boolean;
    included?: { id: string; name: string | null; payload: unknown }[];
    measurements?: SummaryReading[];
  }) {
    const report = {
      findFirst: vi.fn(() =>
        Promise.resolve(
          options.draft === false
            ? null
            : {
                modules: (
                  options.included ?? [
                    { id: 'mod_1', name: 'Laufband Mai', payload: CONFIGURATION },
                  ]
                ).map((entry) => ({
                  assessmentModule: {
                    id: entry.id,
                    name: entry.name,
                    moduleKey: 'lactate',
                    payload: entry.payload,
                    moduleVersion: 2,
                  },
                })),
              },
        ),
      ),
      findMany: vi.fn(() => Promise.resolve([])),
      create: vi.fn(() => Promise.resolve({})),
    };

    const measurement = { findMany: vi.fn(() => Promise.resolve(options.measurements ?? [])) };

    const db = {
      report,
      measurement,
      assessment: {},
      reportModule: {},
      assessmentModule: {},
    } as unknown as Parameters<typeof assessmentSummary>[0];

    return { db, report, measurement };
  }

  const reading = (over: Partial<SummaryReading> = {}): SummaryReading => ({
    assessmentModuleId: 'mod_1',
    measurementTypeId: 'mt_lactate',
    numericValue: 1.2,
    passIndex: 1,
    supersededById: null,
    source: 'MANUAL',
    measurementType: { name: 'Laktat', unit: 'mmol/L' },
    ...over,
  });

  it('says nothing at all while there is no draft', async () => {
    // The summary describes a selection, and without a draft there is none.
    const { db } = summaryDb({ draft: false });

    expect(await assessmentSummary(db, TENANT, 'ass_1', labels)).toBeNull();
  });

  it('describes each included test', async () => {
    const { db } = summaryDb({
      measurements: [reading({ passIndex: 1 }), reading({ passIndex: 2, numericValue: 2.6 })],
    });

    const sections = await assessmentSummary(db, TENANT, 'ass_1', labels);

    expect(sections?.[0]?.name).toBe('Laufband Mai');
    expect(sections?.[0]?.sentences.join(' ')).toContain('Laktat: 1,2 bis 2,6 mmol/L (2 Werte)');
  });

  it('asks only for readings that still stand', async () => {
    const { db, measurement } = summaryDb({ measurements: [] });

    await assessmentSummary(db, TENANT, 'ass_1', labels);

    expect(argsOf(measurement.findMany).where).toMatchObject({ supersededById: null });
  });

  it('draws only on the tests the draft includes and that are not archived', async () => {
    const { db, report } = summaryDb({ measurements: [] });

    await assessmentSummary(db, TENANT, 'ass_1', labels);

    const select = argsOf(report.findFirst).select as {
      modules: { where: Record<string, unknown> };
    };

    expect(select.modules.where).toEqual({
      included: true,
      assessmentModule: { archivedAt: null },
    });
  });

  it('falls back to the type where a test has no name', async () => {
    const { db } = summaryDb({
      included: [{ id: 'mod_1', name: null, payload: CONFIGURATION }],
      measurements: [reading()],
    });

    expect((await assessmentSummary(db, TENANT, 'ass_1', labels))?.[0]?.name).toBe('Laktat');
  });

  it('names the method of a computed value', async () => {
    const { db } = summaryDb({
      included: [
        {
          id: 'mod_1',
          name: 'Körperfett',
          payload: {
            ...CONFIGURATION,
            passes: 1,
            measurementTypes: [{ measurementTypeId: 'mt_body_fat', role: 'optional' }],
            derivations: [{ measurementTypeId: 'mt_body_fat', method: 'jackson_pollock_3' }],
          },
        },
      ],
      measurements: [
        reading({
          measurementTypeId: 'mt_body_fat',
          numericValue: 16.3,
          passIndex: null,
          source: 'DERIVED',
          measurementType: { name: 'Body Fat', unit: '%' },
        }),
      ],
    });

    const sections = await assessmentSummary(db, TENANT, 'ass_1', labels);

    expect(sections?.[0]?.sentences.join(' ')).toContain(
      'berechnet nach Jackson & Pollock, 3 Punkte',
    );
  });

  it('returns nothing to describe where the selection is empty', async () => {
    const { db, measurement } = summaryDb({ included: [], measurements: [] });

    expect(await assessmentSummary(db, TENANT, 'ass_1', labels)).toEqual([]);
    expect(measurement.findMany).not.toHaveBeenCalled();
  });

  it('never reaches outside the workspace', async () => {
    const { db, report, measurement } = summaryDb({ measurements: [reading()] });

    await assessmentSummary(db, OTHER, 'ass_1', labels);

    expect(argsOf(report.findFirst).where).toMatchObject({ organizationId: 'org_b' });
    expect(argsOf(measurement.findMany).where).toMatchObject({ organizationId: 'org_b' });
  });
});

/**
 * The draft text, at the seam between the database and the pure functions that
 * word it.
 *
 * The rule these guard is the one the whole feature turns on: **nothing
 * overwrites what the coach wrote except the coach asking for it.**
 */
describe('the analysis draft', () => {
  interface DraftModule {
    id: string;
    name: string | null;
    moduleKey: string;
    payload: unknown;
    moduleVersion: number;
  }

  const draftModule = (over: Partial<DraftModule> = {}): DraftModule => ({
    id: 'mod_1',
    name: 'Laufband Mai',
    moduleKey: 'lactate',
    payload: CONFIGURATION,
    moduleVersion: 2,
    ...over,
  });

  const reading = (over: Record<string, unknown> = {}) => ({
    assessmentModuleId: 'mod_1',
    measurementTypeId: 'mt_lactate',
    numericValue: 1.2,
    passIndex: 1,
    supersededById: null,
    source: 'MANUAL',
    measurementType: { name: 'Laktat', unit: 'mmol/L' },
    ...over,
  });

  function draftDb(options: {
    modules?: DraftModule[];
    stored?: unknown;
    measurements?: Record<string, unknown>[];
    reportFound?: boolean;
  }) {
    const written: Record<string, unknown>[] = [];

    const report = {
      findFirst: vi.fn(() =>
        Promise.resolve(
          options.reportFound === false
            ? null
            : {
                id: 'rep_1',
                title: 'Auswertung',
                version: 1,
                draft: options.stored ?? null,
                modules: (options.modules ?? [draftModule()]).map((entry) => ({
                  assessmentModule: entry,
                })),
              },
        ),
      ),
      findMany: vi.fn(() => Promise.resolve([])),
      create: vi.fn(() => Promise.resolve({})),
      updateMany: vi.fn((args: Record<string, unknown>) => {
        written.push(args);

        return Promise.resolve({ count: 1 });
      }),
    };

    const measurement = { findMany: vi.fn(() => Promise.resolve(options.measurements ?? [])) };

    const db = {
      report,
      measurement,
      assessment: {},
      reportModule: {},
      assessmentModule: {},
    } as unknown as Parameters<typeof assessmentDraftView>[0];

    return { db, report, measurement, written };
  }

  const storedDraft = (over: Record<string, unknown> = {}) => ({
    version: 1,
    overall: { text: 'Gesamt.', generated: true, basis: 'Gesamt.' },
    sections: [{ moduleId: 'mod_1', text: 'Alt.', generated: true, basis: 'Alt.' }],
    ...over,
  });

  const writtenDraft = (written: Record<string, unknown>[]) =>
    (written[0]?.['data'] as { draft: Record<string, unknown> }).draft;

  describe('reading it', () => {
    it('says nothing while no analysis has been started', async () => {
      const { db } = draftDb({ reportFound: false });

      expect(await assessmentDraftView(db, TENANT, 'ass_1', LABELS)).toBeNull();
    });

    it('returns what was stored, not what the facts say today', async () => {
      const { db } = draftDb({ stored: storedDraft(), measurements: [reading()] });

      const view = await assessmentDraftView(db, TENANT, 'ass_1', LABELS);

      expect(view?.sections[0]?.text).toBe('Alt.');
      expect(view?.overall.text).toBe('Gesamt.');
    });

    it('names the test each section describes', async () => {
      const { db } = draftDb({ stored: storedDraft(), measurements: [reading()] });

      const view = await assessmentDraftView(db, TENANT, 'ass_1', LABELS);

      expect(view?.sections[0]).toMatchObject({ name: 'Laufband Mai', typeLabel: 'Laktat' });
    });

    it('reports that the values have moved since the text was written', async () => {
      // The basis is compared, never the coach's wording.
      const { db } = draftDb({ stored: storedDraft(), measurements: [reading()] });

      expect(
        (await assessmentDraftView(db, TENANT, 'ass_1', LABELS))?.sections[0]?.basisChanged,
      ).toBe(true);
    });

    it('reports no change where the facts still word the same text', async () => {
      const { db, report } = draftDb({ measurements: [reading()] });
      const generated = (await assessmentDraftView(db, TENANT, 'ass_1', LABELS))?.sections[0]?.text;

      const again = draftDb({
        stored: storedDraft({
          sections: [{ moduleId: 'mod_1', text: generated, generated: true, basis: generated }],
        }),
        measurements: [reading()],
      });

      expect(
        (await assessmentDraftView(again.db, TENANT, 'ass_1', LABELS))?.sections[0]?.basisChanged,
      ).toBe(false);
      expect(report.updateMany).not.toHaveBeenCalled();
    });

    it('names a test taken into the analysis after the draft was written', async () => {
      const { db } = draftDb({
        modules: [draftModule(), draftModule({ id: 'mod_2', name: 'Kraft QA' })],
        stored: storedDraft(),
        measurements: [reading()],
      });

      const view = await assessmentDraftView(db, TENANT, 'ass_1', LABELS);

      expect(view?.addedModuleNames).toEqual(['Kraft QA']);
    });

    it('drops a section whose test is no longer drawn on', async () => {
      const { db } = draftDb({
        stored: storedDraft({
          sections: [
            { moduleId: 'mod_1', text: 'Alt.', generated: true, basis: 'Alt.' },
            { moduleId: 'mod_gone', text: 'Weg.', generated: true, basis: 'Weg.' },
          ],
        }),
        measurements: [reading()],
      });

      const view = await assessmentDraftView(db, TENANT, 'ass_1', LABELS);

      expect(view?.sections.map((section) => section.moduleId)).toEqual(['mod_1']);
      expect(view?.removedModuleIds).toEqual(['mod_gone']);
    });

    it('describes an analysis written before drafts existed without writing to it', async () => {
      const { db, report } = draftDb({ stored: null, measurements: [reading()] });

      const view = await assessmentDraftView(db, TENANT, 'ass_1', LABELS);

      expect(view?.sections[0]?.text).toContain('Laktat: 1,2 mmol/L');
      // Writing on a read is how a draft loses an edit.
      expect(report.updateMany).not.toHaveBeenCalled();
    });

    it('never reaches outside the workspace', async () => {
      const { db, report, measurement } = draftDb({ measurements: [reading()] });

      await assessmentDraftView(db, OTHER, 'ass_1', LABELS);

      expect(argsOf(report.findFirst).where).toMatchObject({
        organizationId: 'org_b',
        status: 'DRAFT',
      });
      expect(argsOf(measurement.findMany).where).toMatchObject({ organizationId: 'org_b' });
    });

    it('draws only on included, unarchived tests', async () => {
      const { db, report } = draftDb({ measurements: [] });

      await assessmentDraftView(db, TENANT, 'ass_1', LABELS);

      const select = argsOf(report.findFirst).select as {
        modules: { where: Record<string, unknown> };
      };

      expect(select.modules.where).toEqual({
        included: true,
        assessmentModule: { archivedAt: null },
      });
    });
  });

  describe('the coach writing into it', () => {
    it('stores the text and drops the generated marking', async () => {
      const { db, written } = draftDb({ stored: storedDraft(), measurements: [reading()] });

      await updateDraftText(
        db,
        TENANT,
        'rep_1',
        { kind: 'section', moduleId: 'mod_1' },
        'Eigener Text.',
        LABELS,
      );

      const draft = writtenDraft(written) as { sections: Record<string, unknown>[] };

      expect(draft.sections[0]).toMatchObject({ text: 'Eigener Text.', generated: false });
    });

    it('leaves every other text as it was', async () => {
      const { db, written } = draftDb({ stored: storedDraft(), measurements: [reading()] });

      await updateDraftText(
        db,
        TENANT,
        'rep_1',
        { kind: 'overall' },
        'Meine Einschätzung.',
        LABELS,
      );

      const draft = writtenDraft(written) as {
        overall: Record<string, unknown>;
        sections: Record<string, unknown>[];
      };

      expect(draft.overall).toMatchObject({ text: 'Meine Einschätzung.', generated: false });
      expect(draft.sections[0]).toMatchObject({ text: 'Alt.', generated: true });
    });

    it('writes through the tenant filter, never by id alone', async () => {
      const { db, written } = draftDb({ stored: storedDraft(), measurements: [reading()] });

      await updateDraftText(db, OTHER, 'rep_1', { kind: 'overall' }, 'Text.', LABELS);

      expect(written[0]?.['where']).toMatchObject({
        id: 'rep_1',
        organizationId: 'org_b',
        status: 'DRAFT',
      });
    });

    it('refuses an analysis of another workspace', async () => {
      const { db, report } = draftDb({ reportFound: false });

      expect(await updateDraftText(db, OTHER, 'rep_1', { kind: 'overall' }, 'Text.', LABELS)).toBe(
        false,
      );
      expect(report.updateMany).not.toHaveBeenCalled();
    });
  });

  describe('regenerating one text', () => {
    const edited = () =>
      storedDraft({
        overall: { text: 'Meine Einschätzung.', generated: false, basis: 'Gesamt.' },
        sections: [
          { moduleId: 'mod_1', text: 'Mein Text.', generated: false, basis: 'Alt.' },
          { moduleId: 'mod_2', text: 'Auch meiner.', generated: false, basis: 'Alt 2.' },
        ],
      });

    it('replaces only the text it was asked for', async () => {
      const { db, written } = draftDb({
        modules: [draftModule(), draftModule({ id: 'mod_2', name: 'Kraft QA' })],
        stored: edited(),
        measurements: [reading()],
      });

      await regenerateDraftText(
        db,
        TENANT,
        'rep_1',
        { kind: 'section', moduleId: 'mod_1' },
        LABELS,
      );

      const draft = writtenDraft(written) as {
        overall: Record<string, unknown>;
        sections: Record<string, unknown>[];
      };

      expect(draft.sections[0]).toMatchObject({ generated: true });
      expect(draft.sections[0]?.['text']).toContain('Laktat: 1,2 mmol/L');
      // The coach's other paragraphs stand.
      expect(draft.sections[1]).toMatchObject({ text: 'Auch meiner.', generated: false });
      expect(draft.overall).toMatchObject({ text: 'Meine Einschätzung.', generated: false });
    });

    it('regenerates the assessment-wide text on its own', async () => {
      const { db, written } = draftDb({ stored: edited(), measurements: [reading()] });

      await regenerateDraftText(db, TENANT, 'rep_1', { kind: 'overall' }, LABELS);

      const draft = writtenDraft(written) as {
        overall: Record<string, unknown>;
        sections: Record<string, unknown>[];
      };

      expect(draft.overall).toMatchObject({ generated: true });
      expect(draft.overall['text']).toContain('Ein Test einbezogen');
      expect(draft.sections[0]).toMatchObject({ text: 'Mein Text.', generated: false });
    });

    it('refuses a test the analysis does not draw on', async () => {
      const { db, report } = draftDb({ stored: edited(), measurements: [reading()] });

      expect(
        await regenerateDraftText(
          db,
          TENANT,
          'rep_1',
          { kind: 'section', moduleId: 'mod_fremd' },
          LABELS,
        ),
      ).toBe(false);
      expect(report.updateMany).not.toHaveBeenCalled();
    });

    it('writes through the tenant filter', async () => {
      const { db, written } = draftDb({ stored: edited(), measurements: [reading()] });

      await regenerateDraftText(db, OTHER, 'rep_1', { kind: 'overall' }, LABELS);

      expect(written[0]?.['where']).toMatchObject({
        id: 'rep_1',
        organizationId: 'org_b',
        status: 'DRAFT',
      });
    });
  });
});
