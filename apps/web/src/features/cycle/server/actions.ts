'use server';

import { revalidatePath } from 'next/cache';

import type { BleedingIntensity } from '@apex/domain';

import { api } from '@/trpc/server';

import { recordBleedingSchema, removeBleedingSchema } from '../schemas';

/**
 * Form entry points for the bleeding log.
 *
 * Thin on purpose: the rules are in the service and the procedure, and an
 * action that re-stated any of them would be a second place for them to drift.
 * What it does own is turning a refusal into a sentence a form can show.
 */
export interface BleedingFormState {
  readonly status: 'idle' | 'error' | 'saved';
  readonly message?: string;
  readonly errors?: Record<string, string>;
}

export async function recordBleedingAction(
  _state: BleedingFormState,
  formData: FormData,
): Promise<BleedingFormState> {
  const parsed = recordBleedingSchema.safeParse({
    athleteId: formData.get('athleteId'),
    startedOn: formData.get('startedOn'),
    endedOn: formData.get('endedOn'),
    note: formData.get('note'),
  });

  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const field = issue.path[0];
      if (typeof field === 'string' && !(field in errors)) errors[field] = issue.message;
    }

    return { status: 'error', errors };
  }

  try {
    await api.cycle.record(parsed.data);
  } catch (error) {
    return {
      status: 'error',
      message:
        error instanceof Error ? error.message : 'Der Eintrag konnte nicht gespeichert werden.',
    };
  }

  revalidatePath(`/athletes/${parsed.data.athleteId}`);

  return { status: 'saved' };
}

export async function removeBleedingAction(
  athleteId: string,
  _state: BleedingFormState,
  formData: FormData,
): Promise<BleedingFormState> {
  const parsed = removeBleedingSchema.safeParse({ episodeId: formData.get('episodeId') });
  if (!parsed.success) return { status: 'error', message: 'Eintrag nicht gefunden.' };

  try {
    await api.cycle.remove(parsed.data);
  } catch (error) {
    return {
      status: 'error',
      message: error instanceof Error ? error.message : 'Der Eintrag konnte nicht entfernt werden.',
    };
  }

  revalidatePath(`/athletes/${athleteId}`);

  return { status: 'saved' };
}

/**
 * Marks one day of the calendar, or clears it.
 *
 * A plain argument list rather than a `FormData` action: the calendar is a grid
 * of buttons, not a form, and building a `FormData` per click would be
 * ceremony around three values.
 */
export async function setBleedingDayAction(
  athleteId: string,
  day: string,
  intensity: BleedingIntensity | null,
): Promise<{ message?: string }> {
  try {
    await api.cycle.setDay({ athleteId, day, intensity });
    revalidatePath(`/athletes/${athleteId}`);

    return {};
  } catch (error) {
    return {
      message: error instanceof Error ? error.message : 'Der Tag konnte nicht gespeichert werden.',
    };
  }
}
