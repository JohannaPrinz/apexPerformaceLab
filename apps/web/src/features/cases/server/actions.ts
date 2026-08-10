'use server';

import { revalidatePath } from 'next/cache';

import { TRPCError } from '@trpc/server';

import { api } from '@/trpc/server';

import { createCaseSchema, type CaseStatusInput } from '../schemas';

/** Thin callers. The authorization lives in the procedures — see the athletes slice. */

export interface CaseFormState {
  errors?: Record<string, string>;
  message?: string;
  caseId?: string;
}

export async function createCaseAction(
  _previous: CaseFormState,
  formData: FormData,
): Promise<CaseFormState> {
  const parsed = createCaseSchema.safeParse({
    athleteId: formData.get('athleteId'),
    title: formData.get('title'),
    description: formData.get('description') ?? undefined,
    type: formData.get('type') ?? undefined,
  });

  if (!parsed.success) {
    const errors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (typeof key === 'string' && !errors[key]) errors[key] = issue.message;
    }

    return { errors };
  }

  try {
    const created = await api.cases.create(parsed.data);
    revalidatePath(`/athletes/${parsed.data.athleteId}`);

    return { caseId: created.id };
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
