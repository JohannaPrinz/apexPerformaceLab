import { describe, expect, it, vi } from 'vitest';

import {
  deleteOwnTemplate,
  listOwnTemplates,
  renameOwnTemplate,
  saveOwnTemplate,
} from './module-templates';

/**
 * The configurations a workspace saved for itself.
 *
 * What is pinned here is the boundary and the reading: every query carries the
 * workspace, a write reaches nothing outside it, and a payload this code can no
 * longer understand is left out of the list rather than guessed at.
 */

const TENANT = { organizationId: 'org_a' };

const CONFIGURATION = {
  measurementTypes: [{ measurementTypeId: 'mt_lactate', role: 'required' as const }],
  exerciseIds: [],
  passes: 4,
  recordsSide: false,
  dimensions: [],
};

interface Args {
  where?: Record<string, unknown>;
  data?: Record<string, unknown>;
}

function fakeDb(rows: unknown[] = []) {
  const moduleTemplate = {
    findMany: vi.fn<(args: Args) => Promise<unknown[]>>().mockResolvedValue(rows),
    create: vi.fn<(args: Args) => Promise<unknown>>().mockResolvedValue({
      id: 'tpl_1',
      name: 'Unser Stufentest',
      moduleKey: 'lactate',
      payload: CONFIGURATION,
      moduleVersion: 2,
      createdAt: new Date('2026-09-02T10:00:00.000Z'),
    }),
    updateMany: vi.fn<(args: Args) => Promise<{ count: number }>>().mockResolvedValue({ count: 1 }),
    deleteMany: vi.fn<(args: Args) => Promise<{ count: number }>>().mockResolvedValue({ count: 1 }),
  };

  return {
    db: { moduleTemplate } as unknown as Parameters<typeof listOwnTemplates>[0],
    moduleTemplate,
  };
}

const row = (over: Record<string, unknown> = {}) => ({
  id: 'tpl_1',
  name: 'Unser Stufentest',
  moduleKey: 'lactate',
  payload: CONFIGURATION,
  moduleVersion: 2,
  createdAt: new Date('2026-09-02T10:00:00.000Z'),
  ...over,
});

describe('the workspace boundary', () => {
  it('asks for one workspace when listing', async () => {
    const fake = fakeDb([row()]);

    await listOwnTemplates(fake.db, TENANT);

    expect(fake.moduleTemplate.findMany.mock.calls[0]?.[0].where).toMatchObject({
      organizationId: 'org_a',
    });
  });

  it('writes the workspace onto what it saves', async () => {
    const fake = fakeDb();

    await saveOwnTemplate(fake.db, TENANT, 'coach_1', {
      name: 'Unser Stufentest',
      moduleKey: 'lactate',
      configuration: CONFIGURATION,
    });

    expect(fake.moduleTemplate.create.mock.calls[0]?.[0].data).toMatchObject({
      organizationId: 'org_a',
      createdByCoachId: 'coach_1',
      name: 'Unser Stufentest',
    });
  });

  it('renames through a filter that carries the workspace', async () => {
    const fake = fakeDb();

    await renameOwnTemplate(fake.db, TENANT, 'tpl_1', 'Neuer Name');

    // `updateMany` with the tenant in the filter, never a bare `update`: an id
    // from elsewhere then changes nothing instead of reaching across.
    expect(fake.moduleTemplate.updateMany.mock.calls[0]?.[0].where).toMatchObject({
      id: 'tpl_1',
      organizationId: 'org_a',
    });
  });

  it('deletes through the same filter', async () => {
    const fake = fakeDb();

    await deleteOwnTemplate(fake.db, TENANT, 'tpl_1');

    expect(fake.moduleTemplate.deleteMany.mock.calls[0]?.[0].where).toMatchObject({
      id: 'tpl_1',
      organizationId: 'org_a',
    });
  });

  it("answers false where the row was not this workspace's", async () => {
    const fake = fakeDb();
    fake.moduleTemplate.updateMany.mockResolvedValue({ count: 0 });
    fake.moduleTemplate.deleteMany.mockResolvedValue({ count: 0 });

    await expect(renameOwnTemplate(fake.db, TENANT, 'tpl_x', 'x')).resolves.toBe(false);
    await expect(deleteOwnTemplate(fake.db, TENANT, 'tpl_x')).resolves.toBe(false);
  });
});

describe('reading a stored configuration back', () => {
  it('returns what the domain can read', async () => {
    const found = await listOwnTemplates(fakeDb([row()]).db, TENANT);

    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({ id: 'tpl_1', name: 'Unser Stufentest', moduleKey: 'lactate' });
    expect(found[0]?.configuration.passes).toBe(4);
  });

  it('leaves out a payload it cannot understand rather than guessing', async () => {
    // A template that silently proposed something other than what was saved
    // would be worse than one that is missing.
    const found = await listOwnTemplates(
      fakeDb([row(), row({ id: 'tpl_2', payload: { nonsense: true } })]).db,
      TENANT,
    );

    expect(found.map((entry) => entry.id)).toEqual(['tpl_1']);
  });

  it('trims the name it stores', async () => {
    const fake = fakeDb();

    await saveOwnTemplate(fake.db, TENANT, 'coach_1', {
      name: '  Unser Stufentest  ',
      moduleKey: 'lactate',
      configuration: CONFIGURATION,
    });

    expect(fake.moduleTemplate.create.mock.calls[0]?.[0].data).toMatchObject({
      name: 'Unser Stufentest',
    });
  });
});
