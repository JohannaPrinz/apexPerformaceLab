import { describe, expect, it, vi } from 'vitest';

import {
  confirmAthleteShare,
  revokeAthleteShare,
  shareAthlete,
  visibleToViewer,
  type Viewer,
} from './access';

/**
 * Who may see an athlete, and what a release actually grants.
 *
 * These are the guarantees no screen can prove: that a colleague sees nothing
 * until the athlete has agreed, that a coach id from a request cannot reach
 * across a workspace, and that the filter runs **in the query** rather than as a
 * check somebody could forget to make.
 */

const coach = (id: string): Viewer => ({ organizationId: 'org_a', coachId: id, role: 'coach' });

const TENANT = { organizationId: 'org_a', userId: 'user_1', role: 'coach' } as const;

/** The first argument a spy was called with. */
const argsOf = (spy: { mock: { calls: unknown[] } }, call = 0) =>
  ((spy.mock.calls[call] as unknown[] | undefined)?.[0] ?? {}) as {
    where?: Record<string, unknown>;
    data?: Record<string, unknown>;
  };

function accessDb(
  options: {
    athleteFound?: boolean;
    ownerCoachId?: string;
    memberFound?: boolean;
    grantExists?: boolean;
    updated?: number;
    deleted?: number;
  } = {},
) {
  const created: Record<string, unknown>[] = [];

  const athlete = {
    findFirst: vi.fn(() =>
      Promise.resolve(
        options.athleteFound === false
          ? null
          : { id: 'ath_1', createdByCoachId: options.ownerCoachId ?? 'coach_owner' },
      ),
    ),
  };

  const athleteAccess = {
    findFirst: vi.fn(() => Promise.resolve(options.grantExists === true ? { id: 'acc_1' } : null)),
    create: vi.fn((args: { data: Record<string, unknown> }) => {
      created.push(args.data);

      return Promise.resolve({ id: 'acc_1' });
    }),
    updateMany: vi.fn(() => Promise.resolve({ count: options.updated ?? 1 })),
    deleteMany: vi.fn(() => Promise.resolve({ count: options.deleted ?? 1 })),
    findMany: vi.fn(() => Promise.resolve([])),
  };

  const coachModel = { findFirst: vi.fn(() => Promise.resolve({ id: 'coach_me' })) };

  const membership = {
    findFirst: vi.fn(() => Promise.resolve(options.memberFound === false ? null : { id: 'mem_1' })),
    findMany: vi.fn(() => Promise.resolve([])),
  };

  const db = { athlete, athleteAccess, coach: coachModel, membership } as unknown as Parameters<
    typeof shareAthlete
  >[0];

  return { db, athlete, athleteAccess, membership, created };
}

describe('who a query returns', () => {
  it('narrows a coach to their own athletes and the ones released to them', () => {
    expect(visibleToViewer(coach('coach_me'))).toEqual({
      OR: [
        { createdByCoachId: 'coach_me' },
        { accesses: { some: { coachId: 'coach_me', confirmedAt: { not: null } } } },
      ],
    });
  });

  it('requires the release to be confirmed, not merely offered', () => {
    // An unconfirmed row is a standing offer. It grants nothing, and this is
    // the line that makes that true rather than a promise in a comment.
    const where = visibleToViewer(coach('coach_me')) as {
      OR: { accesses?: { some: { confirmedAt: unknown } } }[];
    };

    expect(where.OR[1]?.accesses?.some.confirmedAt).toEqual({ not: null });
  });

  it('narrows an owner to nothing, because they administer the workspace', () => {
    expect(visibleToViewer({ organizationId: 'org_a', coachId: 'c1', role: 'owner' })).toEqual({});
    expect(visibleToViewer({ organizationId: 'org_a', coachId: 'c1', role: 'admin' })).toEqual({});
  });

  it('returns no athlete at all to a member without a coach profile', () => {
    expect(visibleToViewer({ organizationId: 'org_a', coachId: null, role: 'coach' })).toEqual({
      id: { in: [] },
    });
  });
});

describe('offering access', () => {
  it('records the offer against the workspace and the coach who made it', async () => {
    const { db, created } = accessDb();

    expect(await shareAthlete(db, TENANT, 'ath_1', 'coach_other')).toEqual({ ok: true });
    expect(created[0]).toMatchObject({
      organizationId: 'org_a',
      athleteId: 'ath_1',
      coachId: 'coach_other',
      grantedByCoachId: 'coach_me',
    });
  });

  it('leaves the offer unconfirmed, so it grants nothing yet', async () => {
    const { db, created } = accessDb();

    await shareAthlete(db, TENANT, 'ath_1', 'coach_other');

    expect(created[0]).not.toHaveProperty('confirmedAt');
  });

  it('looks the athlete up through the caller own visibility', async () => {
    const { db, athlete } = accessDb();

    await shareAthlete(db, TENANT, 'ath_1', 'coach_other');

    const where = argsOf(athlete.findFirst).where ?? {};
    expect(where['organizationId']).toBe('org_a');
    expect(where).toHaveProperty('OR');
  });

  it('refuses an athlete the caller cannot see', async () => {
    const { db, created } = accessDb({ athleteFound: false });

    expect(await shareAthlete(db, TENANT, 'ath_1', 'coach_other')).toEqual({
      ok: false,
      refusal: 'ATHLETE_NOT_FOUND',
    });
    expect(created).toHaveLength(0);
  });

  it('refuses a coach who is not a member of this workspace', async () => {
    // The one guarantee a coach id from a request cannot be trusted for.
    const { db, created } = accessDb({ memberFound: false });

    expect(await shareAthlete(db, TENANT, 'ath_1', 'coach_elsewhere')).toEqual({
      ok: false,
      refusal: 'COACH_NOT_IN_WORKSPACE',
    });
    expect(created).toHaveLength(0);
  });

  it('checks that membership inside this workspace, never globally', async () => {
    const { db, membership } = accessDb();

    await shareAthlete(db, TENANT, 'ath_1', 'coach_other');

    expect(argsOf(membership.findFirst).where?.['organizationId']).toBe('org_a');
  });

  it('refuses to release an athlete to the coach who already owns them', async () => {
    const { db, created } = accessDb({ ownerCoachId: 'coach_other' });

    expect(await shareAthlete(db, TENANT, 'ath_1', 'coach_other')).toEqual({
      ok: false,
      refusal: 'ALREADY_OWNER',
    });
    expect(created).toHaveLength(0);
  });

  it('offers twice without creating a second permission', async () => {
    const { db, created } = accessDb({ grantExists: true });

    expect(await shareAthlete(db, TENANT, 'ath_1', 'coach_other')).toEqual({ ok: true });
    expect(created).toHaveLength(0);
  });
});

describe('confirming and withdrawing', () => {
  it('confirms only an offer that is still open', async () => {
    const { db, athleteAccess } = accessDb();

    expect(await confirmAthleteShare(db, TENANT, 'ath_1', 'coach_other')).toBe(true);
    expect(argsOf(athleteAccess.updateMany).where?.['confirmedAt']).toBeNull();
  });

  it('records who confirmed it and when', async () => {
    const { db, athleteAccess } = accessDb();

    await confirmAthleteShare(db, TENANT, 'ath_1', 'coach_other');

    const data = argsOf(athleteAccess.updateMany).data ?? {};
    expect(data['confirmedByCoachId']).toBe('coach_me');
    expect(data['confirmedAt']).toBeInstanceOf(Date);
  });

  it('confirms nothing for an athlete the caller cannot see', async () => {
    const { db, athleteAccess } = accessDb({ athleteFound: false });

    expect(await confirmAthleteShare(db, TENANT, 'ath_1', 'coach_other')).toBe(false);
    expect(athleteAccess.updateMany).not.toHaveBeenCalled();
  });

  it('withdraws by deleting the permission, inside the workspace', async () => {
    const { db, athleteAccess } = accessDb();

    expect(await revokeAthleteShare(db, TENANT, 'ath_1', 'coach_other')).toBe(true);
    expect(argsOf(athleteAccess.deleteMany).where?.['organizationId']).toBe('org_a');
  });

  it('withdraws nothing for an athlete the caller cannot see', async () => {
    const { db, athleteAccess } = accessDb({ athleteFound: false });

    expect(await revokeAthleteShare(db, TENANT, 'ath_1', 'coach_other')).toBe(false);
    expect(athleteAccess.deleteMany).not.toHaveBeenCalled();
  });

  it('reports nothing withdrawn where there was no permission', async () => {
    const { db } = accessDb({ deleted: 0 });

    expect(await revokeAthleteShare(db, TENANT, 'ath_1', 'coach_other')).toBe(false);
  });
});
