import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  discardAnalysisStills,
  freezeReportMedia,
  listAnalysisStills,
  sweepAllAnalysisStills,
  sweepAnalysisStills,
} from './media';

/**
 * The two lifetimes of a still.
 *
 * The rule under test is the order: copy, then freeze, then delete. Any other
 * order loses something — a document naming pictures that were never written, or
 * a picture lost because the copy failed after the original was gone. What this
 * pins is that publishing copies into the report's own folder and that the
 * temporary folder is what gets cleared.
 */

const store = {
  /** key → when it was written, which is what the sweep decides on. */
  objects: new Map<string, Date>(),
  copies: [] as { from: string; to: string }[],
  deleted: [] as string[],
  copyFails: false,
};

vi.mock('@/integrations/object-store', () => ({
  listObjects: (folder: string) =>
    Promise.resolve(
      [...store.objects.entries()]
        .filter(
          ([key]) => key.startsWith(`${folder}/`) && !key.slice(folder.length + 1).includes('/'),
        )
        .map(([key, createdAt]) => ({ key, createdAt })),
    ),
  listFolders: (folder: string) =>
    Promise.resolve([
      ...new Set(
        [...store.objects.keys()]
          .filter((key) => key.startsWith(`${folder}/`))
          .map((key) => key.slice(folder.length + 1).split('/')[0])
          .filter((name): name is string => name !== undefined)
          .map((name) => `${folder}/${name}`),
      ),
    ]),
  copyObject: (from: string, to: string) => {
    if (store.copyFails) return Promise.resolve(false);
    store.copies.push({ from, to });
    store.objects.set(to, store.objects.get(from) ?? new Date());

    return Promise.resolve(true);
  },
  deleteObjects: (keys: readonly string[]) => {
    store.deleted.push(...keys);
    for (const key of keys) store.objects.delete(key);

    return Promise.resolve();
  },
}));

const TENANT = { organizationId: 'org_a' } as const;

const STILL_A = 'analysis-temp/org_a/mod_1/flexed__aaa.jpg';
const STILL_B = 'analysis-temp/org_a/mod_1/extended__bbb.jpg';

beforeEach(() => {
  store.objects.clear();
  store.copies.length = 0;
  store.deleted.length = 0;
  store.copyFails = false;
  store.objects.set(STILL_A, new Date('2026-08-30T09:00:00.000Z'));
  store.objects.set(STILL_B, new Date('2026-08-30T09:00:00.000Z'));
});

describe('what an analysis screen left behind', () => {
  it('finds the stills of one test', async () => {
    expect(await listAnalysisStills(TENANT, 'mod_1')).toEqual([STILL_A, STILL_B]);
  });

  it('finds nothing for a test that had no video', async () => {
    expect(await listAnalysisStills(TENANT, 'mod_2')).toEqual([]);
  });

  it('ignores an object whose key it did not write', async () => {
    // The folder is ours, but a key we cannot read is a key we cannot caption.
    store.objects.set('analysis-temp/org_a/mod_1/notours.txt', new Date());

    expect(await listAnalysisStills(TENANT, 'mod_1')).toEqual([STILL_A, STILL_B]);
  });
});

describe('freezing the stills a document uses', () => {
  const modules = [
    {
      moduleId: 'mod_1',
      images: [{ key: STILL_A, label: 'Tiefste Position' }],
    },
  ];

  it('copies into the report own folder rather than moving', async () => {
    await freezeReportMedia('rep_1', modules);

    expect(store.copies).toHaveLength(1);
    expect(store.copies[0]?.from).toBe(STILL_A);
    expect(store.copies[0]?.to).toMatch(/^reports\/rep_1\/[\w-]+\.jpg$/u);
    // The original is still there: deleting is a separate, later step.
    expect(store.objects.has(STILL_A)).toBe(true);
  });

  it('carries the caption into the frozen document', async () => {
    const frozen = await freezeReportMedia('rep_1', modules);

    expect(frozen.get('mod_1')?.[0]?.label).toBe('Tiefste Position');
    expect(frozen.get('mod_1')?.[0]?.moduleId).toBe('mod_1');
  });

  it('copies only what the coach chose', async () => {
    await freezeReportMedia('rep_1', modules);

    expect(store.copies.map((copy) => copy.from)).toEqual([STILL_A]);
  });

  it('refuses a key the grammar does not recognise', async () => {
    const frozen = await freezeReportMedia('rep_1', [
      { moduleId: 'mod_1', images: [{ key: 'reports/other/x.jpg', label: 'X' }] },
    ]);

    expect(store.copies).toHaveLength(0);
    expect(frozen.size).toBe(0);
  });

  /**
   * §18: a published document freezes **stills**, never a recording.
   *
   * Now that a stored video can be an analysis source, the athlete media area
   * is one `key` away from the freeze — and a copy of a 12 MB recording into
   * `reports/` would quietly defeat the whole storage plan. The grammar already
   * refuses it; this says so out loud, so a later change to `parseAnalysisStillKey`
   * cannot open the door without a failing test.
   */
  it('never copies an athlete’s stored video into a report', async () => {
    const frozen = await freezeReportMedia('rep_1', [
      {
        moduleId: 'mod_1',
        images: [{ key: 'athletes/ath_1/formcheck.mp4', label: 'Formcheck' }],
      },
    ]);

    expect(store.copies).toHaveLength(0);
    expect(frozen.size).toBe(0);
  });

  it('leaves a failed copy out rather than naming a picture it does not have', async () => {
    store.copyFails = true;

    const frozen = await freezeReportMedia('rep_1', modules);

    expect(frozen.size).toBe(0);
  });

  it('records nothing for a test with no chosen stills', async () => {
    const frozen = await freezeReportMedia('rep_1', [{ moduleId: 'mod_1', images: [] }]);

    expect(frozen.size).toBe(0);
  });
});

describe('clearing up afterwards', () => {
  it('removes everything the analysis screen left for those tests', async () => {
    await discardAnalysisStills(TENANT, ['mod_1']);

    expect(store.deleted).toEqual([STILL_A, STILL_B]);
    expect(store.objects.has(STILL_A)).toBe(false);
  });

  it('leaves a published document its own pictures', async () => {
    const frozen = await freezeReportMedia('rep_1', [
      { moduleId: 'mod_1', images: [{ key: STILL_A, label: 'Tiefste Position' }] },
    ]);
    const kept = frozen.get('mod_1')?.[0]?.key ?? '';

    await discardAnalysisStills(TENANT, ['mod_1']);

    // The whole point of copying: clearing the temporary folder must not empty
    // a document somebody has already been handed.
    expect(store.objects.has(kept)).toBe(true);
  });

  it('shrugs at a test that left nothing', async () => {
    await discardAnalysisStills(TENANT, ['mod_2']);

    expect(store.deleted).toEqual([]);
  });
});

/**
 * Sweeping what nobody came back for.
 *
 * Publishing clears the files of the analysis it published; this is the other
 * case — a coach who analysed a video and never wrote the report. Age is the
 * only honest signal, and a file whose age the store does not report is left
 * alone rather than deleted on a guess.
 */
describe('sweeping abandoned analyses', () => {
  const NOW = new Date('2026-09-20T00:00:00.000Z');

  it('removes what has sat there longer than the retention', async () => {
    expect(await sweepAnalysisStills(TENANT, NOW)).toBe(2);
    expect(store.objects.has(STILL_A)).toBe(false);
  });

  it('leaves what is still recent', async () => {
    store.objects.set(STILL_A, new Date('2026-09-19T00:00:00.000Z'));
    store.objects.set(STILL_B, new Date('2026-09-19T00:00:00.000Z'));

    expect(await sweepAnalysisStills(TENANT, NOW)).toBe(0);
    expect(store.objects.has(STILL_A)).toBe(true);
  });

  it('leaves a file whose age the store does not report', async () => {
    store.objects.clear();
    store.objects.set(STILL_A, null as unknown as Date);

    expect(await sweepAnalysisStills(TENANT, NOW)).toBe(0);
    expect(store.objects.has(STILL_A)).toBe(true);
  });

  it('never reaches into another workspace', async () => {
    store.objects.set('analysis-temp/org_b/mod_9/flexed__zzz.jpg', new Date('2026-01-01'));

    await sweepAnalysisStills(TENANT, NOW);

    expect(store.objects.has('analysis-temp/org_b/mod_9/flexed__zzz.jpg')).toBe(true);
  });
});

/**
 * The scheduled sweep, which has no workspace to stand in.
 *
 * A schedule has no session and no tenant, so this walks the temporary area
 * itself rather than the workspaces the database knows about — otherwise the
 * leftovers of a deleted workspace would sit in the bucket for ever, which is
 * precisely the material nobody is entitled to keep.
 */
describe('the scheduled sweep across every workspace', () => {
  const NOW = new Date('2026-09-20T00:00:00.000Z');

  it('clears old files in workspaces it was never told about', async () => {
    store.objects.set('analysis-temp/org_b/mod_9/flexed__zzz.jpg', new Date('2026-01-01'));

    const removed = await sweepAllAnalysisStills(NOW);

    expect(removed).toBeGreaterThanOrEqual(3);
    expect(store.objects.has('analysis-temp/org_b/mod_9/flexed__zzz.jpg')).toBe(false);
  });

  it('leaves recent files everywhere alike', async () => {
    store.objects.clear();
    store.objects.set('analysis-temp/org_b/mod_9/flexed__zzz.jpg', new Date('2026-09-19'));

    expect(await sweepAllAnalysisStills(NOW)).toBe(0);
    expect(store.objects.has('analysis-temp/org_b/mod_9/flexed__zzz.jpg')).toBe(true);
  });

  it('never touches the pictures of a published document', async () => {
    store.objects.clear();
    store.objects.set('reports/rep_1/abc.jpg', new Date('2020-01-01'));

    expect(await sweepAllAnalysisStills(NOW)).toBe(0);
    expect(store.objects.has('reports/rep_1/abc.jpg')).toBe(true);
  });
});
