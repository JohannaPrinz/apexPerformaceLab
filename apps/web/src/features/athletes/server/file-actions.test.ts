import { beforeEach, describe, expect, it, vi } from 'vitest';

import { deleteAnalysedVideoAction, deleteAthleteFileAction } from './file-actions';

/**
 * The two ways a coach deletes a file, and the one thing that separates them.
 *
 * Both go through the same procedure. What differs is whether the page is told
 * to re-read: the file shelf must be, and the analysis page must **not** be —
 * re-reading it after its video is gone replaces the analysis on screen with an
 * empty picker, which is how a finished, unsaved analysis was lost.
 */

const mocks = vi.hoisted(() => ({
  deleteAssetFile: vi.fn(() => Promise.resolve({ ok: true })),
  revalidatePath: vi.fn(),
}));

vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock('@apex/database', () => ({ db: {} }));
vi.mock('@/server/tenant', () => ({ routeTenant: vi.fn() }));
vi.mock('@/services/assets/files', () => ({ MAX_UPLOAD_BYTES: 1, uploadAsset: vi.fn() }));
vi.mock('@/trpc/server', () => ({
  api: { athletes: { deleteAssetFile: mocks.deleteAssetFile } },
}));

beforeEach(() => {
  mocks.deleteAssetFile.mockClear();
  mocks.deleteAssetFile.mockResolvedValue({ ok: true });
  mocks.revalidatePath.mockClear();
});

describe('deleting the video an analysis screen was working on', () => {
  it('deletes through the same procedure as the file shelf', async () => {
    expect(await deleteAnalysedVideoAction('ath_1', 'as_1')).toEqual({});
    expect(mocks.deleteAssetFile).toHaveBeenCalledWith({ athleteId: 'ath_1', assetId: 'as_1' });
  });

  it('does not make the analysis page re-read itself', async () => {
    await deleteAnalysedVideoAction('ath_1', 'as_1');

    expect(mocks.revalidatePath).not.toHaveBeenCalled();
  });

  it('passes a refusal on as a sentence', async () => {
    mocks.deleteAssetFile.mockRejectedValue(new Error('Eine Analyse arbeitet noch damit.'));

    expect(await deleteAnalysedVideoAction('ath_1', 'as_1')).toEqual({
      message: 'Eine Analyse arbeitet noch damit.',
    });
  });
});

describe('deleting from the file shelf', () => {
  it('still refreshes the shelf, which lists the file', async () => {
    await deleteAthleteFileAction('ath_1', 'as_1');

    expect(mocks.revalidatePath).toHaveBeenCalledWith('/athletes/ath_1/dateien');
  });
});
