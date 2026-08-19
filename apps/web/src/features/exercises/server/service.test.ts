import { describe, expect, it, vi } from 'vitest';

import type { PrismaClientInstance } from '@apex/database';

import { listExercisesSchema } from '../schemas';

import {
  countExercises,
  createExercise,
  getExercise,
  listExercises,
  removeExercise,
  setExerciseArchived,
  updateExercise,
  variantsOf,
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
/** A second workspace, used to prove no filter can reach across the boundary. */
const OTHER_TENANT = { organizationId: 'org_b' };

interface QueryArgs {
  where: Record<string, unknown>;
  data?: Record<string, unknown>;
  orderBy?: unknown;
  /** Paging, present only when the caller asked for it. */
  take?: number;
  skip?: number;
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
  canonicalName: string;
  description: string | null;
  instructions: string[];
  primaryMuscles: string[];
  secondaryMuscles: string[];
  equipment: string[];
  category: string | null;
  forceType: string | null;
  mechanic: string | null;
  difficulty: string | null;
  unilateral: boolean;
  media: unknown;
  source: string | null;
  sourceId: string | null;
  license: string | null;
  archivedAt: Date | null;
  organizationId: string | null;
  createdByCoachId: string | null;
  createdAt: Date;
}

const systemRow: ExerciseRow = {
  id: 'ex_system',
  key: 'bench_press',
  name: 'Bankdrücken',
  canonicalName: 'Bench Press',
  description: null,
  instructions: [],
  primaryMuscles: [],
  secondaryMuscles: [],
  equipment: [],
  category: null,
  forceType: null,
  mechanic: null,
  difficulty: null,
  unilateral: false,
  media: null,
  source: null,
  sourceId: null,
  license: null,
  archivedAt: null,
  organizationId: null,
  createdByCoachId: null,
  createdAt: new Date(),
};

const workspaceRow: ExerciseRow = {
  ...systemRow,
  id: 'ex_own',
  key: 'hip_thrust',
  name: 'Hüftheben',
  canonicalName: 'Hip Thrust',
  organizationId: 'org_a',
  createdByCoachId: 'coach_1',
};

/** The catalogue fields a form submits — everything but key and provenance. */
const catalogueInput = {
  name: 'Hüftheben',
  canonicalName: 'Hip Thrust',
  instructions: [],
  primaryMuscles: [],
  secondaryMuscles: [],
  equipment: [],
  unilateral: false,
  media: [],
};

function fakeDb(rows: ExerciseRow[] = []) {
  const exercise = {
    findMany: vi.fn<(args: QueryArgs) => Promise<unknown[]>>().mockResolvedValue(rows),
    findFirst: vi.fn<(args: QueryArgs) => Promise<unknown>>().mockResolvedValue(rows[0] ?? null),
    count: vi.fn<(args: QueryArgs) => Promise<number>>().mockResolvedValue(rows.length),
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
  const exerciseVariant = {
    findMany: vi.fn<(args: QueryArgs) => Promise<unknown[]>>().mockResolvedValue([]),
    upsert: vi.fn<(args: QueryArgs) => Promise<unknown>>().mockResolvedValue({}),
    deleteMany: vi
      .fn<(args: QueryArgs) => Promise<{ count: number }>>()
      .mockResolvedValue({ count: 1 }),
  };

  return {
    db: { exercise, measurement, exerciseVariant } as unknown as Pick<
      PrismaClientInstance,
      'exercise' | 'measurement' | 'exerciseVariant'
    >,
    exercise,
    measurement,
    exerciseVariant,
  };
}

const argsOf = (mock: { mock: { calls: [QueryArgs][] } }, index = 0): QueryArgs => {
  const args = mock.mock.calls[index]?.[0];
  if (!args) throw new Error(`expected a call at index ${index}`);

  return args;
};

describe('reads see this workspace and the system catalogue', () => {
  it('filters on this workspace or system-wide, never on neither', async () => {
    const { db, exercise } = fakeDb();

    await listExercises(db, TENANT, { includeArchived: false });

    expect(argsOf(exercise.findMany).where).toMatchObject({
      AND: [{ OR: [{ organizationId: 'org_a' }, { organizationId: null }] }],
    });
  });

  /**
   * The tenant filter and the search are both `OR`s, and Prisma takes one
   * `where` object — so a second `OR` key would **replace** the first. This is
   * the test that catches a search quietly widening the query to every
   * workspace, which is why it asserts the tenant clause is still there rather
   * than merely that the search clause arrived.
   */
  it('keeps the tenant filter when a search is added', async () => {
    const { db, exercise } = fakeDb();

    await listExercises(db, TENANT, { search: 'kniebeuge', includeArchived: false });

    const where = argsOf(exercise.findMany).where as { AND: Record<string, unknown>[] };

    expect(where.AND).toHaveLength(2);
    expect(where.AND[0]).toMatchObject({
      OR: [{ organizationId: 'org_a' }, { organizationId: null }],
    });
    expect(JSON.stringify(where.AND[1])).toContain('canonicalName');
  });

  it('searches the German name and the canonical English one', async () => {
    const { db, exercise } = fakeDb();

    await listExercises(db, TENANT, { search: 'squat', includeArchived: false });

    const rendered = JSON.stringify(argsOf(exercise.findMany).where);

    expect(rendered).toContain('"name"');
    expect(rendered).toContain('"canonicalName"');
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

    await createExercise(db, TENANT, 'coach_1', catalogueInput);

    expect(argsOf(exercise.create).data).toMatchObject({
      organizationId: 'org_a',
      createdByCoachId: 'coach_1',
      name: 'Hüftheben',
      canonicalName: 'Hip Thrust',
    });
  });

  it('derives a stable key from the name', async () => {
    const { db, exercise } = fakeDb();

    await createExercise(db, TENANT, 'coach_1', {
      ...catalogueInput,
      name: 'Bulgarian Split Squat',
    });

    expect(argsOf(exercise.create).data?.['key']).toBe('bulgarian_split_squat');
  });

  it('scopes an edit, so a system row is out of reach by construction', async () => {
    const { db, exercise } = fakeDb([workspaceRow]);

    await updateExercise(db, TENANT, {
      ...catalogueInput,
      exerciseId: 'ex_system',
      name: 'Renamed',
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
      ...catalogueInput,
      exerciseId: 'ex_system',
      name: 'Renamed',
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

describe('listing with filters', () => {
  const call = async (input: Record<string, unknown> = {}) => {
    const { db, exercise } = fakeDb();
    await listExercises(db, TENANT, listExercisesSchema.parse(input));

    return argsOf(exercise.findMany).where;
  };

  it('adds no narrowing when nothing was asked for', async () => {
    const where = await call({});

    expect(where['category']).toBeUndefined();
    expect(where['unilateral']).toBeUndefined();
    expect((where['AND'] as unknown[]).length).toBe(1);
  });

  it('narrows by each scalar filter', async () => {
    const where = await call({
      category: 'strength',
      difficulty: 'beginner',
      forceType: 'pull',
      mechanic: 'isolation',
      unilateral: true,
    });

    expect(where).toMatchObject({
      category: 'strength',
      difficulty: 'beginner',
      forceType: 'pull',
      mechanic: 'isolation',
      unilateral: true,
    });
  });

  /**
   * `hasEvery`, because "chest and dumbbell" means both. `hasSome` would widen
   * a deliberate narrowing into an either/or and quietly return more.
   */
  it('requires every value of a list filter, not any', async () => {
    const where = await call({ primaryMuscles: ['chest', 'triceps'], equipment: 'dumbbell' });
    const and = where['AND'] as Record<string, unknown>[];

    expect(and).toContainEqual({ primaryMuscles: { hasEvery: ['chest', 'triceps'] } });
    expect(and).toContainEqual({ equipment: { hasEvery: ['dumbbell'] } });
  });

  it('takes a single value as well as a list', async () => {
    const where = await call({ equipment: 'dumbbell' });

    expect(where['AND']).toContainEqual({ equipment: { hasEvery: ['dumbbell'] } });
  });

  it('keeps the tenant clause when search and filters are combined', async () => {
    const where = await call({ search: 'Kniebeuge', category: 'strength' });
    const and = where['AND'] as Record<string, unknown>[];

    expect(and[0]).toEqual({
      OR: [{ organizationId: TENANT.organizationId }, { organizationId: null }],
    });
    expect(where['category']).toBe('strength');
  });

  it('still hides archived exercises unless asked', async () => {
    expect((await call({ category: 'strength' }))['archivedAt']).toBeNull();
    expect((await call({ includeArchived: true }))['archivedAt']).toBeUndefined();
  });

  it('refuses a value outside the vocabulary instead of returning nothing', () => {
    expect(() => listExercisesSchema.parse({ category: 'cardio' })).toThrow();
    expect(() => listExercisesSchema.parse({ mechanic: 'compund' })).toThrow();
  });
});

describe('relationships carry their kind', () => {
  it('returns alternative as alternative and related as related', async () => {
    const { db, exercise, exerciseVariant } = fakeDb();

    exerciseVariant.findMany.mockResolvedValue([
      { exerciseId: 'ex_1', variantId: 'ex_2', type: 'alternative' },
      { exerciseId: 'ex_3', variantId: 'ex_1', type: 'related' },
    ]);
    exercise.findMany.mockResolvedValue([
      { ...systemRow, id: 'ex_2', name: 'Zwei' },
      { ...systemRow, id: 'ex_3', name: 'Drei' },
    ]);

    const result = await variantsOf(db, TENANT, 'ex_1');

    // The defect this guards: reading the rows without `type` turned every
    // alternative into a mere related, and no count would have shown it.
    expect(result.map((entry) => [entry.id, entry.relationship])).toEqual([
      ['ex_2', 'alternative'],
      ['ex_3', 'related'],
    ]);
  });

  it('reads the type whichever side of the pair the exercise is on', async () => {
    const { db, exercise, exerciseVariant } = fakeDb();

    // The link is stored with the smaller id first; asking from the other side
    // must yield the same kind.
    exerciseVariant.findMany.mockResolvedValue([
      { exerciseId: 'ex_1', variantId: 'ex_9', type: 'alternative' },
    ]);
    exercise.findMany.mockResolvedValue([{ ...systemRow, id: 'ex_1', name: 'Eins' }]);

    const result = await variantsOf(db, TENANT, 'ex_9');

    expect(result[0]?.relationship).toBe('alternative');
  });
});

describe('paging never points past the result', () => {
  const call = async (input: Record<string, unknown>) => {
    const { db, exercise } = fakeDb();
    await listExercises(db, TENANT, listExercisesSchema.parse(input));

    return argsOf(exercise.findMany);
  };

  it('passes take and skip straight through', async () => {
    const args = await call({ limit: 25, offset: 50 });

    expect(args.take).toBe(25);
    expect(args.skip).toBe(50);
  });

  /**
   * The assessment builder reads the same list and expects the whole catalogue.
   * A default page size here would have truncated its picker silently.
   */
  it('fetches everything when no paging was asked for', async () => {
    const args = await call({});

    expect(args.take).toBeUndefined();
    expect(args.skip).toBeUndefined();
  });

  it('pages a filtered result the same way', async () => {
    const args = await call({ category: 'strength', limit: 25, offset: 0 });

    expect(args.take).toBe(25);
    expect(args.where['category']).toBe('strength');
  });
});

/**
 * The origin filter (§ catalogue scopes).
 *
 * What is asserted is the `where` clause, because that is where the guarantee
 * lives: narrowing by origin must never become a way to reach another
 * workspace's exercises.
 */
describe('filtering by origin', () => {
  const whereOf = (mock: { mock: { calls: [{ where: Record<string, unknown> }][] } }) =>
    mock.mock.calls[0]?.[0].where ?? {};

  const tenantClause = (where: Record<string, unknown>) =>
    (where['AND'] as Record<string, unknown>[])[0];

  it('reads this workspace or the shared catalogue by default', async () => {
    const { db, exercise } = fakeDb();

    await listExercises(db, TENANT, { includeArchived: false });

    expect(tenantClause(whereOf(exercise.findMany))).toEqual({
      OR: [{ organizationId: 'org_a' }, { organizationId: null }],
    });
  });

  it('selects only the shared catalogue', async () => {
    // `organizationId: null` is a row owned by no workspace — it cannot be
    // another tenant's.
    const { db, exercise } = fakeDb();

    await listExercises(db, TENANT, { includeArchived: false, origin: 'system' });

    expect(tenantClause(whereOf(exercise.findMany))).toEqual({ organizationId: null });
  });

  it("selects only this workspace's own", async () => {
    const { db, exercise } = fakeDb();

    await listExercises(db, TENANT, { includeArchived: false, origin: 'workspace' });

    expect(tenantClause(whereOf(exercise.findMany))).toEqual({ organizationId: 'org_a' });
  });

  it('never names another workspace, whichever origin is asked for', async () => {
    for (const origin of ['all', 'system', 'workspace'] as const) {
      const { db, exercise } = fakeDb();

      await listExercises(db, OTHER_TENANT, { includeArchived: false, origin });

      expect(JSON.stringify(whereOf(exercise.findMany)), origin).not.toContain('org_a');
    }
  });

  it('applies the same narrowing to the count', async () => {
    // The count and the list must not drift: a "3 Treffer" over a list of 276
    // would be worse than either number alone.
    const { db, exercise } = fakeDb();

    await countExercises(db, TENANT, { includeArchived: false, origin: 'workspace' });

    expect(tenantClause(whereOf(exercise.count))).toEqual({ organizationId: 'org_a' });
  });
});
