'use server';

import { revalidatePath } from 'next/cache';

import { TRPCError } from '@trpc/server';

import type { AssessmentModuleStatus } from '@apex/domain';

import { api } from '@/trpc/server';

/**
 * Thin callers for the test runner. The rules — value type, pass bounds,
 * context keys, legal status transitions, supersede — all live in the
 * procedures and the domain package. Nothing is decided here.
 */

export interface MeasurementActionState {
  message?: string;
  savedSlotKey?: string;
}

function toMessage(error: unknown): string {
  if (error instanceof TRPCError) return error.message;

  console.error('[measurements] unexpected failure', error);

  return 'Something went wrong. Please try again.';
}

export async function recordMeasurementAction(input: {
  moduleId: string;
  measurementTypeId: string;
  value: number | string | boolean;
  side: 'LEFT' | 'RIGHT' | 'BILATERAL';
  passIndex: number | null;
  context: Record<string, string> | null;
  note: string | null;
  slotKey: string;
}): Promise<MeasurementActionState> {
  try {
    await api.assessments.measurements.record({
      moduleId: input.moduleId,
      measurementTypeId: input.measurementTypeId,
      value: input.value,
      side: input.side,
      passIndex: input.passIndex,
      context: input.context,
      note: input.note,
      source: 'MANUAL',
    });
    revalidatePath(`/assessments`, 'layout');

    return { savedSlotKey: input.slotKey };
  } catch (error) {
    return { message: toMessage(error) };
  }
}

/**
 * Corrects a value.
 *
 * The screen offers this wherever a value already exists, and the wording says
 * "correct" rather than "edit" — nothing is overwritten, a new reading
 * supersedes the old one and both stay visible (§4, §13).
 */
export async function correctMeasurementAction(input: {
  measurementId: string;
  value: number | string | boolean;
  note: string | null;
  slotKey: string;
}): Promise<MeasurementActionState> {
  try {
    await api.assessments.measurements.correct({
      measurementId: input.measurementId,
      value: input.value,
      note: input.note,
    });
    revalidatePath(`/assessments`, 'layout');

    return { savedSlotKey: input.slotKey };
  } catch (error) {
    return { message: toMessage(error) };
  }
}

export async function addModuleNoteAction(
  moduleId: string,
  body: string,
): Promise<MeasurementActionState> {
  try {
    await api.assessments.measurements.addNote({ moduleId, body });
    revalidatePath(`/assessments`, 'layout');

    return {};
  } catch (error) {
    return { message: toMessage(error) };
  }
}

/**
 * Moves the test along.
 *
 * Only transitions the domain declares legal succeed; a refusal comes back as a
 * message rather than a silent no-op.
 */
export async function setModuleStatusAction(
  moduleId: string,
  status: AssessmentModuleStatus,
): Promise<MeasurementActionState> {
  try {
    await api.assessments.setModuleStatus({ moduleId, status });
    revalidatePath(`/assessments`, 'layout');

    return {};
  } catch (error) {
    return { message: toMessage(error) };
  }
}
