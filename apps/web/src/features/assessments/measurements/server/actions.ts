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
}

function toMessage(error: unknown): string {
  if (error instanceof TRPCError) return error.message;

  console.error('[measurements] unexpected failure', error);

  return 'Something went wrong. Please try again.';
}

/**
 * Records a remark. `passIndex` narrows it to one stage; null is about the test.
 */
export async function addModuleNoteAction(
  moduleId: string,
  body: string,
  passIndex: number | null = null,
): Promise<MeasurementActionState> {
  try {
    await api.assessments.measurements.addNote({ moduleId, body, passIndex });
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

/** What the coach typed into one cell, ready to be written. */
export type StageEntry =
  | {
      readonly kind: 'record';
      /** The cell it came from — how a refusal finds its way back to a field. */
      readonly slotKey: string;
      readonly input: {
        readonly moduleId: string;
        readonly measurementTypeId: string;
        readonly value: number | string | boolean;
        readonly side: 'LEFT' | 'RIGHT' | 'BILATERAL';
        readonly passIndex: number | null;
        /**
         * Which movement the value was taken during.
         *
         * Required exactly when the test declares exercises, and refused when
         * it declares none — the procedure checks both against the stored
         * configuration. Omitting it made every test that works in movements
         * unsavable: the whole stage came back `EXERCISE_MISSING`.
         */
        readonly exerciseId: string | null;
        readonly context: Record<string, string> | null;
        readonly note: string | null;
      };
    }
  | {
      readonly kind: 'correct';
      readonly slotKey: string;
      readonly input: {
        readonly measurementId: string;
        readonly value: number | string | boolean;
        readonly note: string | null;
      };
    };

/** A refusal, addressed back to the cell the coach typed it in. */
export interface StageFieldError {
  readonly slotKey: string;
  readonly message: string;
}

export interface StageActionState {
  message?: string;
  fieldErrors?: StageFieldError[];
}

/**
 * Saves a whole stage — what "Weiter" calls.
 *
 * A thin caller like the rest: the transaction, the validation and the tenant
 * scope live in the procedure. What this adds is translation in both
 * directions — new values and corrections go down as one list so they share a
 * transaction, and failures come back **by index**, which has to become "this
 * field" before a coach can act on it.
 */
export async function saveStageAction(entries: readonly StageEntry[]): Promise<StageActionState> {
  if (entries.length === 0) return {};

  try {
    await api.assessments.measurements.saveStage({
      entries: entries.map((entry) =>
        entry.kind === 'record'
          ? { kind: 'record' as const, input: { ...entry.input, source: 'MANUAL' as const } }
          : { kind: 'correct' as const, input: entry.input },
      ),
    });
    revalidatePath(`/assessments`, 'layout');

    return {};
  } catch (error) {
    const fieldErrors = toFieldErrors(error, entries);

    return fieldErrors.length > 0 ? { fieldErrors } : { message: toMessage(error) };
  }
}

/**
 * Turns the procedure's indexed failures into per-field messages.
 *
 * Returns an empty list when the failure was not about a particular value — a
 * lost connection, a missing permission — so the caller falls back to one
 * message for the stage instead of blaming a field that was fine.
 */
function toFieldErrors(error: unknown, entries: readonly StageEntry[]): StageFieldError[] {
  const failures = error instanceof TRPCError ? error.cause : null;
  if (!Array.isArray(failures)) return [];

  return failures.flatMap((raw): StageFieldError[] => {
    const failure = raw as { index?: number; failure?: { reason?: string } };
    const slotKey = entries[failure.index ?? -1]?.slotKey;

    return slotKey === undefined
      ? []
      : [{ slotKey, message: reasonToMessage(failure.failure?.reason) }];
  });
}

/**
 * A refusal in words a coach can act on.
 *
 * The reasons are the service's own vocabulary; passing them through would put
 * `VALUE_TYPE_MISMATCH` in front of someone who typed a word into a number
 * field.
 */
function reasonToMessage(reason: string | undefined): string {
  if (reason === 'VALUE_TYPE_MISMATCH') return 'Dieser Wert passt nicht zu dieser Messgröße.';
  if (reason === 'TYPE_NOT_CONFIGURED') return 'Diese Messgröße gehört nicht zu diesem Test.';
  if (reason === 'PASS_INVALID') return 'Diese Stufe gibt es in diesem Test nicht.';
  if (reason === 'CONTEXT_INVALID') return 'Für diesen Wert fehlt eine Angabe.';
  if (reason === 'EXERCISE_NOT_CONFIGURED') return 'Diese Übung gehört nicht zu diesem Test.';
  if (reason === 'EXERCISE_MISSING') return 'Für diesen Wert fehlt die Übung.';
  if (reason === 'TYPE_NOT_AVAILABLE') return 'Diese Messgröße steht nicht zur Verfügung.';
  if (reason === 'MODULE_NOT_CONFIGURED') return 'Dieser Test hat keine lesbare Struktur mehr.';
  if (reason === 'MODULE_NOT_FOUND') return 'Dieser Test ist nicht mehr erreichbar.';
  if (reason === 'MEASUREMENT_NOT_FOUND') return 'Der Wert, der korrigiert werden sollte, fehlt.';
  if (reason === 'ALREADY_SUPERSEDED') return 'Dieser Wert wurde inzwischen korrigiert.';

  return 'Dieser Wert konnte nicht gespeichert werden.';
}
