import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  assetForDownload,
  createFolder,
  deleteFolder,
  listAthleteAssets,
  listFolders,
  MAX_ASSET_BYTES,
  MAX_UPLOAD_BYTES,
  prepareResumableUpload,
  registerUploadedAsset,
  renameFolder,
  uploadAsset,
} from './files';

/**
 * Shelves, and putting files on them (§18).
 *
 * The store is mocked; the database fake **answers from the filter**, because
 * the guarantee under test is that the workspace and the athlete are both in
 * every query. One athlete may not reach another's files, and that is decided
 * in these `where` clauses rather than by whoever calls them.
 *
 * The two doors are tested where they live — this is the shared half, and it
 * is shared precisely because it takes the athlete as a parameter and trusts
 * the caller to have earned it.
 */

const { putObject, removeObject, objectInfo } = vi.hoisted(() => ({
  putObject: vi.fn<() => Promise<boolean>>(),
  removeObject: vi.fn<() => Promise<boolean>>(),
  objectInfo: vi.fn<() => Promise<{ sizeBytes: number; mimeType: string | null } | null>>(),
}));

vi.mock('@/integrations/object-store', () => ({ putObject, removeObject, objectInfo }));

const TENANT = { organizationId: 'org_a' } as const;
const OTHER = { organizationId: 'org_b' } as const;

interface FolderRow {
  id: string;
  organizationId: string;
  athleteId: string;
  name: string;
  createdAt: Date;
  createdByCoachId: string | null;
}

interface AssetRow {
  id: string;
  organizationId: string;
  athleteId: string;
  fileName: string;
  folderId: string | null;
  archivedAt: Date | null;
}

/** Postgres's unique violation, as Prisma reports it. */
const uniqueViolation = Object.assign(new Error('unique'), { code: 'P2002' });

function dbFor({
  folders = [],
  assets = [],
}: { folders?: readonly FolderRow[]; assets?: readonly AssetRow[] } = {}) {
  const created: Record<string, unknown>[] = [];
  const filters: Record<string, unknown>[] = [];
  const matches = (
    row: { organizationId: string; athleteId: string },
    where: Record<string, unknown>,
  ) => row.organizationId === where['organizationId'] && row.athleteId === where['athleteId'];

  return {
    created,
    filters,
    db: {
      assetFolder: {
        findMany: vi.fn(({ where }: { where: Record<string, unknown> }) => {
          filters.push(where);

          return Promise.resolve(folders.filter((row) => matches(row, where)));
        }),
        create: vi.fn(({ data }: { data: Record<string, unknown> }) => {
          created.push(data);
          if (
            folders.some((row) => row.name === data['name'] && row.athleteId === data['athleteId'])
          ) {
            return Promise.reject(uniqueViolation);
          }

          return Promise.resolve({ id: 'fol_new' });
        }),
        updateMany: vi.fn(
          ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
            filters.push(where);
            const hit = folders.find((row) => matches(row, where) && row.id === where['id']);
            if (hit && folders.some((row) => row.id !== hit.id && row.name === data['name'])) {
              return Promise.reject(uniqueViolation);
            }

            return Promise.resolve({ count: hit ? 1 : 0 });
          },
        ),
        deleteMany: vi.fn(({ where }: { where: Record<string, unknown> }) => {
          filters.push(where);

          return Promise.resolve({
            count: folders.some((row) => matches(row, where) && row.id === where['id']) ? 1 : 0,
          });
        }),
      },
      asset: {
        findMany: vi.fn(({ where }: { where: Record<string, unknown> }) => {
          filters.push(where);

          return Promise.resolve(assets.filter((row) => matches(row, where)));
        }),
        findFirst: vi.fn(({ where }: { where: Record<string, unknown> }) => {
          filters.push(where);

          return Promise.resolve(
            assets.find((row) => matches(row, where) && row.id === where['id']) ?? null,
          );
        }),
        create: vi.fn(({ data }: { data: Record<string, unknown> }) => {
          created.push(data);

          return Promise.resolve({ id: 'as_new' });
        }),
      },
    },
  };
}

const folder = (over: Partial<FolderRow> = {}): FolderRow => ({
  id: 'fol_1',
  organizationId: 'org_a',
  athleteId: 'ath_1',
  name: 'Formcheck am 05.09.2026',
  createdAt: new Date('2026-09-05T00:00:00.000Z'),
  createdByCoachId: 'coach_1',
  ...over,
});

const file = (over: Partial<AssetRow> = {}): AssetRow => ({
  id: 'as_1',
  organizationId: 'org_a',
  athleteId: 'ath_1',
  fileName: 'squat.mp4',
  folderId: null,
  archivedAt: null,
  ...over,
});

const bytes = (size: number) => Buffer.alloc(size, 1);

beforeEach(() => {
  putObject.mockReset();
  removeObject.mockReset();
  objectInfo.mockReset();
  putObject.mockResolvedValue(true);
  removeObject.mockResolvedValue(true);
  objectInfo.mockResolvedValue({ sizeBytes: 12_000_000, mimeType: 'video/mp4' });
});

describe('shelves', () => {
  it('creates one, recording who filed it', async () => {
    const { db, created } = dbFor();

    const result = await createFolder(db as never, TENANT, 'ath_1', '  Formcheck  ', 'coach_1');

    expect(result).toEqual({ ok: true, value: { id: 'fol_new' } });
    expect(created[0]).toMatchObject({
      organizationId: 'org_a',
      athleteId: 'ath_1',
      name: 'Formcheck',
      createdByCoachId: 'coach_1',
    });
  });

  it('records the athlete as the author when no coach filed it', async () => {
    const { db, created } = dbFor();

    await createFolder(db as never, TENANT, 'ath_1', 'Eigene Videos', null);

    // Null is the meaning, exactly as on `Asset.uploadedByCoachId` (§18).
    expect(created[0]?.['createdByCoachId']).toBeNull();
  });

  it('refuses an empty name without writing anything', async () => {
    const { db, created } = dbFor();

    expect(await createFolder(db as never, TENANT, 'ath_1', '   ', null)).toEqual({
      ok: false,
      refusal: 'EMPTY_NAME',
    });
    expect(created).toEqual([]);
  });

  it('refuses a second folder of the same name for one athlete', async () => {
    const { db } = dbFor({ folders: [folder({ name: 'Formcheck' })] });

    expect(await createFolder(db as never, TENANT, 'ath_1', 'Formcheck', null)).toEqual({
      ok: false,
      refusal: 'NAME_TAKEN',
    });
  });

  it('renames one, scoped to the workspace and the athlete', async () => {
    const { db, filters } = dbFor({ folders: [folder()] });

    expect(await renameFolder(db as never, TENANT, 'ath_1', 'fol_1', 'Formcheck Herbst')).toEqual({
      ok: true,
      value: null,
    });
    expect(filters[0]).toMatchObject({
      organizationId: 'org_a',
      athleteId: 'ath_1',
      id: 'fol_1',
    });
  });

  it('does not rename a folder of another athlete', async () => {
    const { db } = dbFor({ folders: [folder({ athleteId: 'ath_2' })] });

    expect(await renameFolder(db as never, TENANT, 'ath_1', 'fol_1', 'Meins')).toEqual({
      ok: false,
      refusal: 'NOT_FOUND',
    });
  });

  it('deletes a shelf without touching a single file', async () => {
    const { db } = dbFor({ folders: [folder()], assets: [file({ folderId: 'fol_1' })] });

    expect(await deleteFolder(db as never, TENANT, 'ath_1', 'fol_1')).toBe(true);
    // Nothing in this path removes an asset or an object — the column is
    // `SetNull`, so the files simply become loose (§18).
    expect(removeObject).not.toHaveBeenCalled();
    expect(db.asset.findMany).not.toHaveBeenCalled();
  });

  it('lists only this athlete’s shelves, in this workspace', async () => {
    const { db, filters } = dbFor({
      folders: [folder(), folder({ id: 'fol_2', athleteId: 'ath_2' })],
    });

    const list = await listFolders(db as never, TENANT, 'ath_1');

    expect(list.map((row) => row.id)).toEqual(['fol_1']);
    expect(filters[0]).toMatchObject({ organizationId: 'org_a', athleteId: 'ath_1' });
  });
});

describe('reading files', () => {
  it('lists only this athlete’s files', async () => {
    const { db } = dbFor({
      assets: [file(), file({ id: 'as_2', athleteId: 'ath_2' })],
    });

    expect((await listAthleteAssets(db as never, TENANT, 'ath_1')).map((row) => row.id)).toEqual([
      'as_1',
    ]);
  });

  it('finds nothing for an athlete of another workspace', async () => {
    const { db } = dbFor({ assets: [file()] });

    expect(await listAthleteAssets(db as never, OTHER, 'ath_1')).toEqual([]);
  });

  it('hands a download back only for a file of that athlete', async () => {
    const { db } = dbFor({ assets: [file()] });

    expect(await assetForDownload(db as never, TENANT, 'ath_1', 'as_1')).not.toBeNull();
    // The same id, asked for on behalf of somebody else: no row.
    expect(await assetForDownload(db as never, TENANT, 'ath_2', 'as_1')).toBeNull();
  });
});

describe('uploading', () => {
  const input = {
    athleteId: 'ath_1',
    fileName: 'squat.mp4',
    mimeType: 'video/mp4',
    uploadedByCoachId: null,
  };

  it('accepts a file of exactly the limit', async () => {
    const { db, created } = dbFor();

    const result = await uploadAsset(db as never, TENANT, {
      ...input,
      bytes: bytes(MAX_UPLOAD_BYTES),
    });

    expect(result).toEqual({ ok: true, assetId: 'as_new' });
    expect(created[0]).toMatchObject({
      organizationId: 'org_a',
      athleteId: 'ath_1',
      kind: 'VIDEO',
      mimeType: 'video/mp4',
      sizeBytes: MAX_UPLOAD_BYTES,
      fileName: 'squat.mp4',
      uploadedByCoachId: null,
    });
  });

  it('refuses one byte more, and writes no object', async () => {
    const { db, created } = dbFor();

    const result = await uploadAsset(db as never, TENANT, {
      ...input,
      bytes: bytes(MAX_UPLOAD_BYTES + 1),
    });

    expect(result).toEqual({ ok: false, refusal: 'TOO_LARGE' });
    // The whole point of refusing: nothing reaches the store, nothing is filed.
    expect(putObject).not.toHaveBeenCalled();
    expect(created).toEqual([]);
  });

  it('refuses a type this area does not take', async () => {
    const { db } = dbFor();

    expect(
      await uploadAsset(db as never, TENANT, {
        ...input,
        mimeType: 'application/zip',
        bytes: bytes(10),
      }),
    ).toEqual({ ok: false, refusal: 'UNSUPPORTED_TYPE' });
    expect(putObject).not.toHaveBeenCalled();
  });

  it('files a photo as a document and a clip as a video', async () => {
    const { db, created } = dbFor();

    await uploadAsset(db as never, TENANT, {
      ...input,
      fileName: 'haltung.jpg',
      mimeType: 'image/jpeg',
      bytes: bytes(10),
    });

    expect(created[0]).toMatchObject({ kind: 'DOCUMENT' });
  });

  it('builds the key from the athlete and never from the file name', async () => {
    const { db } = dbFor();

    await uploadAsset(db as never, TENANT, {
      ...input,
      fileName: '../../reports/rep_1/stolen.jpg',
      mimeType: 'image/jpeg',
      bytes: bytes(10),
    });

    const key = (putObject.mock.calls as unknown as [string][])[0]?.[0] ?? '';
    expect(key.startsWith('athletes/ath_1/')).toBe(true);
    expect(key).not.toContain('reports');
    expect(key.endsWith('.jpg')).toBe(true);
  });

  it('records the coach on a coach upload', async () => {
    const { db, created } = dbFor();

    await uploadAsset(db as never, TENANT, {
      ...input,
      uploadedByCoachId: 'coach_1',
      bytes: bytes(10),
    });

    expect(created[0]).toMatchObject({ uploadedByCoachId: 'coach_1' });
  });

  it('files nothing when the store refused the bytes', async () => {
    const { db, created } = dbFor();
    putObject.mockResolvedValue(false);

    expect(await uploadAsset(db as never, TENANT, { ...input, bytes: bytes(10) })).toEqual({
      ok: false,
      refusal: 'STORAGE_FAILED',
    });
    expect(created).toEqual([]);
  });

  it('removes the object again when the row could not be written', async () => {
    const { db } = dbFor();
    db.asset.create.mockRejectedValueOnce(new Error('nope'));

    await expect(
      uploadAsset(db as never, TENANT, { ...input, bytes: bytes(10) }),
    ).rejects.toThrow();

    // An object nothing points at is invisible and counts against 1 GB for
    // ever — the one leftover this ordering exists to prevent (§18).
    expect(removeObject).toHaveBeenCalledTimes(1);
  });

  it('refuses an empty file', async () => {
    const { db } = dbFor();

    expect(await uploadAsset(db as never, TENANT, { ...input, bytes: bytes(0) })).toEqual({
      ok: false,
      refusal: 'EMPTY',
    });
  });
});

describe('the resumable road', () => {
  const target = { athleteId: 'ath_1', mimeType: 'video/mp4', sizeBytes: 12 * 1024 * 1024 };

  it('builds a key under the athlete, never from anything the client sent', () => {
    const prepared = prepareResumableUpload(target);

    expect(prepared.ok).toBe(true);
    if (!prepared.ok) return;
    expect(prepared.storageKey.startsWith('athletes/ath_1/')).toBe(true);
    expect(prepared.storageKey.endsWith('.mp4')).toBe(true);
    expect(prepared.mimeType).toBe('video/mp4');
  });

  it('accepts up to the store’s own ceiling and refuses past it', () => {
    expect(prepareResumableUpload({ ...target, sizeBytes: MAX_ASSET_BYTES }).ok).toBe(true);
    expect(prepareResumableUpload({ ...target, sizeBytes: MAX_ASSET_BYTES + 1 })).toEqual({
      ok: false,
      refusal: 'TOO_LARGE',
    });
  });

  it('refuses a type the store would not take', () => {
    expect(prepareResumableUpload({ ...target, mimeType: 'application/zip' })).toEqual({
      ok: false,
      refusal: 'UNSUPPORTED_TYPE',
    });
  });

  it('strips codec parameters before deciding and before storing', () => {
    const prepared = prepareResumableUpload({ ...target, mimeType: 'video/webm;codecs=vp8' });

    expect(prepared.ok && prepared.mimeType).toBe('video/webm');
    expect(prepared.ok && prepared.storageKey.endsWith('.webm')).toBe(true);
  });
});

describe('filing the row after a resumable upload', () => {
  const ticket = {
    athleteId: 'ath_1',
    storageKey: 'athletes/ath_1/abc.mp4',
    mimeType: 'video/mp4',
    fileName: 'formcheck.mp4',
    folderId: null,
    uploadedByCoachId: 'coach_1',
  };

  it('writes nothing when the object is not in the store', async () => {
    const { db, created } = dbFor();
    objectInfo.mockResolvedValue(null);

    expect(await registerUploadedAsset(db as never, TENANT, ticket)).toEqual({
      ok: false,
      refusal: 'NOT_UPLOADED',
    });
    // Storage success comes before asset success, and this is that rule (§18).
    expect(created).toEqual([]);
  });

  it('records the size the store reports, not the one it was told', async () => {
    const { db, created } = dbFor();
    objectInfo.mockResolvedValue({ sizeBytes: 9_876_543, mimeType: 'video/mp4' });

    const result = await registerUploadedAsset(db as never, TENANT, ticket);

    expect(result).toEqual({ ok: true, assetId: 'as_new' });
    expect(created[0]).toMatchObject({
      organizationId: 'org_a',
      athleteId: 'ath_1',
      storageKey: 'athletes/ath_1/abc.mp4',
      sizeBytes: 9_876_543,
      kind: 'VIDEO',
      uploadedByCoachId: 'coach_1',
    });
  });

  it('refuses an object that somehow exceeds the store’s ceiling', async () => {
    const { db, created } = dbFor();
    objectInfo.mockResolvedValue({ sizeBytes: MAX_ASSET_BYTES + 1, mimeType: 'video/mp4' });

    expect(await registerUploadedAsset(db as never, TENANT, ticket)).toEqual({
      ok: false,
      refusal: 'TOO_LARGE',
    });
    expect(created).toEqual([]);
  });

  it('files a converted photo as a document', async () => {
    const { db, created } = dbFor();
    objectInfo.mockResolvedValue({ sizeBytes: 900_000, mimeType: 'image/jpeg' });

    await registerUploadedAsset(db as never, TENANT, {
      ...ticket,
      storageKey: 'athletes/ath_1/abc.jpg',
      mimeType: 'image/jpeg',
      fileName: 'IMG_0042.jpg',
    });

    expect(created[0]).toMatchObject({ kind: 'DOCUMENT', mimeType: 'image/jpeg' });
  });
});
