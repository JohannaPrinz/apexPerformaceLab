import { describe, expect, it, vi } from 'vitest';

import type { PrismaClientInstance } from '@apex/database';

import { createCase, ensureOpenCase, listCasesForAthlete, setCaseStatus } from './service';

/**
 * Two guarantees are tested here.
 *
 * **Tenant scoping**, as in the athletes service. And one that is new with this
 * slice: a case names a *parent*. Scoping the case row is not enough — the
 * athlete it hangs off must belong to the same workspace, or the leak is the
 * relationship rather than the row, which no column constraint catches.
 */

const TENANT = { organizationId: 'org_a' };

interface QueryArgs {
  where: Record<string, unknown>;
  data?: Record<string, unknown>;
}

function fakeDb() {
  const performanceCase = {
    findMany: vi.fn<(args: QueryArgs) => Promise<unknown[]>>().mockResolvedValue([]),
    findFirst: vi.fn<(args: QueryArgs) => Promise<unknown>>().mockResolvedValue(null),
    create: vi.fn<(args: QueryArgs) => Promise<{ id: string }>>().mockResolvedValue({
      id: 'case_1',
    }),
    updateMany: vi
      .fn<(args: QueryArgs) => Promise<{ count: number }>>()
      .mockResolvedValue({ count: 0 }),
  };
  const athlete = {
    findFirst: vi.fn<(args: QueryArgs) => Promise<unknown>>().mockResolvedValue({ id: 'ath_1' }),
  };

  return {
    db: { performanceCase, athlete } as unknown as Pick<
      PrismaClientInstance,
      'performanceCase' | 'athlete'
    >,
    performanceCase,
    athlete,
  };
}

const argsOf = (mock: { mock: { calls: [QueryArgs][] } }, index = 0): QueryArgs => {
  const args = mock.mock.calls[index]?.[0];
  if (!args) throw new Error(`expected a call at index ${index}`);

  return args;
};

describe('case service — tenant scoping', () => {
  it('scopes the list of an athlete’s cases', async () => {
    const { db, performanceCase } = fakeDb();

    await listCasesForAthlete(db, TENANT, { athleteId: 'ath_1' });

    expect(argsOf(performanceCase.findMany).where).toMatchObject({
      organizationId: 'org_a',
      athleteId: 'ath_1',
    });
  });

  it('scopes a status change', async () => {
    const { db, performanceCase } = fakeDb();

    await setCaseStatus(db, TENANT, 'case_1', 'CLOSED');

    expect(argsOf(performanceCase.updateMany).where).toMatchObject({
      organizationId: 'org_a',
      id: 'case_1',
    });
  });

  it('stamps the tenant and the author onto a new case', async () => {
    const { db, performanceCase } = fakeDb();

    await createCase(db, TENANT, 'coach_1', {
      athleteId: 'ath_1',
      title: 'HYROX preparation',
      type: 'ONGOING',
    });

    expect(argsOf(performanceCase.create).data).toMatchObject({
      organizationId: 'org_a',
      createdByCoachId: 'coach_1',
      athleteId: 'ath_1',
    });
  });
});

describe('case service — the parent must be in this workspace', () => {
  it('verifies the athlete before writing', async () => {
    const { db, athlete } = fakeDb();

    await createCase(db, TENANT, 'coach_1', {
      athleteId: 'ath_1',
      title: 'Return to sport',
      type: 'ONGOING',
    });

    expect(argsOf(athlete.findFirst).where).toMatchObject({
      organizationId: 'org_a',
      id: 'ath_1',
    });
  });

  it('refuses to hang a case off another workspace’s athlete', async () => {
    const { db, athlete, performanceCase } = fakeDb();
    athlete.findFirst.mockResolvedValue(null);

    const result = await createCase(db, TENANT, 'coach_1', {
      athleteId: 'ath_from_another_workspace',
      title: 'Nope',
      type: 'ONGOING',
    });

    expect(result).toBeNull();
    expect(performanceCase.create).not.toHaveBeenCalled();
  });
});

describe('ensureOpenCase — the case is mandatory but never a manual step (§8)', () => {
  it('reuses an open case when one exists', async () => {
    const { db, performanceCase } = fakeDb();
    performanceCase.findFirst.mockResolvedValue({ id: 'case_existing', status: 'OPEN' });

    const result = await ensureOpenCase(db, TENANT, 'coach_1', 'ath_1', 'Assessment');

    expect(result).toMatchObject({ id: 'case_existing' });
    expect(performanceCase.create).not.toHaveBeenCalled();
  });

  it('creates a SINGLE_ASSESSMENT case when none is open', async () => {
    const { db, performanceCase } = fakeDb();

    await ensureOpenCase(db, TENANT, 'coach_1', 'ath_1', 'Movement screening');

    expect(argsOf(performanceCase.create).data).toMatchObject({
      type: 'SINGLE_ASSESSMENT',
      title: 'Movement screening',
      athleteId: 'ath_1',
    });
  });

  it('only ever adopts an OPEN case', async () => {
    const { db, performanceCase } = fakeDb();

    await ensureOpenCase(db, TENANT, 'coach_1', 'ath_1', 'Assessment');

    expect(argsOf(performanceCase.findFirst).where).toMatchObject({ status: 'OPEN' });
  });
});

describe('case service — status and end date stay in step', () => {
  it('stamps an end date when a case leaves OPEN', async () => {
    const { db, performanceCase } = fakeDb();

    await setCaseStatus(db, TENANT, 'case_1', 'CLOSED');

    expect(argsOf(performanceCase.updateMany).data?.['endedAt']).toBeInstanceOf(Date);
  });

  it('clears the end date when a case is reopened', async () => {
    const { db, performanceCase } = fakeDb();

    await setCaseStatus(db, TENANT, 'case_1', 'OPEN');

    expect(argsOf(performanceCase.updateMany).data?.['endedAt']).toBeNull();
  });
});
