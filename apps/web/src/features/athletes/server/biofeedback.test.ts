import { describe, expect, it, vi } from 'vitest';

import { readCardRows } from '@apex/domain';

import {
  addBiofeedbackQuantity,
  BIOFEEDBACK_TREND_KEY,
  biofeedbackWeek,
  clearBiofeedbackValue,
  DEFAULT_BIOFEEDBACK_KEYS,
  keyFromName,
  setBiofeedbackNote,
  setBiofeedbackRows,
  setBiofeedbackValue,
} from './biofeedback';

/**
 * The biofeedback week.
 *
 * What is pinned here cannot be seen from the table:
 *
 * 1. **The workspace boundary** on every read and every write, through
 *    `updateMany`/`deleteMany` with the tenant in the filter.
 * 2. **The scale belongs to the quantity.** A row that declares 1–10 refuses
 *    50 — a statement about the declared unit, never about the athlete.
 * 3. **Absent rows mean the default, empty rows mean none.** The card ships
 *    with eight, and a coach must still be able to remove the last one.
 * 4. **A quantity a coach adds is a catalogue entry**, reused rather than
 *    duplicated when the name is already there.
 */

const TENANT = { organizationId: 'org_a' } as const;
const WEEK = new Date('2026-08-31T00:00:00.000Z');
const COACH = { by: 'COACH' as const, coachId: 'coach_1' };

const systemType = (key: string, name: string, unit = '1–10') => ({
  id: `mt_${key}`,
  key,
  name,
  unit,
  organizationId: null as string | null,
});

const TYPES = [
  systemType('sleep_duration', 'Schlaf', 'h'),
  systemType('sleep_quality', 'Schlafqualität'),
  systemType('hunger', 'Hunger'),
  systemType('digestion', 'Verdauung'),
  systemType('stress', 'Stress'),
  systemType('cycle_rating', 'Zyklus'),
  systemType('energy_level', 'Energielevel'),
  systemType('training_rating', 'Training'),
];

interface Entry {
  id: string;
  numericValue: number;
  capturedAt: Date;
  note: string | null;
  recordedBy: 'ATHLETE' | 'COACH';
  measurementType: { key: string };
}

const entry = (key: string, day: string, value: number, over: Partial<Entry> = {}): Entry => ({
  id: `te_${key}_${day}`,
  numericValue: value,
  capturedAt: new Date(`${day}T00:00:00.000Z`),
  note: null,
  recordedBy: 'COACH',
  measurementType: { key },
  ...over,
});

function biofeedbackDb(
  entries: Entry[] = [],
  options: {
    athleteFound?: boolean;
    trendCards?: unknown;
    types?: typeof TYPES;
    standing?: { id: string } | null;
    takenKeys?: string[];
  } = {},
) {
  const created: Record<string, unknown>[] = [];
  const updated: Record<string, unknown>[] = [];
  const types = options.types ?? TYPES;

  const trackingEntry = {
    findMany: vi.fn(() => Promise.resolve(entries)),
    findFirst: vi.fn(() => Promise.resolve(options.standing ?? null)),
    create: vi.fn((args: { data: Record<string, unknown> }) => {
      created.push(args.data);

      return Promise.resolve({ id: 'te_new' });
    }),
    updateMany: vi.fn((args: Record<string, unknown>) => {
      updated.push(args);

      return Promise.resolve({ count: 1 });
    }),
    deleteMany: vi.fn(() => Promise.resolve({ count: 1 })),
  };

  const athleteUpdates: Record<string, unknown>[] = [];
  const athlete = {
    findFirst: vi.fn(() =>
      Promise.resolve(
        options.athleteFound === false
          ? null
          : { id: 'ath_1', trendCards: options.trendCards ?? null },
      ),
    ),
    updateMany: vi.fn((args: { data: Record<string, unknown> }) => {
      athleteUpdates.push(args.data);

      return Promise.resolve({ count: 1 });
    }),
  };

  const typeCreated: Record<string, unknown>[] = [];
  const measurementType = {
    findMany: vi.fn((args: { where: { key?: { startsWith?: string } } }) =>
      Promise.resolve(
        args.where.key?.startsWith === undefined
          ? types
          : (options.takenKeys ?? []).map((key) => ({ key })),
      ),
    ),
    findFirst: vi.fn((args: { where: { key: string } }) =>
      Promise.resolve(types.find((type) => type.key === args.where.key) ?? null),
    ),
    create: vi.fn((args: { data: Record<string, unknown> }) => {
      typeCreated.push(args.data);

      return Promise.resolve({ id: 'mt_new' });
    }),
  };

  const db = { trackingEntry, athlete, measurementType, coach: {} } as unknown as Parameters<
    typeof biofeedbackWeek
  >[0];

  return {
    db,
    trackingEntry,
    athlete,
    measurementType,
    created,
    updated,
    athleteUpdates,
    typeCreated,
  };
}

const argsOf = (spy: { mock: { calls: unknown[][] } }, call = 0) =>
  (spy.mock.calls[call]?.[0] ?? {}) as { where?: Record<string, unknown>; data?: unknown };

describe('the workspace boundary', () => {
  it('asks for the athlete inside the workspace, never trusts the id', async () => {
    const fake = biofeedbackDb();

    await biofeedbackWeek(fake.db, TENANT, 'ath_1', WEEK);

    expect(argsOf(fake.athlete.findFirst).where).toMatchObject({
      id: 'ath_1',
      organizationId: 'org_a',
    });
  });

  it('answers null for an athlete of another workspace', async () => {
    const fake = biofeedbackDb([], { athleteFound: false });

    expect(await biofeedbackWeek(fake.db, TENANT, 'ath_1', WEEK)).toBeNull();
    expect(fake.trackingEntry.findMany).not.toHaveBeenCalled();
  });

  it('scopes the week read', async () => {
    const fake = biofeedbackDb();

    await biofeedbackWeek(fake.db, TENANT, 'ath_1', WEEK);

    expect(argsOf(fake.trackingEntry.findMany).where).toMatchObject({
      athleteId: 'ath_1',
      organizationId: 'org_a',
    });
  });

  it('deletes and annotates only through a biofeedback filter that carries the workspace', async () => {
    const fake = biofeedbackDb();

    await clearBiofeedbackValue(fake.db, TENANT, 'te_1');
    await setBiofeedbackNote(fake.db, TENANT, 'te_1', 'spät ins Bett');

    expect(argsOf(fake.trackingEntry.deleteMany).where).toMatchObject({
      id: 'te_1',
      organizationId: 'org_a',
      measurementType: { category: 'biofeedback' },
    });
    // The category is part of the filter on purpose: this path applies
    // one-value-per-day rules, and must not reach a body weight.
    expect(argsOf(fake.trackingEntry.updateMany).where).toMatchObject({
      id: 'te_1',
      organizationId: 'org_a',
      measurementType: { category: 'biofeedback' },
    });
  });

  it('answers false where the entry was not this workspace’s', async () => {
    const fake = biofeedbackDb();
    fake.trackingEntry.deleteMany.mockResolvedValue({ count: 0 });
    fake.trackingEntry.updateMany.mockResolvedValue({ count: 0 });

    expect(await clearBiofeedbackValue(fake.db, TENANT, 'te_x')).toBe(false);
    expect(await setBiofeedbackNote(fake.db, TENANT, 'te_x', 'x')).toBe(false);
  });
});

describe('the scale a quantity declares', () => {
  const input = {
    athleteId: 'ath_1',
    measurementTypeKey: 'stress',
    day: new Date('2026-09-01T18:42:11.000Z'),
    value: 7,
  };

  it('accepts a rating from 1 to 10', async () => {
    const fake = biofeedbackDb();

    expect(await setBiofeedbackValue(fake.db, TENANT, COACH, input)).toEqual({
      ok: true,
      id: 'te_new',
    });
  });

  it('refuses 50 on a 1–10 row', async () => {
    // A statement about the declared unit, not about the athlete: a quantity
    // that says it is recorded from 1 to 10 cannot hold 50.
    const fake = biofeedbackDb();

    expect(await setBiofeedbackValue(fake.db, TENANT, COACH, { ...input, value: 50 })).toEqual({
      ok: false,
      refusal: 'OUT_OF_SCALE',
    });
    expect(fake.trackingEntry.create).not.toHaveBeenCalled();
  });

  it('refuses 0 on a 1–10 row, because the scale starts at 1', async () => {
    const fake = biofeedbackDb();

    expect(await setBiofeedbackValue(fake.db, TENANT, COACH, { ...input, value: 0 })).toEqual({
      ok: false,
      refusal: 'OUT_OF_SCALE',
    });
  });

  it('lets hours past 10, because sleep is not a rating', async () => {
    const fake = biofeedbackDb();

    expect(
      await setBiofeedbackValue(fake.db, TENANT, COACH, {
        ...input,
        measurementTypeKey: 'sleep_duration',
        value: 11.5,
      }),
    ).toEqual({ ok: true, id: 'te_new' });
  });

  it('refuses a quantity of another category outright', async () => {
    const fake = biofeedbackDb();

    expect(
      await setBiofeedbackValue(fake.db, TENANT, COACH, {
        ...input,
        measurementTypeKey: 'weight',
      }),
    ).toEqual({ ok: false, refusal: 'NOT_A_BIOFEEDBACK_KEY' });
  });
});

describe('writing one cell', () => {
  const input = {
    athleteId: 'ath_1',
    measurementTypeKey: 'stress',
    day: new Date('2026-09-01T18:42:11.000Z'),
    value: 7,
  };

  it('stamps the entry at the UTC midnight of its day', async () => {
    const fake = biofeedbackDb();

    await setBiofeedbackValue(fake.db, TENANT, COACH, input);

    expect(fake.created[0]?.['capturedAt']).toEqual(new Date('2026-09-01T00:00:00.000Z'));
    expect(fake.created[0]?.['organizationId']).toBe('org_a');
    expect(fake.created[0]?.['recordedBy']).toBe('COACH');
  });

  it('replaces a value already recorded that day rather than adding a second', async () => {
    const fake = biofeedbackDb([], { standing: { id: 'te_old' } });

    const result = await setBiofeedbackValue(fake.db, TENANT, COACH, input);

    expect(fake.trackingEntry.create).not.toHaveBeenCalled();
    expect(result).toEqual({ ok: true, id: 'te_old' });
  });

  it('keeps a remark already on the cell when only the figure changes', async () => {
    // Correcting a number is not retracting the reason for it.
    const fake = biofeedbackDb([], { standing: { id: 'te_old' } });

    await setBiofeedbackValue(fake.db, TENANT, COACH, input);

    expect(argsOf(fake.trackingEntry.updateMany).data).not.toHaveProperty('note');
  });

  it('clears the remark where one is explicitly passed as empty', async () => {
    const fake = biofeedbackDb([], { standing: { id: 'te_old' } });

    await setBiofeedbackValue(fake.db, TENANT, COACH, { ...input, note: '  ' });

    expect(argsOf(fake.trackingEntry.updateMany).data).toMatchObject({ note: null });
  });
});

describe('which rows the card shows', () => {
  it('shows the eight defaults where the coach never chose', async () => {
    const week = await biofeedbackWeek(biofeedbackDb().db, TENANT, 'ath_1', WEEK);

    expect(week?.rows.map((row) => row.quantity.key)).toEqual([...DEFAULT_BIOFEEDBACK_KEYS]);
  });

  it('shows none where the coach removed every row', async () => {
    // Empty is a choice and must not fall back to the default, or removing the
    // last row would be impossible.
    const fake = biofeedbackDb([], {
      trendCards: { version: 2, keys: ['biofeedback'], rows: { biofeedback: [] } },
    });

    const week = await biofeedbackWeek(fake.db, TENANT, 'ath_1', WEEK);

    expect(week?.rows).toEqual([]);
    expect(week?.available).toHaveLength(TYPES.length);
  });

  it('keeps the order the coach arranged', async () => {
    const fake = biofeedbackDb([], {
      trendCards: { version: 2, keys: [], rows: { biofeedback: ['stress', 'hunger'] } },
    });

    const week = await biofeedbackWeek(fake.db, TENANT, 'ath_1', WEEK);

    expect(week?.rows.map((row) => row.quantity.key)).toEqual(['stress', 'hunger']);
  });

  it('offers what is not on the card back', async () => {
    const fake = biofeedbackDb([], {
      trendCards: { version: 2, keys: [], rows: { biofeedback: ['stress'] } },
    });

    const week = await biofeedbackWeek(fake.db, TENANT, 'ath_1', WEEK);

    expect(week?.available.map((quantity) => quantity.key)).not.toContain('stress');
    expect(week?.available.map((quantity) => quantity.key)).toContain('hunger');
  });

  it('drops a row naming a quantity the catalogue no longer holds', async () => {
    // Never a line nothing can be written on.
    const fake = biofeedbackDb([], {
      trendCards: { version: 2, keys: [], rows: { biofeedback: ['stress', 'weggefallen'] } },
    });

    const week = await biofeedbackWeek(fake.db, TENANT, 'ath_1', WEEK);

    expect(week?.rows.map((row) => row.quantity.key)).toEqual(['stress']);
  });

  it('stores a new selection without losing the card list beside it', async () => {
    const fake = biofeedbackDb([], {
      trendCards: { version: 2, keys: ['weight', 'biofeedback'], rows: { nutrition: ['protein'] } },
    });

    await setBiofeedbackRows(fake.db, TENANT, 'ath_1', ['stress', 'hunger']);

    const written = fake.athleteUpdates[0]?.['trendCards'];
    expect(readCardRows(written, BIOFEEDBACK_TREND_KEY)).toEqual(['stress', 'hunger']);
    expect(readCardRows(written, 'nutrition')).toEqual(['protein']);
    expect((written as { keys: string[] }).keys).toEqual(['weight', 'biofeedback']);
  });

  it('drops an unknown key from a selection rather than storing it', async () => {
    const fake = biofeedbackDb();

    await setBiofeedbackRows(fake.db, TENANT, 'ath_1', ['stress', 'erfunden']);

    expect(readCardRows(fake.athleteUpdates[0]?.['trendCards'], BIOFEEDBACK_TREND_KEY)).toEqual([
      'stress',
    ]);
  });
});

describe('a quantity of the workspace’s own', () => {
  it('makes a catalogue key out of a German name', () => {
    expect(keyFromName('Wohlbefinden')).toBe('wohlbefinden');
    expect(keyFromName('Übelkeit')).toBe('uebelkeit');
    expect(keyFromName('Muskelkater / DOMS')).toBe('muskelkater_doms');
    expect(keyFromName('Straße')).toBe('strasse');
  });

  it('creates it in the biofeedback category, owned by the workspace', async () => {
    const fake = biofeedbackDb();

    const result = await addBiofeedbackQuantity(fake.db, TENANT, 'ath_1', 'Wohlbefinden');

    expect(result).toEqual({ ok: true, key: 'wohlbefinden' });
    expect(fake.typeCreated[0]).toMatchObject({
      key: 'wohlbefinden',
      name: 'Wohlbefinden',
      unit: '1–10',
      category: 'biofeedback',
      organizationId: 'org_a',
    });
  });

  it('puts it on the card beside the defaults', async () => {
    const fake = biofeedbackDb();

    await addBiofeedbackQuantity(fake.db, TENANT, 'ath_1', 'Wohlbefinden');

    expect(readCardRows(fake.athleteUpdates[0]?.['trendCards'], BIOFEEDBACK_TREND_KEY)).toEqual([
      ...DEFAULT_BIOFEEDBACK_KEYS,
      'wohlbefinden',
    ]);
  });

  it('reuses a quantity of that name instead of a second one', async () => {
    // Two rows both called "Stress" would be two histories of the same thing.
    const fake = biofeedbackDb();

    const result = await addBiofeedbackQuantity(fake.db, TENANT, 'ath_1', 'stress');

    expect(result).toEqual({ ok: true, key: 'stress' });
    expect(fake.measurementType.create).not.toHaveBeenCalled();
  });

  it('suffixes a key another quantity already took', async () => {
    // A different name that happens to slug the same way, or a quantity of
    // another category holding the key. Both keep their own row.
    const fake = biofeedbackDb([], { takenKeys: ['wohlbefinden'] });

    const result = await addBiofeedbackQuantity(fake.db, TENANT, 'ath_1', 'Wohlbefinden!');

    expect(result).toEqual({ ok: true, key: 'wohlbefinden_2' });
    expect(fake.typeCreated[0]).toMatchObject({ key: 'wohlbefinden_2', name: 'Wohlbefinden!' });
  });

  it('reuses by name before minting a key at all', async () => {
    // "Schlaf" is already in the catalogue as `sleep_duration`. Matching on the
    // name rather than on the slug is what stops a second sleep row appearing
    // under a key nobody would recognise.
    const fake = biofeedbackDb();

    expect(await addBiofeedbackQuantity(fake.db, TENANT, 'ath_1', 'Schlaf')).toEqual({
      ok: true,
      key: 'sleep_duration',
    });
    expect(fake.measurementType.create).not.toHaveBeenCalled();
  });

  it('refuses a name no key can be made of', async () => {
    const fake = biofeedbackDb();

    expect(await addBiofeedbackQuantity(fake.db, TENANT, 'ath_1', '???')).toEqual({
      ok: false,
      refusal: 'NAME_UNUSABLE',
    });
    expect(fake.measurementType.create).not.toHaveBeenCalled();
  });

  it('refuses for an athlete of another workspace', async () => {
    const fake = biofeedbackDb([], { athleteFound: false });

    expect(await addBiofeedbackQuantity(fake.db, TENANT, 'ath_1', 'Wohlbefinden')).toEqual({
      ok: false,
      refusal: 'ATHLETE_NOT_FOUND',
    });
    expect(fake.measurementType.create).not.toHaveBeenCalled();
  });
});

describe('what the week says', () => {
  it('lays out seven days, Monday first', async () => {
    const week = await biofeedbackWeek(biofeedbackDb().db, TENANT, 'ath_1', WEEK);

    expect(week?.days).toHaveLength(7);
    expect(week?.days[0]).toEqual(new Date('2026-08-31T00:00:00.000Z'));
    expect(week?.days[6]).toEqual(new Date('2026-09-06T00:00:00.000Z'));
    expect(week?.rows[0]?.cells).toHaveLength(7);
  });

  it('puts each value in its own row and day', async () => {
    const fake = biofeedbackDb([entry('stress', '2026-09-01', 7)]);

    const week = await biofeedbackWeek(fake.db, TENANT, 'ath_1', WEEK);
    const stress = week?.rows.find((row) => row.quantity.key === 'stress');

    expect(stress?.cells[1]?.value).toBe(7);
    expect(stress?.cells[0]).toBeNull();
  });

  it('carries the remark and who wrote the figure', async () => {
    const fake = biofeedbackDb([
      entry('sleep_duration', '2026-09-01', 3, {
        note: 'spät ins Bett',
        recordedBy: 'ATHLETE',
      }),
    ]);

    const week = await biofeedbackWeek(fake.db, TENANT, 'ath_1', WEEK);
    const sleep = week?.rows.find((row) => row.quantity.key === 'sleep_duration');

    expect(sleep?.cells[1]?.note).toBe('spät ins Bett');
    expect(sleep?.cells[1]?.recordedBy).toBe('ATHLETE');
  });

  it('averages only the days that carry a value, and says how many', async () => {
    const fake = biofeedbackDb([
      entry('stress', '2026-08-31', 4),
      entry('stress', '2026-09-01', 8),
    ]);

    const week = await biofeedbackWeek(fake.db, TENANT, 'ath_1', WEEK);

    expect(week?.rows.find((row) => row.quantity.key === 'stress')?.average).toEqual({
      value: 6,
      days: 2,
    });
  });

  it('has no average for a row nothing was written on', async () => {
    const week = await biofeedbackWeek(biofeedbackDb().db, TENANT, 'ath_1', WEEK);

    expect(week?.rows.every((row) => row.average === null)).toBe(true);
  });

  it('never states a target, a requirement or a verdict', async () => {
    // Every figure is a self-report on a scale the platform does not define, so
    // the shape carries no field that could interpret one. Asserted because
    // adding one later would be the quiet way this rule is lost.
    const week = await biofeedbackWeek(biofeedbackDb().db, TENANT, 'ath_1', WEEK);

    expect(Object.keys(week ?? {}).sort()).toEqual(['available', 'days', 'rows', 'weekStart']);
    expect(Object.keys(week?.rows[0] ?? {}).sort()).toEqual(['average', 'cells', 'quantity']);
  });
});
