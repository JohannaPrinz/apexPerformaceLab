import 'server-only';

import type { PrismaClientInstance } from '@apex/database';
import { scoped, withTenant } from '@apex/database/tenant';
import {
  MAX_CARD_ROWS,
  readAllCardRows,
  readCardRows,
  readTrendCards,
  trendCardsPayload,
  withCardRows,
} from '@apex/domain';
import type { TenantContext } from '@apex/types';

import { weekDays } from '../week';

/**
 * What an athlete reports about their own day.
 *
 * ## Why this is tracking, and subjective on purpose
 *
 * Every row here is a **self-report**. A 7 for stress means what this athlete
 * and this coach have agreed it means; nothing in the platform defines it, and
 * so nothing in the platform interprets it. No reference range, no direction, no
 * target, no verdict — the same rule the trend charts and the nutrition week
 * follow, and here it is not a caution but the nature of the data.
 *
 * That also settles why these are `TrackingEntry` rows and not Measurements
 * (§13): a Measurement is a finding recorded inside an Assessment and never
 * edited, and somebody's note that they slept badly on Tuesday is neither.
 *
 * ## Which rows a card shows
 *
 * Eight by default, and then whatever the coach makes of it — rows can be taken
 * off and quantities of their own added. The selection is stored per athlete in
 * the same payload as the card list (`@apex/domain/athletes/trend-cards`),
 * because it answers the same question: which numbers are followed about this
 * person. **Absent means the default**, empty means the coach removed
 * everything — see that module for why the two must not collapse.
 *
 * A quantity a coach adds becomes a `MeasurementType` owned by the workspace —
 * the mechanism §12 already provides for exactly this. It is therefore
 * available to every athlete of that workspace and to the assessment builder,
 * which is the honest consequence of putting it in the catalogue rather than a
 * surprise.
 *
 * ## The note
 *
 * `TrackingEntry.note`, so it travels with the value it explains — three hours
 * of sleep and the reason for them are one entry. It follows that a note needs
 * a value: a remark attached to nothing has nothing to qualify, and the column
 * that would hold it does not exist.
 */

type BiofeedbackDb = Pick<
  PrismaClientInstance,
  'trackingEntry' | 'athlete' | 'measurementType' | 'coach'
>;

/** The card's key in the trend-card list. */
export const BIOFEEDBACK_TREND_KEY = 'biofeedback';

/**
 * The rows the card ships with.
 *
 * A default, unlike the trend cards themselves, which start empty. The
 * difference is what the two are: a trend card is one quantity out of two dozen
 * and choosing it is a professional judgement; this card **is** the biofeedback
 * table, and shipping it blank would mean every coach configures the same eight
 * rows by hand before it does anything.
 */
export const DEFAULT_BIOFEEDBACK_KEYS = [
  'sleep_duration',
  'sleep_quality',
  'hunger',
  'digestion',
  'stress',
  'cycle_rating',
  'energy_level',
  'training_rating',
] as const;

/** The scale a quantity a coach adds is recorded on. */
export const RATING_UNIT = '1–10';

export interface BiofeedbackQuantity {
  readonly key: string;
  readonly name: string;
  readonly unit: string;
  /** Whether this workspace added it. Shown, so a coach knows what they may rename. */
  readonly ownedByWorkspace: boolean;
}

export interface BiofeedbackCell {
  readonly entryId: string;
  readonly value: number;
  readonly note: string | null;
  /** Who wrote it down — §13 keeps a self-report and a coach's entry apart. */
  readonly recordedBy: 'ATHLETE' | 'COACH';
}

/** A mean, and the number of days it was drawn from. Never one without the other. */
export interface BiofeedbackAverage {
  readonly value: number;
  readonly days: number;
}

export interface BiofeedbackRow {
  readonly quantity: BiofeedbackQuantity;
  /** Seven entries, Monday first. `null` where the day was not written down. */
  readonly cells: readonly (BiofeedbackCell | null)[];
  readonly average: BiofeedbackAverage | null;
}

export interface BiofeedbackWeek {
  readonly weekStart: Date;
  readonly days: readonly Date[];
  readonly rows: readonly BiofeedbackRow[];
  /** Biofeedback quantities the catalogue holds that this card does not show. */
  readonly available: readonly BiofeedbackQuantity[];
}

const numberOf = (value: unknown): number | null => {
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : null;
};

/**
 * A catalogue key from a name a coach typed.
 *
 * German text reaches a key that is `[a-z0-9_]+` and nothing else, because that
 * is what a stored payload is validated against. Umlauts are transliterated the
 * way German itself does it — `ä` is `ae`, not a dropped character — so
 * "Wohlbefinden" and "Übelkeit" both survive as words rather than as fragments.
 */
export function keyFromName(name: string): string {
  const slug = name
    .trim()
    .toLowerCase()
    .replaceAll('ä', 'ae')
    .replaceAll('ö', 'oe')
    .replaceAll('ü', 'ue')
    .replaceAll('ß', 'ss')
    .normalize('NFD')
    // Everything else that carries an accent loses it rather than the letter.
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 36);

  return slug;
}

/** The biofeedback quantities this workspace can draw on, by key. */
async function catalogue(
  db: BiofeedbackDb,
  tenant: Pick<TenantContext, 'organizationId'>,
): Promise<Map<string, BiofeedbackQuantity & { id: string }>> {
  const rows = await db.measurementType.findMany({
    where: {
      category: 'biofeedback',
      archivedAt: null,
      OR: [{ organizationId: tenant.organizationId }, { organizationId: null }],
    },
    select: { id: true, key: true, name: true, unit: true, organizationId: true },
    orderBy: [{ name: 'asc' }],
  });

  const byKey = new Map<string, BiofeedbackQuantity & { id: string }>();
  for (const row of rows) {
    const existing = byKey.get(row.key);
    // The workspace's own definition wins over the system one, exactly as the
    // assessment catalogue resolves it.
    if (existing && row.organizationId === null) continue;

    byKey.set(row.key, {
      id: row.id,
      key: row.key,
      name: row.name,
      unit: row.unit,
      ownedByWorkspace: row.organizationId !== null,
    });
  }

  return byKey;
}

/** The rows this athlete's card shows: their selection, or the default. */
function chosenRows(trendCards: unknown): readonly string[] {
  return readCardRows(trendCards, BIOFEEDBACK_TREND_KEY) ?? DEFAULT_BIOFEEDBACK_KEYS;
}

/**
 * One athlete's week.
 *
 * `null` when the athlete is outside the workspace — the same answer every
 * other read in this slice gives, so a caller cannot tell a missing athlete
 * from somebody else's.
 */
export async function biofeedbackWeek(
  db: BiofeedbackDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  athleteId: string,
  weekStart: Date,
): Promise<BiofeedbackWeek | null> {
  const athlete = await db.athlete.findFirst({
    where: scoped(tenant, { id: athleteId }),
    select: { id: true, trendCards: true },
  });

  if (!athlete) return null;

  const byKey = await catalogue(db, tenant);
  const chosen = chosenRows(athlete.trendCards);
  const days = weekDays(weekStart);
  const from = days[0] ?? weekStart;
  // Exclusive: the Monday after, so the last day is included whole.
  const to = new Date((days[6] ?? weekStart).getTime() + 24 * 60 * 60 * 1000);

  const quantities = chosen.flatMap((key) => {
    const found = byKey.get(key);

    // A row naming a quantity the catalogue no longer holds is dropped rather
    // than shown as a line nothing can be written on.
    return found === undefined ? [] : [found];
  });

  const entries =
    quantities.length === 0
      ? []
      : await db.trackingEntry.findMany({
          where: scoped(tenant, {
            athleteId: athlete.id,
            measurementTypeId: { in: quantities.map((quantity) => quantity.id) },
            capturedAt: { gte: from, lt: to },
          }),
          select: {
            id: true,
            numericValue: true,
            capturedAt: true,
            note: true,
            recordedBy: true,
            measurementType: { select: { key: true } },
          },
          // Oldest first, so a day that somehow carries two readings resolves to
          // the later one rather than to whichever came back first.
          orderBy: [{ capturedAt: 'asc' }, { id: 'asc' }],
        });

  const cells = new Map<string, BiofeedbackCell>();
  for (const row of entries) {
    const value = numberOf(row.numericValue);
    if (value === null) continue;

    cells.set(`${row.measurementType.key}|${row.capturedAt.toISOString().slice(0, 10)}`, {
      entryId: row.id,
      value,
      note: row.note,
      recordedBy: row.recordedBy,
    });
  }

  const rows: BiofeedbackRow[] = quantities.map((quantity) => {
    const week = days.map(
      (day) => cells.get(`${quantity.key}|${day.toISOString().slice(0, 10)}`) ?? null,
    );
    const present = week.flatMap((cell) => (cell === null ? [] : [cell.value]));

    return {
      quantity: {
        key: quantity.key,
        name: quantity.name,
        unit: quantity.unit,
        ownedByWorkspace: quantity.ownedByWorkspace,
      },
      cells: week,
      average:
        present.length === 0
          ? null
          : {
              value: present.reduce((total, value) => total + value, 0) / present.length,
              days: present.length,
            },
    };
  });

  const shown = new Set(chosen);

  return {
    weekStart: from,
    days,
    rows,
    available: [...byKey.values()]
      .filter((quantity) => !shown.has(quantity.key))
      .map(({ key, name, unit, ownedByWorkspace }) => ({ key, name, unit, ownedByWorkspace })),
  };
}

export type BiofeedbackRefusal =
  | 'ATHLETE_NOT_FOUND'
  | 'TYPE_NOT_FOUND'
  | 'NOT_A_BIOFEEDBACK_KEY'
  | 'OUT_OF_SCALE'
  | 'NAME_UNUSABLE'
  | 'TOO_MANY_ROWS';

/**
 * Whether a figure belongs on this quantity's scale.
 *
 * A statement about the **declared unit**, never about the athlete: a quantity
 * that says it is recorded from 1 to 10 cannot hold 50, the same way a length
 * in metres cannot be negative. Anything else is only checked for being a
 * number a day can carry.
 */
function onScale(unit: string, value: number): boolean {
  if (!Number.isFinite(value) || value < 0) return false;

  return unit === RATING_UNIT ? value >= 1 && value <= 10 : value <= 1000;
}

/**
 * Sets one cell, keeping any note already on it.
 *
 * One value per day per quantity: a write for a day that already has one
 * replaces it rather than adding a second, because a table cell with two values
 * has none. `updateMany` with the tenant in the filter, never a bare `update`.
 */
export async function setBiofeedbackValue(
  db: BiofeedbackDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  recorded: { readonly by: 'COACH' | 'ATHLETE'; readonly coachId: string | null },
  input: {
    readonly athleteId: string;
    readonly measurementTypeKey: string;
    /** The day, at UTC midnight. Everything else about the moment is discarded. */
    readonly day: Date;
    readonly value: number;
    /** Given, it replaces the note; omitted, whatever stands is kept. */
    readonly note?: string | null;
  },
): Promise<{ ok: true; id: string } | { ok: false; refusal: BiofeedbackRefusal }> {
  const athlete = await db.athlete.findFirst({
    where: scoped(tenant, { id: input.athleteId }),
    select: { id: true },
  });

  if (!athlete) return { ok: false, refusal: 'ATHLETE_NOT_FOUND' };

  const type = await db.measurementType.findFirst({
    where: {
      key: input.measurementTypeKey,
      category: 'biofeedback',
      archivedAt: null,
      OR: [{ organizationId: tenant.organizationId }, { organizationId: null }],
    },
    select: { id: true, unit: true },
    // The workspace's own definition first, matching the read.
    orderBy: [{ organizationId: 'desc' }],
  });

  // Not "type not found": the category is what makes this the biofeedback
  // table, and writing a body weight through it would apply one-value-per-day
  // to a quantity where a second reading that day is a legitimate one.
  if (!type) return { ok: false, refusal: 'NOT_A_BIOFEEDBACK_KEY' };
  if (!onScale(type.unit, input.value)) return { ok: false, refusal: 'OUT_OF_SCALE' };

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

  const note =
    input.note === undefined
      ? {}
      : { note: input.note === null || input.note.trim() === '' ? null : input.note.trim() };

  if (standing !== null) {
    await db.trackingEntry.updateMany({
      where: scoped(tenant, { id: standing.id }),
      data: {
        numericValue: input.value,
        capturedAt: day,
        recordedBy: recorded.by,
        recordedByCoachId: recorded.coachId,
        ...note,
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
      ...note,
    }),
    select: { id: true },
  });

  return { ok: true, id: entry.id };
}

/**
 * Writes the remark on one entry.
 *
 * Separate from the value because it is a separate act — a coach corrects a
 * figure without touching the reason for it, and adds a reason without
 * restating the figure. The entry has to exist: a remark explains a value, and
 * there is nowhere to put one that explains nothing.
 */
export async function setBiofeedbackNote(
  db: BiofeedbackDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  entryId: string,
  note: string | null,
): Promise<boolean> {
  const { count } = await db.trackingEntry.updateMany({
    where: scoped(tenant, { id: entryId, measurementType: { category: 'biofeedback' } }),
    data: { note: note === null || note.trim() === '' ? null : note.trim() },
  });

  return count > 0;
}

/** Empties one cell. Deleted, never superseded — see §13. */
export async function clearBiofeedbackValue(
  db: BiofeedbackDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  entryId: string,
): Promise<boolean> {
  const { count } = await db.trackingEntry.deleteMany({
    where: scoped(tenant, { id: entryId, measurementType: { category: 'biofeedback' } }),
  });

  return count > 0;
}

/**
 * Replaces which rows this athlete's card shows.
 *
 * Read, change, write — rather than a blind overwrite, so the card list stored
 * beside the rows is never lost by a change to the rows.
 */
export async function setBiofeedbackRows(
  db: BiofeedbackDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  athleteId: string,
  keys: readonly string[],
): Promise<{ ok: true } | { ok: false; refusal: BiofeedbackRefusal }> {
  if (keys.length > MAX_CARD_ROWS) return { ok: false, refusal: 'TOO_MANY_ROWS' };

  const athlete = await db.athlete.findFirst({
    where: scoped(tenant, { id: athleteId }),
    select: { trendCards: true },
  });

  if (!athlete) return { ok: false, refusal: 'ATHLETE_NOT_FOUND' };

  const known = await catalogue(db, tenant);
  // A row naming a quantity this workspace does not have would be a line
  // nothing can be written on. Dropped here rather than at every read.
  const rows = keys.filter((key) => known.has(key));

  const { count } = await db.athlete.updateMany({
    where: scoped(tenant, { id: athleteId }),
    data: {
      trendCards: trendCardsPayload(
        readTrendCards(athlete.trendCards),
        withCardRows(readAllCardRows(athlete.trendCards), BIOFEEDBACK_TREND_KEY, rows),
      ),
    },
  });

  return count > 0 ? { ok: true } : { ok: false, refusal: 'ATHLETE_NOT_FOUND' };
}

/**
 * Adds a quantity of the workspace's own, and puts it on this athlete's card.
 *
 * Two writes that belong together: a catalogue entry nobody can see is not what
 * a coach asked for when they typed a name into a table. A name that already
 * exists in the catalogue is **reused** rather than duplicated — two rows both
 * called "Wohlbefinden" would be two histories of the same thing.
 */
export async function addBiofeedbackQuantity(
  db: BiofeedbackDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  athleteId: string,
  name: string,
): Promise<{ ok: true; key: string } | { ok: false; refusal: BiofeedbackRefusal }> {
  const trimmed = name.trim();
  const base = keyFromName(trimmed);

  // A name of nothing but punctuation reaches an empty key, which no payload
  // would accept. Refused with a reason rather than stored as `_`.
  if (trimmed === '' || base === '') return { ok: false, refusal: 'NAME_UNUSABLE' };

  const athlete = await db.athlete.findFirst({
    where: scoped(tenant, { id: athleteId }),
    select: { id: true, trendCards: true },
  });

  if (!athlete) return { ok: false, refusal: 'ATHLETE_NOT_FOUND' };

  const known = await catalogue(db, tenant);
  const sameName = [...known.values()].find(
    (quantity) => quantity.name.toLowerCase() === trimmed.toLowerCase(),
  );

  let key = sameName?.key ?? base;

  if (sameName === undefined) {
    // The key may still be taken — by a quantity of another category, or by one
    // of another name that slugs the same way. A suffix keeps both.
    const taken = await db.measurementType.findMany({
      where: {
        key: { startsWith: base },
        OR: [{ organizationId: tenant.organizationId }, { organizationId: null }],
      },
      select: { key: true },
    });

    const used = new Set(taken.map((row) => row.key));
    let suffix = 2;
    while (used.has(key)) {
      key = `${base}_${String(suffix)}`;
      suffix += 1;
    }

    await db.measurementType.create({
      data: {
        key,
        name: trimmed,
        unit: RATING_UNIT,
        valueType: 'NUMERIC',
        category: 'biofeedback',
        // Owned by the workspace, which is the mechanism §12 provides for a
        // quantity the platform does not ship. No reference range, like every
        // other type here.
        organizationId: tenant.organizationId,
      },
    });
  }

  const current = readCardRows(athlete.trendCards, BIOFEEDBACK_TREND_KEY) ?? [
    ...DEFAULT_BIOFEEDBACK_KEYS,
  ];

  if (current.includes(key)) return { ok: true, key };
  if (current.length >= MAX_CARD_ROWS) return { ok: false, refusal: 'TOO_MANY_ROWS' };

  await db.athlete.updateMany({
    where: scoped(tenant, { id: athleteId }),
    data: {
      trendCards: trendCardsPayload(
        readTrendCards(athlete.trendCards),
        withCardRows(readAllCardRows(athlete.trendCards), BIOFEEDBACK_TREND_KEY, [...current, key]),
      ),
    },
  });

  return { ok: true, key };
}
