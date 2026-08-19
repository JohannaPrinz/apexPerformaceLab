'use server';

import { revalidatePath } from 'next/cache';

import { TRPCError } from '@trpc/server';

import { api } from '@/trpc/server';

import { createAthleteSchema, updateAthleteSchema } from '../schemas';

/**
 * Server Actions for the athlete forms.
 *
 * Thin callers, deliberately. The business logic and — more importantly — the
 * authorization live in the tRPC procedures; an action that re-implemented
 * either would create a second path to the same data with its own bugs. These
 * functions do three things: parse the form, call the procedure, refresh the
 * affected route.
 */

/** One likely duplicate, flattened to what the warning needs to render it. */
export interface DuplicateWarning {
  readonly id: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly dateOfBirth: string | null;
  readonly email: string | null;
  readonly archived: boolean;
  readonly reason: 'email' | 'name_and_birthdate' | 'name';
}

export interface AthleteFormState {
  /** Field name → first message. Absent when the submission was valid. */
  errors?: Record<string, string>;
  /** A failure that is not tied to one field. */
  message?: string;
  /** Set on success so the form can navigate. */
  athleteId?: string;
  /**
   * Likely duplicates found instead of creating (§7).
   *
   * Present means nothing was written: the coach is being asked, not told. A
   * second submit with `confirmDuplicate` goes ahead.
   */
  duplicates?: DuplicateWarning[];
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
    heightCm: formData.get('heightCm') ?? undefined,
    weightKg: formData.get('weightKg') ?? undefined,
    // Contributed only by the confirm button, and only when that button is the
    // one that submitted the form — which is exactly the signal wanted here.
    confirmDuplicate: formData.get('confirmDuplicate') ?? undefined,
  });

  if (!parsed.success) return { errors: firstIssuePerField(parsed.error.issues) };

  try {
    const result = await api.athletes.create(parsed.data);

    if (result.status === 'duplicates') {
      // Nothing was written. The form re-renders with the warning and keeps
      // every value the coach typed, because it is uncontrolled and the browser
      // never navigated away.
      return {
        duplicates: result.candidates.map(({ athlete, reason }) => ({
          id: athlete.id,
          firstName: athlete.firstName,
          lastName: athlete.lastName,
          dateOfBirth: athlete.dateOfBirth?.toISOString().slice(0, 10) ?? null,
          email: athlete.email,
          archived: athlete.archivedAt !== null,
          reason,
        })),
      };
    }

    revalidatePath('/athletes');

    return { athleteId: result.athlete.id };
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
 * Updates an athlete.
 *
 * `athleteId` is bound by the form, never read from `FormData` — a hidden field
 * would let the browser name which record to write, which is the whole shape of
 * an IDOR. The tenant check still stands behind it (`updateMany` with
 * `scoped()`), so this is defence in depth rather than the only control.
 *
 * **An empty field clears the value.** The form always submits every input, so
 * an emptied box arrives as `''` and `updateAthleteSchema` turns it into `null`.
 * A field the form does not carry at all stays `undefined` and is left
 * untouched — that distinction is why the update schema is written separately
 * from the create schema.
 */
export async function updateAthleteAction(
  athleteId: string,
  _previous: AthleteFormState,
  formData: FormData,
): Promise<AthleteFormState> {
  const parsed = updateAthleteSchema.safeParse({
    athleteId,
    firstName: formData.get('firstName'),
    lastName: formData.get('lastName'),
    dateOfBirth: formData.get('dateOfBirth') ?? undefined,
    email: formData.get('email') ?? undefined,
    phone: formData.get('phone') ?? undefined,
    heightCm: formData.get('heightCm') ?? undefined,
    weightKg: formData.get('weightKg') ?? undefined,
  });

  if (!parsed.success) return { errors: firstIssuePerField(parsed.error.issues) };

  try {
    const athlete = await api.athletes.update(parsed.data);
    revalidatePath('/athletes');
    revalidatePath(`/athletes/${athleteId}`);

    return { athleteId: athlete.id };
  } catch (error) {
    return { message: toMessage(error) };
  }
}

/**
 * One message per field — the first, because a field shows one error at a time.
 */
function firstIssuePerField(
  issues: readonly { path: PropertyKey[]; message: string }[],
): Record<string, string> {
  const errors: Record<string, string> = {};
  for (const issue of issues) {
    const key = issue.path[0];
    if (typeof key === 'string' && !errors[key]) errors[key] = issue.message;
  }

  return errors;
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
