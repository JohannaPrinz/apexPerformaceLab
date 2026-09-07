import { beforeEach, describe, expect, it, vi } from 'vitest';

import { analysisSourceFor } from './files';

/**
 * Pointing the existing analysis at a stored video (§18).
 *
 * What is under test is the **authorisation and resolution**, because that is
 * all this integration adds: the analysis itself is untouched, and the only new
 * question is which file a coach may open and where its bytes live.
 *
 * The storage key is an *output* here, never an input — a client names an asset
 * and gets a name back. The tests read the filter to prove it.
 */

const { objectInfo } = vi.hoisted(() => ({
  objectInfo: vi.fn<() => Promise<{ sizeBytes: number; mimeType: string | null } | null>>(),
}));

vi.mock('@/integrations/object-store', () => ({
  objectInfo,
  putObject: vi.fn(),
  removeObject: vi.fn(),
  listObjects: vi.fn(),
}));

const TENANT = { organizationId: 'org_a' } as const;
const OTHER = { organizationId: 'org_b' } as const;

interface AssetRow {
  id: string;
  organizationId: string;
  athleteId: string;
  kind: 'VIDEO' | 'DOCUMENT';
  archivedAt: Date | null;
  fileName: string;
  mimeType: string;
  storageKey: string;
}

const asset = (over: Partial<AssetRow> = {}): AssetRow => ({
  id: 'as_1',
  organizationId: 'org_a',
  athleteId: 'ath_1',
  kind: 'VIDEO',
  archivedAt: null,
  fileName: 'formcheck.mp4',
  mimeType: 'video/mp4',
  storageKey: 'athletes/ath_1/abc.mp4',
  ...over,
});

/** A fake that answers from the filter, so the scoping is what is measured. */
function dbFor(rows: readonly AssetRow[]) {
  const filters: Record<string, unknown>[] = [];

  return {
    filters,
    db: {
      asset: {
        findFirst: vi.fn(({ where }: { where: Record<string, unknown> }) => {
          filters.push(where);

          return Promise.resolve(
            rows.find(
              (row) =>
                row.organizationId === where['organizationId'] &&
                row.id === where['id'] &&
                row.athleteId === where['athleteId'] &&
                row.archivedAt === where['archivedAt'],
            ) ?? null,
          );
        }),
      },
    },
  };
}

beforeEach(() => {
  objectInfo.mockReset();
  objectInfo.mockResolvedValue({ sizeBytes: 4_000_000, mimeType: 'video/mp4' });
});

describe('which video a coach may analyse', () => {
  it('opens their own athlete’s video', async () => {
    const { db } = dbFor([asset()]);

    const result = await analysisSourceFor(db as never, TENANT, 'ath_1', 'as_1');

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.source).toMatchObject({
      assetId: 'as_1',
      fileName: 'formcheck.mp4',
      mimeType: 'video/mp4',
      storageKey: 'athletes/ath_1/abc.mp4',
    });
  });

  it('refuses a video of another workspace', async () => {
    const { db } = dbFor([asset({ organizationId: 'org_b' })]);

    expect(await analysisSourceFor(db as never, TENANT, 'ath_1', 'as_1')).toEqual({
      ok: false,
      refusal: 'NOT_FOUND',
    });
    // And the same row, asked for from the workspace that does own it, is fine.
    expect((await analysisSourceFor(db as never, OTHER, 'ath_1', 'as_1')).ok).toBe(true);
  });

  it('refuses a video of another athlete', async () => {
    const { db } = dbFor([asset({ athleteId: 'ath_2' })]);

    expect(await analysisSourceFor(db as never, TENANT, 'ath_1', 'as_1')).toEqual({
      ok: false,
      refusal: 'NOT_FOUND',
    });
  });

  it('refuses a photo or a document', async () => {
    const { db } = dbFor([asset({ kind: 'DOCUMENT', mimeType: 'image/jpeg' })]);

    // Not filtered out of a list somewhere — refused, so a screen that offered
    // one anyway still cannot start an analysis with it.
    expect(await analysisSourceFor(db as never, TENANT, 'ath_1', 'as_1')).toEqual({
      ok: false,
      refusal: 'NOT_A_VIDEO',
    });
  });

  it('refuses an asset that is not there', async () => {
    const { db } = dbFor([]);

    expect(await analysisSourceFor(db as never, TENANT, 'ath_1', 'as_missing')).toEqual({
      ok: false,
      refusal: 'NOT_FOUND',
    });
  });

  it('refuses one whose bytes are gone from the store', async () => {
    const { db } = dbFor([asset()]);
    objectInfo.mockResolvedValue(null);

    expect(await analysisSourceFor(db as never, TENANT, 'ath_1', 'as_1')).toEqual({
      ok: false,
      refusal: 'MISSING_IN_STORAGE',
    });
  });

  it('asks for a live, unarchived row of that workspace and that athlete', async () => {
    const { db, filters } = dbFor([asset()]);

    await analysisSourceFor(db as never, TENANT, 'ath_1', 'as_1');

    expect(filters[0]).toMatchObject({
      organizationId: 'org_a',
      id: 'as_1',
      athleteId: 'ath_1',
      archivedAt: null,
    });
  });

  it('resolves the storage key server-side and never takes one', async () => {
    const { db, filters } = dbFor([asset()]);

    const result = await analysisSourceFor(db as never, TENANT, 'ath_1', 'as_1');

    // Nothing about a path is asked for; the key comes out of the record.
    expect(JSON.stringify(filters[0])).not.toContain('storageKey');
    expect(result.ok && result.source.storageKey).toBe('athletes/ath_1/abc.mp4');
    // And the store was asked about exactly that key, not one from a caller.
    expect(objectInfo).toHaveBeenCalledWith('athletes/ath_1/abc.mp4');
  });
});
