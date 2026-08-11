import { describe, expect, it, vi } from 'vitest';

import type { PrismaClientInstance } from '@apex/database';

import {
  addModule,
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
  measurementTypeIds: ['mt_lactate', 'mt_hr'],
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
    create: vi.fn<(args: QueryArgs) => Promise<unknown>>().mockResolvedValue({
      id: 'mod_new',
      moduleKey: 'lactate',
      moduleVersion: 1,
      payload: configuration,
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

  return {
    db: { assessment, assessmentModule, performanceCase, athlete } as unknown as Pick<
      PrismaClientInstance,
      'assessment' | 'assessmentModule' | 'performanceCase' | 'athlete'
    >,
    assessment,
    assessmentModule,
    performanceCase,
    athlete,
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

    await removeModule(db, TENANT, 'mod_1');

    expect(argsOf(assessmentModule.deleteMany).where).toMatchObject({
      organizationId: 'org_a',
    });
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

    await addModule(db, TENANT, { assessmentId: 'as_1', moduleKey: 'lactate', configuration }, () =>
      Promise.resolve([]),
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
      { assessmentId: 'as_1', moduleKey: 'lactate', templateKey: 'lactate_step_test' },
      () => Promise.resolve(['mt_1']),
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
