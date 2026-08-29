import { describe, expect, it } from 'vitest';

import { protocolKey, testProtocolSchema } from './configuration';
import { selfComparisons, seriesIdentity, type ComparableReading } from './self-comparison';

/**
 * The same test again.
 *
 * The tests worth having here are the ones that would still pass if the module
 * quietly invented something: a "best" value chosen without a direction, a
 * difference between two readings that were never the same measurement, or a
 * comparison across a protocol that changed underneath.
 */

const day = (iso: string) => new Date(`${iso}T09:00:00.000Z`);

const reading = (over: Partial<ComparableReading> = {}): ComparableReading => ({
  measurementTypeId: 'mt_duration',
  side: 'BILATERAL',
  exerciseId: null,
  passIndex: null,
  context: null,
  value: 278,
  capturedAt: day('2026-03-12'),
  moduleId: 'mod_now',
  protocolKey: '1km_bahn|1000||',
  ...over,
});

describe('the identity of a series', () => {
  it('separates two protocols of the same quantity', () => {
    const bahn = reading({ protocolKey: '1km_bahn|1000||' });
    const strasse = reading({ protocolKey: '1km_strasse|1000||' });

    expect(seriesIdentity(bahn)).not.toBe(seriesIdentity(strasse));
  });

  it('treats "no protocol" as its own class, not as a wildcard', () => {
    const none = reading({ protocolKey: null });
    const some = reading({ protocolKey: '1km_bahn|1000||' });

    expect(seriesIdentity(none)).not.toBe(seriesIdentity(some));
  });

  it('still separates what comparisonKey separates', () => {
    // Same protocol, different side. The existing rule decides this, and this
    // module must not quietly widen it.
    const left = reading({ side: 'LEFT' });
    const right = reading({ side: 'RIGHT' });

    expect(seriesIdentity(left)).not.toBe(seriesIdentity(right));
  });
});

describe('what one test reports about itself', () => {
  const earlier = reading({ moduleId: 'mod_feb', value: 289, capturedAt: day('2026-02-02') });
  const middle = reading({ moduleId: 'mod_jan', value: 301, capturedAt: day('2026-01-05') });
  const current = reading({ moduleId: 'mod_now', value: 278, capturedAt: day('2026-03-12') });

  const result = () => selfComparisons([middle, earlier, current], 'mod_now')[0];

  it('finds the most recent comparable reading before it', () => {
    expect(result()?.previous?.value).toBe(289);
    expect(result()?.previous?.capturedAt).toEqual(day('2026-02-02'));
  });

  it('states the difference signed, in the measurement unit', () => {
    // 278 − 289. A negative number, and not a word about whether that is good.
    expect(result()?.difference).toBe(-11);
  });

  it('counts the whole series', () => {
    expect(result()?.count).toBe(3);
  });

  it('has no previous value for a first test', () => {
    const only = selfComparisons([current], 'mod_now')[0];

    expect(only?.previous).toBeNull();
    expect(only?.difference).toBeNull();
  });

  it('leaves out series this test contributed nothing to', () => {
    const other = reading({ moduleId: 'mod_feb', measurementTypeId: 'mt_pace' });

    const results = selfComparisons([current, other], 'mod_now');

    expect(results).toHaveLength(1);
    expect(results[0]?.coordinates.measurementTypeId).toBe('mt_duration');
  });

  it('does not carry floating-point noise into the difference', () => {
    const a = reading({ moduleId: 'mod_a', value: 0.1, capturedAt: day('2026-01-01') });
    const b = reading({ moduleId: 'mod_now', value: 0.3, capturedAt: day('2026-02-01') });

    expect(selfComparisons([a, b], 'mod_now')[0]?.difference).toBe(0.2);
  });
});

describe('the extremes', () => {
  const readings = [
    reading({ moduleId: 'mod_jan', value: 301, capturedAt: day('2026-01-05') }),
    reading({ moduleId: 'mod_feb', value: 289, capturedAt: day('2026-02-02') }),
    reading({ moduleId: 'mod_now', value: 278, capturedAt: day('2026-03-12') }),
  ];

  it('names both, always', () => {
    const found = selfComparisons(readings, 'mod_now')[0];

    expect(found?.highest.value).toBe(301);
    expect(found?.highest.capturedAt).toEqual(day('2026-01-05'));
    expect(found?.lowest.value).toBe(278);
  });

  it('names no best value without a declared direction', () => {
    // The heart of it: 278 seconds is the best of these three in a time trial
    // and the worst in a hold. Nothing in the data says which.
    expect(selfComparisons(readings, 'mod_now')[0]?.best).toBeNull();
  });

  it('names the lower extreme as best where the coach said lower is the aim', () => {
    const found = selfComparisons(readings, 'mod_now', 'lower')[0];

    expect(found?.best?.value).toBe(278);
    expect(found?.best?.capturedAt).toEqual(day('2026-03-12'));
  });

  it('names the higher extreme where the coach said higher', () => {
    expect(selfComparisons(readings, 'mod_now', 'higher')[0]?.best?.value).toBe(301);
  });

  it('counts a later test towards the extremes but never as the previous value', () => {
    const later = reading({ moduleId: 'mod_apr', value: 240, capturedAt: day('2026-04-01') });
    const found = selfComparisons([...readings, later], 'mod_now')[0];

    // Reading an old test must show what came *before* it — but the lowest value
    // of the series is a fact about the series.
    expect(found?.previous?.value).toBe(289);
    expect(found?.lowest.value).toBe(240);
  });
});

describe('the protocol identity', () => {
  it('is null where no protocol was declared', () => {
    expect(protocolKey(null)).toBeNull();
    expect(protocolKey(undefined)).toBeNull();
  });

  it('changes when any recorded condition changes', () => {
    const base = testProtocolSchema.parse({ key: 'sled_push', venue: 'halle_a' });
    const elsewhere = testProtocolSchema.parse({ key: 'sled_push', venue: 'halle_b' });

    // The whole reason a venue is recorded: two floors are two different tests.
    expect(protocolKey(base)).not.toBe(protocolKey(elsewhere));
  });

  it('ignores the direction, so setting it later does not split the series', () => {
    const before = testProtocolSchema.parse({ key: 'run_1km', distanceM: 1000 });
    const after = testProtocolSchema.parse({
      key: 'run_1km',
      distanceM: 1000,
      betterDirection: 'lower',
    });

    expect(protocolKey(before)).toBe(protocolKey(after));
  });

  it('refuses a key that would not survive being typed twice', () => {
    expect(testProtocolSchema.safeParse({ key: '1 km Bahn' }).success).toBe(false);
    expect(testProtocolSchema.safeParse({ key: 'run_1km' }).success).toBe(true);
  });

  it('ships no distances, loads or repetition counts of its own', () => {
    // Everything is the coach's entry. A default here would be a rule this
    // software does not own, copied into every test that used it.
    const minimal = testProtocolSchema.parse({ key: 'anything' });

    expect(minimal.distanceM).toBeUndefined();
    expect(minimal.division).toBeUndefined();
    expect(minimal.device).toBeUndefined();
    expect(minimal.venue).toBeUndefined();
  });
});
