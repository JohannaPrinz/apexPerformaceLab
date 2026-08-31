import { describe, expect, it } from 'vitest';

import {
  readReportSnapshot,
  REPORT_SNAPSHOT_VERSION,
  snapshotIsEmpty,
  snapshotMediaKeys,
} from './report-snapshot';

/**
 * The frozen document.
 *
 * The rule under test is self-sufficiency: what a coach signed off must render
 * years later from itself alone. A snapshot that looked anything up — a target
 * a coach has since changed, a caption from a profile that has since been
 * retired — would quietly rewrite a document an athlete already read.
 */

const series = {
  key: 's1',
  typeName: 'Kniewinkel',
  measurementTypeKey: 'joint_angle',
  unit: '°',
  side: 'LEFT',
  exerciseName: 'Kniebeuge',
  passIndex: null,
  context: { joint: 'Knie', position: 'tiefste Position' },
  source: 'DERIVED',
  current: { value: 78, capturedAt: '2026-08-29T10:00:00.000Z' },
  previous: null,
  difference: null,
  best: null,
  betterDirection: null,
  target: { comparison: 'at_most' as const, degrees: 90, met: true },
};

const snapshot = {
  version: REPORT_SNAPSHOT_VERSION,
  publishedAt: '2026-08-29T12:00:00.000Z',
  assessment: { performedAt: '2026-08-29T09:00:00.000Z' },
  athlete: { firstName: 'Lena', lastName: 'Hofmann' },
  coach: { name: 'Johanna Prinz' },
  modules: [
    {
      moduleId: 'mod_1',
      name: 'Kniebeuge',
      typeLabel: 'Bewegungsanalyse',
      protocolLabel: null,
      derivations: [],
      series: [series],
      media: [
        {
          id: 'm1',
          key: 'reports/org_a/rep_1/m1.jpg',
          label: 'Tiefste Position',
          moduleId: 'mod_1',
        },
      ],
      interpretation: 'Knie links flacher.',
      recommendation: '',
    },
  ],
  overall: { interpretation: '', recommendation: '' },
};

describe('reading a frozen document', () => {
  it('reads the current shape whole', () => {
    const read = readReportSnapshot(snapshot);

    expect(read?.modules[0]?.series[0]?.target).toEqual({
      comparison: 'at_most',
      degrees: 90,
      met: true,
    });
    expect(read?.modules[0]?.media[0]?.label).toBe('Tiefste Position');
  });

  it('carries the verdict, not the threshold to re-check later', () => {
    // A coach who changes the target next month must not turn a met target into
    // a missed one in a document somebody has already read.
    const read = readReportSnapshot(snapshot);

    expect(read?.modules[0]?.series[0]?.target?.met).toBe(true);
  });

  it('refuses a shape it does not know rather than half-reading it', () => {
    expect(readReportSnapshot({ version: 99, modules: [] })).toBeNull();
    expect(readReportSnapshot(null)).toBeNull();
    expect(readReportSnapshot({ ...snapshot, modules: 'nope' })).toBeNull();
  });
});

describe('upgrading version 1', () => {
  const legacy = {
    ...snapshot,
    version: 1,
    modules: [
      {
        ...snapshot.modules[0],
        media: undefined,
        series: [
          {
            ...series,
            measurementTypeKey: undefined,
            betterDirection: undefined,
            target: undefined,
          },
        ],
      },
    ],
  };

  it('keeps an older link opening', () => {
    expect(readReportSnapshot(legacy)?.version).toBe(REPORT_SNAPSHOT_VERSION);
  });

  it('fills in absences only — never a direction or a verdict it never had', () => {
    const read = readReportSnapshot(legacy);

    expect(read?.modules[0]?.series[0]?.betterDirection).toBeNull();
    expect(read?.modules[0]?.series[0]?.target).toBeNull();
    expect(read?.modules[0]?.media).toEqual([]);
  });

  it("loses none of the coach's words", () => {
    expect(readReportSnapshot(legacy)?.modules[0]?.interpretation).toBe('Knie links flacher.');
  });
});

describe('what a document owns', () => {
  it('names every stored object, so deleting it leaves nothing behind', () => {
    expect(snapshotMediaKeys(readReportSnapshot(snapshot)!)).toEqual([
      'reports/org_a/rep_1/m1.jpg',
    ]);
  });

  it('counts a document with only pictures as not empty', () => {
    const picturesOnly = {
      ...snapshot,
      modules: [{ ...snapshot.modules[0], series: [] }],
    };

    expect(snapshotIsEmpty(readReportSnapshot(picturesOnly)!)).toBe(false);
  });

  it('counts a document with neither as empty', () => {
    const nothing = {
      ...snapshot,
      modules: [{ ...snapshot.modules[0], series: [], media: [] }],
    };

    expect(snapshotIsEmpty(readReportSnapshot(nothing)!)).toBe(true);
  });
});
