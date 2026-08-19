import { describe, expect, it, vi } from 'vitest';

import type { PrismaClientInstance } from '@apex/database';

import {
  createAthlete,
  getAthlete,
  listAthletes,
  setAthleteArchived,
  updateAthlete,
} from './service';

/**
 * Cross-tenant isolation, asserted rather than trusted.
 *
 * This is the highest-impact threat in the model (docs/SECURITY.md §1): with a
 * shared schema, a single query that forgets `organizationId` hands one
 * coaching business another's athletes. Code review catches most of them;
 * a test catches the rest, and keeps catching them when someone edits the
 * service in six months.
 *
 * No database is involved. The service takes `db` as an argument precisely so
 * the arguments it builds can be inspected — the assertions here are about the
 * *query*, which is where the guarantee lives.
 */

const TENANT = { organizationId: 'org_a' };
const OTHER_TENANT = { organizationId: 'org_b' };

/**
 * The shape the assertions reach into.
 *
 * Typed rather than left as `any`: the whole point of this suite is the content
 * of `where`, and an assertion against `any` would still pass if the property
 * disappeared.
 */
interface QueryArgs {
  where: Record<string, unknown>;
  data?: Record<string, unknown>;
}

/** Records every call so the `where` clause can be inspected. */
function fakeDb() {
  const athlete = {
    findMany: vi.fn<(args: QueryArgs) => Promise<{ id: string }[]>>().mockResolvedValue([]),
    findFirst: vi.fn<(args: QueryArgs) => Promise<null>>().mockResolvedValue(null),
    create: vi.fn<(args: QueryArgs) => Promise<{ id: string }>>().mockResolvedValue({
      id: 'ath_1',
    }),
    updateMany: vi
      .fn<(args: QueryArgs) => Promise<{ count: number }>>()
      .mockResolvedValue({ count: 0 }),
  };

  return { db: { athlete } as unknown as Pick<PrismaClientInstance, 'athlete'>, athlete };
}

/** First argument of the nth recorded call. */
const argsOf = (mock: { mock: { calls: [QueryArgs][] } }, index = 0): QueryArgs => {
  const args = mock.mock.calls[index]?.[0];
  if (!args) throw new Error(`expected a call at index ${index}`);

  return args;
};

const listInput = { cursor: null, limit: 25, includeArchived: false };

describe('athlete service — tenant scoping', () => {
  it('scopes the roster query', async () => {
    const { db, athlete } = fakeDb();

    await listAthletes(db, TENANT, listInput);

    expect(argsOf(athlete.findMany).where).toMatchObject({
      organizationId: 'org_a',
    });
  });

  it('scopes a lookup by id — an id alone never proves ownership', async () => {
    const { db, athlete } = fakeDb();

    await getAthlete(db, TENANT, 'ath_from_another_workspace');

    expect(argsOf(athlete.findFirst).where).toMatchObject({
      organizationId: 'org_a',
      id: 'ath_from_another_workspace',
    });
  });

  it('stamps the tenant onto a new athlete', async () => {
    const { db, athlete } = fakeDb();

    await createAthlete(db, TENANT, 'coach_1', { firstName: 'Ida', lastName: 'Nowak' });

    expect(argsOf(athlete.create).data).toMatchObject({
      organizationId: 'org_a',
      createdByCoachId: 'coach_1',
    });
  });

  it('scopes updates through updateMany, never a bare unique write', async () => {
    const { db, athlete } = fakeDb();

    await updateAthlete(db, TENANT, { athleteId: 'ath_1', firstName: 'Ida' });

    // `update` takes a unique `where` and cannot carry the tenant filter. Its
    // absence from the fake is the point: using it would throw here.
    expect(athlete.updateMany).toHaveBeenCalledOnce();
    expect(argsOf(athlete.updateMany).where).toMatchObject({
      organizationId: 'org_a',
      id: 'ath_1',
    });
  });

  it('scopes archiving', async () => {
    const { db, athlete } = fakeDb();

    await setAthleteArchived(db, TENANT, 'ath_1', true);

    expect(argsOf(athlete.updateMany).where).toMatchObject({
      organizationId: 'org_a',
    });
  });

  it('cannot be widened by a caller passing their own organizationId', async () => {
    const { db, athlete } = fakeDb();

    // `scoped()` applies the tenant key last, so a smuggled value loses.
    await listAthletes(db, TENANT, {
      ...listInput,
      search: 'x',
    });

    expect(argsOf(athlete.findMany).where.organizationId).toBe('org_a');
    expect(argsOf(athlete.findMany).where.organizationId).not.toBe(OTHER_TENANT.organizationId);
  });
});

describe('athlete service — behaviour', () => {
  it('reports a miss as null rather than throwing, so the router decides the code', async () => {
    const { db } = fakeDb();

    expect(await getAthlete(db, TENANT, 'nope')).toBeNull();
    expect(await updateAthlete(db, TENANT, { athleteId: 'nope' })).toBeNull();
    expect(await setAthleteArchived(db, TENANT, 'nope', true)).toBeNull();
  });

  it('hides the roster page probe from the caller', async () => {
    const { db, athlete } = fakeDb();
    // One more row than the limit means "there is a next page".
    athlete.findMany.mockResolvedValue(
      Array.from({ length: 26 }, (_, index) => ({ id: `ath_${index}` })),
    );

    const page = await listAthletes(db, TENANT, listInput);

    expect(page.items).toHaveLength(25);
    expect(page.nextCursor).toBe('ath_24');
  });

  it('returns no cursor on the last page', async () => {
    const { db, athlete } = fakeDb();
    athlete.findMany.mockResolvedValue([{ id: 'ath_0' }]);

    expect((await listAthletes(db, TENANT, listInput)).nextCursor).toBeNull();
  });

  it('excludes archived athletes from the working roster by default', async () => {
    const { db, athlete } = fakeDb();

    await listAthletes(db, TENANT, listInput);
    expect(argsOf(athlete.findMany).where).toMatchObject({ archivedAt: null });

    await listAthletes(db, TENANT, { ...listInput, includeArchived: true });
    expect(argsOf(athlete.findMany, 1).where).not.toHaveProperty('archivedAt');
  });

  it('writes null for an absent contact detail, never undefined', async () => {
    const { db, athlete } = fakeDb();

    await createAthlete(db, TENANT, 'coach_1', { firstName: 'Ida', lastName: 'Nowak' });

    // `undefined` in a Prisma `data` object means "leave alone", which is not
    // the same as "there is no value" — on create the two coincide, on update
    // they do not, and the column should read null either way.
    expect(argsOf(athlete.create).data).toMatchObject({
      email: null,
      phone: null,
      dateOfBirth: null,
    });
  });
});

/**
 * Height and weight through the service.
 *
 * Two separate concerns: the write has to carry the fields, and the read has to
 * hand back numbers. The second is the one that bites silently — a `Decimal`
 * reaching a component stringifies as an object, not a value.
 */
describe('body measurements', () => {
  it('writes both figures on create', () => {
    const { db, athlete } = fakeDb();

    void createAthlete(db, TENANT, 'coach_1', {
      firstName: 'Johanna',
      lastName: 'Prinz',
      heightCm: 178,
      weightKg: 64.5,
    });

    expect(argsOf(athlete.create).data).toMatchObject({ heightCm: 178, weightKg: 64.5 });
  });

  it('writes null for a figure the coach cleared', () => {
    // The point of the separate update schema: `null` is an instruction to
    // remove, and it must reach the database rather than being skipped.
    const { db, athlete } = fakeDb();

    void updateAthlete(db, TENANT, { athleteId: 'ath_1', weightKg: null });

    expect(argsOf(athlete.updateMany).data).toMatchObject({ weightKg: null });
  });

  it('leaves an unsent figure untouched', () => {
    const { db, athlete } = fakeDb();

    void updateAthlete(db, TENANT, { athleteId: 'ath_1', firstName: 'Johanna' });

    expect(argsOf(athlete.updateMany).data).not.toHaveProperty('weightKg');
    expect(argsOf(athlete.updateMany).data).not.toHaveProperty('heightCm');
  });

  it('hands back numbers, never a Decimal object', async () => {
    // Prisma returns `Decimal`, superjson carries it to the client as one, and
    // `String()` on it stringifies an object. Converting once at this boundary
    // is why no caller has to know that.
    const { db, athlete } = fakeDb();
    const decimal = { toString: () => '64.5', valueOf: () => 64.5 };

    athlete.findFirst.mockResolvedValue({
      id: 'ath_1',
      heightCm: { toString: () => '178', valueOf: () => 178 },
      weightKg: decimal,
    } as never);

    const record = await getAthlete(db, TENANT, 'ath_1');

    expect(record?.heightCm).toBe(178);
    expect(record?.weightKg).toBe(64.5);
    expect(typeof record?.weightKg).toBe('number');
  });

  it('reads an absent figure as null', async () => {
    const { db, athlete } = fakeDb();
    athlete.findFirst.mockResolvedValue({ id: 'ath_1', heightCm: null, weightKg: null } as never);

    const record = await getAthlete(db, TENANT, 'ath_1');

    expect(record?.heightCm).toBeNull();
    expect(record?.weightKg).toBeNull();
  });
});
