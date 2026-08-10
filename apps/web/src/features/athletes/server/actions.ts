'use server';

import { revalidatePath } from 'next/cache';

import { TRPCError } from '@trpc/server';

import { api } from '@/trpc/server';

import { createAthleteSchema } from '../schemas';

/**
 * Server Actions for the athlete forms.
 *
 * Thin callers, deliberately. The business logic and — more importantly — the
 * authorization live in the tRPC procedures; an action that re-implemented
 * either would create a second path to the same data with its own bugs. These
 * functions do three things: parse the form, call the procedure, refresh the
 * affected route.
 */

export interface AthleteFormState {
  /** Field name → first message. Absent when the submission was valid. */
  errors?: Record<string, string>;
  /** A failure that is not tied to one field. */
  message?: string;
  /** Set on success so the form can navigate. */
  athleteId?: string;
}

export async function createAthleteAction(
  _previous: AthleteFormState,
  formData: FormData,
): Promise<AthleteFormState> {
  // A field absent from the form is `null`; an untouched one is `''`. The
  // schema treats both as absence, so nothing has to be normalised here.
  const parsed = createAthleteSchema.safeParse({
    firstName: formData.get('firstName'),
    lastName: formData.get('lastName'),
    dateOfBirth: formData.get('dateOfBirth') ?? undefined,
    email: formData.get('email') ?? undefined,
    phone: formData.get('phone') ?? undefined,
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
    const athlete = await api.athletes.create(parsed.data);
    revalidatePath('/athletes');

    return { athleteId: athlete.id };
  } catch (error) {
    return { message: toMessage(error) };
  }
}

export async function setAthleteArchivedAction(
  athleteId: string,
  archived: boolean,
): Promise<{ message?: string }> {
  try {
    await api.athletes.setArchived({ athleteId, archived });
    revalidatePath('/athletes');
    revalidatePath(`/athletes/${athleteId}`);

    return {};
  } catch (error) {
    return { message: toMessage(error) };
  }
}

/**
 * Turns a procedure failure into something a person can read.
 *
 * A tRPC error carries a message written for this purpose; anything else is
 * unexpected and must not be surfaced verbatim — an unhandled database error
 * can contain column names, constraint names and occasionally data.
 */
function toMessage(error: unknown): string {
  if (error instanceof TRPCError) return error.message;

  console.error('[athletes] unexpected failure', error);

  return 'Something went wrong. Please try again.';
}
