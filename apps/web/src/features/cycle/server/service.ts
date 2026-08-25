import 'server-only';

import type { PrismaClientInstance } from '@apex/database';
import { scoped, withTenant } from '@apex/database/tenant';
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
  note: string | null;
  recordedBy: 'ATHLETE' | 'COACH';
  recordedByCoachId: string | null;
}

const episodeSelect = {
  id: true,
  startedOn: true,
  endedOn: true,
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
