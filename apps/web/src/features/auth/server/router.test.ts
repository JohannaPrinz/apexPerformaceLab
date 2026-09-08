import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createCallerFactory, createTRPCRouter } from '@/server/api/trpc';

import { authRouter } from './router';

/**
 * Identity and workspace, read once per request (§6, §26.22).
 *
 * Three procedures answer "who am I and where": the workspace list, the current
 * workspace, and the coach profile. Two of them wanted the same coach row and
 * read it twice — the rung below `coachProfile` needs the id to record
 * authorship, the header needs the name.
 *
 * What is asserted here is both halves of that change: the row is read **once**
 * per request, and each procedure still answers exactly what it answered
 * before. Plus the part a memo could quietly break — that nothing of another
 * account or another workspace can come back through it.
 */

vi.mock('@apex/database', () => ({ db: {} }));
vi.mock('@apex/auth', () => ({ auth: { api: { getSession: vi.fn() } } }));

const COACHES = [
  {
    userId: 'usr_a',
    id: 'coach_a',
    displayName: 'A. Trainerin',
    professionalTitle: 'B.Sc.',
    createdAt: new Date('2026-01-02T00:00:00.000Z'),
  },
  {
    userId: 'usr_b',
    id: 'coach_b',
    displayName: 'B. Trainer',
    professionalTitle: null,
    createdAt: new Date('2026-02-03T00:00:00.000Z'),
  },
];

const MEMBERSHIPS = [
  {
    userId: 'usr_a',
    organizationId: 'org_1',
    id: 'mem_a1',
    role: 'owner',
    createdAt: new Date('2026-01-02T00:00:00.000Z'),
  },
  {
    userId: 'usr_a',
    organizationId: 'org_2',
    id: 'mem_a2',
    role: 'coach',
    createdAt: new Date('2026-03-04T00:00:00.000Z'),
  },
  {
    userId: 'usr_b',
    organizationId: 'org_2',
    id: 'mem_b2',
    role: 'coach',
    createdAt: new Date('2026-04-05T00:00:00.000Z'),
  },
];

const ORGANIZATIONS = [
  {
    id: 'org_1',
    name: 'Praxis Nord',
    slug: 'nord',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  },
  {
    id: 'org_2',
    name: 'Praxis Süd',
    slug: 'sued',
    createdAt: new Date('2026-02-01T00:00:00.000Z'),
  },
];

/** Every read the fake served, so a repeat is visible rather than inferred. */
const reads: { model: string; where: Record<string, unknown> }[] = [];

const db = {
  coach: {
    findUnique: vi.fn(({ where }: { where: { userId: string } }) => {
      reads.push({ model: 'coach', where });
      const found = COACHES.find((row) => row.userId === where.userId);

      return Promise.resolve(
        found
          ? {
              id: found.id,
              displayName: found.displayName,
              professionalTitle: found.professionalTitle,
              createdAt: found.createdAt,
            }
          : null,
      );
    }),
  },
  membership: {
    findUnique: vi.fn(
      ({
        where,
      }: {
        where: { userId_organizationId: { userId: string; organizationId: string } };
      }) => {
        reads.push({ model: 'membership.findUnique', where });
        const { userId, organizationId } = where.userId_organizationId;
        const found = MEMBERSHIPS.find(
          (row) => row.userId === userId && row.organizationId === organizationId,
        );

        return Promise.resolve(found ? { role: found.role } : null);
      },
    ),
    findMany: vi.fn(({ where }: { where: { userId: string } }) => {
      reads.push({ model: 'membership.findMany', where });

      return Promise.resolve(
        MEMBERSHIPS.filter((row) => row.userId === where.userId).map((row) => ({
          role: row.role,
          createdAt: row.createdAt,
          organization: ORGANIZATIONS.filter((org) => org.id === row.organizationId).map((org) => ({
            id: org.id,
            name: org.name,
            slug: org.slug,
          }))[0],
        })),
      );
    }),
  },
  organization: {
    findUnique: vi.fn(({ where }: { where: { id: string } }) => {
      reads.push({ model: 'organization', where });
      const found = ORGANIZATIONS.find((row) => row.id === where.id);

      return Promise.resolve(
        found
          ? { id: found.id, name: found.name, slug: found.slug, createdAt: found.createdAt }
          : null,
      );
    }),
  },
};

const createCaller = createCallerFactory(createTRPCRouter({ auth: authRouter }));

/**
 * One caller, one request — with the real memo.
 *
 * A `Map` that lives as long as this context, exactly as `createTRPCContext`
 * builds it. Stubbing the memo away (as other router tests do, where it is not
 * what is under test) would remove the thing being measured here.
 */
const requestFor = (userId: string, activeOrganizationId: string | null) => {
  const once = new Map<string, Promise<unknown>>();

  return createCaller({
    db,
    headers: new Headers(),
    session: {
      user: { id: userId, name: 'Test', email: `${userId}@example.org` },
      session: { activeOrganizationId },
    },
    perRequest: <T>(key: string, read: () => Promise<T>): Promise<T> => {
      const known = once.get(key);
      if (known !== undefined) return known as Promise<T>;
      const started = read();
      once.set(key, started);

      return started;
    },
  } as never);
};

const coachReads = () => reads.filter((entry) => entry.model === 'coach');

beforeEach(() => {
  reads.length = 0;
});

describe('the coach row within one request', () => {
  it('is read once, however many procedures ask for it', async () => {
    const caller = requestFor('usr_a', 'org_1');

    await Promise.all([
      caller.auth.coachProfile(),
      caller.auth.coachProfile(),
      caller.auth.currentWorkspace(),
    ]);

    expect(coachReads()).toHaveLength(1);
  });

  it('is read again in the next request, never carried across', async () => {
    await requestFor('usr_a', 'org_1').auth.coachProfile();
    await requestFor('usr_a', 'org_1').auth.coachProfile();

    // Two requests, two reads: the memo lives on the context and dies with it.
    expect(coachReads()).toHaveLength(2);
  });

  it('never answers one account with another’s profile', async () => {
    const a = await requestFor('usr_a', 'org_1').auth.coachProfile();
    const b = await requestFor('usr_b', 'org_2').auth.coachProfile();

    expect(a?.id).toBe('coach_a');
    expect(b?.id).toBe('coach_b');
    expect(coachReads().map((entry) => entry.where)).toEqual([
      { userId: 'usr_a' },
      { userId: 'usr_b' },
    ]);
  });
});

describe('what the three procedures answer', () => {
  it('gives the coach profile unchanged', async () => {
    expect(await requestFor('usr_a', 'org_1').auth.coachProfile()).toEqual({
      id: 'coach_a',
      displayName: 'A. Trainerin',
      professionalTitle: 'B.Sc.',
      createdAt: new Date('2026-01-02T00:00:00.000Z'),
    });
  });

  it('answers null for a user who is not a coach', async () => {
    // A legitimate answer, not an error: not every account is a coach.
    expect(await requestFor('usr_none', 'org_1').auth.coachProfile()).toBeNull();
  });

  it('gives the current workspace with the session’s role', async () => {
    expect(await requestFor('usr_a', 'org_1').auth.currentWorkspace()).toEqual({
      id: 'org_1',
      name: 'Praxis Nord',
      slug: 'nord',
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      role: 'owner',
    });
  });

  it('gives every workspace of the user, oldest first', async () => {
    expect(await requestFor('usr_a', 'org_1').auth.myWorkspaces()).toEqual([
      {
        id: 'org_1',
        name: 'Praxis Nord',
        slug: 'nord',
        role: 'owner',
        joinedAt: new Date('2026-01-02T00:00:00.000Z'),
      },
      {
        id: 'org_2',
        name: 'Praxis Süd',
        slug: 'sued',
        role: 'coach',
        joinedAt: new Date('2026-03-04T00:00:00.000Z'),
      },
    ]);
  });
});

describe('what the memo must not loosen', () => {
  it('still refuses a workspace the user is not a member of', async () => {
    // usr_b belongs to org_2 only. A session claiming org_1 is refused by the
    // membership check, coach profile or not.
    await expect(requestFor('usr_b', 'org_1').auth.currentWorkspace()).rejects.toThrow(
      /not a member/i,
    );
  });

  it('reads the workspace named by the session, not one from another request', async () => {
    await requestFor('usr_a', 'org_1').auth.currentWorkspace();
    await requestFor('usr_a', 'org_2').auth.currentWorkspace();

    expect(reads.filter((entry) => entry.model === 'organization').map((e) => e.where)).toEqual([
      { id: 'org_1' },
      { id: 'org_2' },
    ]);
  });

  it('lists only the memberships of the signed-in user', async () => {
    await requestFor('usr_b', 'org_2').auth.myWorkspaces();

    expect(reads.filter((entry) => entry.model === 'membership.findMany')).toEqual([
      { model: 'membership.findMany', where: { userId: 'usr_b' } },
    ]);
  });
});
