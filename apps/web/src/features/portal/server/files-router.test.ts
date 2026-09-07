import { beforeEach, describe, expect, it, vi } from 'vitest';

import { createCallerFactory, createTRPCRouter } from '@/server/api/trpc';

import { portalFilesProcedures } from './files-router';

/**
 * The athlete's door onto their files (§18, §21).
 *
 * The services were covered separately; what only the procedure can show is the
 * thing this door exists for — **an athlete reaches their own files and no
 * other's**. Every read and write below resolves the athlete from the session,
 * so the assertions are about what the queries were given, not about what the
 * fake chose to return.
 */

/**
 * The tRPC module pulls in the real client and the real auth instance, each of
 * which wants a live configuration. Mocked at the boundary; the tenant helpers
 * are deliberately left alone, because `scoped` is what puts the workspace into
 * every filter and stubbing it would remove the thing under test.
 */
vi.mock('@apex/database', () => ({ db: {} }));
vi.mock('@apex/auth', () => ({ auth: { api: { getSession: vi.fn() } } }));

/** No store in a test, and none needed: the ticket is decided before any bytes. */
vi.mock('@/integrations/object-store', () => ({
  putObject: vi.fn(),
  removeObject: vi.fn(),
  objectInfo: vi.fn(() => Promise.resolve({ sizeBytes: 12_000_000, mimeType: 'video/mp4' })),
}));

const router = createTRPCRouter(portalFilesProcedures);
const createCaller = createCallerFactory(router);

const ATHLETES = [
  { id: 'ath_a', userId: 'usr_a', organizationId: 'org_1', archivedAt: null },
  { id: 'ath_b', userId: 'usr_b', organizationId: 'org_1', archivedAt: null },
  { id: 'ath_c', userId: 'usr_c', organizationId: 'org_1', archivedAt: new Date('2026-01-01') },
];

/** Files, and whose they are. `as_b` is athlete B's and must stay unreachable. */
const FILES = [
  { id: 'as_a', organizationId: 'org_1', athleteId: 'ath_a' },
  { id: 'as_b', organizationId: 'org_1', athleteId: 'ath_b' },
];

const filters: Record<string, unknown>[] = [];

const db = {
  membership: { findUnique: vi.fn().mockResolvedValue({ role: 'athlete' }) },
  athlete: {
    findFirst: vi.fn(({ where }: { where: Record<string, unknown> }) =>
      Promise.resolve(
        ATHLETES.find(
          (row) =>
            (where['userId'] === undefined || row.userId === where['userId']) &&
            row.organizationId === where['organizationId'],
        ) ?? null,
      ),
    ),
  },
  assetFolder: {
    findMany: vi.fn(({ where }: { where: Record<string, unknown> }) => {
      filters.push(where);

      return Promise.resolve([]);
    }),
    create: vi.fn(({ data }: { data: Record<string, unknown> }) => {
      filters.push(data);

      return Promise.resolve({ id: 'fol_1' });
    }),
    updateMany: vi.fn(({ where }: { where: Record<string, unknown> }) => {
      filters.push(where);

      return Promise.resolve({ count: 1 });
    }),
    deleteMany: vi.fn(({ where }: { where: Record<string, unknown> }) => {
      filters.push(where);

      return Promise.resolve({ count: 1 });
    }),
  },
  asset: {
    findMany: vi.fn(({ where }: { where: Record<string, unknown> }) => {
      filters.push(where);

      return Promise.resolve([]);
    }),
    findFirst: vi.fn(({ where }: { where: Record<string, unknown> }) => {
      filters.push(where);

      return Promise.resolve(
        FILES.find(
          (row) =>
            row.organizationId === where['organizationId'] &&
            row.athleteId === where['athleteId'] &&
            row.id === where['id'],
        ) ?? null,
      );
    }),
  },
};

const callerFor = (userId: string) =>
  createCaller({
    db,
    headers: new Headers(),
    session: {
      user: { id: userId, name: 'Test', email: `${userId}@example.org` },
      session: { activeOrganizationId: 'org_1' },
    },
    perRequest: <T>(_key: string, read: () => Promise<T>) => read(),
  } as never);

beforeEach(() => {
  filters.length = 0;
});

describe('whose files these are', () => {
  it('reads shelves and files for the athlete in the session', async () => {
    await callerFor('usr_a').files();

    for (const where of filters) {
      expect(where).toMatchObject({ organizationId: 'org_1', athleteId: 'ath_a' });
    }
    expect(filters).toHaveLength(2);
  });

  it('reads athlete B’s when B is signed in, with the request unchanged', async () => {
    await callerFor('usr_b').files();

    expect(filters[0]).toMatchObject({ athleteId: 'ath_b' });
  });

  it('takes no athlete in any input schema', () => {
    // The structural half: there is no parameter to tamper with, so there is
    // no comparison anybody can forget to make.
    for (const [name, procedure] of Object.entries(portalFilesProcedures)) {
      const inputs = (procedure as { _def: { inputs: unknown[] } })._def.inputs;

      for (const input of inputs) {
        const shape = (input as { shape?: Record<string, unknown> }).shape ?? {};
        expect(Object.keys(shape), `${name} accepts an athlete`).not.toContain('athleteId');
      }
    }
  });

  it('refuses an account that is not an athlete', async () => {
    await expect(callerFor('usr_none').files()).rejects.toThrow(/athlete portal account/i);
  });
});

describe('athlete A cannot reach athlete B', () => {
  it('refuses to delete a file that is not theirs', async () => {
    // `as_b` exists — it simply is not A's, and the ownership lookup is what
    // decides that before the shared deletion service is asked anything.
    await expect(callerFor('usr_a').deleteFile({ assetId: 'as_b' })).rejects.toThrow(
      /Nicht gefunden/,
    );
  });

  it('scopes a folder rename to the session athlete', async () => {
    await callerFor('usr_a').renameFileFolder({ folderId: 'fol_of_b', name: 'Meins' });

    expect(filters.at(-1)).toMatchObject({
      organizationId: 'org_1',
      athleteId: 'ath_a',
      id: 'fol_of_b',
    });
  });

  it('scopes a folder deletion to the session athlete', async () => {
    await callerFor('usr_a').deleteFileFolder({ folderId: 'fol_of_b' });

    expect(filters.at(-1)).toMatchObject({ athleteId: 'ath_a', id: 'fol_of_b' });
  });

  it('files a new folder under the session athlete, with no coach', async () => {
    await callerFor('usr_a').createFileFolder({ name: 'Formcheck' });

    expect(filters.at(-1)).toMatchObject({
      organizationId: 'org_1',
      athleteId: 'ath_a',
      name: 'Formcheck',
      createdByCoachId: null,
    });
  });

  it('names the session athlete as the upload target, never a coach', async () => {
    expect(await callerFor('usr_a').fileUploadTarget()).toEqual({
      athleteId: 'ath_a',
      uploadedByCoachId: null,
    });
  });
});

describe('a deactivated athlete', () => {
  it('may still read their files', async () => {
    await expect(callerFor('usr_c').files()).resolves.toBeDefined();
  });

  it('may not upload, file or delete', async () => {
    await expect(callerFor('usr_c').fileUploadTarget()).rejects.toThrow(/auf Lesen gestellt/);
    await expect(callerFor('usr_c').createFileFolder({ name: 'Neu' })).rejects.toThrow(
      /auf Lesen gestellt/,
    );
    await expect(callerFor('usr_c').deleteFile({ assetId: 'as_a' })).rejects.toThrow(
      /auf Lesen gestellt/,
    );
  });
});

describe('permission to write one object', () => {
  const wanted = {
    fileName: 'formcheck.mp4',
    mimeType: 'video/mp4',
    sizeBytes: 12_000_000,
    folderId: null,
  };

  it('issues a ticket bound to the session athlete, with no coach on it', async () => {
    const { ticket } = await callerFor('usr_a').createFileUploadTicket(wanted);
    const { readUploadTicket } = await import('@/server/upload-ticket');

    expect(readUploadTicket(ticket)).toMatchObject({
      organizationId: 'org_1',
      athleteId: 'ath_a',
      uploadedByCoachId: null,
    });
  });

  it('puts the storage key inside the ticket, under that athlete', async () => {
    const { ticket } = await callerFor('usr_a').createFileUploadTicket(wanted);
    const { readUploadTicket } = await import('@/server/upload-ticket');

    // The client never names a path; this is the only place one is decided.
    expect(readUploadTicket(ticket)?.storageKey.startsWith('athletes/ath_a/')).toBe(true);
  });

  it('issues athlete B a ticket for B, with the request unchanged', async () => {
    const { ticket } = await callerFor('usr_b').createFileUploadTicket(wanted);
    const { readUploadTicket } = await import('@/server/upload-ticket');

    expect(readUploadTicket(ticket)).toMatchObject({ athleteId: 'ath_b' });
  });

  it('refuses to spend athlete B’s ticket for athlete A', async () => {
    const { ticket } = await callerFor('usr_b').createFileUploadTicket(wanted);

    // Even a genuine, unexpired ticket is bound to the record it names.
    await expect(callerFor('usr_a').registerFileUpload({ ticket })).rejects.toThrow(
      /Nicht gefunden/,
    );
  });

  it('refuses a file bigger than the store would take', async () => {
    await expect(
      callerFor('usr_a').createFileUploadTicket({ ...wanted, sizeBytes: 60 * 1024 * 1024 }),
    ).rejects.toThrow(/zu groß/);
  });

  it('refuses a type the store would not take', async () => {
    await expect(
      callerFor('usr_a').createFileUploadTicket({ ...wanted, mimeType: 'application/zip' }),
    ).rejects.toThrow(/nicht ablegen/);
  });

  it('gives a deactivated athlete neither a ticket nor a registration', async () => {
    await expect(callerFor('usr_c').createFileUploadTicket(wanted)).rejects.toThrow(
      /auf Lesen gestellt/,
    );
    await expect(callerFor('usr_c').registerFileUpload({ ticket: 'x' })).rejects.toThrow(
      /auf Lesen gestellt/,
    );
  });
});
