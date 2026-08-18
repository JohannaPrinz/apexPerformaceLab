import { describe, expect, it } from 'vitest';

import {
  ensureActiveOrganizationId,
  personalWorkspaceName,
  slugifyWorkspaceName,
} from './provisioning';

/**
 * Slug derivation is pure and easy to get quietly wrong: a regex that eats a
 * character class it should not eats digits out of every workspace URL, and
 * nothing fails loudly. These cases pin the behaviour that matters for a
 * German-language product.
 */
describe('slugifyWorkspaceName', () => {
  it('lowercases and joins words with a single hyphen', () => {
    expect(slugifyWorkspaceName('Apex Performance Lab')).toBe('apex-performance-lab');
  });

  it('keeps digits', () => {
    expect(slugifyWorkspaceName('Studio 21')).toBe('studio-21');
    expect(slugifyWorkspaceName('360 Grad')).toBe('360-grad');
  });

  it('folds German umlauts to their base letter', () => {
    expect(slugifyWorkspaceName('Jörg Müller')).toBe('jorg-muller');
    expect(slugifyWorkspaceName('Ärztehaus')).toBe('arztehaus');
  });

  it('expands ß rather than dropping it', () => {
    // NFKD leaves ß intact, so without the explicit expansion this would
    // collapse to "stra-er".
    expect(slugifyWorkspaceName('Straßer')).toBe('strasser');
  });

  it('strips punctuation and collapses separator runs', () => {
    expect(slugifyWorkspaceName('Müller & Söhne — Coaching!')).toBe('muller-sohne-coaching');
  });

  it('trims leading and trailing separators', () => {
    expect(slugifyWorkspaceName('  ...Apex...  ')).toBe('apex');
  });

  it('never ends on a hyphen after truncation', () => {
    const slug = slugifyWorkspaceName(`${'a'.repeat(39)} tail`);

    expect(slug.length).toBeLessThanOrEqual(40);
    expect(slug.endsWith('-')).toBe(false);
  });

  it('falls back when nothing survives', () => {
    expect(slugifyWorkspaceName('***')).toBe('workspace');
    expect(slugifyWorkspaceName('')).toBe('workspace');
  });
});

describe('personalWorkspaceName', () => {
  it("starts from the coach's own name", () => {
    expect(personalWorkspaceName('Johanna Prinz')).toBe('Johanna Prinz');
  });

  it('trims surrounding whitespace', () => {
    expect(personalWorkspaceName('  Johanna Prinz  ')).toBe('Johanna Prinz');
  });

  it('falls back when the name is empty', () => {
    // Better Auth requires a name, but an OAuth provider may return only
    // whitespace — the workspace still needs something to be called.
    expect(personalWorkspaceName('   ')).toBe('My Workspace');
  });
});

/**
 * A hand-written in-memory stand-in for the Prisma client.
 *
 * No mock framework on purpose. A mock asserts *that a method was called*,
 * which here would pass while the rows are wrong; this fake holds actual rows,
 * so "no second workspace" is checked by counting organizations rather than by
 * trusting a call count. It also enforces the two constraints the production
 * schema enforces, `Coach.userId @unique` and
 * `Membership @@unique([userId, organizationId])`, because the idempotency
 * argument rests on exactly those.
 *
 * `$transaction` runs the callback against the same store. That models
 * atomicity only for the happy path, which is all these tests need: rollback
 * belongs to Postgres, not to this file.
 */
interface FakeRow {
  readonly id: string;
  readonly userId?: string;
  readonly organizationId?: string;
  readonly slug?: string;
  readonly name?: string;
  readonly createdAt?: Date;
}

function uniqueViolation(): Error {
  return Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
}

function createFakeDb(seed: {
  users?: { id: string; name: string }[];
  coaches?: { id: string; userId: string }[];
  organizations?: { id: string; slug: string; name: string }[];
  memberships?: { userId: string; organizationId: string; createdAt: Date }[];
}) {
  const users = [...(seed.users ?? [])];
  const coaches: FakeRow[] = [...(seed.coaches ?? [])];
  const organizations: FakeRow[] = [...(seed.organizations ?? [])];
  const memberships: FakeRow[] = (seed.memberships ?? []).map((row, index) => ({
    id: `seed-${String(index)}`,
    ...row,
  }));

  let counter = 0;
  const nextId = (prefix: string): string => `${prefix}${String((counter += 1))}`;

  const findFirstMembership = ({ where }: { where: { userId: string } }) =>
    Promise.resolve(
      [...memberships]
        .filter((row) => row.userId === where.userId)
        .sort((a, b) => (a.createdAt?.getTime() ?? 0) - (b.createdAt?.getTime() ?? 0))[0] ?? null,
    );

  const store = {
    user: {
      findUnique: ({ where }: { where: { id: string } }) =>
        Promise.resolve(users.find((row) => row.id === where.id) ?? null),
    },
    coach: {
      findUnique: ({ where }: { where: { userId: string } }) =>
        Promise.resolve(coaches.find((row) => row.userId === where.userId) ?? null),
      create: ({ data }: { data: { userId: string } }) => {
        if (coaches.some((row) => row.userId === data.userId)) throw uniqueViolation();
        const row = { id: nextId('coach-'), userId: data.userId };
        coaches.push(row);

        return Promise.resolve(row);
      },
    },
    organization: {
      findUnique: ({ where }: { where: { slug: string } }) =>
        Promise.resolve(organizations.find((row) => row.slug === where.slug) ?? null),
      create: ({ data }: { data: { name: string; slug: string } }) => {
        if (organizations.some((row) => row.slug === data.slug)) throw uniqueViolation();
        const row = { id: nextId('org-'), slug: data.slug, name: data.name };
        organizations.push(row);

        return Promise.resolve(row);
      },
    },
    membership: {
      findFirst: findFirstMembership,
      create: ({ data }: { data: { userId: string; organizationId: string } }) => {
        const clash = memberships.some(
          (row) => row.userId === data.userId && row.organizationId === data.organizationId,
        );
        if (clash) throw uniqueViolation();
        const row = { id: nextId('mem-'), ...data, createdAt: new Date() };
        memberships.push(row);

        return Promise.resolve(row);
      },
    },
    $transaction: <T>(run: (tx: unknown) => Promise<T>): Promise<T> => run(store),
  };

  return { store, coaches, organizations, memberships, findFirstMembership };
}

type FakeDb = ReturnType<typeof createFakeDb>;

/** The fake covers exactly the surface these functions touch. */
const asDb = (fake: FakeDb): Parameters<typeof ensureActiveOrganizationId>[0] =>
  fake.store as unknown as Parameters<typeof ensureActiveOrganizationId>[0];

describe('ensureActiveOrganizationId', () => {
  it('provisions a workspace for a coach who has none', async () => {
    // The registration case. Better Auth writes the session before the user
    // hook has committed the membership, so this hook finds nothing and has to
    // create it. Before the fix the session stored null here.
    const fake = createFakeDb({ users: [{ id: 'u1', name: 'Johanna Prinz' }] });

    const organizationId = await ensureActiveOrganizationId(asDb(fake), 'u1');

    expect(organizationId).not.toBeNull();
    expect(fake.organizations).toHaveLength(1);
    expect(fake.coaches).toHaveLength(1);
    expect(fake.memberships).toHaveLength(1);
    expect(fake.memberships[0]?.organizationId).toBe(organizationId);
  });

  it('names the workspace after the coach rather than falling back', async () => {
    // Why this function reads the user at all: the session hook is handed a
    // userId and no name. Without the lookup the workspace would be called
    // "My Workspace" whenever this hook wins the race, so the name would
    // depend on timing.
    const fake = createFakeDb({ users: [{ id: 'u1', name: 'Johanna Prinz' }] });

    await ensureActiveOrganizationId(asDb(fake), 'u1');

    expect(fake.organizations[0]?.name).toBe('Johanna Prinz');
    expect(fake.organizations[0]?.slug).toBe('johanna-prinz');
  });

  it('returns the existing organization for a coach who already has one', async () => {
    const fake = createFakeDb({
      users: [{ id: 'u1', name: 'Johanna Prinz' }],
      coaches: [{ id: 'c1', userId: 'u1' }],
      organizations: [{ id: 'org-existing', slug: 'johanna-prinz', name: 'Johanna Prinz' }],
      memberships: [
        { userId: 'u1', organizationId: 'org-existing', createdAt: new Date('2026-01-01') },
      ],
    });

    const organizationId = await ensureActiveOrganizationId(asDb(fake), 'u1');

    expect(organizationId).toBe('org-existing');
    expect(fake.organizations).toHaveLength(1);
  });

  it('picks the oldest membership when a coach belongs to several', async () => {
    // Guards the multi-organization future: the personal workspace is the one
    // that has been there longest, so a later practice membership must not
    // silently become the default.
    const fake = createFakeDb({
      users: [{ id: 'u1', name: 'Johanna Prinz' }],
      coaches: [{ id: 'c1', userId: 'u1' }],
      memberships: [
        { userId: 'u1', organizationId: 'org-later', createdAt: new Date('2026-05-01') },
        { userId: 'u1', organizationId: 'org-personal', createdAt: new Date('2026-01-01') },
      ],
    });

    expect(await ensureActiveOrganizationId(asDb(fake), 'u1')).toBe('org-personal');
  });

  it('creates no second workspace, coach or membership when called again', async () => {
    // Both hooks run for one registration, so this happens on every sign-up.
    const fake = createFakeDb({ users: [{ id: 'u1', name: 'Johanna Prinz' }] });

    const first = await ensureActiveOrganizationId(asDb(fake), 'u1');
    const second = await ensureActiveOrganizationId(asDb(fake), 'u1');

    expect(second).toBe(first);
    expect(fake.organizations).toHaveLength(1);
    expect(fake.coaches).toHaveLength(1);
    expect(fake.memberships).toHaveLength(1);
  });

  it('provisions nothing for a user id with no user row', async () => {
    // The low-level guard, and the only thing this function refuses on its own:
    // a deleted account or a stale session must not conjure a workspace, and
    // there is no name to build one from.
    //
    // This is NOT the athlete gate. Deciding who deserves a workspace is a
    // policy question, and under the MVP rule that everyone who registers is a
    // coach it is answered at the session hook in server.ts, which is where it
    // has to change when athlete portal accounts arrive (§21).
    const fake = createFakeDb({});

    expect(await ensureActiveOrganizationId(asDb(fake), 'ghost')).toBeNull();
    expect(fake.organizations).toHaveLength(0);
    expect(fake.coaches).toHaveLength(0);
    expect(fake.memberships).toHaveLength(0);
  });

  it('resolves the membership the other hook wrote when provisioning declines', async () => {
    // The race from the losing side: the user hook committed its coach profile
    // between the resolve above and the provisioning call, so provisioning
    // returns null. Reading the membership a second time is what keeps the
    // session from storing null in the very situation this fix exists for.
    const fake = createFakeDb({
      users: [{ id: 'u1', name: 'Johanna Prinz' }],
      coaches: [{ id: 'c1', userId: 'u1' }],
    });

    let call = 0;
    fake.store.membership.findFirst = (args: { where: { userId: string } }) => {
      call += 1;
      if (call === 1) return Promise.resolve(null);

      // The other transaction commits between the two reads.
      fake.memberships.push({
        id: 'mem-other',
        userId: 'u1',
        organizationId: 'org-other',
        createdAt: new Date(),
      });

      return fake.findFirstMembership(args);
    };

    expect(await ensureActiveOrganizationId(asDb(fake), 'u1')).toBe('org-other');
    expect(fake.organizations).toHaveLength(0);
  });
});
