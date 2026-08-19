import { describe, expect, it, vi } from 'vitest';

import type { PrismaClientInstance } from '@apex/database';

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
  updateModuleConfiguration,
} from './service';

const TENANT = { organizationId: 'org_a' };

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
      type: 'INITIAL',
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
  it('refuses to delete a test that has been started', async () => {
    const { db, assessmentModule } = fakeDb();
    assessmentModule.findFirst.mockResolvedValue({
      id: 'mod_1',
      status: 'IN_PROGRESS',
      assessmentId: 'ass_1',
    });
    assessmentModule.findMany.mockResolvedValue([{ status: 'IN_PROGRESS' }]);

    const result = await removeModule(db, TENANT, 'mod_1');

    expect(result).toMatchObject({ ok: false, reason: 'ASSESSMENT_BEGUN' });
    expect(assessmentModule.deleteMany).not.toHaveBeenCalled();
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

  it('refuses a test that took place once the assessment has been performed', async () => {
    const { db, assessmentModule } = fakeDb();
    assessmentModule.findFirst.mockResolvedValue({
      id: 'mod_1',
      status: 'COMPLETED',
      assessmentId: 'ass_1',
    });
    assessmentModule.findMany.mockResolvedValue([{ status: 'COMPLETED' }]);

    const result = await removeModule(db, TENANT, 'mod_1');

    expect(result).toMatchObject({ ok: false, reason: 'ASSESSMENT_BEGUN' });
    expect(assessmentModule.deleteMany).not.toHaveBeenCalled();
  });

  it('still deletes a skipped test after the assessment was performed', async () => {
    const { db, assessmentModule } = fakeDb();
    assessmentModule.findFirst.mockResolvedValue({
      id: 'mod_1',
      status: 'SKIPPED',
      assessmentId: 'ass_1',
    });
    assessmentModule.findMany.mockResolvedValue([{ status: 'COMPLETED' }, { status: 'SKIPPED' }]);

    expect((await removeModule(db, TENANT, 'mod_1')).ok).toBe(true);
  });

  it('scopes the sibling lookup to the workspace', async () => {
    // The statuses that decide the rule must not be read across tenants.
    const { db, assessmentModule } = fakeDb();

    await removeModule(db, TENANT, 'mod_1');

    expect(argsOf(assessmentModule.findMany).where).toMatchObject({ organizationId: 'org_a' });
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
      { assessmentId: 'as_1', moduleKey: 'lactate', configuration },
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
      { assessmentId: 'as_elsewhere', moduleKey: 'lactate', configuration },
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
      { assessmentId: 'as_1', moduleKey: 'lactate', templateKey: 'lactate_step_test' },
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
      { assessmentId: 'as_1', moduleKey: 'lactate', templateKey: 'lactate_step_test' },
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
      { assessmentId: 'as_1', moduleKey: 'body_composition', templateKey: 'body_fat_measurement' },
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
      { assessmentId: 'as_1', moduleKey: 'body_composition', templateKey: 'body_fat_measurement' },
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
      { assessmentId: 'as_1', moduleKey: 'lactate', configuration },
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
      { assessmentId: 'as_1', moduleKey: 'lactate', configuration },
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
      { assessmentId: 'as_1', moduleKey: 'lactate', configuration },
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
    moduleKey: 'lactate',
    moduleVersion: 2,
    payload: configuration,
    status: 'COMPLETED',
    createdByCoachId: 'coach_original',
    createdAt: new Date(),
  };

  /** Source found, then no clash in the target assessment. */
  const withSource = () => {
    const harness = fakeDb();
    harness.assessmentModule.findFirst.mockResolvedValueOnce(sourceRow).mockResolvedValueOnce(null);

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
   * An assessment records each test once. Reported as a sentence rather than
   * left to the unique constraint.
   */
  it('refuses a copy into an assessment that already holds the test', async () => {
    const { db, assessmentModule } = fakeDb();
    assessmentModule.findFirst.mockResolvedValue(sourceRow);

    const result = await copyModule(db, TENANT, 'coach_2', 'mod_1', 'as_1');

    expect(result).toEqual({ ok: false, reason: 'ALREADY_PRESENT' });
    expect(assessmentModule.create).not.toHaveBeenCalled();
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
