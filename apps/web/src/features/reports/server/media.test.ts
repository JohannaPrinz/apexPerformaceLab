import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  analysisStillsFor,
  analysisStillTests,
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
  /** Every folder the store was asked about, so a round trip is countable. */
  listedObjects: [] as string[],
  listedFolders: [] as string[],
};

vi.mock('@/integrations/object-store', () => ({
  listObjects: (folder: string, limit = 100) => {
    store.listedObjects.push(folder);

    return Promise.resolve(
      [...store.objects.entries()]
        .filter(
          ([key]) => key.startsWith(`${folder}/`) && !key.slice(folder.length + 1).includes('/'),
        )
        .map(([key, createdAt]) => ({ key, createdAt }))
        .slice(0, limit),
    );
  },
  listFolders: (folder: string, limit = 500) => {
    store.listedFolders.push(folder);

    return Promise.resolve(
      [
        ...new Set(
          [...store.objects.keys()]
            .filter((key) => key.startsWith(`${folder}/`))
            .map((key) => key.slice(folder.length + 1).split('/')[0])
            .filter((name): name is string => name !== undefined)
            .map((name) => `${folder}/${name}`),
        ),
      ].slice(0, limit),
    );
  },
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
  store.listedObjects.length = 0;
  store.listedFolders.length = 0;
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

/**
 * Asking the store once instead of once per test.
 *
 * An analysis screen wants the stills of every test it shows, and almost every
 * one of those tests has none — stills exist only where a coach ran a video
 * analysis. Eight tests were eight round trips to be told "nothing here" eight
 * times, ~120 ms each.
 *
 * The temporary area is laid out `analysis-temp/{workspace}/{test}/…`, so the
 * folder names one level under the workspace already say which tests have
 * anything. What is asserted here is that the shortcut never *loses* a picture:
 * the answer for a test must be the same list `listAnalysisStills` gives, in
 * the same order, whichever route it came by.
 */
describe('the stills of several tests at once', () => {
  const eight = Array.from({ length: 8 }, (_, index) => `mod_${String(index + 1)}`);

  /** What the store was asked, minus the one folder listing. */
  const reads = () => store.listedObjects.length;

  it('asks the store nothing where no test has a still', async () => {
    store.objects.clear();

    const found = await analysisStillsFor(TENANT, eight, await analysisStillTests(TENANT));

    expect([...found.values()]).toEqual(eight.map(() => []));
    // One listing of the workspace folder, and not a single per-test read.
    expect(reads()).toBe(0);
    expect(store.listedFolders).toEqual(['analysis-temp/org_a']);
  });

  it('asks nothing for a video analysis that produced no still', async () => {
    // The test ran, the coach kept no frame: there is no folder, so there is
    // nothing to ask about.
    store.objects.clear();

    const found = await analysisStillsFor(TENANT, ['mod_9'], await analysisStillTests(TENANT));

    expect(found.get('mod_9')).toEqual([]);
    expect(reads()).toBe(0);
  });

  it('asks once for the one test that has stills', async () => {
    const found = await analysisStillsFor(TENANT, eight, await analysisStillTests(TENANT));

    expect(found.get('mod_1')).toEqual([STILL_A, STILL_B]);
    expect(reads()).toBe(1);
    expect(store.listedObjects).toEqual(['analysis-temp/org_a/mod_1']);
  });

  it('answers every asked test, with or without stills', async () => {
    const found = await analysisStillsFor(TENANT, eight, await analysisStillTests(TENANT));

    expect([...found.keys()]).toEqual(eight);
    expect(found.get('mod_2')).toEqual([]);
  });

  it('asks once per test that has stills, and no more', async () => {
    store.objects.set('analysis-temp/org_a/mod_4/flexed__ccc.jpg', new Date());
    store.objects.set('analysis-temp/org_a/mod_7/flexed__ddd.jpg', new Date());

    const found = await analysisStillsFor(TENANT, eight, await analysisStillTests(TENANT));

    expect(reads()).toBe(3);
    expect(found.get('mod_4')).toEqual(['analysis-temp/org_a/mod_4/flexed__ccc.jpg']);
    expect(found.get('mod_7')).toEqual(['analysis-temp/org_a/mod_7/flexed__ddd.jpg']);
    expect(found.get('mod_3')).toEqual([]);
  });

  it('still asks all eight where all eight have stills', async () => {
    for (const moduleId of eight) {
      store.objects.set(`analysis-temp/org_a/${moduleId}/flexed__x.jpg`, new Date());
    }

    const found = await analysisStillsFor(TENANT, eight, await analysisStillTests(TENANT));

    expect(reads()).toBe(8);
    expect(eight.every((moduleId) => (found.get(moduleId) ?? []).length > 0)).toBe(true);
  });

  it('gives the same list, in the same order, as asking one test directly', async () => {
    store.objects.set('analysis-temp/org_a/mod_1/hip__ccc.jpg', new Date());

    const alone = await listAnalysisStills(TENANT, 'mod_1');
    const batched = await analysisStillsFor(TENANT, ['mod_1'], await analysisStillTests(TENANT));

    expect(batched.get('mod_1')).toEqual(alone);
  });

  it('ignores an object whose key it did not write, exactly as before', async () => {
    store.objects.set('analysis-temp/org_a/mod_1/notours.txt', new Date());

    const found = await analysisStillsFor(TENANT, ['mod_1'], await analysisStillTests(TENANT));

    expect(found.get('mod_1')).toEqual([STILL_A, STILL_B]);
  });

  it('never looks into another workspace', async () => {
    store.objects.set('analysis-temp/org_b/mod_1/flexed__eee.jpg', new Date());

    const tests = await analysisStillTests(TENANT);

    expect([...(tests ?? [])]).toEqual(['mod_1']);
    expect(store.listedFolders).toEqual(['analysis-temp/org_a']);

    const found = await analysisStillsFor(TENANT, ['mod_1'], tests);

    expect(found.get('mod_1')).toEqual([STILL_A, STILL_B]);
  });

  it('falls back to asking each test where the listing may be incomplete', async () => {
    // A truncated list would turn "I did not see it" into "it does not exist",
    // which is how a coach's pictures would quietly disappear from the screen.
    const found = await analysisStillsFor(TENANT, eight, null);

    expect(reads()).toBe(8);
    expect(found.get('mod_1')).toEqual([STILL_A, STILL_B]);
  });

  it('reports an unanswerable listing as unanswered, not as empty', async () => {
    // Above the ceiling the shortcut refuses to conclude anything.
    for (let index = 0; index < 1000; index += 1) {
      store.objects.set(`analysis-temp/org_a/many_${String(index)}/flexed__x.jpg`, new Date());
    }

    expect(await analysisStillTests(TENANT)).toBeNull();
  });
});
