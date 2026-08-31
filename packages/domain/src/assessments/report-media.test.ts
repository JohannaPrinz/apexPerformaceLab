import { describe, expect, it } from 'vitest';

import {
  analysisKeyBelongsToOrganization,
  analysisStillFolder,
  analysisStillKey,
  athleteMediaFolder,
  athleteOfKey,
  parseAnalysisStillKey,
  reportMediaFolder,
  reportMediaKey,
  reportMediaSchema,
  reportOfKey,
} from './report-media';

/**
 * Where the bytes of a still live, and who may read them.
 *
 * The key is a security boundary: a route hands one to the object store, and
 * the only thing standing between a workspace and another workspace's pictures
 * is that the organisation is part of the path. So the tests here are mostly
 * about what a key may **not** be.
 */

const STILL = {
  organizationId: 'org_a',
  moduleId: 'mod_1',
  position: 'flexed',
  stillId: 'Xk29fA',
} as const;

describe('temporary stills', () => {
  it('puts the workspace, the test and the moment into the key', () => {
    expect(analysisStillKey(STILL)).toBe('analysis-temp/org_a/mod_1/flexed__Xk29fA.jpg');
  });

  it('round-trips', () => {
    expect(parseAnalysisStillKey(analysisStillKey(STILL))).toEqual(STILL);
  });

  it('refuses to build a key that would escape its prefix', () => {
    // The whole point of validating here: `..` in an id is a path traversal.
    expect(() => analysisStillKey({ ...STILL, moduleId: '../../etc' })).toThrow();
    expect(() => analysisStillKey({ ...STILL, organizationId: 'a/b' })).toThrow();
    expect(() => analysisStillKey({ ...STILL, position: 'Flexed Position' })).toThrow();
    expect(() => analysisStillKey({ ...STILL, stillId: '' })).toThrow();
  });

  it('reads back nothing from a key it did not write', () => {
    expect(parseAnalysisStillKey('reports/rep_1/abc.jpg')).toBeNull();
    expect(parseAnalysisStillKey('analysis-temp/org_a/mod_1/flexed.jpg')).toBeNull();
    expect(parseAnalysisStillKey('analysis-temp/org_a/mod_1/a__b__c.jpg')).toBeNull();
    expect(parseAnalysisStillKey('analysis-temp/org_a/mod_1/flexed__x.png')).toBeNull();
    expect(parseAnalysisStillKey('analysis-temp/org_a/flexed__x.jpg')).toBeNull();
  });

  it("names the folder a test's stills live in, for listing and for cleanup", () => {
    expect(analysisStillFolder('org_a', 'mod_1')).toBe('analysis-temp/org_a/mod_1');
  });
});

describe('stills a published analysis owns', () => {
  it('lives under the report, not under the test that produced it', () => {
    // §16: publishing copies. A document whose pictures sit in a folder the
    // analysis screen may empty is not frozen.
    expect(reportMediaKey('rep_1', 'm1')).toBe('reports/rep_1/m1.jpg');
    expect(reportMediaFolder('rep_1')).toBe('reports/rep_1');
  });

  it('refuses identifiers that would escape the prefix', () => {
    expect(() => reportMediaKey('../x', 'm1')).toThrow();
    expect(() => reportMediaFolder('rep 1')).toThrow();
  });

  it("carries its own caption, so it never needs today's catalogue", () => {
    const parsed = reportMediaSchema.safeParse({
      id: 'm1',
      key: 'reports/rep_1/m1.jpg',
      label: 'Tiefste Position, Kniewinkel',
      moduleId: 'mod_1',
    });

    expect(parsed.success).toBe(true);
  });

  it('refuses a media entry without a caption', () => {
    const parsed = reportMediaSchema.safeParse({
      id: 'm1',
      key: 'reports/rep_1/m1.jpg',
      label: '',
      moduleId: 'mod_1',
    });

    expect(parsed.success).toBe(false);
  });
});

describe('the tenant boundary of the temporary area', () => {
  it("admits this workspace's own working files", () => {
    expect(
      analysisKeyBelongsToOrganization('analysis-temp/org_a/mod_1/flexed__x.jpg', 'org_a'),
    ).toBe(true);
  });

  it('refuses another workspace', () => {
    expect(
      analysisKeyBelongsToOrganization('analysis-temp/org_b/mod_1/flexed__x.jpg', 'org_a'),
    ).toBe(false);
  });

  it('is not fooled by a workspace whose id merely starts the same', () => {
    // `org_a` must not open `org_ab`. The trailing slash is what does it.
    expect(
      analysisKeyBelongsToOrganization('analysis-temp/org_ab/mod_1/flexed__x.jpg', 'org_a'),
    ).toBe(false);
  });

  it('refuses anything outside the temporary area', () => {
    // A report file is not settled by the workspace in the path — it has none.
    expect(analysisKeyBelongsToOrganization('reports/rep_1/m1.jpg', 'org_a')).toBe(false);
    expect(analysisKeyBelongsToOrganization('athletes/ath_1/x.jpg', 'org_a')).toBe(false);
    expect(analysisKeyBelongsToOrganization('../analysis-temp/org_a/mod_1/x.jpg', 'org_a')).toBe(
      false,
    );
  });
});

/**
 * The other two areas name what they belong to, and the routes ask the record.
 *
 * A report folder names only the report; an athlete folder only the athlete.
 * Reading either back is what lets a route ask the one question that decides it,
 * instead of inventing a second rule beside the ones already in the record.
 */
describe('reading which report or athlete a key belongs to', () => {
  it('reads the report out of a report key', () => {
    expect(reportOfKey('reports/rep_1/m1.jpg')).toBe('rep_1');
  });

  it('reads the athlete out of an athlete key, however deep', () => {
    expect(athleteOfKey('athletes/ath_1/video.mp4')).toBe('ath_1');
    expect(athleteOfKey('athletes/ath_1/2026/befund.pdf')).toBe('ath_1');
  });

  it('reads nothing out of the other areas', () => {
    expect(reportOfKey('analysis-temp/org_a/mod_1/flexed__x.jpg')).toBeNull();
    expect(reportOfKey('athletes/ath_1/x.jpg')).toBeNull();
    expect(athleteOfKey('reports/rep_1/m1.jpg')).toBeNull();
    expect(athleteOfKey('analysis-temp/org_a/mod_1/flexed__x.jpg')).toBeNull();
  });

  it('reads nothing out of a key that would escape its prefix', () => {
    expect(reportOfKey('reports/../secret/m1.jpg')).toBeNull();
    expect(athleteOfKey('athletes/../secret/x.jpg')).toBeNull();
  });

  it('names an athlete folder, kept apart from the other two areas', () => {
    expect(athleteMediaFolder('ath_1')).toBe('athletes/ath_1');
    expect(() => athleteMediaFolder('../x')).toThrow();
  });
});
