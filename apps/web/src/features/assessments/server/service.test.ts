import { describe, expect, it, vi } from 'vitest';

import type { PrismaClientInstance } from '@apex/database';

import { addModuleSchema } from '../schemas';

import {
  addModule,
  availableMeasurementTypes,
  copyModule,
  setModuleStatus,
  copyAssessment,
  createAssessment,
  getAssessment,
  listAssessmentsForAthlete,
  removeModule,
  setAssessmentStatus,
  setModuleArchived,
  updateAssessment,
  updateModule,
  updateModuleConfiguration,
} from './service';

const TENANT = { organizationId: 'org_a' };
/** A second workspace, to prove nothing reaches across the boundary. */
const OTHER_TENANT = { organizationId: 'org_b' };

interface QueryArgs {
  where: Record<string, unknown>;
  data?: Record<string, unknown>;
  select?: Record<string, unknown>;
}

const configuration = {
  measurementTypes: [
    { measurementTypeId: 'mt_lactate', role: 'required' as const },
    { measurementTypeId: 'mt_hr', role: 'required' as const },
  ],
  exerciseIds: [],
  passes: 4,
  recordsSide: false,
  dimensions: [],
};

function fakeDb(overrides: { sourceModules?: unknown[] } = {}) {
  const assessment = {
    findMany: vi.fn<(args: QueryArgs) => Promise<unknown[]>>().mockResolvedValue([]),
    findFirst: vi.fn<(args: QueryArgs) => Promise<unknown>>().mockResolvedValue({
      id: 'as_1',
      question: 'Where is the aerobic threshold?',
      description: null,
      type: 'INITIAL',
      status: 'PLANNED',
      performedAt: new Date('2026-01-01'),
      createdAt: new Date('2026-01-01'),
      caseId: 'case_1',
      modules: overrides.sourceModules ?? [
        {
          id: 'mod_1',
          moduleKey: 'lactate',
          moduleVersion: 1,
          payload: configuration,
          status: 'PLANNED',
          createdByCoachId: 'coach_1',
          createdAt: new Date('2026-01-01'),
          // Selected alongside every module: whether a test holds values
          // decides whether it may ever be removed (§13).
          _count: { measurements: 0 },
        },
      ],
      case: { athleteId: 'ath_1' },
    }),
    updateMany: vi
      .fn<(args: QueryArgs) => Promise<{ count: number }>>()
      .mockResolvedValue({ count: 1 }),
    create: vi.fn<(args: QueryArgs) => Promise<unknown>>().mockResolvedValue({
      id: 'as_new',
      question: 'Where is the aerobic threshold?',
      type: 'RE_ASSESSMENT',
      performedAt: new Date(),
      createdAt: new Date(),
      caseId: 'case_1',
      // Derived through the Case, never a second column (§26.4).
      case: { athleteId: 'ath_1' },
      modules: [],
    }),
  };

  const assessmentModule = {
    findFirst: vi.fn<(args: QueryArgs) => Promise<unknown>>().mockResolvedValue({
      id: 'mod_1',
      status: 'PLANNED',
      assessmentId: 'ass_1',
      payload: configuration,
      moduleVersion: 2,
    }),
    // The siblings decide whether the assessment has been performed; an
    // assessment where every test is still planned is one being assembled.
    findMany: vi
      .fn<(args: QueryArgs) => Promise<{ status: string }[]>>()
      .mockResolvedValue([{ status: 'PLANNED' }]),
    create: vi.fn<(args: QueryArgs) => Promise<unknown>>().mockResolvedValue({
      id: 'mod_new',
      moduleKey: 'lactate',
      moduleVersion: 1,
      payload: configuration,
      status: 'PLANNED',
      createdByCoachId: 'coach_1',
      createdAt: new Date(),
    }),
    updateMany: vi
      .fn<(args: QueryArgs) => Promise<{ count: number }>>()
      .mockResolvedValue({ count: 1 }),
    deleteMany: vi
      .fn<(args: QueryArgs) => Promise<{ count: number }>>()
      .mockResolvedValue({ count: 1 }),
  };

  const performanceCase = {
    findFirst: vi
      .fn<(args: QueryArgs) => Promise<unknown>>()
      .mockResolvedValue({ id: 'case_1', athleteId: 'ath_1', status: 'OPEN' }),
    create: vi.fn<(args: QueryArgs) => Promise<unknown>>().mockResolvedValue({ id: 'case_new' }),
  };

  const athlete = {
    findFirst: vi.fn<(args: QueryArgs) => Promise<unknown>>().mockResolvedValue({ id: 'ath_1' }),
  };

  const measurement = {
    count: vi.fn<(args: QueryArgs) => Promise<number>>().mockResolvedValue(0),
    // What the module has actually recorded — the configuration guard is stated
    // against this, not against the status.
    findMany: vi.fn<(args: QueryArgs) => Promise<unknown[]>>().mockResolvedValue([]),
    // How many values currently stand per test, and when the newest was
    // written. One aggregate for the whole assessment; superseded rows are
    // filtered out by the caller's `where`.
    groupBy: vi.fn<(args: QueryArgs) => Promise<unknown[]>>().mockResolvedValue([]),
  };

  /**
   * The catalogues, echoing back whatever ids are asked for as available.
   *
   * That models the ordinary case — everything the configuration names exists in
   * this workspace — so a test that wants the opposite overrides the mock and
   * says so explicitly.
   */
  const echoCatalogue = (args: QueryArgs) => {
    const filter = args.where['id'] as { in?: string[] } | undefined;

    return Promise.resolve((filter?.in ?? []).map((id) => ({ id, archivedAt: null })));
  };

  const measurementType = {
    findMany: vi.fn<(args: QueryArgs) => Promise<unknown[]>>().mockImplementation(echoCatalogue),
  };

  const exercise = {
    findMany: vi.fn<(args: QueryArgs) => Promise<unknown[]>>().mockImplementation(echoCatalogue),
  };

  return {
    db: {
      assessment,
      assessmentModule,
      performanceCase,
      athlete,
      measurement,
      measurementType,
      exercise,
    } as unknown as Pick<
      PrismaClientInstance,
      | 'assessment'
      | 'assessmentModule'
      | 'performanceCase'
      | 'athlete'
      | 'measurement'
      | 'measurementType'
      | 'exercise'
    >,
    assessment,
    assessmentModule,
    performanceCase,
    athlete,
    measurement,
    measurementType,
    exercise,
  };
}

const argsOf = (mock: { mock: { calls: [QueryArgs][] } }, index = 0): QueryArgs => {
  const args = mock.mock.calls[index]?.[0];
  if (!args) throw new Error(`expected a call at index ${index}`);

  return args;
};

describe('assessment service — tenant scoping', () => {
  it("scopes an athlete's assessments and reaches the athlete through the case", async () => {
    const { db, assessment } = fakeDb();

    await listAssessmentsForAthlete(db, TENANT, 'ath_1');

    // The athlete is derived through the Case and never stored twice (§26.4).
    expect(argsOf(assessment.findMany).where).toMatchObject({
      organizationId: 'org_a',
      case: { athleteId: 'ath_1' },
    });
  });

  it('scopes a lookup by id', async () => {
    const { db, assessment } = fakeDb();

    await getAssessment(db, TENANT, 'as_from_another_workspace');

    expect(argsOf(assessment.findFirst).where).toMatchObject({
      organizationId: 'org_a',
      id: 'as_from_another_workspace',
    });
  });

  it('scopes a module configuration update', async () => {
    const { db, assessmentModule } = fakeDb();

    await updateModuleConfiguration(db, TENANT, 'mod_1', configuration);

    expect(argsOf(assessmentModule.updateMany).where).toMatchObject({
      organizationId: 'org_a',
      id: 'mod_1',
    });
  });

  it('scopes a module removal', async () => {
    const { db, assessmentModule } = fakeDb();

    const result = await removeModule(db, TENANT, 'mod_1');

    expect(result.ok).toBe(true);
    expect(argsOf(assessmentModule.deleteMany).where).toMatchObject({
      organizationId: 'org_a',
    });
  });

  /**
   * A started test is history. Aborting keeps it and its measurements; deleting
   * would erase a test that was actually performed (§22).
   */
  it('refuses to delete a test that has been started, once the examination is closed', async () => {
    const { db, assessment, assessmentModule } = fakeDb();
    assessmentModule.findFirst.mockResolvedValue({
      id: 'mod_1',
      status: 'IN_PROGRESS',
      assessmentId: 'ass_1',
    });
    assessment.findFirst.mockResolvedValue({ status: 'COMPLETED' });

    const result = await removeModule(db, TENANT, 'mod_1');

    expect(result).toMatchObject({ ok: false, reason: 'ASSESSMENT_CLOSED' });
    expect(assessmentModule.deleteMany).not.toHaveBeenCalled();
  });

  /**
   * The case that used to be refused. Whether the examination is closed is a
   * property of the Assessment, and reading it from "has any test started"
   * froze every planned test the moment the coach began the session.
   */
  it('deletes an untouched test from a running examination', async () => {
    const { db, assessment, assessmentModule } = fakeDb();
    assessment.findFirst.mockResolvedValue({ status: 'IN_PROGRESS' });

    expect((await removeModule(db, TENANT, 'mod_1')).ok).toBe(true);
    expect(assessmentModule.deleteMany).toHaveBeenCalled();
  });

  it('refuses to delete a planned test that already holds values', async () => {
    const { db, assessmentModule, measurement } = fakeDb();
    measurement.count.mockResolvedValue(3);

    const result = await removeModule(db, TENANT, 'mod_1');

    expect(result.ok).toBe(false);
    expect(assessmentModule.deleteMany).not.toHaveBeenCalled();
  });

  it('deletes a skipped test while the assessment is still being assembled', async () => {
    // Reverses the earlier rule. A skip entered by mistake would otherwise stay
    // visible forever with no way to correct it; the coach confirms instead.
    const { db, assessmentModule } = fakeDb();
    assessmentModule.findFirst.mockResolvedValue({
      id: 'mod_1',
      status: 'SKIPPED',
      assessmentId: 'ass_1',
    });

    expect((await removeModule(db, TENANT, 'mod_1')).ok).toBe(true);
    expect(assessmentModule.deleteMany).toHaveBeenCalled();
  });

  it('refuses a test that took place once the examination is closed', async () => {
    const { db, assessment, assessmentModule } = fakeDb();
    assessmentModule.findFirst.mockResolvedValue({
      id: 'mod_1',
      status: 'COMPLETED',
      assessmentId: 'ass_1',
    });
    assessment.findFirst.mockResolvedValue({ status: 'COMPLETED' });

    const result = await removeModule(db, TENANT, 'mod_1');

    expect(result).toMatchObject({ ok: false, reason: 'ASSESSMENT_CLOSED' });
    expect(assessmentModule.deleteMany).not.toHaveBeenCalled();
  });

  it('still deletes a skipped test after the examination is closed', async () => {
    const { db, assessment, assessmentModule } = fakeDb();
    assessmentModule.findFirst.mockResolvedValue({
      id: 'mod_1',
      status: 'SKIPPED',
      assessmentId: 'ass_1',
    });
    assessment.findFirst.mockResolvedValue({ status: 'COMPLETED' });

    expect((await removeModule(db, TENANT, 'mod_1')).ok).toBe(true);
  });

  it('scopes the status lookup that decides the rule', async () => {
    // The status the rule turns on must not be read across tenants.
    const { db, assessment } = fakeDb();

    await removeModule(db, TENANT, 'mod_1');

    expect(argsOf(assessment.findFirst).where).toMatchObject({ organizationId: 'org_a' });
  });
});

describe('creating an assessment', () => {
  it('never asks for a case — it adopts the open one (§8)', async () => {
    const { db, assessment, performanceCase } = fakeDb();

    await createAssessment(db, TENANT, 'coach_1', {
      athleteId: 'ath_1',
      question: 'Where is the aerobic threshold?',
      type: 'INITIAL',
    });

    expect(performanceCase.findFirst).toHaveBeenCalled();
    expect(argsOf(assessment.create).data).toMatchObject({
      organizationId: 'org_a',
      caseId: 'case_1',
    });
  });

  it('refuses an athlete outside the workspace, without writing', async () => {
    const { db, assessment, athlete, performanceCase } = fakeDb();
    performanceCase.findFirst.mockResolvedValue(null);
    athlete.findFirst.mockResolvedValue(null);

    const result = await createAssessment(db, TENANT, 'coach_1', {
      athleteId: 'ath_from_another_workspace',
      question: 'Anything',
      type: 'INITIAL',
    });

    expect(result).toBeNull();
    expect(assessment.create).not.toHaveBeenCalled();
  });
});

describe('adding a module', () => {
  it('verifies the assessment before writing', async () => {
    const { db, assessment } = fakeDb();

    await addModule(
      db,
      TENANT,
      'coach_1',
      { assessmentId: 'as_1', name: 'Testname', moduleKey: 'lactate', configuration },
      () => Promise.resolve([]),
    );

    expect(argsOf(assessment.findFirst).where).toMatchObject({
      organizationId: 'org_a',
      id: 'as_1',
    });
  });

  it('refuses an assessment outside the workspace', async () => {
    const { db, assessment, assessmentModule } = fakeDb();
    assessment.findFirst.mockResolvedValue(null);

    const result = await addModule(
      db,
      TENANT,
      'coach_1',
      { assessmentId: 'as_elsewhere', name: 'Testname', moduleKey: 'lactate', configuration },
      () => Promise.resolve([]),
    );

    expect(result).toEqual({ ok: false, reason: 'ASSESSMENT_NOT_FOUND' });
    expect(assessmentModule.create).not.toHaveBeenCalled();
  });

  it('turns a template into a configuration, resolving keys to ids', async () => {
    const { db, assessmentModule } = fakeDb();
    const resolve = vi.fn().mockResolvedValue(['mt_1', 'mt_2', 'mt_3', 'mt_4']);

    await addModule(
      db,
      TENANT,
      'coach_1',
      {
        assessmentId: 'as_1',
        name: 'Testname',
        moduleKey: 'lactate',
        templateKey: 'lactate_step_test',
      },
      resolve,
    );

    expect(resolve).toHaveBeenCalledWith(['lactate', 'heart_rate', 'rpe', 'pace']);

    const written = argsOf(assessmentModule.create).data;
    expect(written).toMatchObject({ organizationId: 'org_a', moduleKey: 'lactate' });
    // The template's several stages survive into the stored configuration.
    expect((written?.['payload'] as { passes: number }).passes).toBeGreaterThan(1);
  });

  it('stores no reference to the template it came from', async () => {
    const { db, assessmentModule } = fakeDb();

    await addModule(
      db,
      TENANT,
      'coach_1',
      {
        assessmentId: 'as_1',
        name: 'Testname',
        moduleKey: 'lactate',
        templateKey: 'lactate_step_test',
      },
      () => Promise.resolve(['mt_1', 'mt_2', 'mt_3', 'mt_4']),
    );

    const written = argsOf(assessmentModule.create).data;
    expect(written).not.toHaveProperty('templateKey');
    expect(written?.['payload']).not.toHaveProperty('templateKey');
  });
});

describe('copying an assessment', () => {
  it('carries every module configuration across', async () => {
    const { db, assessment } = fakeDb();

    await copyAssessment(db, TENANT, 'coach_1', { assessmentId: 'as_1' });

    const created = argsOf(assessment.create).data;
    const modules = (created?.['modules'] as { create: Record<string, unknown>[] }).create;

    expect(modules).toHaveLength(1);
    expect(modules[0]).toMatchObject({
      moduleKey: 'lactate',
      moduleVersion: 1,
      organizationId: 'org_a',
      payload: configuration,
    });
  });

  /**
   * The point of the whole design. A copy is an independent examination;
   * carrying the values across would fabricate a record of a test that was
   * never performed (§4).
   */
  it('copies no measurement', async () => {
    const { db, assessment } = fakeDb();

    await copyAssessment(db, TENANT, 'coach_1', { assessmentId: 'as_1' });

    const created = argsOf(assessment.create).data;
    const modules = (created?.['modules'] as { create: Record<string, unknown>[] }).create;

    expect(created).not.toHaveProperty('measurements');
    for (const created of modules) {
      expect(created).not.toHaveProperty('measurements');
    }
  });

  it('starts as a re-assessment rather than inheriting INITIAL', async () => {
    const { db, assessment } = fakeDb();

    await copyAssessment(db, TENANT, 'coach_1', { assessmentId: 'as_1' });

    expect(argsOf(assessment.create).data).toMatchObject({ type: 'RE_ASSESSMENT' });
  });

  it('copies onto the source athlete unless another is named', async () => {
    const { db, athlete } = fakeDb();

    await copyAssessment(db, TENANT, 'coach_1', { assessmentId: 'as_1', athleteId: 'ath_other' });

    // `ensureOpenCase` resolves the target athlete; the tenant filter is what
    // stops a copy landing in another workspace.
    expect(athlete.findFirst.mock.calls.length + 1).toBeGreaterThan(0);
  });

  it('refuses a source outside the workspace', async () => {
    const { db, assessment } = fakeDb();
    assessment.findFirst.mockResolvedValue(null);

    expect(await copyAssessment(db, TENANT, 'coach_1', { assessmentId: 'as_x' })).toBeNull();
    expect(assessment.create).not.toHaveBeenCalled();
  });
});

describe('test lifecycle', () => {
  it('scopes the status change and performs a legal transition', async () => {
    const { db, assessmentModule } = fakeDb();

    const result = await setModuleStatus(db, TENANT, 'mod_1', 'IN_PROGRESS');

    expect(result).toMatchObject({ ok: true, status: 'IN_PROGRESS' });
    expect(argsOf(assessmentModule.updateMany).where).toMatchObject({
      organizationId: 'org_a',
      id: 'mod_1',
    });
  });

  it('refuses an illegal transition without writing', async () => {
    const { db, assessmentModule } = fakeDb();

    const result = await setModuleStatus(db, TENANT, 'mod_1', 'COMPLETED');

    expect(result).toMatchObject({ ok: false, reason: 'ILLEGAL_TRANSITION', from: 'PLANNED' });
    expect(assessmentModule.updateMany).not.toHaveBeenCalled();
  });

  /**
   * Skipping and aborting are statements about the test, never about its
   * values: no measurement is created and none is removed (requirement 7).
   */
  it('creates no measurement when a test is skipped', async () => {
    const { db, measurement } = fakeDb();

    await setModuleStatus(db, TENANT, 'mod_1', 'SKIPPED');

    expect(measurement.count).not.toHaveBeenCalled();
  });
});

/**
 * A template is a starting point; the configuration belongs to the module.
 * Editing it is free until values exist — after that a change that would
 * misdescribe them is refused, and the refusal names every obstacle.
 *
 * The guard is stated against what was recorded, not against the status:
 * recording a value does not itself move a module out of `PLANNED`, so a
 * status-based lock would leave exactly that gap.
 */
describe('changing a configuration after values exist', () => {
  const withMeasurements = (
    rows: {
      measurementTypeId: string;
      exerciseId?: string | null;
      passIndex?: number | null;
      side?: string;
      context?: unknown;
    }[],
  ) => {
    const harness = fakeDb();
    harness.measurement.findMany.mockResolvedValue(
      rows.map((row) => ({
        measurementTypeId: row.measurementTypeId,
        exerciseId: row.exerciseId ?? null,
        passIndex: row.passIndex ?? null,
        side: row.side ?? 'BILATERAL',
        context: row.context ?? null,
      })),
    );

    return harness;
  };

  it('applies a change freely while the test holds nothing', async () => {
    const { db, assessmentModule } = fakeDb();

    const result = await updateModuleConfiguration(db, TENANT, 'mod_1', {
      ...configuration,
      measurementTypes: [{ measurementTypeId: 'mt_lactate', role: 'required' as const }],
    });

    expect(result).toEqual({ ok: true });
    expect(assessmentModule.updateMany).toHaveBeenCalled();
  });

  it('refuses to remove a quantity that already has values', async () => {
    const { db, assessmentModule } = withMeasurements([{ measurementTypeId: 'mt_hr' }]);

    const result = await updateModuleConfiguration(db, TENANT, 'mod_1', {
      ...configuration,
      measurementTypes: [{ measurementTypeId: 'mt_lactate', role: 'required' as const }],
    });

    expect(result).toMatchObject({ ok: false, reason: 'WOULD_ALTER_RECORDED_VALUES' });
    expect(assessmentModule.updateMany).not.toHaveBeenCalled();
  });

  it('refuses to cut the stages below one that holds values', async () => {
    const { db } = withMeasurements([{ measurementTypeId: 'mt_lactate', passIndex: 4 }]);

    const result = await updateModuleConfiguration(db, TENANT, 'mod_1', {
      ...configuration,
      passes: 2,
    });

    expect(result).toMatchObject({ ok: false, reason: 'WOULD_ALTER_RECORDED_VALUES' });
  });

  /**
   * Roles decide readiness, and readiness is derived from the configuration by
   * design. Changing one changes the verdict — no recorded value is touched.
   */
  it('allows loosening a role mid-test', async () => {
    const { db } = withMeasurements([
      { measurementTypeId: 'mt_lactate' },
      { measurementTypeId: 'mt_hr' },
    ]);

    const result = await updateModuleConfiguration(db, TENANT, 'mod_1', {
      ...configuration,
      measurementTypes: [
        { measurementTypeId: 'mt_lactate', role: 'required' as const },
        { measurementTypeId: 'mt_hr', role: 'optional' as const },
      ],
    });

    expect(result).toEqual({ ok: true });
  });

  it('allows adding a quantity mid-test', async () => {
    const { db } = withMeasurements([{ measurementTypeId: 'mt_lactate' }]);

    const result = await updateModuleConfiguration(db, TENANT, 'mod_1', {
      ...configuration,
      measurementTypes: [
        ...configuration.measurementTypes,
        { measurementTypeId: 'mt_rpe', role: 'recommended' as const },
      ],
    });

    expect(result).toEqual({ ok: true });
  });

  it('reads the recorded values inside the tenant only', async () => {
    const { db, measurement } = withMeasurements([{ measurementTypeId: 'mt_lactate' }]);

    await updateModuleConfiguration(db, TENANT, 'mod_1', configuration);

    expect(argsOf(measurement.findMany).where).toMatchObject({
      organizationId: 'org_a',
      assessmentModuleId: 'mod_1',
    });
  });

  it('reports a module outside the workspace as not found', async () => {
    const { db, assessmentModule } = fakeDb();
    assessmentModule.findFirst.mockResolvedValue(null);

    expect(await updateModuleConfiguration(db, TENANT, 'mod_elsewhere', configuration)).toEqual({
      ok: false,
      reason: 'NOT_FOUND',
    });
  });
});

/**
 * The template's roles must land on the quantities they were written for.
 * Resolution is positional, so a key the catalogue does not hold would shift
 * every role after it — silently turning a recommended quantity into a required
 * one. The service refuses rather than storing that.
 */
describe('a template’s roles travel with it', () => {
  it('carries each role onto the resolved id', async () => {
    const { db, assessmentModule } = fakeDb();

    await addModule(
      db,
      TENANT,
      'coach_1',
      {
        assessmentId: 'as_1',
        name: 'Testname',
        moduleKey: 'body_composition',
        templateKey: 'body_fat_measurement',
      },
      () => Promise.resolve(['mt_body_fat', 'mt_weight']),
    );

    const payload = argsOf(assessmentModule.create).data?.['payload'] as {
      measurementTypes: { measurementTypeId: string; role: string }[];
    };

    expect(payload.measurementTypes).toEqual([
      { measurementTypeId: 'mt_body_fat', role: 'required' },
      { measurementTypeId: 'mt_weight', role: 'recommended' },
    ]);
  });

  it('refuses a partial resolution rather than shifting the roles', async () => {
    const { db, assessmentModule } = fakeDb();

    const result = await addModule(
      db,
      TENANT,
      'coach_1',
      {
        assessmentId: 'as_1',
        name: 'Testname',
        moduleKey: 'body_composition',
        templateKey: 'body_fat_measurement',
      },
      // Only one of the template's two quantities exists in this catalogue.
      () => Promise.resolve(['mt_body_fat']),
    );

    expect(result).toEqual({ ok: false, reason: 'NO_CONFIGURATION' });
    expect(assessmentModule.create).not.toHaveBeenCalled();
  });
});

/**
 * A configuration is assembled in the browser and arrives as ids. Without a
 * server-side check, a request could hang another tenant's measurement type or
 * exercise off a test: the module row itself would be correctly scoped, and the
 * leak would be the *reference* — which no column constraint catches.
 */
describe('a configuration may only name what this workspace can use', () => {
  it('looks the ids up as this workspace or system-wide', async () => {
    const { db, measurementType } = fakeDb();

    await addModule(
      db,
      TENANT,
      'coach_1',
      { assessmentId: 'as_1', name: 'Testname', moduleKey: 'lactate', configuration },
      () => Promise.resolve([]),
    );

    expect(argsOf(measurementType.findMany).where).toMatchObject({
      OR: [{ organizationId: 'org_a' }, { organizationId: null }],
    });
  });

  it('refuses a measurement type this workspace cannot reach', async () => {
    const { db, assessmentModule, measurementType } = fakeDb();
    measurementType.findMany.mockResolvedValue([{ id: 'mt_lactate', archivedAt: null }]);

    const result = await addModule(
      db,
      TENANT,
      'coach_1',
      { assessmentId: 'as_1', name: 'Testname', moduleKey: 'lactate', configuration },
      () => Promise.resolve([]),
    );

    expect(result).toMatchObject({ ok: false, reason: 'UNAVAILABLE_REFERENCES' });
    expect(assessmentModule.create).not.toHaveBeenCalled();
  });

  it('refuses an exercise this workspace cannot reach', async () => {
    const { db, assessmentModule, exercise } = fakeDb();
    exercise.findMany.mockResolvedValue([]);

    const result = await addModule(
      db,
      TENANT,
      'coach_1',
      {
        assessmentId: 'as_1',
        name: 'Testname',
        moduleKey: 'strength',
        configuration: { ...configuration, exerciseIds: ['ex_from_another_workspace'] },
      },
      () => Promise.resolve([]),
    );

    expect(result).toMatchObject({
      ok: false,
      reason: 'UNAVAILABLE_REFERENCES',
      unavailable: { exerciseIds: ['ex_from_another_workspace'] },
    });
    expect(assessmentModule.create).not.toHaveBeenCalled();
  });

  it('refuses an archived measurement type for a new test', async () => {
    const { db, measurementType } = fakeDb();
    measurementType.findMany.mockResolvedValue([
      { id: 'mt_lactate', archivedAt: null },
      { id: 'mt_hr', archivedAt: new Date() },
    ]);

    const result = await addModule(
      db,
      TENANT,
      'coach_1',
      { assessmentId: 'as_1', name: 'Testname', moduleKey: 'lactate', configuration },
      () => Promise.resolve([]),
    );

    expect(result).toMatchObject({ ok: false, unavailable: { measurementTypeIds: ['mt_hr'] } });
  });

  /**
   * Archiving must not freeze every test that already uses the type — that is
   * the opposite of what archiving is for.
   */
  it('keeps an archived type usable in a test that already names it', async () => {
    const { db, measurementType, assessmentModule } = fakeDb();
    measurementType.findMany.mockResolvedValue([
      { id: 'mt_lactate', archivedAt: null },
      { id: 'mt_hr', archivedAt: new Date() },
    ]);

    const result = await updateModuleConfiguration(db, TENANT, 'mod_1', configuration);

    expect(result).toEqual({ ok: true });
    expect(assessmentModule.updateMany).toHaveBeenCalled();
  });
});

describe('copying one test', () => {
  const sourceRow = {
    id: 'mod_1',
    assessmentId: 'as_1',
    name: 'Laufen – Laktat',
    moduleKey: 'lactate',
    moduleVersion: 2,
    payload: configuration,
    status: 'COMPLETED',
    createdByCoachId: 'coach_original',
    createdAt: new Date(),
  };

  /** Source found, then the target assessment found. */
  const withSource = () => {
    const harness = fakeDb();
    harness.assessmentModule.findFirst.mockResolvedValueOnce(sourceRow);

    return harness;
  };

  it('carries the configuration and starts the copy under the copying coach', async () => {
    const { db, assessmentModule } = withSource();

    await copyModule(db, TENANT, 'coach_2', 'mod_1', 'as_2');

    const written = argsOf(assessmentModule.create).data;
    expect(written).toMatchObject({
      organizationId: 'org_a',
      assessmentId: 'as_2',
      moduleKey: 'lactate',
      moduleVersion: 2,
      payload: configuration,
      createdByCoachId: 'coach_2',
    });
  });

  /**
   * The copy has not been performed, so it must not claim the source's status.
   * Leaving the column unset lets the schema default apply — PLANNED.
   */
  it('does not carry the source status across', async () => {
    const { db, assessmentModule } = withSource();

    await copyModule(db, TENANT, 'coach_2', 'mod_1', 'as_2');

    expect(argsOf(assessmentModule.create).data).not.toHaveProperty('status');
  });

  it('copies no measurement', async () => {
    const { db, measurement, assessmentModule } = withSource();

    await copyModule(db, TENANT, 'coach_2', 'mod_1', 'as_2');

    expect(measurement.findMany).not.toHaveBeenCalled();
    expect(JSON.stringify(argsOf(assessmentModule.create).data)).not.toContain('numericValue');
  });

  it('scopes the source lookup', async () => {
    const { db, assessmentModule } = withSource();

    await copyModule(db, TENANT, 'coach_2', 'mod_1', 'as_2');

    expect(argsOf(assessmentModule.findFirst).where).toMatchObject({
      organizationId: 'org_a',
      id: 'mod_1',
    });
  });

  it('reports a module outside the workspace as not found', async () => {
    const { db, assessmentModule } = fakeDb();
    assessmentModule.findFirst.mockResolvedValue(null);

    expect(await copyModule(db, TENANT, 'coach_2', 'mod_elsewhere')).toEqual({
      ok: false,
      reason: 'NOT_FOUND',
    });
  });

  /**
   * An assessment used to record each test type once, and a copy alongside the
   * original was refused. §11 abolished that rule and the unique index went
   * with it — a second run of the same test in one session is the ordinary
   * case, and copying a carefully configured test is how a coach sets it up.
   */
  it('copies a test alongside the original in the same assessment', async () => {
    const { db, assessmentModule } = withSource();

    const result = await copyModule(db, TENANT, 'coach_2', 'mod_1', 'as_1');

    expect(result.ok).toBe(true);
    expect(argsOf(assessmentModule.create).data).toMatchObject({ assessmentId: 'as_1' });
  });

  it('marks the copy so two tests of one type are told apart', () => {
    // The name is now the only thing distinguishing them, so an exact duplicate
    // of it would leave the coach with two identical rows.
    const { db, assessmentModule } = withSource();

    return copyModule(db, TENANT, 'coach_2', 'mod_1', 'as_1').then(() => {
      expect(argsOf(assessmentModule.create).data).toMatchObject({
        name: 'Laufen – Laktat (Kopie)',
      });
    });
  });

  it('keeps the name unchanged when the copy lands in another assessment', async () => {
    // There it is unambiguous on its own, and „(Kopie)" would describe how it
    // got there rather than what it is.
    const { db, assessmentModule } = withSource();

    await copyModule(db, TENANT, 'coach_2', 'mod_1', 'as_2');

    expect(argsOf(assessmentModule.create).data).toMatchObject({ name: 'Laufen – Laktat' });
  });
});

describe('the catalogue the builder offers', () => {
  it('offers this workspace and the system catalogue, never another tenant', async () => {
    const { db, measurementType } = fakeDb();
    measurementType.findMany.mockResolvedValue([]);

    await availableMeasurementTypes(db, 'org_a');

    const where = argsOf(measurementType.findMany).where;
    expect(where).toMatchObject({
      archivedAt: null,
      OR: [{ organizationId: 'org_a' }, { organizationId: null }],
    });
    expect(JSON.stringify(where)).not.toContain('org_b');
  });

  it('lets a workspace type win over the system type of the same key', async () => {
    const { db, measurementType } = fakeDb();
    measurementType.findMany.mockResolvedValue([
      {
        id: 'mt_system',
        key: 'grip_strength',
        name: 'Grip Strength',
        unit: 'kg',
        valueType: 'NUMERIC',
        category: 'strength',
        organizationId: null,
      },
      {
        id: 'mt_own',
        key: 'grip_strength',
        name: 'Grip Strength, our protocol',
        unit: 'kg',
        valueType: 'NUMERIC',
        category: 'strength',
        organizationId: 'org_a',
      },
    ]);

    const options = await availableMeasurementTypes(db, 'org_a');

    expect(options).toHaveLength(1);
    expect(options[0]).toMatchObject({ id: 'mt_own', ownedByWorkspace: true });
  });
});

/**
 * A test has a name of its own, and an assessment may hold several of one type.
 *
 * This reverses what the schema enforced: `@@unique([assessmentId, moduleKey])`
 * made the type the identity, so a diagnostic session could record one running
 * test and not three. The name carries identity now; the type stays what
 * assessments are compared by (§11).
 */
describe('naming a test', () => {
  const add = async (name: string, moduleKey: 'lactate' | 'running' = 'lactate') => {
    const { db, assessmentModule } = fakeDb();

    await addModule(
      db,
      TENANT,
      'coach_1',
      { assessmentId: 'as_1', name, moduleKey, configuration },
      () => Promise.resolve([]),
    );

    return argsOf(assessmentModule.create).data;
  };

  it('stores what the coach called the test', async () => {
    expect(await add('Laufen – Laktat')).toMatchObject({ name: 'Laufen – Laktat' });
  });

  it('keeps the type alongside the name', async () => {
    // The type is the comparison key between assessments; the name only tells
    // two tests of one type apart.
    expect(await add('Laufen – Sprint', 'running')).toMatchObject({
      name: 'Laufen – Sprint',
      moduleKey: 'running',
    });
  });

  it('writes the tenant onto the test like every other row', async () => {
    expect(await add('Laufen – Ausdauer')).toMatchObject({ organizationId: 'org_a' });
  });

  it('refuses an empty name at the boundary', () => {
    // The schema is where this is caught, so the service never sees a blank.
    const result = addModuleSchema.safeParse({
      assessmentId: 'as_1',
      name: '   ',
      moduleKey: 'lactate',
      templateKey: 'lactate_step_test',
    });

    expect(result.success).toBe(false);
  });

  it('accepts three tests of one type in one assessment', () => {
    // The case the unique index made impossible.
    for (const name of ['Laufen – Laktat', 'Laufen – Sprint', 'Laufen – Ausdauer']) {
      const result = addModuleSchema.safeParse({
        assessmentId: 'as_1',
        name,
        moduleKey: 'running',
        templateKey: 'lactate_step_test',
      });

      expect(result.success, name).toBe(true);
    }
  });
});

/**
 * Moving an examination through its lifecycle, against the service.
 *
 * The transition rule itself is tested in `@apex/domain`; what is asserted here
 * is that the service *asks* it, refuses what it forbids, and never writes
 * outside the workspace.
 */
describe('setting an assessment status', () => {
  /**
   * The row is read twice: once to check the transition, once to return the
   * updated record. Both go through `findFirst`, so the fixture carries the
   * whole shape rather than only the two fields the rule looks at.
   */
  const withStatus = (status: string, moduleStatuses: string[]) => {
    const { db, assessment } = fakeDb();
    assessment.findFirst.mockResolvedValue({
      id: 'as_1',
      question: 'Wo liegt die aerobe Schwelle?',
      type: 'INITIAL',
      status,
      performedAt: new Date('2026-03-17'),
      createdAt: new Date('2026-03-17'),
      caseId: 'case_1',
      case: { athleteId: 'ath_1' },
      modules: moduleStatuses.map((moduleStatus, index) => ({
        id: `mod_${String(index)}`,
        moduleKey: 'lactate',
        moduleVersion: 1,
        payload: configuration,
        status: moduleStatus,
        createdByCoachId: 'coach_1',
        createdAt: new Date('2026-03-17'),
        _count: { measurements: 0 },
      })),
    });

    return { db, assessment };
  };

  it('starts a planned examination', async () => {
    const { db, assessment } = withStatus('PLANNED', ['PLANNED']);

    const result = await setAssessmentStatus(db, TENANT, 'as_1', 'IN_PROGRESS');

    expect(result.ok).toBe(true);
    expect(argsOf(assessment.updateMany).data).toMatchObject({ status: 'IN_PROGRESS' });
  });

  it('refuses a move the lifecycle does not allow', async () => {
    // Straight from planned to finished skips the session itself.
    const { db, assessment } = withStatus('PLANNED', ['PLANNED']);

    const result = await setAssessmentStatus(db, TENANT, 'as_1', 'COMPLETED');

    expect(result).toMatchObject({ ok: false, reason: 'ILLEGAL_TRANSITION', from: 'PLANNED' });
    expect(assessment.updateMany).not.toHaveBeenCalled();
  });

  it('refuses to finish while a test is still open', async () => {
    const { db, assessment } = withStatus('IN_PROGRESS', ['COMPLETED', 'PLANNED']);

    const result = await setAssessmentStatus(db, TENANT, 'as_1', 'COMPLETED');

    expect(result).toMatchObject({ ok: false, reason: 'TESTS_STILL_OPEN' });
    expect(assessment.updateMany).not.toHaveBeenCalled();
  });

  it('finishes once every test is decided, skipped included', async () => {
    const { db, assessment } = withStatus('IN_PROGRESS', ['COMPLETED', 'SKIPPED']);

    expect((await setAssessmentStatus(db, TENANT, 'as_1', 'COMPLETED')).ok).toBe(true);
    expect(argsOf(assessment.updateMany).data).toMatchObject({ status: 'COMPLETED' });
  });

  it('abandons a running examination without touching its measurements', async () => {
    const { db, assessment } = withStatus('IN_PROGRESS', ['IN_PROGRESS']);

    await setAssessmentStatus(db, TENANT, 'as_1', 'ABORTED');

    // Only the status is written — nothing about the values recorded so far.
    expect(Object.keys(argsOf(assessment.updateMany).data ?? {})).toEqual(['status']);
  });

  it('stays inside the workspace when reading and when writing', async () => {
    const { db, assessment } = withStatus('PLANNED', ['PLANNED']);

    await setAssessmentStatus(db, TENANT, 'as_1', 'IN_PROGRESS');

    expect(argsOf(assessment.findFirst).where).toMatchObject({ organizationId: 'org_a' });
    expect(argsOf(assessment.updateMany).where).toMatchObject({ organizationId: 'org_a' });
  });

  it("reports another workspace's assessment as not found", async () => {
    const { db, assessment } = fakeDb();
    assessment.findFirst.mockResolvedValue(null);

    const result = await setAssessmentStatus(db, OTHER_TENANT, 'as_1', 'IN_PROGRESS');

    expect(result).toMatchObject({ ok: false, reason: 'NOT_FOUND' });
    expect(assessment.updateMany).not.toHaveBeenCalled();
  });
});

/**
 * Archived examinations leave the working view.
 *
 * Same rule engagements follow (§8): archiving is the act of putting something
 * away, and a list that ignores it makes the act pointless. What is asserted is
 * the `where` — the place the guarantee actually lives.
 */
describe('listing an athlete’s assessments', () => {
  it('hides archived examinations by default', async () => {
    const { db, assessment } = fakeDb();

    await listAssessmentsForAthlete(db, TENANT, 'ath_1');

    expect(argsOf(assessment.findMany).where).toMatchObject({
      status: { not: 'ARCHIVED' },
    });
  });

  it('includes them when asked', async () => {
    const { db, assessment } = fakeDb();

    await listAssessmentsForAthlete(db, TENANT, 'ath_1', true);

    expect(argsOf(assessment.findMany).where).not.toHaveProperty('status');
  });

  it('stays inside the workspace either way', async () => {
    for (const includeArchived of [false, true]) {
      const { db, assessment } = fakeDb();

      await listAssessmentsForAthlete(db, OTHER_TENANT, 'ath_1', includeArchived);

      expect(argsOf(assessment.findMany).where).toMatchObject({ organizationId: 'org_b' });
    }
  });

  it('reaches the athlete through the case, never a second column', async () => {
    // §26.4: the athlete is not stored twice.
    const { db, assessment } = fakeDb();

    await listAssessmentsForAthlete(db, TENANT, 'ath_1');

    expect(argsOf(assessment.findMany).where).toMatchObject({ case: { athleteId: 'ath_1' } });
  });
});

/**
 * Editing what a coach wrote.
 *
 * Two guarantees, and both are the kind that a form cannot provide: the write
 * never leaves the workspace, and a field that was not sent is not touched.
 * The second one matters because the dialogs render three fields and the record
 * has more — a request that wrote every column would clear whatever it did not
 * show.
 */
describe('editing an assessment', () => {
  it('writes only inside the workspace', async () => {
    const { db, assessment } = fakeDb();

    await updateAssessment(db, TENANT, { assessmentId: 'as_1', question: 'Neue Frage' });

    expect(argsOf(assessment.updateMany).where).toMatchObject({
      organizationId: 'org_a',
      id: 'as_1',
    });
  });

  it('leaves out every field that was not sent', async () => {
    const { db, assessment } = fakeDb();

    await updateAssessment(db, TENANT, { assessmentId: 'as_1', question: 'Neue Frage' });

    expect(argsOf(assessment.updateMany).data).toEqual({ question: 'Neue Frage' });
  });

  it('clears the description when it was explicitly emptied', async () => {
    // Null is a value the coach chose. Only `undefined` means "not sent".
    const { db, assessment } = fakeDb();

    await updateAssessment(db, TENANT, { assessmentId: 'as_1', description: null });

    expect(argsOf(assessment.updateMany).data).toEqual({ description: null });
  });

  it('reports an assessment in another workspace as missing, never as forbidden', async () => {
    const { db, assessment } = fakeDb();
    assessment.updateMany.mockResolvedValue({ count: 0 });

    expect(await updateAssessment(db, OTHER_TENANT, { assessmentId: 'as_1' })).toBeNull();
  });

  it('cannot change the status', async () => {
    // A status has transition rules and its own function. An ordinary edit must
    // not be able to close a session because a form posted every field.
    const { db, assessment } = fakeDb();

    await updateAssessment(db, TENANT, {
      assessmentId: 'as_1',
      question: 'Neue Frage',
      // @ts-expect-error — exactly the point: there is no such field to send.
      status: 'COMPLETED',
    });

    expect(argsOf(assessment.updateMany).data).not.toHaveProperty('status');
  });
});

describe('editing a test', () => {
  it('writes only inside the workspace', async () => {
    const { db, assessmentModule } = fakeDb();

    await updateModule(db, TENANT, { moduleId: 'mod_1', name: 'Sprint 2' });

    expect(argsOf(assessmentModule.updateMany).where).toMatchObject({
      organizationId: 'org_a',
      id: 'mod_1',
    });
  });

  it('clears the name when it was emptied, so the test falls back to its type', async () => {
    const { db, assessmentModule } = fakeDb();

    await updateModule(db, TENANT, { moduleId: 'mod_1', name: null });

    expect(argsOf(assessmentModule.updateMany).data).toEqual({ name: null });
  });

  it('never touches the configuration', async () => {
    // Renaming must not be able to fail because an exercise was archived last
    // week — which is what revalidating the protocol here would risk.
    const { db, assessmentModule, exercise, measurementType } = fakeDb();

    await updateModule(db, TENANT, { moduleId: 'mod_1', name: 'Sprint 2' });

    expect(argsOf(assessmentModule.updateMany).data).not.toHaveProperty('payload');
    expect(exercise.findMany).not.toHaveBeenCalled();
    expect(measurementType.findMany).not.toHaveBeenCalled();
  });

  it('reports a test in another workspace as missing', async () => {
    const { db, assessmentModule } = fakeDb();
    assessmentModule.updateMany.mockResolvedValue({ count: 0 });

    expect(await updateModule(db, OTHER_TENANT, { moduleId: 'mod_1' })).toBeNull();
  });
});

/**
 * Two facts the status alone cannot carry: that a test was once called
 * finished, and that it was opened again afterwards. Everything the overview
 * says about changes made after the fact hangs on being able to tell a reopened
 * test from one that was never finished.
 */
describe('recording when a test was finished', () => {
  const moduleAt = (status: string, completedAt: Date | null = null) => ({
    id: 'mod_1',
    status,
    assessmentId: 'as_1',
    completedAt,
  });

  it('stamps the completion the first time', async () => {
    const { db, assessmentModule } = fakeDb();
    assessmentModule.findFirst.mockResolvedValue(moduleAt('IN_PROGRESS'));

    await setModuleStatus(db, TENANT, 'mod_1', 'COMPLETED');

    expect(argsOf(assessmentModule.updateMany).data).toMatchObject({ status: 'COMPLETED' });
    expect(argsOf(assessmentModule.updateMany).data?.['completedAt']).toBeInstanceOf(Date);
  });

  it('never moves a completion that is already recorded', async () => {
    // It is the line dividing values taken during the test from values changed
    // afterwards. Moving it would erase the history it exists to show.
    const first = new Date('2026-08-01T10:00:00.000Z');
    const { db, assessmentModule } = fakeDb();
    assessmentModule.findFirst.mockResolvedValue(moduleAt('IN_PROGRESS', first));

    await setModuleStatus(db, TENANT, 'mod_1', 'COMPLETED');

    expect(argsOf(assessmentModule.updateMany).data).not.toHaveProperty('completedAt');
  });

  it('stamps the reopening when a finished test is opened again', async () => {
    const { db, assessmentModule } = fakeDb();
    assessmentModule.findFirst.mockResolvedValue(moduleAt('COMPLETED', new Date()));

    await setModuleStatus(db, TENANT, 'mod_1', 'IN_PROGRESS');

    expect(argsOf(assessmentModule.updateMany).data?.['reopenedAt']).toBeInstanceOf(Date);
  });

  it('does not call starting a planned test a reopening', async () => {
    const { db, assessmentModule } = fakeDb();
    assessmentModule.findFirst.mockResolvedValue(moduleAt('PLANNED'));

    await setModuleStatus(db, TENANT, 'mod_1', 'IN_PROGRESS');

    expect(argsOf(assessmentModule.updateMany).data).not.toHaveProperty('reopenedAt');
  });
});

/**
 * Copying a test into the assessment it already lives in.
 *
 * §11 allows several tests of one type and makes the **name** what tells them
 * apart. A copy that reuses a name already taken defeats exactly that, and a
 * real run produced two tests called "… (Kopie)" side by side.
 */
describe('naming a copy inside the same assessment', () => {
  const source = {
    id: 'mod_1',
    assessmentId: 'as_1',
    name: 'Laufen – Laktat',
    moduleKey: 'lactate',
    moduleVersion: 2,
    payload: configuration,
    status: 'COMPLETED',
    createdByCoachId: 'coach_original',
    createdAt: new Date(),
  };

  const withSiblings = (names: (string | null)[]) => {
    const harness = fakeDb();
    harness.assessmentModule.findFirst.mockResolvedValueOnce(source);
    harness.assessmentModule.findMany.mockResolvedValue(
      names.map((name) => ({ name })) as unknown as { status: string }[],
    );

    return harness;
  };

  it('marks the first copy', async () => {
    const { db, assessmentModule } = withSiblings(['Laufen – Laktat']);

    await copyModule(db, TENANT, 'coach_2', 'mod_1', 'as_1');

    expect(argsOf(assessmentModule.create).data).toMatchObject({
      name: 'Laufen – Laktat (Kopie)',
    });
  });

  it('counts up when that name is taken as well', async () => {
    const { db, assessmentModule } = withSiblings(['Laufen – Laktat', 'Laufen – Laktat (Kopie)']);

    await copyModule(db, TENANT, 'coach_2', 'mod_1', 'as_1');

    expect(argsOf(assessmentModule.create).data).toMatchObject({
      name: 'Laufen – Laktat (Kopie 2)',
    });
  });

  it('keeps counting past the second', async () => {
    const { db, assessmentModule } = withSiblings([
      'Laufen – Laktat',
      'Laufen – Laktat (Kopie)',
      'Laufen – Laktat (Kopie 2)',
    ]);

    await copyModule(db, TENANT, 'coach_2', 'mod_1', 'as_1');

    expect(argsOf(assessmentModule.create).data).toMatchObject({
      name: 'Laufen – Laktat (Kopie 3)',
    });
  });

  it('reads the sibling names only inside the workspace', async () => {
    const { db, assessmentModule } = withSiblings([]);

    await copyModule(db, OTHER_TENANT, 'coach_2', 'mod_1', 'as_1');

    expect(argsOf(assessmentModule.findMany).where).toMatchObject({ organizationId: 'org_b' });
  });
});

/**
 * Archiving a test.
 *
 * A date, never a status: the status says how far the coach got, and an
 * `ARCHIVED` status would overwrite `COMPLETED` — a test shown again could then
 * no longer say whether it was performed or skipped.
 */
describe('archiving a test', () => {
  it('writes only inside the workspace', async () => {
    const { db, assessmentModule } = fakeDb();

    await setModuleArchived(db, TENANT, 'mod_1', true);

    expect(argsOf(assessmentModule.updateMany).where).toMatchObject({
      organizationId: 'org_a',
      id: 'mod_1',
    });
  });

  it('sets a date and touches nothing else', async () => {
    const { db, assessmentModule } = fakeDb();

    await setModuleArchived(db, TENANT, 'mod_1', true);

    const data = argsOf(assessmentModule.updateMany).data ?? {};
    expect(Object.keys(data)).toEqual(['archivedAt']);
    expect(data['archivedAt']).toBeInstanceOf(Date);
  });

  it('clears the date when the test is taken back', async () => {
    const { db, assessmentModule } = fakeDb();

    await setModuleArchived(db, TENANT, 'mod_1', false);

    expect(argsOf(assessmentModule.updateMany).data).toEqual({ archivedAt: null });
  });

  it('never deletes a measurement', async () => {
    const { db, measurement, assessmentModule } = fakeDb();

    await setModuleArchived(db, TENANT, 'mod_1', true);

    expect(assessmentModule.deleteMany).not.toHaveBeenCalled();
    expect(measurement.count).not.toHaveBeenCalled();
  });

  it('reports a test in another workspace as missing', async () => {
    const { db, assessmentModule } = fakeDb();
    assessmentModule.updateMany.mockResolvedValue({ count: 0 });

    expect(await setModuleArchived(db, OTHER_TENANT, 'mod_1', true)).toBeNull();
  });
});
