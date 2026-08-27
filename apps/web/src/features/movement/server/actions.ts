'use server';

import { revalidatePath } from 'next/cache';

import { TRPCError } from '@trpc/server';

import {
  planMeasurements,
  storableOf,
  type AngleTargetConfig,
  type MovementValue,
  type PlanDecisions,
  type PlannedMeasurement,
} from '@apex/domain';

import { api } from '@/trpc/server';

/**
 * Writing what a video analysis worked out.
 *
 * ## Nothing new is written, and nothing new writes it
 *
 * This calls `measurements.recordMany` — the same procedure the entry screen
 * uses, with the same validation, the same transaction and the same tenant
 * scope. There is deliberately no video-analysis mutation, no second measurement
 * path and no service of its own: a value derived from a video is a Measurement
 * like any other, distinguished by `source: DERIVED` and by a remark, not by a
 * parallel architecture.
 *
 * What the client sends is therefore already constrained by the module's stored
 * configuration: a measurement type the test does not record, a context key it
 * did not declare or a stage it does not have is refused by the procedure, not
 * by trust in this file.
 *
 * ## The workspace is never taken from the request
 *
 * No `organizationId` crosses the wire. The procedure reads the tenant from the
 * session and scopes the module lookup by it, so a module id belonging to
 * another workspace resolves to nothing at all.
 *
 * ## What is not stored
 *
 * The video, and the landmarks. The recording never leaves the browser in this
 * MVP, and raw pose data is not a measurement — see the slice README for what
 * would have to be built before either changes.
 */

export interface SaveAnalysisState {
  message?: string;
  savedCount?: number;
}

/** What came back from filing a standalone analysis. */
export interface StandaloneSaveState {
  message?: string;
  savedCount?: number;
  /** Values the test could not hold, so the screen never overstates the save. */
  refused?: number;
  moduleId?: string;
  assessmentId?: string;
  /** Whether the athlete's video-analysis test had to be opened for this. */
  createdTest?: boolean;
}

function toMessage(error: unknown): string {
  if (error instanceof TRPCError) return error.message;

  console.error('[movement] unexpected failure', error);

  return 'Die Ergebnisse konnten nicht gespeichert werden. Bitte erneut versuchen.';
}

/**
 * Saves the derived values, and optionally the coach's remark about the test.
 *
 * The remark is a Note on the module (§20) — the mechanism that already exists
 * for "what the coach makes of this test". An Insight would be the richer home
 * for an interpretation, but that slice is not built; writing one here would
 * mean inventing half of it.
 */
export async function saveVideoAnalysisAction(
  moduleId: string,
  planned: readonly PlannedMeasurement[],
  note: string | null,
  capturedAt: string,
): Promise<SaveAnalysisState> {
  const trimmed = note?.trim() ?? '';

  if (planned.length === 0 && trimmed === '') {
    return { message: 'Es wurde nichts zum Speichern ausgewählt.' };
  }

  try {
    if (planned.length > 0) {
      await api.assessments.measurements.recordMany({
        measurements: planned.map((entry) => ({
          moduleId,
          measurementTypeId: entry.measurementTypeId,
          value: entry.value,
          side: entry.side,
          exerciseId: entry.exerciseId,
          passIndex: entry.passIndex,
          context: entry.context,
          note: entry.note,
          // What makes these values readable as computed rather than measured
          // by hand, everywhere they later appear.
          source: 'DERIVED',
          capturedAt,
        })),
      });
    }

    if (trimmed !== '') {
      await api.assessments.measurements.addNote({ moduleId, body: trimmed, passIndex: null });
    }

    revalidatePath('/assessments', 'layout');

    return { savedCount: planned.length };
  } catch (error) {
    return { message: toMessage(error) };
  }
}

/**
 * Files a standalone analysis under an athlete.
 *
 * ## Why the plan is made here and not in the browser
 *
 * The coach chose an athlete, not a test. Which test the values land in — and
 * therefore which of them can be stored at all — is only known once the server
 * has found or opened that test. Planning in the browser would mean guessing a
 * configuration and discovering the mismatch at the write.
 *
 * The values themselves come from the browser because that is where the video
 * was analysed and where the coach corrected them. They are numbers; the server
 * decides what may be done with them, and `recordMany` validates every one
 * against the module's stored configuration regardless.
 *
 * ## One instant per analysis
 *
 * Every value shares a single `capturedAt`. That is what makes "the analyses in
 * this test" answerable without a new concept — see `analysis-target.ts` for why
 * they are not passes.
 */
export interface StandaloneSaveInput {
  readonly athleteId: string;
  readonly purpose: string;
  readonly profileKey: string;
  readonly tracks: readonly string[];
  readonly targets: readonly AngleTargetConfig[];
  readonly exerciseId: string;
  readonly values: readonly MovementValue[];
  readonly decisions: PlanDecisions;
  readonly note: string;
  readonly capturedAt: string;
}

export async function saveStandaloneAnalysisAction({
  athleteId,
  purpose,
  profileKey,
  tracks,
  targets,
  values,
  decisions,
  note,
  capturedAt,
}: StandaloneSaveInput): Promise<StandaloneSaveState> {
  try {
    const target = await api.assessments.openAnalysisTarget({
      athleteId,
      purpose,
      profileKey,
      tracks: [...tracks],
      targets: [...targets],
    });

    const entries = planMeasurements(
      values,
      target.configuration,
      target.typeKeys,
      decisions,
      purpose,
    );
    const planned = storableOf(entries);

    if (planned.length > 0) {
      await api.assessments.measurements.recordMany({
        measurements: planned.map((entry) => ({
          moduleId: target.moduleId,
          measurementTypeId: entry.measurementTypeId,
          value: entry.value,
          side: entry.side,
          exerciseId: entry.exerciseId,
          passIndex: entry.passIndex,
          context: entry.context,
          note: entry.note,
          source: 'DERIVED' as const,
          capturedAt,
        })),
      });
    }

    const body = note.trim();
    if (body !== '') {
      await api.assessments.measurements.addNote({
        moduleId: target.moduleId,
        body,
        passIndex: null,
      });
    }

    revalidatePath('/assessments', 'layout');
    revalidatePath('/athletes', 'layout');

    return {
      savedCount: planned.length,
      moduleId: target.moduleId,
      assessmentId: target.assessmentId,
      createdTest: target.created,
      // Named so the screen can say what could not be filed rather than
      // implying everything was.
      refused: entries.filter((entry) => entry.kind === 'refused').length,
    };
  } catch (error) {
    return { message: toMessage(error) };
  }
}
