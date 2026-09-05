import 'server-only';

import type { PrismaClientInstance } from '@apex/database';
import { scoped, withTenant } from '@apex/database/tenant';
import {
  readAllCardRows,
  readTrendCards,
  trendCardsPayload,
  withoutTrendCard,
  withTrendCard,
} from '@apex/domain';
import type { TenantContext } from '@apex/types';

/**
 * Values an athlete or their coach writes down outside an examination.
 *
 * ## Why this is not a Measurement
 *
 * §13 decides it: a Measurement is a fact recorded inside an Assessment and
 * never edited, and `assessmentModuleId` is mandatory precisely so that every
 * Measurement has a professional context. A body weight noted on a Tuesday has
 * no such context and does deserve to be correctable — so it is its own object,
 * sharing the **measurement type** and therefore the unit.
 *
 * ## Which cards a profile shows
 *
 * Stored on the athlete, chosen by the coach, and empty until they choose. The
 * platform does not decide which numbers matter about a person.
 */

type TrackingDb = Pick<PrismaClientInstance, 'trackingEntry' | 'athlete' | 'measurementType'>;

export interface RecordTrackingInput {
  readonly athleteId: string;
  /** The catalogue key, so a caller never has to resolve an id first. */
  readonly measurementTypeKey: string;
  readonly value: number;
  readonly capturedAt: Date;
  readonly note?: string | undefined;
}

export type TrackingRefusal = 'ATHLETE_NOT_FOUND' | 'TYPE_NOT_FOUND';

/**
 * Writes one reading.
 *
 * The athlete is checked inside the tenant rather than trusted from the input —
 * the same rule every write here follows. The measurement type is resolved from
 * its key against this workspace **and** the system catalogue, which is what
 * makes a card choosable before the workspace has ever recorded that quantity.
 */
export async function recordTrackingEntry(
  db: TrackingDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  recorded: { readonly by: 'COACH' | 'ATHLETE'; readonly coachId: string | null },
  input: RecordTrackingInput,
): Promise<{ ok: true; id: string } | { ok: false; refusal: TrackingRefusal }> {
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

  const entry = await db.trackingEntry.create({
    data: withTenant(tenant, {
      athleteId: athlete.id,
      measurementTypeId: type.id,
      numericValue: input.value,
      capturedAt: input.capturedAt,
      source: 'MANUAL' as const,
      recordedBy: recorded.by,
      recordedByCoachId: recorded.coachId,
      ...(input.note === undefined || input.note.trim() === '' ? {} : { note: input.note.trim() }),
    }),
    select: { id: true },
  });

  return { ok: true, id: entry.id };
}

/**
 * Removes one reading.
 *
 * Deleted outright, not superseded. That is the difference §13 draws: a
 * Measurement is a finding whose history is part of the record, a tracking entry
 * is somebody's note about their own Tuesday.
 */
export async function deleteTrackingEntry(
  db: TrackingDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  entryId: string,
): Promise<boolean> {
  const { count } = await db.trackingEntry.deleteMany({
    where: scoped(tenant, { id: entryId }),
  });

  return count > 0;
}

/** One athlete's readings of one quantity, newest first. */
export async function trackingEntriesFor(
  db: TrackingDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  athleteId: string,
  measurementTypeKey: string,
) {
  return db.trackingEntry.findMany({
    where: scoped(tenant, { athleteId, measurementType: { key: measurementTypeKey } }),
    select: {
      id: true,
      numericValue: true,
      capturedAt: true,
      note: true,
      recordedBy: true,
      source: true,
    },
    orderBy: [{ capturedAt: 'desc' }],
    take: 100,
  });
}

/**
 * Adds or removes one card.
 *
 * Read, change, write — rather than a blind overwrite, so a stored order the
 * coach arranged is never lost by a click on a different card.
 */
export async function setTrendCard(
  db: TrackingDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  athleteId: string,
  key: string,
  shown: boolean,
): Promise<boolean> {
  const athlete = await db.athlete.findFirst({
    where: scoped(tenant, { id: athleteId }),
    select: { trendCards: true },
  });

  if (!athlete) return false;

  const current = readTrendCards(athlete.trendCards);
  const next = shown ? withTrendCard(current, key) : withoutTrendCard(current, key);

  const { count } = await db.athlete.updateMany({
    where: scoped(tenant, { id: athleteId }),
    // The row selections travel with the list: they share one payload, and
    // rebuilding only the keys would erase which quantities a table shows.
    data: { trendCards: trendCardsPayload(next, readAllCardRows(athlete.trendCards)) },
  });

  return count > 0;
}

/**
 * Puts the cards in a new order.
 *
 * Only a reordering: any key the athlete does not already have is dropped, and
 * any it has that the caller left out is appended in its old position. A screen
 * that had gone stale would otherwise silently remove a card by omitting it,
 * which is a different operation with a different control.
 *
 * The row selections stored beside the list are carried through untouched — the
 * two live in one payload, and a writer that rebuilt only the keys would erase
 * which quantities the biofeedback table shows.
 */
export async function setTrendCardOrder(
  db: TrackingDb,
  tenant: Pick<TenantContext, 'organizationId'>,
  athleteId: string,
  keys: readonly string[],
): Promise<boolean> {
  const athlete = await db.athlete.findFirst({
    where: scoped(tenant, { id: athleteId }),
    select: { trendCards: true },
  });

  if (!athlete) return false;

  const current = readTrendCards(athlete.trendCards);
  const wanted = keys.filter((key) => current.includes(key));
  const seen = new Set(wanted);
  const next = [...wanted];

  // Anything the caller did not mention keeps its place relative to the rest,
  // appended rather than lost.
  for (const key of current) if (!seen.has(key)) next.push(key);

  const { count } = await db.athlete.updateMany({
    where: scoped(tenant, { id: athleteId }),
    data: { trendCards: trendCardsPayload(next, readAllCardRows(athlete.trendCards)) },
  });

  return count > 0;
}
