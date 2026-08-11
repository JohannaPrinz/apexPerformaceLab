import { describe, expect, it, vi } from 'vitest';

import type { PrismaClientInstance } from '@apex/database';

import { getCase, listCasesForAthlete, setCaseStatus } from './service';

/**
 * Reads and the status transition. The writes moved to
 * `@/services/case-provisioning` when the assessments slice needed them too —
 * their tests moved with them.
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
    updateMany: vi
      .fn<(args: QueryArgs) => Promise<{ count: number }>>()
      .mockResolvedValue({ count: 0 }),
  };

  return {
    db: { performanceCase } as unknown as Pick<PrismaClientInstance, 'performanceCase'>,
    performanceCase,
  };
}

const argsOf = (mock: { mock: { calls: [QueryArgs][] } }, index = 0): QueryArgs => {
  const args = mock.mock.calls[index]?.[0];
  if (!args) throw new Error(`expected a call at index ${index}`);

  return args;
};

describe('case service — tenant scoping', () => {
  it("scopes the list of an athlete's cases", async () => {
    const { db, performanceCase } = fakeDb();

    await listCasesForAthlete(db, TENANT, { athleteId: 'ath_1' });

    expect(argsOf(performanceCase.findMany).where).toMatchObject({
      organizationId: 'org_a',
      athleteId: 'ath_1',
    });
  });

  it('scopes a lookup by id — an id alone never proves ownership', async () => {
    const { db, performanceCase } = fakeDb();

    await getCase(db, TENANT, 'case_from_another_workspace');

    expect(argsOf(performanceCase.findFirst).where).toMatchObject({
      organizationId: 'org_a',
      id: 'case_from_another_workspace',
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

  it('reports a miss as null so the router decides the code', async () => {
    const { db } = fakeDb();

    expect(await setCaseStatus(db, TENANT, 'nope', 'CLOSED')).toBeNull();
    expect(await getCase(db, TENANT, 'nope')).toBeNull();
  });
});
