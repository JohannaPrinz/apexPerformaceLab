import { beforeEach, describe, expect, it, vi } from 'vitest';

import { assetDeletion, deleteAsset, releaseAssetsOfAssessment } from './deletion';

/**
 * When a file may go, and what goes with it (§18).
 *
 * The store is mocked at the module boundary — these are rules, not a network —
 * but the **database fake answers from the filter**, because half of what is
 * under test is that the workspace and the right conditions are in the query at
 * all. A fake that returned whatever the test configured would pass every
 * assertion here while the service read the wrong rows. The same goes for the
 * transaction: it undoes what its callback wrote when the callback throws,
 * because that rollback is the guarantee.
 *
 * The one thing tests cannot show is what is not there: frozen report media are
 * not Assets, so no query in this file can reach them. That is asserted the
 * only way it can be — by checking that a deletion touches nothing but the one
 * row and the one object.
 */

const { listObjects, removeObject, putObject } = vi.hoisted(() => ({
  listObjects: vi.fn<(folder: string, limit?: number) => Promise<readonly unknown[]>>(),
  removeObject: vi.fn<() => Promise<boolean>>(),
  putObject: vi.fn<() => Promise<boolean>>(),
}));

vi.mock('@/integrations/object-store', () => ({ listObjects, removeObject, putObject }));

const TENANT = { organizationId: 'org_a' } as const;

interface AssetRow {
  id: string;
  organizationId: string;
  storageKey: string;
  assessmentModuleId: string | null;
  assessmentId?: string | null;
  analysisStatus?: 'RUNNING' | 'FINISHED' | 'FAILED' | null;
  analysisExpiresAt?: Date | null;
}

interface InsightRow {
  id: string;
  assetId: string;
  assessmentModuleId: string;
  measurements: number;
}

/** Modules that a published, included report covers. */
type Published = readonly string[];

/** Whether an analysis is holding this row at this moment. */
const leaseHolds = (row: AssetRow, now: number) =>
  row.analysisStatus === 'RUNNING' && (row.analysisExpiresAt?.getTime() ?? 0) > now;

function dbFor({
  assets = [],
  insights = [],
  published = [],
}: {
  assets?: readonly AssetRow[];
  insights?: readonly InsightRow[];
  published?: Published;
} = {}) {
  const deletes: Record<string, unknown>[] = [];
  /** Mutable, so a delete really removes and a rollback really restores. */
  const rows = [...assets];

  const delegates = {
    asset: {
      findFirst: vi.fn(({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve(
          rows.find(
            (row) => row.organizationId === where['organizationId'] && row.id === where['id'],
          ) ?? null,
        ),
      ),
      findMany: vi.fn(({ where }: { where: Record<string, unknown> }) => {
        // The bulk read: this workspace, and either context pointing at the
        // assessment. Interpreted rather than assumed.
        const or = where['OR'] as { assessmentId?: string }[] | undefined;
        const wanted = or?.[0]?.assessmentId;

        return Promise.resolve(
          rows.filter(
            (row) => row.organizationId === where['organizationId'] && row.assessmentId === wanted,
          ),
        );
      }),
      /**
       * Removes only what the filter allows.
       *
       * The condition the service puts in the `WHERE` is the entire point of
       * the atomic delete, so the fake evaluates it rather than answering
       * `count: 1` and pretending.
       */
      deleteMany: vi.fn(({ where }: { where: Record<string, unknown> }) => {
        deletes.push(where);

        const now = Date.now();
        const matched = rows.filter(
          (row) =>
            row.organizationId === where['organizationId'] &&
            row.id === where['id'] &&
            // `notHeldByAnalysis` is present exactly when the caller demands it.
            (where['OR'] === undefined || !leaseHolds(row, now)),
        );

        for (const row of matched) rows.splice(rows.indexOf(row), 1);

        return Promise.resolve({ count: matched.length });
      }),
    },
    insightAsset: {
      findMany: vi.fn(({ where }: { where: Record<string, unknown> }) =>
        Promise.resolve(
          insights
            .filter((row) => row.assetId === where['assetId'])
            .map((row) => ({
              insight: {
                id: row.id,
                assessmentModuleId: row.assessmentModuleId,
                _count: { measurementEvidence: row.measurements },
              },
            })),
        ),
      ),
    },
    reportModule: {
      findMany: vi.fn(({ where }: { where: Record<string, unknown> }) => {
        const ids = (where['assessmentModuleId'] as { in: string[] }).in;
        const wantsPublished =
          (where['report'] as { status?: string } | undefined)?.status === 'PUBLISHED';

        return Promise.resolve(
          where['organizationId'] === 'org_a' && wantsPublished && where['included'] === true
            ? ids.filter((id) => published.includes(id)).map((id) => ({ assessmentModuleId: id }))
            : [],
        );
      }),
    },
  };

  return {
    deletes,
    rows,
    db: {
      ...delegates,
      /**
       * An interactive transaction, with the part that matters: a callback that
       * throws leaves nothing behind. The service relies on exactly that — a
       * failed storage removal must not leave the row deleted.
       */
      $transaction: async <T>(work: (tx: typeof delegates) => Promise<T>): Promise<T> => {
        const writtenBefore = deletes.length;
        const rowsBefore = [...rows];

        try {
          return await work(delegates);
        } catch (error) {
          deletes.length = writtenBefore;
          rows.splice(0, rows.length, ...rowsBefore);
          throw error;
        }
      },
    },
  };
}

const asset = (over: Partial<AssetRow> = {}): AssetRow => ({
  id: 'as_1',
  organizationId: 'org_a',
  storageKey: 'athletes/ath_1/as_1.mp4',
  assessmentModuleId: null,
  assessmentId: null,
  analysisStatus: null,
  analysisExpiresAt: null,
  ...over,
});

/** A file an analysis is holding right now. */
const held = (over: Partial<AssetRow> = {}): AssetRow =>
  asset({
    analysisStatus: 'RUNNING',
    analysisExpiresAt: new Date(Date.now() + 60 * 60 * 1000),
    ...over,
  });

beforeEach(() => {
  listObjects.mockReset();
  removeObject.mockReset();
  putObject.mockReset();
  listObjects.mockResolvedValue([]);
  removeObject.mockResolvedValue(true);
  putObject.mockResolvedValue(true);
});

describe('what may be deleted', () => {
  it('allows a file nothing depends on', async () => {
    const { db } = dbFor({ assets: [asset()] });

    expect(await assetDeletion(db as never, TENANT, 'as_1')).toEqual({ status: 'DELETE_ALLOWED' });
  });

  it('does not find a file of another workspace', async () => {
    const { db } = dbFor({ assets: [asset({ organizationId: 'org_b' })] });

    expect(await assetDeletion(db as never, TENANT, 'as_1')).toEqual({ status: 'NOT_FOUND' });
  });

  it('refuses while an analysis is working on the test it belongs to', async () => {
    const { db } = dbFor({ assets: [asset({ assessmentModuleId: 'mod_1' })] });
    listObjects.mockResolvedValue([{ key: 'analysis-temp/org_a/mod_1/flexed__x.jpg' }]);

    expect(await assetDeletion(db as never, TENANT, 'as_1')).toEqual({
      status: 'DELETE_BLOCKED_ACTIVE_ANALYSIS',
      moduleId: 'mod_1',
    });
    expect(listObjects).toHaveBeenCalledWith('analysis-temp/org_a/mod_1', 1);
  });

  it('asks the store about stills only where there is a test', async () => {
    const { db } = dbFor({ assets: [asset()] });

    await assetDeletion(db as never, TENANT, 'as_1');

    // The lease arrived with the row. The coarse stills check needs a test to
    // be about, and there is none — so the store is not asked at all.
    expect(listObjects).not.toHaveBeenCalled();
  });
});

describe('evidence for a finding', () => {
  it('refuses where a finding cites it and nothing permanent took its place', async () => {
    const { db } = dbFor({
      assets: [asset()],
      insights: [{ id: 'ins_1', assetId: 'as_1', assessmentModuleId: 'mod_1', measurements: 0 }],
    });

    expect(await assetDeletion(db as never, TENANT, 'as_1')).toEqual({
      status: 'DELETE_BLOCKED_MISSING_INSIGHT_EVIDENCE',
      insightIds: ['ins_1'],
    });
  });

  it('allows it once a published report covers the same test', async () => {
    const { db } = dbFor({
      assets: [asset()],
      insights: [{ id: 'ins_1', assetId: 'as_1', assessmentModuleId: 'mod_1', measurements: 0 }],
      published: ['mod_1'],
    });

    expect(await assetDeletion(db as never, TENANT, 'as_1')).toEqual({ status: 'DELETE_ALLOWED' });
  });

  it('allows it where the finding rests on measured values', async () => {
    const { db } = dbFor({
      assets: [asset()],
      insights: [{ id: 'ins_1', assetId: 'as_1', assessmentModuleId: 'mod_1', measurements: 3 }],
    });

    expect(await assetDeletion(db as never, TENANT, 'as_1')).toEqual({ status: 'DELETE_ALLOWED' });
  });

  it('names every finding that would be left without evidence', async () => {
    const { db } = dbFor({
      assets: [asset()],
      insights: [
        { id: 'ins_1', assetId: 'as_1', assessmentModuleId: 'mod_1', measurements: 0 },
        { id: 'ins_2', assetId: 'as_1', assessmentModuleId: 'mod_2', measurements: 0 },
        // Covered: not named.
        { id: 'ins_3', assetId: 'as_1', assessmentModuleId: 'mod_3', measurements: 0 },
      ],
      published: ['mod_3'],
    });

    const verdict = await assetDeletion(db as never, TENANT, 'as_1');

    expect(verdict).toEqual({
      status: 'DELETE_BLOCKED_MISSING_INSIGHT_EVIDENCE',
      insightIds: ['ins_1', 'ins_2'],
    });
  });

  it('being filed against an assessment is not evidence', async () => {
    // A video sitting in a test with no deliberate insight link: no obstacle.
    const { db } = dbFor({ assets: [asset({ assessmentModuleId: 'mod_1' })] });

    expect(await assetDeletion(db as never, TENANT, 'as_1')).toEqual({ status: 'DELETE_ALLOWED' });
  });
});

describe('performing the deletion', () => {
  it('removes the row and the object together, scoped to the workspace', async () => {
    const { db, deletes } = dbFor({ assets: [asset()] });

    expect(await deleteAsset(db as never, TENANT, 'as_1')).toEqual({ status: 'DELETED' });
    expect(removeObject).toHaveBeenCalledWith('athletes/ath_1/as_1.mp4');
    expect(deletes).toHaveLength(1);
    expect(deletes[0]).toMatchObject({ organizationId: 'org_a', id: 'as_1' });
  });

  it('restores the row when the object could not be removed', async () => {
    const { db, deletes, rows } = dbFor({ assets: [asset()] });
    removeObject.mockResolvedValue(false);

    expect(await deleteAsset(db as never, TENANT, 'as_1')).toEqual({ status: 'STORAGE_FAILED' });
    // The failure this whole ordering exists to prevent: a row gone and the
    // bytes left behind with nothing pointing at them. The transaction threw,
    // so the row is back.
    expect(deletes).toEqual([]);
    expect(rows).toHaveLength(1);
  });

  it('touches neither the object nor the row when the verdict refuses', async () => {
    const { db, deletes } = dbFor({
      assets: [asset()],
      insights: [{ id: 'ins_1', assetId: 'as_1', assessmentModuleId: 'mod_1', measurements: 0 }],
    });

    const result = await deleteAsset(db as never, TENANT, 'as_1');

    expect(result.status).toBe('DELETE_BLOCKED_MISSING_INSIGHT_EVIDENCE');
    expect(removeObject).not.toHaveBeenCalled();
    expect(deletes).toEqual([]);
  });

  it('deletes a video with annotations — they are the database’s to cascade', async () => {
    // Nothing here consults annotations, and that is the assertion: they never
    // enter the decision, so a video is never held back by its own remarks.
    const { db } = dbFor({ assets: [asset({ storageKey: 'athletes/ath_1/clip.mp4' })] });

    expect(await deleteAsset(db as never, TENANT, 'as_1')).toEqual({ status: 'DELETED' });
    expect(removeObject).toHaveBeenCalledWith('athletes/ath_1/clip.mp4');
  });
});

describe('freeing the files of an assessment', () => {
  const files = [
    asset({ id: 'as_free', assessmentId: 'asm_1', storageKey: 'athletes/a/free.mp4' }),
    asset({
      id: 'as_held',
      assessmentId: 'asm_1',
      assessmentModuleId: 'mod_busy',
      storageKey: 'athletes/a/held.mp4',
    }),
    asset({ id: 'as_other', assessmentId: 'asm_2', storageKey: 'athletes/a/other.mp4' }),
  ];

  it('removes what may go, from the store as well as the database', async () => {
    const { db, deletes } = dbFor({ assets: files });

    const result = await releaseAssetsOfAssessment(db as never, TENANT, 'asm_1');

    expect(result.deleted).toEqual(['as_free', 'as_held']);
    expect(removeObject).toHaveBeenCalledWith('athletes/a/free.mp4');
    expect(deletes.map((where) => where['id'])).toEqual(['as_free', 'as_held']);
    expect(deletes.every((where) => where['organizationId'] === 'org_a')).toBe(true);
    // Another assessment's file is not swept up with it.
    expect(removeObject).not.toHaveBeenCalledWith('athletes/a/other.mp4');
  });

  it('reports what it had to keep instead of failing silently', async () => {
    const { db } = dbFor({ assets: files });
    listObjects.mockResolvedValue([{ key: 'analysis-temp/org_a/mod_busy/flexed__x.jpg' }]);

    const result = await releaseAssetsOfAssessment(db as never, TENANT, 'asm_1');

    expect(result.deleted).toEqual(['as_free']);
    expect(result.kept).toEqual([{ assetId: 'as_held', reason: 'DELETE_BLOCKED_ACTIVE_ANALYSIS' }]);
  });

  it('keeps a file an analysis is holding, and says so', async () => {
    const { db } = dbFor({
      assets: [
        asset({ id: 'as_free', assessmentId: 'asm_1', storageKey: 'athletes/a/free.mp4' }),
        held({ id: 'as_leased', assessmentId: 'asm_1', storageKey: 'athletes/a/leased.mp4' }),
      ],
    });

    const result = await releaseAssetsOfAssessment(db as never, TENANT, 'asm_1');

    expect(result.deleted).toEqual(['as_free']);
    expect(result.kept).toEqual([
      { assetId: 'as_leased', reason: 'DELETE_BLOCKED_ACTIVE_ANALYSIS' },
    ]);
    expect(removeObject).not.toHaveBeenCalledWith('athletes/a/leased.mp4');
  });

  it('keeps a file whose object refused to go, and says so', async () => {
    const { db, deletes } = dbFor({ assets: [files[0]!] });
    removeObject.mockResolvedValue(false);

    const result = await releaseAssetsOfAssessment(db as never, TENANT, 'asm_1');

    expect(result.deleted).toEqual([]);
    expect(result.kept).toEqual([{ assetId: 'as_free', reason: 'STORAGE_FAILED' }]);
    expect(deletes).toEqual([]);
  });

  it('reaches no frozen report media, because those are not Assets', async () => {
    const { db } = dbFor({ assets: files });

    await releaseAssetsOfAssessment(db as never, TENANT, 'asm_1');

    // Every key it touched is an athlete upload. Nothing under `reports/` can
    // be reached from here at all — publication copied those out of harm's way.
    for (const call of removeObject.mock.calls as unknown as [string][]) {
      expect(call[0]).not.toContain('reports/');
    }
  });
});

describe('a stored video held by an analysis', () => {
  it('refuses while the lease holds, even with no test behind it', async () => {
    // The stills check cannot see this at all: the file belongs to no module,
    // so there are no working stills to notice (§18).
    const { db } = dbFor({ assets: [held()] });

    expect(await assetDeletion(db as never, TENANT, 'as_1')).toEqual({
      status: 'DELETE_BLOCKED_ACTIVE_ANALYSIS',
      moduleId: null,
    });
  });

  it('lets it go once the analysis has finished', async () => {
    const { db } = dbFor({ assets: [asset({ analysisStatus: 'FINISHED' })] });

    expect(await assetDeletion(db as never, TENANT, 'as_1')).toEqual({ status: 'DELETE_ALLOWED' });
  });

  it('lets it go after a failed analysis too', async () => {
    const { db } = dbFor({ assets: [asset({ analysisStatus: 'FAILED' })] });

    expect(await assetDeletion(db as never, TENANT, 'as_1')).toEqual({ status: 'DELETE_ALLOWED' });
  });

  it('ignores a lease that has run out', async () => {
    // A tab closed mid-analysis cannot end its own hold, and a lock nobody can
    // clear would block a deletion for ever.
    const { db } = dbFor({
      assets: [
        asset({ analysisStatus: 'RUNNING', analysisExpiresAt: new Date(Date.now() - 1000) }),
      ],
    });

    expect(await assetDeletion(db as never, TENANT, 'as_1')).toEqual({ status: 'DELETE_ALLOWED' });
  });

  it('does not confuse one file’s lease with another', async () => {
    const { db } = dbFor({ assets: [held({ id: 'as_1' }), asset({ id: 'as_other' })] });

    expect(await assetDeletion(db as never, TENANT, 'as_other')).toEqual({
      status: 'DELETE_ALLOWED',
    });
  });

  it('deletes nothing while the lease stands', async () => {
    const { db, deletes, rows } = dbFor({ assets: [held()] });

    const result = await deleteAsset(db as never, TENANT, 'as_1');

    expect(result.status).toBe('DELETE_BLOCKED_ACTIVE_ANALYSIS');
    expect(removeObject).not.toHaveBeenCalled();
    expect(deletes).toEqual([]);
    expect(rows).toHaveLength(1);
  });
});

describe('deleting and starting an analysis at the same moment', () => {
  it('carries the analysis condition into the delete itself', async () => {
    const { db, deletes } = dbFor({ assets: [asset()] });

    await deleteAsset(db as never, TENANT, 'as_1');

    // Not a check followed by a delete — one statement, so a lease taken in
    // between still wins.
    const or = deletes[0]?.['OR'] as
      { analysisStatus?: unknown; analysisExpiresAt?: { lte: Date } }[] | undefined;

    expect(or?.[0]).toEqual({ analysisStatus: null });
    expect(or?.[1]).toEqual({ analysisStatus: { not: 'RUNNING' } });
    expect(or?.[2]?.analysisExpiresAt?.lte).toBeInstanceOf(Date);
  });

  it('refuses when the analysis started after the verdict was taken', async () => {
    // The race itself: the verdict saw a free file, and by the time the delete
    // ran an analysis had started. The statement matches no row, and the answer
    // is the truthful refusal rather than a silent success.
    const { db, deletes, rows } = dbFor({ assets: [asset()] });

    db.asset.findFirst.mockImplementationOnce(({ where }: { where: Record<string, unknown> }) => {
      const found = rows.find((row) => row.id === where['id']) ?? null;
      // Between the read and the delete, somebody takes the hold.
      rows.splice(0, rows.length, held());

      return Promise.resolve(found);
    });

    expect(await deleteAsset(db as never, TENANT, 'as_1')).toEqual({
      status: 'DELETE_BLOCKED_ACTIVE_ANALYSIS',
      moduleId: null,
    });
    // It did try, in one statement — and the store was never touched, because
    // no row went.
    expect(deletes).toHaveLength(1);
    expect(removeObject).not.toHaveBeenCalled();
    expect(rows).toHaveLength(1);
  });

  it('deletes exactly once when two deletions race', async () => {
    const { db, rows } = dbFor({ assets: [asset()] });

    const [first, second] = await Promise.all([
      deleteAsset(db as never, TENANT, 'as_1'),
      deleteAsset(db as never, TENANT, 'as_1'),
    ]);

    // Both verdicts saw a deletable file; only one statement matched the row.
    // The loser is told the file is gone — not that an analysis is holding it,
    // which is the other thing a zero count can mean.
    expect([first?.status, second?.status].sort()).toEqual(['DELETED', 'NOT_FOUND']);
    expect(rows).toEqual([]);
  });
});
