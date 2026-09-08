import { describe, expect, it, vi } from 'vitest';

import { athleteTrend } from './trends';

/**
 * Which reads one trend card waits for.
 *
 * A card used to be four reads in a line: the quantity's name and unit, then
 * its values, then the wider movement list, then the athlete's own entries.
 * Only one of them ever needed an answer from another — the movement *names*,
 * which can only be looked up once the values say which movements occurred.
 * With three cards on a profile that was three cards' worth of round trips
 * stacked four deep.
 *
 * What is asserted here is the shape of the waiting, not a duration: reads that
 * need nothing from each other must all have started before any of them
 * finished, and the one that genuinely depends must still start afterwards.
 * A test about timing has to be able to see time, so every read resolves on a
 * later tick and records when it began and ended.
 */

const TENANT = { organizationId: 'org_a' } as const;
const ATHLETE = { id: 'ath_1', sex: 'female' as const };

function recordingDb(events: string[], options: { withExercise?: boolean } = {}) {
  const read =
    <T>(name: string, value: T) =>
    () => {
      events.push(`${name}:start`);

      return new Promise<T>((resolve) => {
        setTimeout(() => {
          events.push(`${name}:end`);
          resolve(value);
        }, 5);
      });
    };

  const measurement = options.withExercise
    ? [
        {
          capturedAt: new Date('2026-04-01T00:00:00.000Z'),
          numericValue: { toString: () => '4' },
          exerciseId: 'ex_1',
          side: 'BILATERAL',
          passIndex: null,
          context: null,
          measurementType: { key: 'lactate', name: 'Laktat', unit: 'mmol/l' },
          assessmentModule: { name: 'Laufen', moduleKey: 'lactate' },
        },
      ]
    : [];

  return {
    measurementType: {
      findFirst: vi.fn(read('type', { name: 'Laktat', unit: 'mmol/l' })),
    },
    measurement: { findMany: vi.fn(read('values', measurement)) },
    trackingEntry: { findMany: vi.fn(read('tracked', [])) },
    exercise: { findMany: vi.fn(read('exerciseNames', [])) },
  } as unknown as Parameters<typeof athleteTrend>[0];
}

const before = (events: string[], one: string, other: string) =>
  events.indexOf(one) < events.indexOf(other);

describe('what one trend card waits for', () => {
  it('asks for the quantity, its values and the self-reports in one wave', async () => {
    const events: string[] = [];

    await athleteTrend(recordingDb(events), TENANT, ATHLETE, { key: 'lactate', exerciseIds: [] });

    // Each started before any of them came back.
    expect(before(events, 'values:start', 'type:end')).toBe(true);
    expect(before(events, 'tracked:start', 'type:end')).toBe(true);
    expect(before(events, 'type:start', 'values:end')).toBe(true);
  });

  it('still waits for the values before naming the movements', async () => {
    const events: string[] = [];

    await athleteTrend(recordingDb(events, { withExercise: true }), TENANT, ATHLETE, {
      key: 'lactate',
      exerciseIds: [],
    });

    // The one real dependency: which movements to name follows from the values.
    expect(before(events, 'values:end', 'exerciseNames:start')).toBe(true);
  });

  it('leaves the self-reports out where the card is narrowed to movements', async () => {
    const events: string[] = [];

    await athleteTrend(recordingDb(events), TENANT, ATHLETE, {
      key: 'lactate',
      exerciseIds: ['ex_1'],
    });

    // A self-reported value belongs to no lift, so a narrowed card must not
    // read them at all — the parallelisation must not have made that read
    // unconditional.
    expect(events.filter((entry) => entry.startsWith('tracked'))).toEqual([]);
  });

  it('answers null for a quantity this workspace does not have', async () => {
    const events: string[] = [];
    const db = recordingDb(events) as unknown as {
      measurementType: { findFirst: () => Promise<unknown> };
    };
    db.measurementType.findFirst = () => Promise.resolve(null);

    const chart = await athleteTrend(
      db as unknown as Parameters<typeof athleteTrend>[0],
      TENANT,
      ATHLETE,
      { key: 'gone', exerciseIds: [] },
    );

    expect(chart).toBeNull();
  });

  it('draws the cycle card without reading anything', async () => {
    const events: string[] = [];

    const chart = await athleteTrend(recordingDb(events), TENANT, ATHLETE, {
      key: 'cycle',
      exerciseIds: [],
    });

    // The calendar loads its own month; this card is a heading and nothing else.
    expect(chart?.kind).toBe('cycle');
    expect(events).toEqual([]);
  });
});
