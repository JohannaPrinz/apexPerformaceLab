import { describe, expect, it, vi } from 'vitest';

import { clearNutritionValue, nutritionWeek, setNutritionValue } from './nutrition';

/**
 * The nutrition week.
 *
 * Four things are pinned here, and none of them can be seen from the table:
 *
 * 1. **The workspace boundary.** Every read and every write carries the tenant,
 *    and the writes go through `updateMany`/`deleteMany` with it in the filter —
 *    never a bare `update` an id from elsewhere could reach through.
 * 2. **One value per day, per quantity.** A second write to the same cell
 *    replaces the first. Without it a cell would have no defined value.
 * 3. **The energy total follows the domain**, including its refusal: a day
 *    missing one macronutrient has no total rather than a smaller one.
 * 4. **Averages state their day count.** A mean over three days is not a week.
 */

const TENANT = { organizationId: 'org_a' } as const;
const WEEK = new Date('2026-08-31T00:00:00.000Z');

const TYPES = [
  { id: 'mt_protein', key: 'protein', name: 'Eiweiß', unit: 'g', organizationId: null },
  { id: 'mt_carbs', key: 'carbohydrates', name: 'Kohlenhydrate', unit: 'g', organizationId: null },
  { id: 'mt_fat', key: 'fat', name: 'Fette', unit: 'g', organizationId: null },
  { id: 'mt_fibre', key: 'fibre', name: 'Ballaststoffe', unit: 'g', organizationId: null },
  { id: 'mt_fluid', key: 'fluid_intake', name: 'Trinkmenge', unit: 'L', organizationId: null },
];

interface Entry {
  id: string;
  numericValue: number;
  capturedAt: Date;
  recordedBy: 'ATHLETE' | 'COACH';
  measurementType: { key: string };
}

const entry = (key: string, day: string, value: number, over: Partial<Entry> = {}): Entry => ({
  id: `te_${key}_${day}`,
  numericValue: value,
  capturedAt: new Date(`${day}T00:00:00.000Z`),
  recordedBy: 'COACH',
  measurementType: { key },
  ...over,
});

function nutritionDb(
  entries: Entry[] = [],
  options: { athleteFound?: boolean; types?: typeof TYPES; standing?: { id: string } | null } = {},
) {
  const trackingEntry = {
    findMany: vi.fn(() => Promise.resolve(entries)),
    findFirst: vi.fn(() => Promise.resolve(options.standing ?? null)),
    create: vi.fn(() => Promise.resolve({ id: 'te_new' })),
    updateMany: vi.fn(() => Promise.resolve({ count: 1 })),
    deleteMany: vi.fn(() => Promise.resolve({ count: 1 })),
  };

  const athlete = {
    findFirst: vi.fn(() =>
      Promise.resolve(options.athleteFound === false ? null : { id: 'ath_1' }),
    ),
  };

  const measurementType = {
    findMany: vi.fn(() => Promise.resolve(options.types ?? TYPES)),
    findFirst: vi.fn((args: { where: { key: string } }) =>
      Promise.resolve((options.types ?? TYPES).find((type) => type.key === args.where.key) ?? null),
    ),
    count: vi.fn(() => Promise.resolve((options.types ?? TYPES).length)),
  };

  const db = { trackingEntry, athlete, measurementType } as unknown as Parameters<
    typeof nutritionWeek
  >[0];

  return { db, trackingEntry, athlete, measurementType };
}

const argsOf = (spy: { mock: { calls: unknown[][] } }, call = 0) =>
  (spy.mock.calls[call]?.[0] ?? {}) as { where?: Record<string, unknown>; data?: unknown };

describe('the workspace boundary', () => {
  it('asks for the athlete inside the workspace, never trusts the id', async () => {
    const fake = nutritionDb();

    await nutritionWeek(fake.db, TENANT, 'ath_1', WEEK);

    expect(argsOf(fake.athlete.findFirst).where).toMatchObject({
      id: 'ath_1',
      organizationId: 'org_a',
    });
  });

  it('answers null for an athlete of another workspace', async () => {
    const fake = nutritionDb([], { athleteFound: false });

    expect(await nutritionWeek(fake.db, TENANT, 'ath_1', WEEK)).toBeNull();
    // And reads nothing further — a caller cannot tell a missing athlete from
    // somebody else's.
    expect(fake.trackingEntry.findMany).not.toHaveBeenCalled();
  });

  it('scopes the week read', async () => {
    const fake = nutritionDb();

    await nutritionWeek(fake.db, TENANT, 'ath_1', WEEK);

    expect(argsOf(fake.trackingEntry.findMany).where).toMatchObject({
      athleteId: 'ath_1',
      organizationId: 'org_a',
    });
  });

  it('deletes through a filter that carries the workspace', async () => {
    const fake = nutritionDb();

    await clearNutritionValue(fake.db, TENANT, 'te_1', null);

    expect(argsOf(fake.trackingEntry.deleteMany).where).toMatchObject({
      id: 'te_1',
      organizationId: 'org_a',
    });
  });

  it('answers false where the entry was not this workspace’s', async () => {
    const fake = nutritionDb();
    fake.trackingEntry.deleteMany.mockResolvedValue({ count: 0 });

    expect(await clearNutritionValue(fake.db, TENANT, 'te_x', null)).toBe(false);
  });

  /** See the same case in `biofeedback.test.ts` — the portal path (§21). */
  it('narrows to one athlete when an owner is named', async () => {
    const fake = nutritionDb();

    await clearNutritionValue(fake.db, TENANT, 'te_1', 'ath_1');

    expect(argsOf(fake.trackingEntry.deleteMany).where).toMatchObject({
      id: 'te_1',
      organizationId: 'org_a',
      athleteId: 'ath_1',
    });
  });
});

describe('writing one cell', () => {
  const input = {
    athleteId: 'ath_1',
    measurementTypeKey: 'protein',
    day: new Date('2026-09-01T18:42:11.000Z'),
    value: 150,
  };

  const coach = { by: 'COACH' as const, coachId: 'coach_1' };

  it('stamps the entry at the UTC midnight of its day', async () => {
    // The moment inside the day carries no information — a day's protein is one
    // figure — and a value stamped at 18:42 would land in a different column
    // than the one it was typed in wherever the reader is not on UTC.
    const fake = nutritionDb();

    await setNutritionValue(fake.db, TENANT, coach, input);

    const data = argsOf(fake.trackingEntry.create).data as Record<string, unknown>;
    expect(data['capturedAt']).toEqual(new Date('2026-09-01T00:00:00.000Z'));
    expect(data['organizationId']).toBe('org_a');
    expect(data['recordedBy']).toBe('COACH');
    expect(data['recordedByCoachId']).toBe('coach_1');
  });

  it('replaces a value already recorded that day rather than adding a second', async () => {
    const fake = nutritionDb([], { standing: { id: 'te_old' } });

    const result = await setNutritionValue(fake.db, TENANT, coach, input);

    expect(fake.trackingEntry.create).not.toHaveBeenCalled();
    expect(argsOf(fake.trackingEntry.updateMany).where).toMatchObject({
      id: 'te_old',
      organizationId: 'org_a',
    });
    expect(result).toEqual({ ok: true, id: 'te_old' });
  });

  it('refuses a quantity that is not part of the table', async () => {
    // This function replaces what it finds. Letting it write a body weight would
    // silently apply one-value-per-day to a quantity where a second reading on
    // the same day is a legitimate second reading.
    const fake = nutritionDb();

    const result = await setNutritionValue(fake.db, TENANT, coach, {
      ...input,
      measurementTypeKey: 'weight',
    });

    expect(result).toEqual({ ok: false, refusal: 'NOT_A_NUTRITION_KEY' });
    expect(fake.athlete.findFirst).not.toHaveBeenCalled();
  });

  it('refuses an athlete of another workspace', async () => {
    const fake = nutritionDb([], { athleteFound: false });

    expect(await setNutritionValue(fake.db, TENANT, coach, input)).toEqual({
      ok: false,
      refusal: 'ATHLETE_NOT_FOUND',
    });
  });
});

describe('what the week says', () => {
  it('lays out seven days, Monday first', async () => {
    const week = await nutritionWeek(nutritionDb().db, TENANT, 'ath_1', WEEK);

    expect(week?.days).toHaveLength(7);
    expect(week?.days[0]?.date).toEqual(new Date('2026-08-31T00:00:00.000Z'));
    expect(week?.days[6]?.date).toEqual(new Date('2026-09-06T00:00:00.000Z'));
  });

  it('puts each value in its own day and column', async () => {
    const week = await nutritionWeek(
      nutritionDb([entry('protein', '2026-09-01', 150)]).db,
      TENANT,
      'ath_1',
      WEEK,
    );

    expect(week?.days[1]?.values.protein?.value).toBe(150);
    expect(week?.days[0]?.values.protein).toBeUndefined();
  });

  it('computes the energy of a day with all three macronutrients', async () => {
    const week = await nutritionWeek(
      nutritionDb([
        entry('protein', '2026-09-01', 150),
        entry('carbohydrates', '2026-09-01', 300),
        entry('fat', '2026-09-01', 80),
      ]).db,
      TENANT,
      'ath_1',
      WEEK,
    );

    expect(week?.days[1]?.energyKcal).toBe(2520);
  });

  it('leaves a day without all three without a total', async () => {
    // Not a smaller total: a day missing its fat is a day nobody finished
    // writing down, and a figure there would understate it by a third.
    const week = await nutritionWeek(
      nutritionDb([entry('protein', '2026-09-01', 150), entry('carbohydrates', '2026-09-01', 300)])
        .db,
      TENANT,
      'ath_1',
      WEEK,
    );

    expect(week?.days[1]?.energyKcal).toBeNull();
  });

  it('averages only the days that carry a value, and says how many', async () => {
    const week = await nutritionWeek(
      nutritionDb([entry('protein', '2026-08-31', 100), entry('protein', '2026-09-01', 200)]).db,
      TENANT,
      'ath_1',
      WEEK,
    );

    expect(week?.averages.protein).toEqual({ value: 150, days: 2 });
  });

  it('has no average for a quantity nothing was written for', async () => {
    const week = await nutritionWeek(nutritionDb().db, TENANT, 'ath_1', WEEK);

    expect(week?.averages.protein).toBeUndefined();
    expect(week?.energyAverage).toBeNull();
  });

  it('carries who wrote each figure', async () => {
    // §13 keeps a self-report and a coach's entry apart, and the table is the
    // only place the difference can be seen.
    const week = await nutritionWeek(
      nutritionDb([entry('protein', '2026-09-01', 150, { recordedBy: 'ATHLETE' })]).db,
      TENANT,
      'ath_1',
      WEEK,
    );

    expect(week?.days[1]?.values.protein?.recordedBy).toBe('ATHLETE');
  });

  it('offers no column for a quantity the catalogue does not hold', async () => {
    // Never a column that cannot be written to.
    const week = await nutritionWeek(
      nutritionDb([], { types: TYPES.slice(0, 3) }).db,
      TENANT,
      'ath_1',
      WEEK,
    );

    expect(week?.quantities.map((quantity) => quantity.key)).toEqual([
      'protein',
      'carbohydrates',
      'fat',
    ]);
  });

  it('never states a target, a requirement or a verdict', async () => {
    const week = await nutritionWeek(
      nutritionDb([entry('protein', '2026-09-01', 150)]).db,
      TENANT,
      'ath_1',
      WEEK,
    );

    // The shape itself carries no such field. Asserted because adding one later
    // would be the quiet way this rule is lost.
    expect(Object.keys(week ?? {}).sort()).toEqual([
      'averages',
      'days',
      'energyAverage',
      'quantities',
      'weekStart',
    ]);
  });
});
