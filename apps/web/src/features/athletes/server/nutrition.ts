import 'server-only';

import type { PrismaClientInstance } from '@apex/database';
import { scoped, withTenant } from '@apex/database/tenant';
import { calculateEnergyIntake, ENERGY_NUTRIENT_KEYS, type EnergyNutrientKey } from '@apex/domain';
import type { TenantContext } from '@apex/types';

import { weekDays } from '../week';

/**
 * What an athlete ate and drank, week by week.
 *
 * ## Why this is tracking and not an assessment
 *
 * §13 draws the line and it falls squarely here: a Measurement is a finding
 * recorded inside an Assessment and never edited, which is what a nutrition
 * *test* produces — one day, examined. Following what somebody eats over
 * months is the other thing entirely: entries a person writes down for
 * themselves, correctable, with no professional context per row. So this reads
 * and writes `TrackingEntry`, sharing the **measurement types** with the test —
 * and therefore the units — and nothing else.
 *
 * The consequence is the useful one: a nutrition test and a tracked week speak
 * the same quantities, so the figures are comparable without a second
 * vocabulary, while the record never claims a self-reported Tuesday was a
 * diagnostic finding.
 *
 * ## One value per day, per quantity
 *
 * Unlike a body weight — where a reading before breakfast and one after
 * training are genuinely two readings — a day's protein is one figure. So a
 * write for a day that already has one **replaces** it rather than adding a
 * second, and every entry is stamped at the UTC midnight of its day (see
 * `../week.ts`). Without that rule a table cell would have no defined value.
 *
 * ## What is computed, and what is not
 *
 * The energy of a day, from the three macronutrients by the published factors
 * (`@apex/domain`), and the plain arithmetic mean of the days that carry a
 * value. Nothing else: no target, no requirement, no trend, no verdict. How
 * much a person should eat is a professional judgement about that person, and
 * the platform holds no basis for one — the same rule the trend charts follow.
 *
 * The averages state **how many days** they are drawn from, because a mean over
 * three days is not a week and a screen that showed only the number would let
 * it be read as one.
 */

type NutritionDb = Pick<PrismaClientInstance, 'trackingEntry' | 'athlete' | 'measurementType'>;

/**
 * The quantities the table holds, in the order it shows them.
 *
 * The three macronutrients first because they carry the energy total, then
 * fibre and fluid. Deliberately **not** `energy_intake`: that is computed from
 * the three, so a column a coach could type into would invite them to disagree
 * with the arithmetic.
 */
export const NUTRITION_TRACKING_KEYS = [
  'protein',
  'carbohydrates',
  'fat',
  'fibre',
  'fluid_intake',
] as const;

export type NutritionTrackingKey = (typeof NUTRITION_TRACKING_KEYS)[number];

/** The card's key in the trend-card list — the one card that is a table. */
export const NUTRITION_TREND_KEY = 'nutrition';

const trackingKeys = new Set<string>(NUTRITION_TRACKING_KEYS);

export interface NutritionQuantity {
  readonly key: NutritionTrackingKey;
  readonly name: string;
  readonly unit: string;
}

export interface NutritionCell {
  readonly entryId: string;
  readonly value: number;
  /** Who wrote it down. Shown, because the two are not the same evidence (§13). */
  readonly recordedBy: 'ATHLETE' | 'COACH';
}

export interface NutritionDay {
  readonly date: Date;
  readonly values: Readonly<Partial<Record<NutritionTrackingKey, NutritionCell>>>;
  /** The day's energy, or `null` while one of the three macronutrients is absent. */
  readonly energyKcal: number | null;
}

/** A mean, and the number of days it was drawn from. Never one without the other. */
export interface NutritionAverage {
  readonly value: number;
  readonly days: number;
}

export interface NutritionWeek {
  readonly weekStart: Date;
  readonly quantities: readonly NutritionQuantity[];
  readonly days: readonly NutritionDay[];
  readonly averages: Readonly<Partial<Record<NutritionTrackingKey, NutritionAverage>>>;
  readonly energyAverage: NutritionAverage | null;
}

const numberOf = (value: unknown): number | null => {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * The nutrition types of this workspace, by key.
 *
 * The workspace's own definition wins over the system one, exactly as the
 * assessment catalogue resolves it — a workspace that renamed "Trinkmenge" sees
 * its own name here too.
 */
async function typesByKey(
  db: NutritionDb,
  tenant: Pick<TenantContext, 'organizationId'>,
): Promise<Map<string, { id: string; name: string; unit: string }>> {
  const rows = await db.measurementType.findMany({
    where: {
      key: { in: [...NUTRITION_TRACKING_KEYS] },
      archivedAt: null,
      OR: [{ organizationId: tenant.organizationId }, { organizationId: null }],
    },
    select: { id: true, key: true, name: true, unit: true, organizationId: true },
  });

  const byKey = new Map<string, { id: string; name: string; unit: string }>();
  for (const row of rows) {
    const existing = byKey.get(row.key);
    if (!existing || row.organizationId !== null) {
      byKey.set(row.key, { id: row.id, name: row.name, unit: row.unit });
    }
  }

  return byKey;
}

/**
 * One athlete's week.
 *
 * `null` when the athlete is outside the workspace — the same answer every
 * other read in this slice gives, so a caller cannot tell a missing athlete
 * from somebody else's.
 */
export async function nutritionWeek(
  db: NutritionDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  athleteId: string,
  weekStart: Date,
): Promise<NutritionWeek | null> {
  const athlete = await db.athlete.findFirst({
    where: scoped(tenant, { id: athleteId }),
    select: { id: true },
  });

  if (!athlete) return null;

  const byKey = await typesByKey(db, tenant);
  const days = weekDays(weekStart);
  const from = days[0] ?? weekStart;
  // Exclusive: the Monday after, so the last day is included whole.
  const to = new Date((days[6] ?? weekStart).getTime() + 24 * 60 * 60 * 1000);

  const rows = await db.trackingEntry.findMany({
    where: scoped(tenant, {
      athleteId: athlete.id,
      measurementTypeId: { in: [...byKey.values()].map((type) => type.id) },
      capturedAt: { gte: from, lt: to },
    }),
    select: {
      id: true,
      numericValue: true,
      capturedAt: true,
      recordedBy: true,
      measurementType: { select: { key: true } },
    },
    // Oldest first, so a day that somehow carries two readings resolves to the
    // later one rather than to whichever the database happened to return first.
    orderBy: [{ capturedAt: 'asc' }, { id: 'asc' }],
  });

  const cells = new Map<string, NutritionCell>();
  for (const row of rows) {
    const value = numberOf(row.numericValue);
    if (value === null || !trackingKeys.has(row.measurementType.key)) continue;

    cells.set(`${row.capturedAt.toISOString().slice(0, 10)}|${row.measurementType.key}`, {
      entryId: row.id,
      value,
      recordedBy: row.recordedBy,
    });
  }

  const quantities: NutritionQuantity[] = NUTRITION_TRACKING_KEYS.flatMap((key) => {
    const type = byKey.get(key);

    // A workspace whose catalogue is missing one of these gets a table without
    // that column, never a column that cannot be written to.
    return type === undefined ? [] : [{ key, name: type.name, unit: type.unit }];
  });

  const built: NutritionDay[] = days.map((date) => {
    const stamp = date.toISOString().slice(0, 10);
    const values: Partial<Record<NutritionTrackingKey, NutritionCell>> = {};

    for (const quantity of quantities) {
      const cell = cells.get(`${stamp}|${quantity.key}`);
      if (cell !== undefined) values[quantity.key] = cell;
    }

    const grams: Partial<Record<EnergyNutrientKey, number>> = {};
    for (const key of ENERGY_NUTRIENT_KEYS) {
      const cell = values[key];
      if (cell !== undefined) grams[key] = cell.value;
    }

    const energy = calculateEnergyIntake(grams);

    return { date, values, energyKcal: energy.ok ? energy.value.energyKcal : null };
  });

  const averages: Partial<Record<NutritionTrackingKey, NutritionAverage>> = {};
  for (const quantity of quantities) {
    const present = built.flatMap((day) => {
      const cell = day.values[quantity.key];

      return cell === undefined ? [] : [cell.value];
    });

    if (present.length === 0) continue;
    averages[quantity.key] = {
      value: present.reduce((total, value) => total + value, 0) / present.length,
      days: present.length,
    };
  }

  const energyDays = built.flatMap((day) => (day.energyKcal === null ? [] : [day.energyKcal]));

  return {
    weekStart: from,
    quantities,
    days: built,
    averages,
    energyAverage:
      energyDays.length === 0
        ? null
        : {
            value: energyDays.reduce((total, value) => total + value, 0) / energyDays.length,
            days: energyDays.length,
          },
  };
}

export type NutritionWriteRefusal = 'ATHLETE_NOT_FOUND' | 'TYPE_NOT_FOUND' | 'NOT_A_NUTRITION_KEY';

/**
 * Sets one cell.
 *
 * Replaces a value already recorded for that day rather than adding a second,
 * because a day's protein is one figure — see the header. `updateMany` with the
 * tenant in the filter, never a bare `update`: an entry from elsewhere then
 * changes nothing instead of being reached across.
 */
export async function setNutritionValue(
  db: NutritionDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  recorded: { readonly by: 'COACH' | 'ATHLETE'; readonly coachId: string | null },
  input: {
    readonly athleteId: string;
    readonly measurementTypeKey: string;
    /** The day, at UTC midnight. Everything else about the moment is discarded. */
    readonly day: Date;
    readonly value: number;
  },
): Promise<{ ok: true; id: string } | { ok: false; refusal: NutritionWriteRefusal }> {
  if (!trackingKeys.has(input.measurementTypeKey)) {
    // This function replaces what it finds. Letting it write any quantity would
    // silently apply the one-value-per-day rule to body weight, where a second
    // reading on the same day is a legitimate second reading.
    return { ok: false, refusal: 'NOT_A_NUTRITION_KEY' };
  }

  const athlete = await db.athlete.findFirst({
    where: scoped(tenant, { id: input.athleteId }),
    select: { id: true },
  });

  if (!athlete) return { ok: false, refusal: 'ATHLETE_NOT_FOUND' };

  const type = await db.measurementType.findFirst({
    where: {
      key: input.measurementTypeKey,
      archivedAt: null,
      OR: [{ organizationId: tenant.organizationId }, { organizationId: null }],
    },
    select: { id: true },
  });

  if (!type) return { ok: false, refusal: 'TYPE_NOT_FOUND' };

  const day = new Date(
    Date.UTC(input.day.getUTCFullYear(), input.day.getUTCMonth(), input.day.getUTCDate()),
  );
  const next = new Date(day.getTime() + 24 * 60 * 60 * 1000);

  const standing = await db.trackingEntry.findFirst({
    where: scoped(tenant, {
      athleteId: athlete.id,
      measurementTypeId: type.id,
      capturedAt: { gte: day, lt: next },
    }),
    select: { id: true },
    orderBy: [{ capturedAt: 'desc' }, { id: 'desc' }],
  });

  if (standing !== null) {
    await db.trackingEntry.updateMany({
      where: scoped(tenant, { id: standing.id }),
      data: {
        numericValue: input.value,
        capturedAt: day,
        recordedBy: recorded.by,
        recordedByCoachId: recorded.coachId,
      },
    });

    return { ok: true, id: standing.id };
  }

  const entry = await db.trackingEntry.create({
    data: withTenant(tenant, {
      athleteId: athlete.id,
      measurementTypeId: type.id,
      numericValue: input.value,
      capturedAt: day,
      source: 'MANUAL' as const,
      recordedBy: recorded.by,
      recordedByCoachId: recorded.coachId,
    }),
    select: { id: true },
  });

  return { ok: true, id: entry.id };
}

/**
 * Empties one cell.
 *
 * Deleted outright, like every other tracking entry: a self-report is somebody's
 * note about their own Tuesday, not a finding whose history is part of the
 * record (§13).
 */
export async function clearNutritionValue(
  db: NutritionDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  entryId: string,
): Promise<boolean> {
  const { count } = await db.trackingEntry.deleteMany({
    where: scoped(tenant, { id: entryId, measurementType: { key: { in: [...trackingKeys] } } }),
  });

  return count > 0;
}
