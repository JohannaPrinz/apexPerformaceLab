import { describe, expect, it, vi } from 'vitest';

import type { PrismaClientInstance } from '@apex/database';

import {
  createExercise,
  getExercise,
  listExercises,
  removeExercise,
  setExerciseArchived,
  updateExercise,
} from './service';

/**
 * Two guarantees, and they pull in opposite directions — which is why they are
 * tested together.
 *
 * **Reads must see the system catalogue.** A system exercise carries
 * `organizationId = null`; a strict tenant filter would hide the whole shipped
 * catalogue. Reads use `this workspace OR system-wide`.
 *
 * **Writes must not.** Every mutation is `scoped()`, which pins
 * `organizationId` to this workspace and therefore cannot match a system row at
 * all. A system exercise is protected by the shape of the query, not only by a
 * rule someone remembered to check.
 */

const TENANT = { organizationId: 'org_a' };

interface QueryArgs {
  where: Record<string, unknown>;
  data?: Record<string, unknown>;
  orderBy?: unknown;
}

/**
 * Annotated rather than inferred: `systemRow` would otherwise narrow
 * `organizationId` to `null`, and the workspace row spread from it could not
 * widen back to a string.
 */
interface ExerciseRow {
  id: string;
  key: string;
  name: string;
  description: string | null;
  muscleGroups: string[];
  archivedAt: Date | null;
  organizationId: string | null;
  createdByCoachId: string | null;
  createdAt: Date;
}

const systemRow: ExerciseRow = {
  id: 'ex_system',
  key: 'bench_press',
  name: 'Bench Press',
  description: null,
  muscleGroups: [],
  archivedAt: null,
  organizationId: null,
  createdByCoachId: null,
  createdAt: new Date(),
};

const workspaceRow: ExerciseRow = {
  ...systemRow,
  id: 'ex_own',
  key: 'hip_thrust',
  name: 'Hip thrust',
  organizationId: 'org_a',
  createdByCoachId: 'coach_1',
};

function fakeDb(rows: ExerciseRow[] = []) {
  const exercise = {
    findMany: vi.fn<(args: QueryArgs) => Promise<unknown[]>>().mockResolvedValue(rows),
    findFirst: vi.fn<(args: QueryArgs) => Promise<unknown>>().mockResolvedValue(rows[0] ?? null),
    create: vi.fn<(args: QueryArgs) => Promise<unknown>>().mockResolvedValue(workspaceRow),
    updateMany: vi
      .fn<(args: QueryArgs) => Promise<{ count: number }>>()
      .mockResolvedValue({ count: 1 }),
    deleteMany: vi
      .fn<(args: QueryArgs) => Promise<{ count: number }>>()
      .mockResolvedValue({ count: 1 }),
  };
  const measurement = {
    count: vi.fn<(args: QueryArgs) => Promise<number>>().mockResolvedValue(0),
  };

  return {
    db: { exercise, measurement } as unknown as Pick<
      PrismaClientInstance,
      'exercise' | 'measurement'
    >,
    exercise,
    measurement,
  };
}

const argsOf = (mock: { mock: { calls: [QueryArgs][] } }, index = 0): QueryArgs => {
  const args = mock.mock.calls[index]?.[0];
  if (!args) throw new Error(`expected a call at index ${index}`);

  return args;
};

describe('reads see this workspace and the system catalogue', () => {
  it('filters on “this workspace OR system-wide”, never on neither', () => {
    const { db, exercise } = fakeDb();

    void listExercises(db, TENANT, { includeArchived: false });

    expect(argsOf(exercise.findMany).where).toMatchObject({
      OR: [{ organizationId: 'org_a' }, { organizationId: null }],
    });
  });

  it('never names another workspace', async () => {
    const { db, exercise } = fakeDb();

    await listExercises(db, TENANT, { includeArchived: false });

    const serialised = JSON.stringify(argsOf(exercise.findMany).where);
    expect(serialised).toContain('org_a');
    expect(serialised).not.toContain('org_b');
  });

  it('hides archived exercises unless asked', async () => {
    const { db, exercise } = fakeDb();

    await listExercises(db, TENANT, { includeArchived: false });
    expect(argsOf(exercise.findMany).where).toMatchObject({ archivedAt: null });

    await listExercises(db, TENANT, { includeArchived: true });
    expect(argsOf(exercise.findMany, 1).where).not.toHaveProperty('archivedAt');
  });

  it('marks a system exercise as not editable, a workspace one as editable', async () => {
    const system = await getExercise(...([fakeDb([systemRow]).db, TENANT, 'ex_system'] as const));
    expect(system?.scope).toBe('SYSTEM');
    expect(system?.editable).toBe(false);

    const own = await getExercise(...([fakeDb([workspaceRow]).db, TENANT, 'ex_own'] as const));
    expect(own?.scope).toBe('WORKSPACE');
    expect(own?.editable).toBe(true);
  });
});

describe('writes are scoped and therefore cannot reach a system exercise', () => {
  it('stamps the tenant and the author onto a new exercise', async () => {
    const { db, exercise } = fakeDb();

    await createExercise(db, TENANT, 'coach_1', { name: 'Hip thrust', muscleGroups: [] });

    expect(argsOf(exercise.create).data).toMatchObject({
      organizationId: 'org_a',
      createdByCoachId: 'coach_1',
      name: 'Hip thrust',
    });
  });

  it('derives a stable key from the name', async () => {
    const { db, exercise } = fakeDb();

    await createExercise(db, TENANT, 'coach_1', {
      name: 'Bulgarian Split Squat',
      muscleGroups: [],
    });

    expect(argsOf(exercise.create).data?.['key']).toBe('bulgarian_split_squat');
  });

  it('scopes an edit, so a system row is out of reach by construction', async () => {
    const { db, exercise } = fakeDb([workspaceRow]);

    await updateExercise(db, TENANT, {
      exerciseId: 'ex_system',
      name: 'Renamed',
      muscleGroups: [],
    });

    expect(argsOf(exercise.updateMany).where).toMatchObject({
      organizationId: 'org_a',
      id: 'ex_system',
    });
  });

  it('reports a system exercise as not found rather than forbidden', async () => {
    const { db, exercise } = fakeDb();
    exercise.updateMany.mockResolvedValue({ count: 0 });

    const result = await updateExercise(db, TENANT, {
      exerciseId: 'ex_system',
      name: 'Renamed',
      muscleGroups: [],
    });

    // FORBIDDEN would confirm the row exists (docs/SECURITY.md §4).
    expect(result).toEqual({ ok: false, reason: 'NOT_FOUND' });
  });

  it('scopes archiving', async () => {
    const { db, exercise } = fakeDb([workspaceRow]);

    await setExerciseArchived(db, TENANT, 'ex_own', true);

    expect(argsOf(exercise.updateMany).where).toMatchObject({
      organizationId: 'org_a',
      id: 'ex_own',
    });
    expect(argsOf(exercise.updateMany).data?.['archivedAt']).toBeInstanceOf(Date);
  });

  it('restores by clearing the archive stamp rather than by a second flag', async () => {
    const { db, exercise } = fakeDb([workspaceRow]);

    await setExerciseArchived(db, TENANT, 'ex_own', false);

    expect(argsOf(exercise.updateMany).data?.['archivedAt']).toBeNull();
  });
});

describe('deleting versus archiving', () => {
  it('deletes an unused workspace exercise', async () => {
    const { db, exercise } = fakeDb([workspaceRow]);

    expect(await removeExercise(db, TENANT, 'ex_own')).toEqual({ ok: true });
    expect(argsOf(exercise.deleteMany).where).toMatchObject({ organizationId: 'org_a' });
  });

  it('refuses to delete a workspace exercise that has measurements', async () => {
    const { db, measurement, exercise } = fakeDb([workspaceRow]);
    measurement.count.mockResolvedValue(4);

    expect(await removeExercise(db, TENANT, 'ex_own')).toEqual({ ok: false, reason: 'IN_USE' });
    expect(exercise.deleteMany).not.toHaveBeenCalled();
  });

  it('counts usage inside the tenant only', async () => {
    const { db, measurement } = fakeDb([workspaceRow]);

    await removeExercise(db, TENANT, 'ex_own');

    expect(argsOf(measurement.count).where).toMatchObject({
      organizationId: 'org_a',
      exerciseId: 'ex_own',
    });
  });

  it('refuses to delete a system exercise even when unused', async () => {
    const { db, exercise } = fakeDb([systemRow]);

    expect(await removeExercise(db, TENANT, 'ex_system')).toEqual({
      ok: false,
      reason: 'SYSTEM_EXERCISE',
    });
    expect(exercise.deleteMany).not.toHaveBeenCalled();
  });
});
