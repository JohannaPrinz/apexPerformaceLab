import { describe, expect, it, vi } from 'vitest';

import {
  assessmentAnalysisOverview,
  assessmentEvaluation,
  createReport,
  updateDraftText,
  listReportsForAssessment,
  reportReadiness,
  setReportModuleInclusion,
} from './service';

// The curves are drawn by the assessments slice, whose barrel reaches the
// Prisma client at import time. Nothing here talks to a database — every read
// is a fake below — so the client is stubbed rather than configured.
vi.mock('@apex/database', () => ({ db: {} }));

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
const LABELS = {
  module: (key: string) => key,
  moduleStatus: (status: string) => status,
};

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
    /** Which modules hold a standing value. */
    recorded?: string[];
    /** An analysis already open for this assessment. */
    openDraft?: Record<string, unknown> | undefined;
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
    findFirst: vi.fn(
      (args: { select?: Record<string, unknown>; where?: Record<string, unknown> }) => {
        // The "is one already open" lookup, told apart by the status it filters
        // on. It answers null unless a test says an open draft exists.
        if (args.where?.['status'] === 'DRAFT' && args.select && 'title' in args.select) {
          return Promise.resolve(options.openDraft ?? null);
        }

        if (options.reportFound === false) return Promise.resolve(null);
        // The version lookup and the readiness read share one spy; they are told
        // apart by what they select.
        if (args.select && 'version' in args.select) return Promise.resolve({ version: 2 });

        return Promise.resolve({
          id: 'rep_1',
          modules: options.reportModules ?? [{ included: true, assessmentModule: moduleRow() }],
        });
      },
    ),
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
    // Which tests recorded anything. The creation rule reads this and nothing
    // else — a test with no standing value gets no inclusion row.
    groupBy: vi.fn(() =>
      Promise.resolve(
        (options.recorded ?? ['mod_1']).map((assessmentModuleId) => ({ assessmentModuleId })),
      ),
    ),
  };

  const exercise = { findMany: vi.fn(() => Promise.resolve([])) };

  const db = {
    report,
    reportModule,
    assessment,
    assessmentModule,
    measurement,
    exercise,
  } as unknown as Parameters<typeof createReport>[0];

  return {
    db,
    report,
    reportModule,
    assessment,
    assessmentModule,
    measurement,
    exercise,
    created,
    upserted,
  };
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

    return createReport(db, TENANT, 'coach_1', {
      assessmentId: 'ass_1',
      title: 'Auswertung',
    }).then(() => {
      expect(created[0]).toMatchObject({ scope: 'ASSESSMENT', assessmentId: 'ass_1' });
    });
  });

  it('starts as a draft', async () => {
    const { db, created } = reportDb();

    await createReport(db, TENANT, 'coach_1', { assessmentId: 'ass_1', title: 'A' });

    // The column default is DRAFT, so nothing here may set a status at all.
    expect(created[0]?.['status']).toBeUndefined();
  });

  it('takes the next free version', async () => {
    const { db, created } = reportDb();

    await createReport(db, TENANT, 'coach_1', { assessmentId: 'ass_1', title: 'A' });

    expect(created[0]?.['version']).toBe(3);
  });

  it('starts at version one where there is no earlier analysis', async () => {
    const { db, report, created } = reportDb();
    // Two lookups run before the write: is one already open, and what is the
    // highest version so far. Both answer nothing here.
    report.findFirst.mockImplementation(() => Promise.resolve(null));

    await createReport(db, TENANT, 'coach_1', { assessmentId: 'ass_1', title: 'A' });

    expect(created[0]?.['version']).toBe(1);
  });

  it('takes authorship from the signed-in coach, never from the request', async () => {
    const { db, created } = reportDb();

    await createReport(db, TENANT, 'coach_1', { assessmentId: 'ass_1', title: 'A' });

    expect(created[0]?.['authorCoachId']).toBe('coach_1');
  });

  it('includes only the tests that recorded something', async () => {
    // The rule that ended two rules disagreeing: a test with no standing value
    // has nothing to analyse, and writing an inclusion row for it produced a
    // selection that said "not included" beside a text that included it anyway.
    const { db, created } = reportDb({
      assessmentModules: [{ id: 'mod_1' }, { id: 'mod_2' }],
      recorded: ['mod_1'],
    });

    await createReport(db, TENANT, 'coach_1', { assessmentId: 'ass_1', title: 'Auswertung' });

    const rows = (created[0]?.['modules'] as { create: { assessmentModuleId: string }[] }).create;

    expect(rows.map((row) => row.assessmentModuleId)).toEqual(['mod_1']);
  });

  it('writes the rows rather than relying on their absence', async () => {
    // "Excluded" and "not yet decided" have to stay distinguishable.
    const { db, created } = reportDb();

    await createReport(db, TENANT, 'coach_1', { assessmentId: 'ass_1', title: 'A' });

    expect(created[0]).toHaveProperty('modules');
  });

  it('leaves an archived test out of the query entirely', async () => {
    // Archiving is the coach saying a test has left the working view. An
    // analysis created afterwards must not quietly draw on it again.
    const { db, assessment } = reportDb();

    await createReport(db, TENANT, 'coach_1', { assessmentId: 'ass_1', title: 'A' });

    const select = argsOf(assessment.findFirst).select as {
      modules: { where: Record<string, unknown> };
    };

    expect(select.modules.where).toEqual({ archivedAt: null });
  });

  it('answers with the open analysis rather than making a second one', async () => {
    // Completing an assessment asks for an analysis every time. A coach who
    // presses it twice must not end up with two drafts of one examination.
    const { db, created } = reportDb({ openDraft: { id: 'rep_open', version: 3 } });

    const report = await createReport(db, TENANT, 'coach_1', {
      assessmentId: 'ass_1',
      title: 'Auswertung',
    });

    expect(report?.id).toBe('rep_open');
    expect(created).toHaveLength(0);
  });

  it('refuses an assessment of another workspace', async () => {
    const { db, report } = reportDb({ assessmentFound: false });

    expect(
      await createReport(db, OTHER, 'coach_1', { assessmentId: 'ass_1', title: 'A' }),
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

/**
 * The analysis screen's one read.
 *
 * Two things are under test that nothing else can catch: that a result keeps the
 * coordinates which make it readable — side, exercise, stage, context — and that
 * a test with no values never reaches the analysis, neither as a selectable row
 * nor as a section of text. The second is the rule that replaced two rules
 * disagreeing with each other.
 */

const DAY = (iso: string) => new Date(`${iso}T09:00:00.000Z`);

interface Reading {
  measurementTypeId: string;
  side: string;
  exerciseId: string | null;
  passIndex: number | null;
  context: unknown;
  numericValue: { toString: () => string } | null;
  capturedAt: Date;
  source: string;
  assessmentModule: {
    id: string;
    moduleKey: string;
    payload: unknown;
    moduleVersion: number;
    /** What a curve labels its series with — read from the same rows (§16). */
    name: string | null;
    status: string;
  };
  measurementType: { name: string; unit: string; valueType: string };
}

/** The configuration the evaluation fixture's readings belong to. */
const LOAD_CONFIGURATION = {
  measurementTypes: [{ measurementTypeId: 'mt_load', role: 'required' }],
  exerciseIds: [],
  passes: 1,
  recordsSide: true,
  dimensions: [],
};

const reading = (over: Partial<Reading> = {}): Reading => ({
  measurementTypeId: 'mt_load',
  side: 'BILATERAL',
  exerciseId: null,
  passIndex: null,
  context: null,
  numericValue: { toString: () => '100' },
  capturedAt: DAY('2026-03-01'),
  source: 'MANUAL',
  assessmentModule: {
    id: 'mod_1',
    moduleKey: 'strength',
    payload: LOAD_CONFIGURATION,
    moduleVersion: 2,
    name: 'Krafttest',
    status: 'COMPLETED',
  },
  measurementType: { name: 'Last', unit: 'kg', valueType: 'NUMERIC' },
  ...over,
});

function evaluationDb(options: {
  modules?: {
    id: string;
    name: string | null;
    moduleKey: string;
    status: string;
    payload: unknown;
    moduleVersion: number;
  }[];
  reportModules?: { assessmentModuleId: string; included: boolean }[];
  readings?: Reading[];
  draft?: unknown;
  reportFound?: boolean;
  exercises?: { id: string; name: string }[];
}) {
  const modules = options.modules ?? [
    {
      id: 'mod_1',
      name: 'Krafttest',
      moduleKey: 'strength',
      status: 'COMPLETED',
      payload: LOAD_CONFIGURATION,
      moduleVersion: 2,
    },
  ];

  const db = {
    assessment: {
      findFirst: vi.fn(() =>
        Promise.resolve({
          id: 'ass_1',
          question: 'Wie steht es um die Kraft?',
          status: 'COMPLETED',
          performedAt: DAY('2026-03-01'),
          case: {
            athlete: {
              id: 'ath_1',
              firstName: 'Anna',
              lastName: 'Beispiel',
              // All four selected, all four optional in the record — the
              // fixture keeps them absent, which is the commoner case and the
              // one the BMI, the age and the strength standards must survive.
              heightCm: null,
              weightKg: null,
              dateOfBirth: null,
              sex: 'not_specified',
            },
          },
          modules,
        }),
      ),
    },
    report: {
      findFirst: vi.fn(() =>
        Promise.resolve(
          options.reportFound === false
            ? null
            : {
                id: 'rep_1',
                title: 'Auswertung',
                version: 1,
                draft: options.draft ?? null,
                authorCoach: { displayName: 'Johanna Prinz', user: { name: 'Johanna' } },
                modules:
                  options.reportModules ??
                  modules.map((entry) => ({ assessmentModuleId: entry.id, included: true })),
              },
        ),
      ),
      updateMany: vi.fn(() => Promise.resolve({ count: 1 })),
    },
    /**
     * Three reads, started together: this athlete's readings, and the cohort as
     * its tests and its grouped extremes. The cohort is answered empty — it is
     * its own question, with its own tests below, and these are about the first.
     */
    measurement: {
      findMany: vi.fn(() => Promise.resolve(options.readings ?? [])),
      groupBy: vi.fn(() => Promise.resolve([])),
    },
    assessmentModule: { findMany: vi.fn(() => Promise.resolve([])) },
    exercise: { findMany: vi.fn(() => Promise.resolve(options.exercises ?? [])) },
  } as unknown as Parameters<typeof assessmentEvaluation>[0];

  return db;
}

describe('the analysis screen read', () => {
  it('offers to start one where none exists', async () => {
    const found = await assessmentEvaluation(
      evaluationDb({ reportFound: false }),
      TENANT,
      'ass_1',
      LABELS,
    );

    expect(found).toBeNull();
  });

  it('keeps the exercise, so two lifts never collapse into one row', async () => {
    // The failure this rule exists for: a strength test over two movements read
    // back as "Last: 60 bis 120 kg", with nothing saying which was which.
    const found = await assessmentEvaluation(
      evaluationDb({
        exercises: [
          { id: 'ex_squat', name: 'Kniebeuge' },
          { id: 'ex_bench', name: 'Bankdrücken' },
        ],
        readings: [
          reading({ exerciseId: 'ex_squat', numericValue: { toString: () => '120' } }),
          reading({ exerciseId: 'ex_bench', numericValue: { toString: () => '60' } }),
        ],
      }),
      TENANT,
      'ass_1',
      LABELS,
    );

    const series = found?.modules[0]?.series ?? [];

    expect(series).toHaveLength(2);
    expect(series.map((entry) => entry.exerciseName).sort()).toEqual(['Bankdrücken', 'Kniebeuge']);
    expect(series.map((entry) => entry.current.value).sort((a, b) => a - b)).toEqual([60, 120]);
  });

  it('keeps the side, so a left and a right value stay two results', async () => {
    const found = await assessmentEvaluation(
      evaluationDb({
        readings: [
          reading({ side: 'LEFT', numericValue: { toString: () => '38' } }),
          reading({ side: 'RIGHT', numericValue: { toString: () => '45' } }),
        ],
      }),
      TENANT,
      'ass_1',
      LABELS,
    );

    expect(found?.modules[0]?.series.map((entry) => entry.side).sort()).toEqual(['LEFT', 'RIGHT']);
  });

  it('keeps the stage and the context dimensions', async () => {
    const found = await assessmentEvaluation(
      evaluationDb({
        readings: [
          reading({ passIndex: 1, context: { joint: 'Knie' } }),
          reading({ passIndex: 2, context: { joint: 'Knie' } }),
          reading({ passIndex: 1, context: { joint: 'Hüfte' } }),
        ],
      }),
      TENANT,
      'ass_1',
      LABELS,
    );

    // Three coordinates, three results — a stage and a joint are not the same
    // measurement however equal the numbers are.
    expect(found?.modules[0]?.series).toHaveLength(3);
    expect(found?.modules[0]?.series[0]?.context).toEqual({ joint: 'Knie' });
  });

  it('carries the unit, the source and the moment through', async () => {
    const found = await assessmentEvaluation(
      evaluationDb({ readings: [reading({ source: 'DERIVED' })] }),
      TENANT,
      'ass_1',
      LABELS,
    );

    const row = found?.modules[0]?.series[0];

    expect(row?.typeName).toBe('Last');
    expect(row?.unit).toBe('kg');
    expect(row?.source).toBe('DERIVED');
    expect(row?.current.capturedAt).toEqual(DAY('2026-03-01'));
  });

  it('compares a series with its own earlier reading', async () => {
    const found = await assessmentEvaluation(
      evaluationDb({
        readings: [
          reading({
            assessmentModule: {
              id: 'mod_old',
              moduleKey: 'strength',
              payload: LOAD_CONFIGURATION,
              moduleVersion: 2,
              name: 'Krafttest',
              status: 'COMPLETED',
            },
            capturedAt: DAY('2026-01-10'),
            numericValue: { toString: () => '92.5' },
          }),
          reading({ numericValue: { toString: () => '100' } }),
        ],
      }),
      TENANT,
      'ass_1',
      LABELS,
    );

    const row = found?.modules[0]?.series[0];

    expect(row?.previous?.value).toBe(92.5);
    expect(row?.previous?.capturedAt).toEqual(DAY('2026-01-10'));
    expect(row?.difference).toBe(7.5);
  });

  it('says nothing about a best value without a declared direction', async () => {
    const found = await assessmentEvaluation(
      evaluationDb({ readings: [reading()] }),
      TENANT,
      'ass_1',
      LABELS,
    );

    expect(found?.modules[0]?.series[0]?.best).toBeNull();
  });

  it('blocks a test with no values, and never lets it into the analysis', async () => {
    const found = await assessmentEvaluation(
      evaluationDb({
        modules: [
          {
            id: 'mod_1',
            name: 'Krafttest',
            moduleKey: 'strength',
            status: 'COMPLETED',
            payload: LOAD_CONFIGURATION,
            moduleVersion: 2,
          },
          {
            id: 'mod_2',
            name: 'Nie erfasst',
            moduleKey: 'strength',
            status: 'SKIPPED',
            payload: LOAD_CONFIGURATION,
            moduleVersion: 2,
          },
        ],
        // Both carry an inclusion row, as an older analysis would have written.
        reportModules: [
          { assessmentModuleId: 'mod_1', included: true },
          { assessmentModuleId: 'mod_2', included: true },
        ],
        readings: [reading()],
      }),
      TENANT,
      'ass_1',
      LABELS,
    );

    const empty = found?.modules.find((entry) => entry.moduleId === 'mod_2');

    // One rule, read in one place: blocked, therefore not included, therefore no
    // section of its own. The state this replaced showed it unticked and
    // disabled while a paragraph for it stood in the text below.
    expect(empty?.blocked).toBe('NO_VALUES');
    expect(empty?.included).toBe(false);
    expect(empty?.series).toEqual([]);
    expect(found?.summary.usable).toBe(1);
    expect(found?.summary.included).toBe(1);
  });

  it('states the fill state once, as three numbers', async () => {
    const found = await assessmentEvaluation(
      evaluationDb({ readings: [reading(), reading({ side: 'LEFT' })] }),
      TENANT,
      'ass_1',
      LABELS,
    );

    expect(found?.summary).toEqual({ tests: 1, usable: 1, included: 1, values: 2 });
  });

  it("hands over the coach's texts and writes none of its own", async () => {
    const found = await assessmentEvaluation(
      evaluationDb({
        readings: [reading()],
        draft: {
          version: 2,
          overall: { interpretation: 'Gesamtbild stabil.', recommendation: 'Weiter so.' },
          sections: [{ moduleId: 'mod_1', interpretation: 'Kraft gehalten.', recommendation: '' }],
        },
      }),
      TENANT,
      'ass_1',
      LABELS,
    );

    expect(found?.overall.interpretation).toBe('Gesamtbild stabil.');
    expect(found?.modules[0]?.interpretation).toBe('Kraft gehalten.');
    // Nothing was generated into the empty one.
    expect(found?.modules[0]?.recommendation).toBe('');
  });

  it('reads a version 1 draft without losing what the coach wrote', async () => {
    const found = await assessmentEvaluation(
      evaluationDb({
        readings: [reading()],
        draft: {
          version: 1,
          overall: { text: 'Alter Text', generated: false, basis: 'erzeugt' },
          sections: [{ moduleId: 'mod_1', text: 'Alter Abschnitt', generated: false, basis: 'x' }],
        },
      }),
      TENANT,
      'ass_1',
      LABELS,
    );

    expect(found?.overall.interpretation).toBe('Alter Text');
    expect(found?.modules[0]?.interpretation).toBe('Alter Abschnitt');
  });

  it('never leaves the workspace', async () => {
    const db = evaluationDb({ readings: [reading()] });
    await assessmentEvaluation(db, OTHER, 'ass_1', LABELS);

    for (const spy of [
      (db as unknown as { assessment: { findFirst: { mock: { calls: unknown[][] } } } }).assessment
        .findFirst,
      (db as unknown as { report: { findFirst: { mock: { calls: unknown[][] } } } }).report
        .findFirst,
      (db as unknown as { measurement: { findMany: { mock: { calls: unknown[][] } } } }).measurement
        .findMany,
      (db as unknown as { measurement: { groupBy: { mock: { calls: unknown[][] } } } }).measurement
        .groupBy,
      (db as unknown as { assessmentModule: { findMany: { mock: { calls: unknown[][] } } } })
        .assessmentModule.findMany,
    ]) {
      const where = (spy.mock.calls[0]?.[0] as { where?: Record<string, unknown> } | undefined)
        ?.where;

      expect(where?.['organizationId']).toBe('org_b');
    }
  });
});

describe('storing what the coach wrote', () => {
  it('writes only the addressed text', async () => {
    const db = evaluationDb({
      draft: {
        version: 2,
        overall: { interpretation: 'A', recommendation: 'B' },
        sections: [{ moduleId: 'mod_1', interpretation: 'C', recommendation: 'D' }],
      },
    });

    await updateDraftText(
      db,
      TENANT,
      'rep_1',
      { kind: 'section', moduleId: 'mod_1' },
      'recommendation',
      'neu',
    );

    const written = (
      (db as unknown as { report: { updateMany: { mock: { calls: unknown[][] } } } }).report
        .updateMany.mock.calls[0]?.[0] as {
        data?: { draft?: { sections?: unknown[]; overall?: unknown } };
      }
    ).data?.draft;

    expect(written?.overall).toEqual({ interpretation: 'A', recommendation: 'B' });
    expect(written?.sections).toEqual([
      { moduleId: 'mod_1', interpretation: 'C', recommendation: 'neu', stills: [] },
    ]);
  });

  it('refuses an analysis of another workspace', async () => {
    const db = evaluationDb({ reportFound: false });

    expect(
      await updateDraftText(db, TENANT, 'rep_1', { kind: 'overall' }, 'interpretation', 'x'),
    ).toBe(false);
  });

  it('reaches only a draft, because a published analysis is immutable', async () => {
    const db = evaluationDb({});
    await updateDraftText(db, TENANT, 'rep_1', { kind: 'overall' }, 'interpretation', 'x');

    const where = (
      (db as unknown as { report: { findFirst: { mock: { calls: unknown[][] } } } }).report
        .findFirst.mock.calls[0]?.[0] as { where?: Record<string, unknown> }
    ).where;

    expect(where?.['status']).toBe('DRAFT');
  });
});

/**
 * Which reads wait for which.
 *
 * The analysis screen was the slowest in the app because its reads ran in a
 * line: the examination, then its draft, then the readings, then the cohort —
 * each waiting out a full round trip for an answer it did not use. What is
 * asserted here is the **shape of the waiting**, not a duration: two reads that
 * need nothing from each other must both have started before either has
 * finished, and a read that genuinely depends on another must start after it.
 *
 * A test about timing has to be able to see time, so every read here resolves
 * on a later tick and records when it started and finished.
 */
function recordingDb(events: string[]) {
  const read =
    <T>(name: string, value: T) =>
    () => {
      events.push(`${name}:start`);

      return new Promise<T>((resolve) => {
        setTimeout(() => {
          events.push(`${name}:end`);
          resolve(value);
        }, 5);
      });
    };

  const modules = [
    {
      id: 'mod_1',
      name: 'Laufen',
      moduleKey: 'lactate',
      status: 'COMPLETED',
      payload: null,
      moduleVersion: 1,
    },
  ];

  return {
    assessment: {
      findFirst: vi.fn(
        read('assessment', {
          id: 'ass_1',
          question: 'Warum?',
          status: 'COMPLETED',
          performedAt: new Date('2026-05-05T00:00:00.000Z'),
          case: {
            athlete: {
              id: 'ath_1',
              firstName: 'Mara',
              lastName: 'Berg',
              heightCm: null,
              weightKg: null,
              dateOfBirth: null,
              sex: 'not_specified',
            },
          },
          modules,
        }),
      ),
    },
    report: {
      findFirst: vi.fn(
        read('draft', {
          id: 'rep_1',
          title: 'Auswertung',
          version: 1,
          draft: null,
          authorCoach: { displayName: 'Johanna', user: { name: 'Johanna' } },
          modules: [{ assessmentModuleId: 'mod_1', included: true }],
        }),
      ),
    },
    assessmentModule: { findMany: vi.fn(read('cohortTests', [])) },
    measurement: {
      groupBy: vi.fn(read('cohort', [])),
      findMany: vi.fn(() => {
        // One reading with an exercise on it, so the exercise read — the one
        // that genuinely depends on this answer — actually happens.
        return read('readings', [
          {
            measurementTypeId: 'mt_1',
            side: 'BILATERAL',
            exerciseId: 'ex_1',
            passIndex: null,
            context: null,
            numericValue: { toString: () => '4' },
            capturedAt: new Date('2026-05-05T00:00:00.000Z'),
            source: 'MANUAL',
            assessmentModule: {
              id: 'mod_1',
              moduleKey: 'lactate',
              payload: null,
              moduleVersion: 1,
            },
            measurementType: { key: 'lactate', name: 'Laktat', unit: 'mmol/l' },
          },
        ])();
      }),
    },
    exercise: { findMany: vi.fn(read('exercises', [])) },
  } as unknown as Parameters<typeof assessmentEvaluation>[0];
}

describe('what the analysis read waits for', () => {
  it('asks for the examination and its draft in the same wave', async () => {
    const events: string[] = [];

    await assessmentEvaluation(recordingDb(events), TENANT, 'ass_1', LABELS);

    // Both started before either came back — one round trip, not two.
    expect(events.indexOf('draft:start')).toBeLessThan(events.indexOf('assessment:end'));
    expect(events.indexOf('assessment:start')).toBeLessThan(events.indexOf('draft:end'));
  });

  it('asks for the readings and the cohort in the same wave', async () => {
    const events: string[] = [];

    await assessmentEvaluation(recordingDb(events), TENANT, 'ass_1', LABELS);

    // All three: this athlete's readings, the cohort's tests and its extremes.
    for (const [a, b] of [
      ['readings', 'cohort'],
      ['readings', 'cohortTests'],
      ['cohort', 'cohortTests'],
    ] as const) {
      expect(events.indexOf(`${a}:start`)).toBeLessThan(events.indexOf(`${b}:end`));
      expect(events.indexOf(`${b}:start`)).toBeLessThan(events.indexOf(`${a}:end`));
    }
  });

  it('still waits where a read genuinely depends on another', async () => {
    const events: string[] = [];

    await assessmentEvaluation(recordingDb(events), TENANT, 'ass_1', LABELS);

    // The readings name the tests to compare; the exercises are named by the
    // readings. Neither may start early, and this is what keeps the
    // parallelisation honest rather than merely fast.
    expect(events.indexOf('readings:start')).toBeGreaterThan(events.indexOf('assessment:end'));
    expect(events.indexOf('exercises:start')).toBeGreaterThan(events.indexOf('readings:end'));
  });

  it('reads nothing further when there is no examination', async () => {
    const events: string[] = [];
    const db = recordingDb(events) as unknown as {
      assessment: { findFirst: () => Promise<unknown> };
    };
    db.assessment.findFirst = () => Promise.resolve(null);

    expect(
      await assessmentEvaluation(
        db as unknown as Parameters<typeof assessmentEvaluation>[0],
        TENANT,
        'ass_1',
        LABELS,
      ),
    ).toBeNull();
    // The draft may have been asked for alongside it — that is the point of the
    // wave — but nothing beyond it was.
    expect(events.filter((entry) => entry.startsWith('readings'))).toEqual([]);
    // `cohort` and `cohortTests` alike.
    expect(events.filter((entry) => entry.startsWith('cohort'))).toEqual([]);
  });
});

/**
 * The curves, drawn from the readings the screen already has.
 *
 * The analysis reads every standing reading of every test type this assessment
 * covers, for this athlete, before it can fill the comparison table. The curves
 * are drawn from that same set — same tenant scope, same supersede and archive
 * rules, same athlete — so they were being read a second time: six more round
 * trips that could not start until this read had finished.
 *
 * What is asserted here is that they now cost **no read at all**, and that the
 * count does not move with the number of tests. The equivalence of the curves
 * themselves is pinned in `assessments/measurements/server/service.test.ts`,
 * where the two routes can be run against the same rows.
 */
describe('where the analysis screen gets its curves', () => {
  const eight = Array.from({ length: 8 }, (_, index) => ({
    id: `mod_${String(index + 1)}`,
    name: `Test ${String(index + 1)}`,
    moduleKey: `key_${String(index + 1)}`,
    status: 'COMPLETED',
    payload: LOAD_CONFIGURATION,
    moduleVersion: 2,
  }));

  /** Two stages of one test, which is the least that makes a curve. */
  const stages = (moduleId: string, moduleKey: string, from = 100) =>
    [1, 2].map((passIndex) =>
      reading({
        passIndex,
        numericValue: { toString: () => String(from + passIndex) },
        assessmentModule: {
          id: moduleId,
          moduleKey,
          payload: LOAD_CONFIGURATION,
          moduleVersion: 2,
          name: `Test ${moduleId}`,
          status: 'COMPLETED',
        },
      }),
    );

  /** Every read the fake answered, whatever it was asked about. */
  const reads = (db: Parameters<typeof assessmentEvaluation>[0]) => {
    const fake = db as unknown as {
      assessment: { findFirst: { mock: { calls: unknown[] } } };
      report: { findFirst: { mock: { calls: unknown[] } } };
      measurement: {
        findMany: { mock: { calls: unknown[] } };
        groupBy: { mock: { calls: unknown[] } };
      };
      assessmentModule: { findMany: { mock: { calls: unknown[] } } };
      exercise: { findMany: { mock: { calls: unknown[] } } };
    };

    return (
      fake.assessment.findFirst.mock.calls.length +
      fake.report.findFirst.mock.calls.length +
      fake.measurement.findMany.mock.calls.length +
      fake.measurement.groupBy.mock.calls.length +
      fake.assessmentModule.findMany.mock.calls.length +
      fake.exercise.findMany.mock.calls.length
    );
  };

  it('draws the one test an analysis includes', async () => {
    const db = evaluationDb({ readings: stages('mod_1', 'strength') });

    const found = await assessmentEvaluation(db, TENANT, 'ass_1', LABELS);

    expect([...(found?.curves.keys() ?? [])]).toEqual(['mod_1']);
    expect(found?.curves.get('mod_1')?.[0]?.series.map((line) => line.moduleId)).toEqual(['mod_1']);
  });

  it('costs the same reads for eight tests as for one', async () => {
    const one = evaluationDb({
      modules: eight.slice(0, 1),
      readings: stages('mod_1', 'key_1'),
    });
    const all = evaluationDb({
      modules: eight,
      readings: eight.flatMap((entry) => stages(entry.id, entry.moduleKey)),
    });

    await assessmentEvaluation(one, TENANT, 'ass_1', LABELS);
    await assessmentEvaluation(all, TENANT, 'ass_1', LABELS);

    // The curve read used to be six queries per included test, behind this one.
    expect(reads(all)).toBe(reads(one));
  });

  it('asks for no measurement beyond the ones it already made', async () => {
    // This athlete's readings and the cohort's extremes. A second row read
    // would be the old curve read coming back.
    const db = evaluationDb({
      modules: eight,
      readings: eight.flatMap((entry) => stages(entry.id, entry.moduleKey)),
    });

    await assessmentEvaluation(db, TENANT, 'ass_1', LABELS);

    const fake = db as unknown as {
      measurement: {
        findMany: { mock: { calls: unknown[] } };
        groupBy: { mock: { calls: unknown[] } };
      };
    };

    expect(fake.measurement.findMany.mock.calls).toHaveLength(1);
    expect(fake.measurement.groupBy.mock.calls).toHaveLength(1);
  });

  it('gives each test only its own readings', async () => {
    const db = evaluationDb({
      modules: eight,
      readings: eight.flatMap((entry, index) => stages(entry.id, entry.moduleKey, index * 100)),
    });

    const found = await assessmentEvaluation(db, TENANT, 'ass_1', LABELS);

    expect(
      eight.map((entry) =>
        found?.curves
          .get(entry.id)
          ?.flatMap((group) => group.series.flatMap((line) => line.points.map((point) => point.y))),
      ),
    ).toEqual(eight.map((_entry, index) => [index * 100 + 1, index * 100 + 2]));
  });

  it('keeps two quantities of one test on their own axes', async () => {
    const db = evaluationDb({
      readings: [
        ...stages('mod_1', 'strength'),
        ...stages('mod_1', 'strength').map((row) => ({
          ...row,
          measurementTypeId: 'mt_pace',
          measurementType: { name: 'Pace', unit: 'km/h', valueType: 'NUMERIC' },
        })),
      ],
    });

    const found = await assessmentEvaluation(db, TENANT, 'ass_1', LABELS);

    expect(found?.curves.get('mod_1')?.map((group) => [group.typeName, group.unit])).toEqual([
      ['Last', 'kg'],
      ['Pace', 'km/h'],
    ]);
  });

  it('draws nothing for a test the analysis leaves out', async () => {
    const db = evaluationDb({
      modules: eight.slice(0, 2),
      reportModules: [
        { assessmentModuleId: 'mod_1', included: true },
        { assessmentModuleId: 'mod_2', included: false },
      ],
      readings: [...stages('mod_1', 'key_1'), ...stages('mod_2', 'key_2')],
    });

    const found = await assessmentEvaluation(db, TENANT, 'ass_1', LABELS);

    expect([...(found?.curves.keys() ?? [])]).toEqual(['mod_1']);
    expect(found?.curves.get('mod_2')).toBeUndefined();
  });

  it('draws nothing where the analysis includes no test at all', async () => {
    const db = evaluationDb({
      reportModules: [],
      readings: stages('mod_1', 'strength'),
    });

    const found = await assessmentEvaluation(db, TENANT, 'ass_1', LABELS);

    expect(found?.curves.size).toBe(0);
  });

  it('ignores an inclusion naming a test this assessment does not have', async () => {
    // The included ids come from the report, and the report may name a test
    // that has since been archived out of the assessment.
    const db = evaluationDb({
      reportModules: [
        { assessmentModuleId: 'mod_1', included: true },
        { assessmentModuleId: 'mod_weg', included: true },
      ],
      readings: stages('mod_1', 'strength'),
    });

    const found = await assessmentEvaluation(db, TENANT, 'ass_1', LABELS);

    expect([...(found?.curves.keys() ?? [])]).toEqual(['mod_1']);
  });

  it('keeps the curves off the tests themselves', async () => {
    // `composeSnapshot` falls back to a test's own `charts`, and a draft PDF
    // has never carried curves. Putting them there would change what a coach
    // gets on paper without anybody asking for it.
    const db = evaluationDb({ readings: stages('mod_1', 'strength') });

    const found = await assessmentEvaluation(db, TENANT, 'ass_1', LABELS);

    expect(found?.modules.every((entry) => entry.charts.length === 0)).toBe(true);
    expect((found?.curves.get('mod_1') ?? []).length).toBeGreaterThan(0);
  });
});
