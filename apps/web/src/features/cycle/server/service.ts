import 'server-only';

import type { PrismaClientInstance } from '@apex/database';
import { scoped, withTenant } from '@apex/database/tenant';
import { readBleedingIntensity, type BleedingIntensity } from '@apex/domain';
import type { TenantContext } from '@apex/types';

import type { ListBleedingInput, RecordBleedingInput, RemoveBleedingInput } from '../schemas';

/**
 * Documented menstrual bleeding.
 *
 * ## Independent of Assessments, by construction
 *
 * Nothing here touches a Module, an Assessment or a Measurement. A bleeding is
 * not produced by a test and does not belong to a session: it stands alone in
 * time, which is the shape `CORE_OBJECTS` gives everything the athlete records
 * about themselves. Filing it as a Measurement would place it inside an
 * examination that never happened.
 *
 * ## What it will not compute
 *
 * Cycle length, phase, a fertile window, a readiness score — none of them. The
 * record holds what was observed; a hormonal phase inferred from two dates is a
 * claim the data does not support, and a performance judgement drawn from one
 * would be a claim on top of a claim. The read returns episodes, ordered.
 *
 * ## Correctable, unlike a Measurement
 *
 * A Measurement is a diagnostic finding and is never edited (§13, §4). A
 * self-recorded date is not: a bleeding entered on the wrong day is a slip, and
 * the person who made it may remove it. That is the documented difference
 * between the two kinds of record, not a relaxation of the rule.
 */

type CycleDb = Pick<PrismaClientInstance, 'bleedingEpisode' | 'athlete'>;

export interface BleedingEpisodeRecord {
  id: string;
  startedOn: Date;
  endedOn: Date | null;
  intensity: BleedingIntensity | null;
  note: string | null;
  recordedBy: 'ATHLETE' | 'COACH';
  recordedByCoachId: string | null;
}

const episodeSelect = {
  id: true,
  startedOn: true,
  endedOn: true,
  intensity: true,
  note: true,
  recordedBy: true,
  recordedByCoachId: true,
} as const;

export type RecordBleedingResult =
  | { ok: true; episode: BleedingEpisodeRecord }
  | { ok: false; reason: 'ATHLETE_NOT_FOUND' }
  | { ok: false; reason: 'ALREADY_RECORDED' };

/**
 * A day, read as a day.
 *
 * `new Date('2026-03-04')` is midnight **UTC**, which is what a `@db.Date`
 * column stores and returns. Parsing it any other way would shift the entry by
 * a day for anyone east or west of Greenwich.
 */
const asDay = (iso: string): Date => new Date(`${iso}T00:00:00.000Z`);

/**
 * Records a bleeding for an athlete of this workspace.
 *
 * The athlete is verified inside the tenant first, so a foreign id is a
 * `NOT_FOUND` rather than a foreign-key error — the same answer every other
 * read gives, which is what stops an id from being probed for existence.
 */
export async function recordBleeding(
  db: CycleDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  input: RecordBleedingInput,
  author: { recordedBy: 'ATHLETE' | 'COACH'; coachId: string | null },
): Promise<RecordBleedingResult> {
  const athlete = await db.athlete.findFirst({
    where: scoped(tenant, { id: input.athleteId }),
    select: { id: true },
  });

  if (!athlete) return { ok: false, reason: 'ATHLETE_NOT_FOUND' };

  const startedOn = asDay(input.startedOn);

  // Both the athlete and their coach may enter the same first day. The second
  // one is a duplicate, not a second bleeding — refused with a reason a form
  // can show rather than left to the unique index.
  const existing = await db.bleedingEpisode.findFirst({
    where: scoped(tenant, { athleteId: athlete.id, startedOn }),
    select: { id: true },
  });

  if (existing) return { ok: false, reason: 'ALREADY_RECORDED' };

  const episode = await db.bleedingEpisode.create({
    data: withTenant(tenant, {
      athleteId: athlete.id,
      startedOn,
      endedOn: input.endedOn ? asDay(input.endedOn) : null,
      note: input.note ?? null,
      recordedBy: author.recordedBy,
      // Set only for a coach — the pair is a database constraint as well, so a
      // writer that got this wrong would be refused rather than stored.
      recordedByCoachId: author.recordedBy === 'COACH' ? author.coachId : null,
    }),
    select: episodeSelect,
  });

  return { ok: true, episode };
}

/**
 * One athlete's documented bleedings, newest first.
 *
 * Newest first because that is the question being asked — when was the last
 * one. A chart over time reverses it, which is a display concern.
 */
export async function listBleeding(
  db: CycleDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  input: ListBleedingInput,
): Promise<BleedingEpisodeRecord[] | null> {
  const athlete = await db.athlete.findFirst({
    where: scoped(tenant, { id: input.athleteId }),
    select: { id: true },
  });

  if (!athlete) return null;

  return db.bleedingEpisode.findMany({
    where: scoped(tenant, { athleteId: athlete.id }),
    select: episodeSelect,
    orderBy: [{ startedOn: 'desc' }],
  });
}

/**
 * One day of one month, as the calendar draws it.
 *
 * `intensity` is null both for a day nothing was recorded on and for one
 * recorded before strengths existed; `marked` is what tells the two apart. A
 * screen that only had the strength would draw a documented bleeding as an
 * empty day.
 */
export interface BleedingDay {
  /** UTC midnight, like every date this slice handles. */
  readonly date: Date;
  readonly marked: boolean;
  readonly intensity: BleedingIntensity | null;
  /** The entry behind it, so a click knows what it is changing. */
  readonly episodeId: string | null;
  /**
   * Whether the entry covers more than this one day.
   *
   * Entries written before the calendar are ranges. The calendar cannot split
   * one without inventing a strength for the days it did not touch, so it says
   * so instead and offers to remove the entry whole.
   */
  readonly partOfRange: boolean;
  readonly note: string | null;
  readonly recordedBy: 'ATHLETE' | 'COACH' | null;
}

export interface BleedingMonth {
  /** The first of the month, UTC midnight. */
  readonly month: Date;
  readonly days: readonly BleedingDay[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

const dayCount = (year: number, month: number): number =>
  new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

/**
 * One athlete's month.
 *
 * Every day of it, marked or not — the calendar draws a grid and a grid needs
 * every cell, not only the ones with something in them. `null` when the athlete
 * is outside the workspace, the same answer every other read here gives.
 */
export async function bleedingMonth(
  db: CycleDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  athleteId: string,
  month: Date,
): Promise<BleedingMonth | null> {
  const athlete = await db.athlete.findFirst({
    where: scoped(tenant, { id: athleteId }),
    select: { id: true },
  });

  if (!athlete) return null;

  const first = new Date(Date.UTC(month.getUTCFullYear(), month.getUTCMonth(), 1));
  const total = dayCount(first.getUTCFullYear(), first.getUTCMonth());
  const next = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 1));

  /**
   * Two kinds of entry reach this month: one that begins in it, and a range
   * that began earlier and runs into it.
   *
   * Deliberately **not** "anything before the month with no end". A missing
   * `endedOn` means the end was not written down, not that the bleeding never
   * stopped — the same reading the write uses. Asking the other way pulled in
   * every open entry the athlete ever had, which was harmless here only
   * because the expansion below bounds them to one day each.
   */
  const episodes = await db.bleedingEpisode.findMany({
    where: scoped(tenant, {
      athleteId: athlete.id,
      OR: [
        { startedOn: { gte: first, lt: next } },
        { startedOn: { lt: first }, endedOn: { gte: first } },
      ],
    }),
    select: episodeSelect,
    orderBy: [{ startedOn: 'asc' }],
  });

  const byDay = new Map<string, { episode: BleedingEpisodeRecord; range: boolean }>();
  for (const episode of episodes) {
    const last = episode.endedOn ?? episode.startedOn;
    const range = last.getTime() !== episode.startedOn.getTime();

    for (
      let day = new Date(episode.startedOn.getTime());
      day.getTime() <= last.getTime();
      day = new Date(day.getTime() + DAY_MS)
    ) {
      if (day < first || day >= next) continue;
      byDay.set(day.toISOString().slice(0, 10), { episode, range });
    }
  }

  const days: BleedingDay[] = [];
  for (let index = 0; index < total; index += 1) {
    const date = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), index + 1));
    const found = byDay.get(date.toISOString().slice(0, 10));

    days.push({
      date,
      marked: found !== undefined,
      intensity: readBleedingIntensity(found?.episode.intensity),
      episodeId: found?.episode.id ?? null,
      partOfRange: found?.range ?? false,
      note: found?.episode.note ?? null,
      recordedBy: found?.episode.recordedBy ?? null,
    });
  }

  return { month: first, days };
}

export type SetBleedingDayResult =
  | { ok: true }
  | { ok: false; reason: 'ATHLETE_NOT_FOUND' }
  | { ok: false; reason: 'PART_OF_RANGE' };

/**
 * Marks one day, or clears it.
 *
 * `null` removes the day's entry — the same control that made it, so a mistaken
 * mark needs no second gesture to undo.
 *
 * **A day inside a multi-day entry is refused.** Those exist only from before
 * the calendar; changing one would mean splitting the entry in three and
 * inventing a strength for the days nobody touched. The refusal travels with a
 * reason, so the screen can offer what it can actually do — remove the entry
 * whole.
 */
export async function setBleedingDay(
  db: CycleDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  input: {
    readonly athleteId: string;
    /** A calendar day, `2026-03-04`. */
    readonly day: string;
    readonly intensity: BleedingIntensity | null;
  },
  author: { recordedBy: 'ATHLETE' | 'COACH'; coachId: string | null },
): Promise<SetBleedingDayResult> {
  const athlete = await db.athlete.findFirst({
    where: scoped(tenant, { id: input.athleteId }),
    select: { id: true },
  });

  if (!athlete) return { ok: false, reason: 'ATHLETE_NOT_FOUND' };

  const day = asDay(input.day);

  /**
   * Anything covering this day: the entry for the day itself, or a range that
   * encloses it.
   *
   * **An entry with no `endedOn` covers its first day and nothing else.** It
   * used to be asked for as `startedOn <= day AND (endedOn IS NULL OR endedOn
   * >= day)`, which reads a missing end as "still running" — so a single entry
   * from August refused every later day for ever, and a coach with one in their
   * record could mark nothing at all.
   *
   * `endedOn` is optional because the first day is what people actually track
   * (see the model), so its absence means *the end was not written down*, not
   * *it never ended*. The month read has always expanded such an entry over one
   * day (`endedOn ?? startedOn`); this is the write agreeing with it.
   */
  const covering = await db.bleedingEpisode.findFirst({
    where: scoped(tenant, {
      athleteId: athlete.id,
      OR: [{ startedOn: day }, { startedOn: { lt: day }, endedOn: { gte: day } }],
    }),
    select: { id: true, startedOn: true, endedOn: true },
    orderBy: [{ startedOn: 'desc' }],
  });

  const coversOneDay =
    covering !== null &&
    covering.startedOn.getTime() === day.getTime() &&
    (covering.endedOn ?? covering.startedOn).getTime() === covering.startedOn.getTime();

  if (covering !== null && !coversOneDay) return { ok: false, reason: 'PART_OF_RANGE' };

  if (input.intensity === null) {
    if (covering !== null) {
      // `deleteMany` with the tenant in the filter, never `delete` by id.
      await db.bleedingEpisode.deleteMany({ where: scoped(tenant, { id: covering.id }) });
    }

    return { ok: true };
  }

  if (covering !== null) {
    await db.bleedingEpisode.updateMany({
      where: scoped(tenant, { id: covering.id }),
      data: {
        intensity: input.intensity,
        recordedBy: author.recordedBy,
        recordedByCoachId: author.recordedBy === 'COACH' ? author.coachId : null,
      },
    });

    return { ok: true };
  }

  await db.bleedingEpisode.create({
    data: withTenant(tenant, {
      athleteId: athlete.id,
      // The day is both the first and the last: the calendar records days, and
      // the unique index on (athlete, first day) is what makes that one row.
      startedOn: day,
      endedOn: day,
      intensity: input.intensity,
      recordedBy: author.recordedBy,
      recordedByCoachId: author.recordedBy === 'COACH' ? author.coachId : null,
    }),
    select: { id: true },
  });

  return { ok: true };
}

/**
 * Removes an entry.
 *
 * `deleteMany` with the tenant in the filter, never `delete` by id: a bare
 * delete would act on the row before anyone checked whose workspace it is in,
 * and a count of zero is the only honest way to report "not yours" without
 * confirming the id exists.
 */
export async function removeBleeding(
  db: CycleDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  input: RemoveBleedingInput,
): Promise<{ ok: boolean }> {
  const { count } = await db.bleedingEpisode.deleteMany({
    where: scoped(tenant, { id: input.episodeId }),
  });

  return { ok: count > 0 };
}
