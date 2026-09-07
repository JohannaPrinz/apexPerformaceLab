'use server';

import { revalidatePath } from 'next/cache';

import { api } from '@/trpc/server';

/**
 * The athlete's own writes, from the portal (§21).
 *
 * ## Why these exist beside the coach's actions rather than instead of them
 *
 * They look like the athlete slice's actions with one argument missing, and
 * that missing argument is the whole point: **no athlete is passed**. The
 * procedures behind these resolve the record from the session, so there is
 * nothing in the request that decides whose day is being written down.
 *
 * The coach's actions still take an id, because a coach legitimately writes for
 * whichever athlete they have open. Merging the two would mean one procedure
 * that sometimes trusts an id and sometimes does not, and the case it got wrong
 * would be the one nobody tested.
 *
 * Every entry these produce carries `recordedBy: ATHLETE`, decided in the
 * procedure and never sent from here.
 */
export interface PortalWriteState {
  readonly message?: string;
}

const failed = (error: unknown, fallback: string): PortalWriteState => ({
  message: error instanceof Error ? error.message : fallback,
});

/** One page, so a saved value shows up wherever it is read. */
const refresh = () => {
  revalidatePath('/portal');
};

export async function setPortalNutritionAction(
  measurementTypeKey: string,
  day: Date,
  value: number,
): Promise<PortalWriteState> {
  try {
    await api.portal.setNutritionValue({ measurementTypeKey, day, value });
  } catch (error) {
    return failed(error, 'Der Wert konnte nicht gespeichert werden.');
  }

  refresh();

  return {};
}

export async function clearPortalNutritionAction(entryId: string): Promise<PortalWriteState> {
  try {
    await api.portal.clearNutritionValue({ entryId });
  } catch (error) {
    return failed(error, 'Der Wert konnte nicht entfernt werden.');
  }

  refresh();

  return {};
}

export async function setPortalBiofeedbackAction(
  measurementTypeKey: string,
  day: Date,
  value: number,
): Promise<PortalWriteState> {
  try {
    await api.portal.setBiofeedbackValue({ measurementTypeKey, day, value });
  } catch (error) {
    return failed(error, 'Der Wert konnte nicht gespeichert werden.');
  }

  refresh();

  return {};
}

export async function clearPortalBiofeedbackAction(entryId: string): Promise<PortalWriteState> {
  try {
    await api.portal.clearBiofeedbackValue({ entryId });
  } catch (error) {
    return failed(error, 'Der Wert konnte nicht entfernt werden.');
  }

  refresh();

  return {};
}

/** The remark that explains a value — why the night was three hours long. */
export async function setPortalBiofeedbackNoteAction(
  entryId: string,
  note: string | null,
): Promise<PortalWriteState> {
  try {
    await api.portal.setBiofeedbackNote({ entryId, note });
  } catch (error) {
    return failed(error, 'Die Bemerkung konnte nicht gespeichert werden.');
  }

  refresh();

  return {};
}

export async function setPortalBleedingDayAction(
  day: string,
  intensity: 'SPOTTING' | 'LIGHT' | 'MEDIUM' | 'HEAVY' | null,
): Promise<PortalWriteState> {
  try {
    await api.portal.setBleedingDay({ day, intensity });
  } catch (error) {
    return failed(error, 'Der Tag konnte nicht gespeichert werden.');
  }

  refresh();

  return {};
}

export async function removePortalBleedingAction(episodeId: string): Promise<PortalWriteState> {
  try {
    await api.portal.removeBleeding({ episodeId });
  } catch (error) {
    return failed(error, 'Der Eintrag blieb stehen.');
  }

  refresh();

  return {};
}
