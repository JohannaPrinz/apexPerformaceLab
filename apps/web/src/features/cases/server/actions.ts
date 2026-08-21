'use server';

import { revalidatePath } from 'next/cache';

import { TRPCError } from '@trpc/server';

import { api } from '@/trpc/server';

import { createCaseSchema, updateCaseSchema, type CaseStatusInput } from '../schemas';

/** Thin callers. The authorization lives in the procedures — see the athletes slice. */

/** What the coach writes about an engagement — the same three fields either way. */
export interface CaseFields {
  title: string;
  description: string;
  type: 'ONGOING' | 'SINGLE_ASSESSMENT';
}

/**
 * Opens an engagement.
 *
 * Plain arguments rather than `FormData`: the dialog holds its own state and
 * validates before calling, so passing a form object would mean serialising
 * state only to parse it back. The schema still runs here — this action is a
 * caller, not a gate, and the procedure behind it validates again.
 */
export async function createCaseAction(
  athleteId: string,
  fields: CaseFields,
): Promise<{ message?: string; caseId?: string }> {
  const parsed = createCaseSchema.safeParse({ athleteId, ...fields });

  if (!parsed.success) {
    return { message: parsed.error.issues[0]?.message ?? 'Bitte die Eingaben prüfen.' };
  }

  try {
    const created = await api.cases.create(parsed.data);
    revalidatePath(`/athletes/${athleteId}`);

    return { caseId: created.id };
  } catch (error) {
    return { message: toMessage(error) };
  }
}

/**
 * Corrects an engagement.
 *
 * An emptied description is an instruction to remove it, not an untouched
 * field — the same rule the athlete form follows, and the reason the schema
 * turns `''` into `null` rather than into absence.
 */
export async function updateCaseAction(
  caseId: string,
  athleteId: string,
  fields: CaseFields,
): Promise<{ message?: string }> {
  const parsed = updateCaseSchema.safeParse({ caseId, ...fields });

  if (!parsed.success) {
    return { message: parsed.error.issues[0]?.message ?? 'Bitte die Eingaben prüfen.' };
  }

  try {
    await api.cases.update(parsed.data);
    revalidatePath(`/athletes/${athleteId}`);

    return {};
  } catch (error) {
    return { message: toMessage(error) };
  }
}

export async function setCaseStatusAction(
  caseId: string,
  status: CaseStatusInput,
  athleteId: string,
): Promise<{ message?: string }> {
  try {
    await api.cases.setStatus({ caseId, status });
    revalidatePath(`/athletes/${athleteId}`);

    return {};
  } catch (error) {
    return { message: toMessage(error) };
  }
}

function toMessage(error: unknown): string {
  if (error instanceof TRPCError) return error.message;

  console.error('[cases] unexpected failure', error);

  return 'Something went wrong. Please try again.';
}
