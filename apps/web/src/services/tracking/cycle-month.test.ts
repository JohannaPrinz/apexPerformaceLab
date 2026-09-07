import { describe, expect, it, vi } from 'vitest';

import { bleedingMonth, setBleedingDay } from './cycle';

/**
 * The month behind the calendar.
 *
 * Three things are pinned, and none is visible from the grid:
 *
 * 1. **The workspace boundary** on the read and on every write.
 * 2. **A range that began before the month still covers days in it** — the
 *    read cannot be bounded below by the first, or a bleeding that started on
 *    the 28th would vanish from the month it runs into.
 * 3. **A day inside a range is refused, not split.** Splitting would mean
 *    inventing a strength for the days nobody touched.
 */

const TENANT = { organizationId: 'org_a' } as const;
const MARCH = new Date('2026-03-01T00:00:00.000Z');
const COACH = { recordedBy: 'COACH' as const, coachId: 'coach_1' };

const day = (iso: string) => new Date(`${iso}T00:00:00.000Z`);

interface Episode {
  id: string;
  startedOn: Date;
  endedOn: Date | null;
  intensity: string | null;
  note: string | null;
  recordedBy: 'ATHLETE' | 'COACH';
  recordedByCoachId: string | null;
}

const episode = (over: Partial<Episode> = {}): Episode => ({
  id: 'ep_1',
  startedOn: day('2026-03-04'),
  endedOn: day('2026-03-04'),
  intensity: 'MEDIUM',
  note: null,
  recordedBy: 'COACH',
  recordedByCoachId: 'coach_1',
  ...over,
});

function cycleDb(
  episodes: Episode[] = [],
  options: { athleteFound?: boolean; covering?: Partial<Episode> | null } = {},
) {
  const created: Record<string, unknown>[] = [];
  const updated: Record<string, unknown>[] = [];
  const deleted: Record<string, unknown>[] = [];

  const bleedingEpisode = {
    /** The same reading as the query: begins in the month, or runs into it. */
    findMany: vi.fn((args: { where: { OR?: Record<string, unknown>[] } }) =>
      Promise.resolve(
        episodes.filter((row) =>
          (args.where.OR ?? []).some((clause) => {
            const started = clause['startedOn'] as { gte?: Date; lt?: Date } | undefined;
            const ended = clause['endedOn'] as { gte?: Date } | undefined;

            const startOk =
              (started?.gte === undefined || row.startedOn >= started.gte) &&
              (started?.lt === undefined || row.startedOn < started.lt);
            const endOk =
              ended?.gte === undefined || (row.endedOn !== null && row.endedOn >= ended.gte);

            return startOk && endOk;
          }),
        ),
      ),
    ),
    /**
     * Applies the `OR` the caller actually asked with.
     *
     * A fake that returned whatever a test configured would answer "covered"
     * to any query, and the bug this file pins lives in the filter itself — an
     * entry with no end wrongly matching every later day. Interpreting the
     * clause is what makes the assertion mean anything.
     */
    findFirst: vi.fn((args: { where: { OR?: Record<string, unknown>[] } }) => {
      if (options.covering === undefined || options.covering === null) {
        return Promise.resolve(null);
      }

      const row = episode(options.covering);
      const at = (value: unknown) => (value instanceof Date ? value.getTime() : NaN);

      const matches = (args.where.OR ?? []).some((clause) => {
        const started = clause['startedOn'] as Date | { lt?: Date } | undefined;
        const ended = clause['endedOn'] as { gte?: Date } | null | undefined;

        const startOk =
          started instanceof Date
            ? at(started) === row.startedOn.getTime()
            : started?.lt !== undefined
              ? row.startedOn.getTime() < at(started.lt)
              : true;

        const endOk =
          ended === null
            ? row.endedOn === null
            : ended?.gte !== undefined
              ? row.endedOn !== null && row.endedOn.getTime() >= at(ended.gte)
              : true;

        return startOk && endOk;
      });

      return Promise.resolve(matches ? row : null);
    }),
    create: vi.fn((args: { data: Record<string, unknown> }) => {
      created.push(args.data);

      return Promise.resolve({ id: 'ep_new' });
    }),
    updateMany: vi.fn((args: Record<string, unknown>) => {
      updated.push(args);

      return Promise.resolve({ count: 1 });
    }),
    deleteMany: vi.fn((args: Record<string, unknown>) => {
      deleted.push(args);

      return Promise.resolve({ count: 1 });
    }),
  };

  const athlete = {
    findFirst: vi.fn(() =>
      Promise.resolve(options.athleteFound === false ? null : { id: 'ath_1' }),
    ),
  };

  const db = { bleedingEpisode, athlete } as unknown as Parameters<typeof bleedingMonth>[0];

  return { db, bleedingEpisode, athlete, created, updated, deleted };
}

const argsOf = (spy: { mock: { calls: unknown[][] } }, call = 0) =>
  (spy.mock.calls[call]?.[0] ?? {}) as { where?: Record<string, unknown>; data?: unknown };

describe('the workspace boundary', () => {
  it('asks for the athlete inside the workspace', async () => {
    const fake = cycleDb();

    await bleedingMonth(fake.db, TENANT, 'ath_1', MARCH);

    expect(argsOf(fake.athlete.findFirst).where).toMatchObject({
      id: 'ath_1',
      organizationId: 'org_a',
    });
  });

  it('answers null for an athlete of another workspace', async () => {
    const fake = cycleDb([], { athleteFound: false });

    expect(await bleedingMonth(fake.db, TENANT, 'ath_1', MARCH)).toBeNull();
    expect(fake.bleedingEpisode.findMany).not.toHaveBeenCalled();
  });

  it('scopes the month read', async () => {
    const fake = cycleDb();

    await bleedingMonth(fake.db, TENANT, 'ath_1', MARCH);

    expect(argsOf(fake.bleedingEpisode.findMany).where).toMatchObject({
      athleteId: 'ath_1',
      organizationId: 'org_a',
    });
  });

  it('deletes through a filter that carries the workspace', async () => {
    const fake = cycleDb([], { covering: {} });

    await setBleedingDay(
      fake.db,
      TENANT,
      { athleteId: 'ath_1', day: '2026-03-04', intensity: null },
      COACH,
    );

    expect(argsOf(fake.bleedingEpisode.deleteMany).where).toMatchObject({
      id: 'ep_1',
      organizationId: 'org_a',
    });
  });
});

describe('what the month holds', () => {
  it('lays out every day of it', async () => {
    const month = await bleedingMonth(cycleDb().db, TENANT, 'ath_1', MARCH);

    expect(month?.days).toHaveLength(31);
    expect(month?.days[0]?.date).toEqual(day('2026-03-01'));
    expect(month?.days[30]?.date).toEqual(day('2026-03-31'));
  });

  it('handles a short month and a leap February', async () => {
    const april = await bleedingMonth(cycleDb().db, TENANT, 'ath_1', day('2026-04-01'));
    const february = await bleedingMonth(cycleDb().db, TENANT, 'ath_1', day('2028-02-01'));

    expect(april?.days).toHaveLength(30);
    expect(february?.days).toHaveLength(29);
  });

  it('marks the day an entry names, and only that day', async () => {
    const month = await bleedingMonth(cycleDb([episode()]).db, TENANT, 'ath_1', MARCH);

    expect(month?.days[3]?.marked).toBe(true);
    expect(month?.days[3]?.intensity).toBe('MEDIUM');
    expect(month?.days[3]?.partOfRange).toBe(false);
    expect(month?.days[2]?.marked).toBe(false);
  });

  it('spreads a range across its days and says so', async () => {
    const month = await bleedingMonth(
      cycleDb([episode({ startedOn: day('2026-03-04'), endedOn: day('2026-03-07') })]).db,
      TENANT,
      'ath_1',
      MARCH,
    );

    expect(month?.days.slice(3, 7).every((entry) => entry.marked)).toBe(true);
    expect(month?.days.slice(3, 7).every((entry) => entry.partOfRange)).toBe(true);
    expect(month?.days[7]?.marked).toBe(false);
  });

  it('shows a range that began in the previous month', async () => {
    // The read cannot be bounded below by the first of the month, or a bleeding
    // that started on the 28th would vanish from the month it runs into.
    const month = await bleedingMonth(
      cycleDb([episode({ startedOn: day('2026-02-27'), endedOn: day('2026-03-02') })]).db,
      TENANT,
      'ath_1',
      MARCH,
    );

    expect(month?.days[0]?.marked).toBe(true);
    expect(month?.days[1]?.marked).toBe(true);
    expect(month?.days[2]?.marked).toBe(false);
  });

  it('leaves an open entry from an earlier month out of this one', async () => {
    // A missing end means the end was not written down, not that the bleeding
    // is still running. Reading it the other way marked every later month.
    const month = await bleedingMonth(
      cycleDb([episode({ startedOn: day('2026-02-24'), endedOn: null })]).db,
      TENANT,
      'ath_1',
      MARCH,
    );

    expect(month?.days.every((entry) => !entry.marked)).toBe(true);
  });

  it('reads an entry without a strength as documented, not as empty', async () => {
    // Every entry from before the calendar has none, and a day drawn empty
    // would lose a bleeding that was written down.
    const month = await bleedingMonth(
      cycleDb([episode({ intensity: null })]).db,
      TENANT,
      'ath_1',
      MARCH,
    );

    expect(month?.days[3]?.marked).toBe(true);
    expect(month?.days[3]?.intensity).toBeNull();
  });

  it('drops a stored strength it cannot read rather than guessing', async () => {
    const month = await bleedingMonth(
      cycleDb([episode({ intensity: 'SEHR_STARK' })]).db,
      TENANT,
      'ath_1',
      MARCH,
    );

    expect(month?.days[3]?.marked).toBe(true);
    expect(month?.days[3]?.intensity).toBeNull();
  });
});

describe('marking one day', () => {
  const input = { athleteId: 'ath_1', day: '2026-03-04', intensity: 'HEAVY' as const };

  it('writes the day as both the first and the last', async () => {
    // The calendar records days; the unique index on (athlete, first day) is
    // what makes that one row.
    const fake = cycleDb([], { covering: null });

    await setBleedingDay(fake.db, TENANT, input, COACH);

    expect(fake.created[0]).toMatchObject({
      startedOn: day('2026-03-04'),
      endedOn: day('2026-03-04'),
      intensity: 'HEAVY',
      organizationId: 'org_a',
      recordedBy: 'COACH',
      recordedByCoachId: 'coach_1',
    });
  });

  it('changes the strength of a day already marked', async () => {
    const fake = cycleDb([], { covering: {} });

    await setBleedingDay(fake.db, TENANT, input, COACH);

    expect(fake.bleedingEpisode.create).not.toHaveBeenCalled();
    expect(argsOf(fake.bleedingEpisode.updateMany).data).toMatchObject({ intensity: 'HEAVY' });
  });

  it('clears a day when no strength is given', async () => {
    const fake = cycleDb([], { covering: {} });

    await setBleedingDay(fake.db, TENANT, { ...input, intensity: null }, COACH);

    expect(fake.deleted).toHaveLength(1);
  });

  it('does nothing when clearing a day that holds nothing', async () => {
    const fake = cycleDb([], { covering: null });

    expect(await setBleedingDay(fake.db, TENANT, { ...input, intensity: null }, COACH)).toEqual({
      ok: true,
    });
    expect(fake.deleted).toEqual([]);
  });

  it('is not blocked by an earlier entry whose end was never documented', async () => {
    // The bug this pins: `endedOn: null` means "the end was not written down",
    // and the read has always treated such an entry as covering its first day
    // only. The write disagreed — it asked for anything with `startedOn <= day`
    // and a null end, so one open entry from August refused every day after it
    // for ever. A coach with a single such entry could mark nothing at all.
    const fake = cycleDb([], {
      covering: { startedOn: day('2026-08-24'), endedOn: null },
    });

    // The 4th of March is a free day as far as that entry is concerned, so the
    // mark is written like any other.
    expect(await setBleedingDay(fake.db, TENANT, input, COACH)).toEqual({ ok: true });
    expect(fake.created).toHaveLength(1);
  });

  it('asks only for entries that really cover the day', async () => {
    const fake = cycleDb([], { covering: null });

    await setBleedingDay(fake.db, TENANT, input, COACH);

    const where = argsOf(fake.bleedingEpisode.findFirst).where as {
      OR?: { startedOn?: unknown; endedOn?: unknown }[];
    };

    // Two cases and no third: the day itself, or a range that encloses it. An
    // open-ended entry is neither once it is past its own day.
    expect(where.OR).toEqual([
      { startedOn: day('2026-03-04') },
      { startedOn: { lt: day('2026-03-04') }, endedOn: { gte: day('2026-03-04') } },
    ]);
  });

  it('refuses a day inside a multi-day entry rather than splitting it', async () => {
    const fake = cycleDb([], {
      covering: { startedOn: day('2026-03-02'), endedOn: day('2026-03-07') },
    });

    expect(await setBleedingDay(fake.db, TENANT, input, COACH)).toEqual({
      ok: false,
      reason: 'PART_OF_RANGE',
    });
    expect(fake.created).toEqual([]);
    expect(fake.updated).toEqual([]);
    expect(fake.deleted).toEqual([]);
  });

  it('refuses an athlete of another workspace', async () => {
    const fake = cycleDb([], { athleteFound: false });

    expect(await setBleedingDay(fake.db, TENANT, input, COACH)).toEqual({
      ok: false,
      reason: 'ATHLETE_NOT_FOUND',
    });
  });
});
