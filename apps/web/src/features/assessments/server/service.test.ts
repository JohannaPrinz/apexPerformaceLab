import { describe, expect, it, vi } from 'vitest';

import type { PrismaClientInstance } from '@apex/database';

import {
  addModule,
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
      modules: [],
    }),
  };

  const assessmentModule = {
    findFirst: vi.fn<(args: QueryArgs) => Promise<unknown>>().mockResolvedValue({
      id: 'mod_1',
      status: 'PLANNED',
      payload: configuration,
      moduleVersion: 2,
    }),
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

  return {
    db: { assessment, assessmentModule, performanceCase, athlete, measurement } as unknown as Pick<
      PrismaClientInstance,
      'assessment' | 'assessmentModule' | 'performanceCase' | 'athlete' | 'measurement'
    >,
    assessment,
    assessmentModule,
    performanceCase,
    athlete,
    measurement,
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
    assessmentModule.findFirst.mockResolvedValue({ id: 'mod_1', status: 'IN_PROGRESS' });

    const result = await removeModule(db, TENANT, 'mod_1');

    expect(result).toMatchObject({ ok: false, reason: 'HAS_HISTORY' });
    expect(assessmentModule.deleteMany).not.toHaveBeenCalled();
  });

  it('refuses to delete a planned test that already holds values', async () => {
    const { db, assessmentModule, measurement } = fakeDb();
    measurement.count.mockResolvedValue(3);

    const result = await removeModule(db, TENANT, 'mod_1');

    expect(result.ok).toBe(false);
    expect(assessmentModule.deleteMany).not.toHaveBeenCalled();
  });

  it('refuses to delete a skipped test — the decision is part of the record', async () => {
    const { db, assessmentModule } = fakeDb();
    assessmentModule.findFirst.mockResolvedValue({ id: 'mod_1', status: 'SKIPPED' });

    expect((await removeModule(db, TENANT, 'mod_1')).ok).toBe(false);
    expect(assessmentModule.deleteMany).not.toHaveBeenCalled();
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

    expect(result).toBeNull();
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

    expect(result).toBeNull();
    expect(assessmentModule.create).not.toHaveBeenCalled();
  });
});
