import { describe, expect, it, vi } from 'vitest';

import type { PrismaClientInstance } from '@apex/database';

import {
  athleteWhere,
  countAthletesMatching,
  createAthlete,
  findAthleteDuplicates,
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
    count: vi.fn<(args: QueryArgs) => Promise<number>>().mockResolvedValue(0),
  };

  return { db: { athlete } as unknown as Pick<PrismaClientInstance, 'athlete'>, athlete };
}

/** First argument of the nth recorded call. */
const argsOf = (mock: { mock: { calls: [QueryArgs][] } }, index = 0): QueryArgs => {
  const args = mock.mock.calls[index]?.[0];
  if (!args) throw new Error(`expected a call at index ${index}`);

  return args;
};

const listInput = { cursor: null, limit: 25, status: 'active' as const };

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

    await listAthletes(db, TENANT, { ...listInput, status: 'all' as const });
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

/**
 * Editing another workspace's athlete.
 *
 * The regression this guards is the one that would not look like a bug in a
 * diff: `updateMany` with a tenant filter simply matches nothing, so the write
 * is silently a no-op. What must not happen is the service reporting success —
 * the router turns `null` into `NOT_FOUND`, and a coach probing ids learns
 * nothing about whether the row exists (docs/SECURITY.md §4).
 */
describe('editing across a tenant boundary', () => {
  it('writes nothing and reports null for another workspace’s athlete', async () => {
    const { db, athlete } = fakeDb();
    athlete.updateMany.mockResolvedValue({ count: 0 });

    const result = await updateAthlete(db, OTHER_TENANT, {
      athleteId: 'ath_owned_by_org_a',
      firstName: 'Fremd',
    });

    expect(result).toBeNull();
    expect(argsOf(athlete.updateMany).where).toMatchObject({ organizationId: 'org_b' });
    // A miss must not fall back to a second, unscoped read.
    expect(athlete.findFirst).not.toHaveBeenCalled();
  });

  it('ignores an organizationId smuggled in through the request', async () => {
    const { db, athlete } = fakeDb();

    await updateAthlete(db, TENANT, {
      athleteId: 'ath_1',
      organizationId: 'org_b',
    } as never);

    expect(argsOf(athlete.updateMany).where).toMatchObject({ organizationId: 'org_a' });
    expect(argsOf(athlete.updateMany).data).not.toHaveProperty('organizationId');
  });
});

/**
 * Duplicate detection (§7).
 *
 * The rules are asserted rather than the query, because the rules are where the
 * judgement lives: the database only narrows to "same name or same address",
 * and everything that decides whether a warning is worth showing happens after.
 */
describe('finding likely duplicates', () => {
  const row = (over: Record<string, unknown> = {}) => ({
    id: 'ath_existing',
    firstName: 'Johanna',
    lastName: 'Prinz',
    dateOfBirth: new Date('1994-03-17T00:00:00.000Z'),
    email: 'johanna@example.org',
    phone: null,
    heightCm: null,
    weightKg: null,
    archivedAt: null,
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
    userId: null,
    createdByCoachId: 'coach_1',
    ...over,
  });

  const find = async (
    rows: Record<string, unknown>[],
    candidate: Parameters<typeof findAthleteDuplicates>[2],
  ) => {
    const { db, athlete } = fakeDb();
    athlete.findMany.mockResolvedValue(rows as never);

    return { result: await findAthleteDuplicates(db, TENANT, candidate), athlete };
  };

  it('stays inside the workspace', async () => {
    const { athlete } = await find([], { firstName: 'Johanna', lastName: 'Prinz' });

    expect(argsOf(athlete.findMany).where).toMatchObject({ organizationId: 'org_a' });
  });

  it('does not exclude archived athletes', async () => {
    // The commonest duplicate of all: someone archived last season, re-entered
    // because the roster hides them by default.
    const { result, athlete } = await find([row({ archivedAt: new Date('2026-02-01') })], {
      firstName: 'Johanna',
      lastName: 'Prinz',
    });

    expect(argsOf(athlete.findMany).where).not.toHaveProperty('archivedAt');
    expect(result).toHaveLength(1);
    expect(result[0]?.athlete.archivedAt).not.toBeNull();
  });

  it('reports an identical address as the strongest reason', async () => {
    const { result } = await find([row({ firstName: 'Hanna', lastName: 'Prinz-Meier' })], {
      firstName: 'Johanna',
      lastName: 'Prinz',
      email: 'JOHANNA@example.org',
    });

    expect(result[0]?.reason).toBe('email');
  });

  it('reports a matching name and birthdate together', async () => {
    const { result } = await find([row()], {
      firstName: 'johanna',
      lastName: '  Prinz ',
      dateOfBirth: '1994-03-17',
    });

    expect(result[0]?.reason).toBe('name_and_birthdate');
  });

  it('rules out a namesake with a different birthdate', async () => {
    // Two people called Johanna Prinz born in different years are two people,
    // and saying so is what keeps the warning worth reading.
    const { result } = await find([row({ email: null })], {
      firstName: 'Johanna',
      lastName: 'Prinz',
      dateOfBirth: '2001-08-02',
    });

    expect(result).toEqual([]);
  });

  it('still warns on the name alone when a birthdate is missing', async () => {
    const { result } = await find([row({ dateOfBirth: null, email: null })], {
      firstName: 'Johanna',
      lastName: 'Prinz',
      dateOfBirth: '1994-03-17',
    });

    expect(result[0]?.reason).toBe('name');
  });

  it('does not fold umlauts', async () => {
    // Fuzzy matching turns a warning into noise. That is its own decision, not
    // something to slip in here.
    const { result } = await find([row({ firstName: 'Jürgen', lastName: 'Müller', email: null })], {
      firstName: 'Juergen',
      lastName: 'Mueller',
    });

    expect(result).toEqual([]);
  });

  it('lists the strongest reason first', async () => {
    const { result } = await find(
      [
        row({ id: 'ath_name', dateOfBirth: null, email: null }),
        row({ id: 'ath_mail', firstName: 'Hanna', lastName: 'Meier' }),
      ],
      { firstName: 'Johanna', lastName: 'Prinz', email: 'johanna@example.org' },
    );

    expect(result.map((entry) => entry.reason)).toEqual(['email', 'name']);
  });

  it('finds nothing when nothing is similar', async () => {
    expect((await find([], { firstName: 'Neu', lastName: 'Person' })).result).toEqual([]);
  });
});

/**
 * Finding a person by the name a coach would actually type.
 *
 * The clause is asserted rather than the result, because the clause is what the
 * database sees — and the previous shape could not match a full name at all:
 * one `contains` per column, and no column holds both names.
 */
describe('searching the roster', () => {
  const clauseFor = (search: string) =>
    athleteWhere(TENANT, { search, status: 'active' }) as Record<string, unknown>;

  it('asks both name columns for a single word', () => {
    expect(clauseFor('Prinz')['AND']).toEqual([
      {
        OR: [
          { firstName: { contains: 'Prinz', mode: 'insensitive' } },
          { lastName: { contains: 'Prinz', mode: 'insensitive' } },
        ],
      },
    ]);
  });

  it('requires every word of a full name to match something', () => {
    // "Johanna Prinz" is the commonest search a coach types and it used to
    // return nothing.
    const and = clauseFor('Johanna Prinz')['AND'] as unknown[];

    expect(and).toHaveLength(2);
    expect(JSON.stringify(and)).toContain('Johanna');
    expect(JSON.stringify(and)).toContain('Prinz');
  });

  it('does not care in which order the names were typed', () => {
    // AND is commutative, so the two clauses differ only in order — comparing
    // them as sets is the honest assertion.
    const asSet = (search: string) =>
      (clauseFor(search)['AND'] as unknown[]).map((entry) => JSON.stringify(entry)).sort();

    expect(asSet('Prinz Johanna')).toEqual(asSet('Johanna Prinz'));
  });

  it('ignores stray whitespace rather than searching for it', () => {
    expect((clauseFor('  Prinz   Johanna  ')['AND'] as unknown[]).length).toBe(2);
  });

  it('searches nothing when nothing was typed', () => {
    expect(athleteWhere(TENANT, { status: 'active' })).not.toHaveProperty('AND');
  });

  it('stays inside the workspace whatever was searched for', () => {
    expect(clauseFor('Prinz')['organizationId']).toBe('org_a');
  });
});

/**
 * The three states of the roster filter.
 *
 * `active` is the default and the working list; `archived` is the one the
 * previous boolean could not express, and it is the case a coach hits when
 * looking for someone they deactivated last season.
 */
describe('filtering by status', () => {
  it('hides archived athletes by default', () => {
    expect(athleteWhere(TENANT, {})).toMatchObject({ archivedAt: null });
  });

  it('shows only archived ones when asked', () => {
    expect(athleteWhere(TENANT, { status: 'archived' })).toMatchObject({
      archivedAt: { not: null },
    });
  });

  it('places no status condition at all on "Alle"', () => {
    expect(athleteWhere(TENANT, { status: 'all' })).not.toHaveProperty('archivedAt');
  });

  it('counts through the same clause the list uses', async () => {
    // The headline and the rows must describe one set. Sharing the clause is
    // what makes that structural rather than a promise.
    const { db, athlete } = fakeDb();

    await countAthletesMatching(db, TENANT, { search: 'Prinz', status: 'archived' });

    expect(argsOf(athlete.count).where).toEqual(
      athleteWhere(TENANT, { search: 'Prinz', status: 'archived' }),
    );
  });
});
