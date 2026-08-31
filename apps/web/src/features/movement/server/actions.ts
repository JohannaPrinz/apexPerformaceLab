'use server';

import { randomBytes } from 'node:crypto';

import { revalidatePath } from 'next/cache';

import { TRPCError } from '@trpc/server';

import {
  analysisStillKey,
  planMeasurements,
  storableOf,
  STILL_CONTENT_TYPE,
  type AngleTargetConfig,
  type MovementAnalysisConfig,
  type MovementValue,
  type PlanDecisions,
  type PlannedMeasurement,
} from '@apex/domain';

import { putObject } from '@/integrations/object-store';
import { routeTenant } from '@/server/tenant';
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
  /** Which examination to file into. Empty opens one for this analysis alone. */
  readonly assessmentId?: string | undefined;
  readonly profileKey: string;
  readonly tracks: readonly string[];
  readonly targets: readonly AngleTargetConfig[];
  readonly exerciseId: string;
  readonly values: readonly MovementValue[];
  readonly decisions: PlanDecisions;
  readonly note: string;
  readonly capturedAt: string;
  /**
   * The shape of the movement, as the run measured it.
   *
   * Filed with the test so the athlete's profile and the assessment's analysis
   * can draw the course and the tempo — without it there are angles and no
   * analysis.
   */
  readonly movement: MovementAnalysisConfig;
}

export async function saveStandaloneAnalysisAction({
  athleteId,
  purpose,
  assessmentId,
  profileKey,
  tracks,
  targets,
  values,
  decisions,
  note,
  capturedAt,
  movement,
}: StandaloneSaveInput): Promise<StandaloneSaveState> {
  try {
    const target = await api.assessments.openAnalysisTarget({
      athleteId,
      ...(assessmentId === undefined || assessmentId === '' ? {} : { assessmentId }),
      purpose,
      profileKey,
      tracks: [...tracks],
      targets: [...targets],
    });

    /**
     * What the run measured, filed against the test that was just opened.
     *
     * The assessment-bound screen has always done this; this path did not, and
     * the consequence was invisible in the only place it mattered: an analysis
     * assigned to an athlete produced angles and no analysis, so the athlete's
     * profile said no movement had been analysed. Without the result there is a
     * curve nobody can draw.
     */
    await api.assessments.recordMovementAnalysis({ moduleId: target.moduleId, movement });

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

/**
 * Puts one still of a movement analysis into the object store.
 *
 * ## Why the workspace is looked up rather than sent
 *
 * The key carries the organisation, and the key is what the serving route uses
 * to refuse another workspace. If the browser supplied it, that boundary would
 * be a value the browser chose. So the module is resolved through the ordinary
 * tenant-scoped procedure first, and the organisation comes from the session —
 * a module belonging to somebody else resolves to nothing and nothing is written.
 *
 * ## Why these stills are temporary
 *
 * They belong to the analysis screen, not to the athlete. Publishing copies the
 * ones a coach actually used into the report's own folder and deletes these; an
 * analysis that is never published leaves them to expire under the bucket's
 * lifecycle rule. Nothing here is an `Asset`, and nothing appears in an
 * athlete's media.
 */
export async function uploadAnalysisStillAction(
  moduleId: string,
  position: string,
  base64: string,
): Promise<{ key?: string; message?: string }> {
  // A generous ceiling on one re-encoded frame. Enough for a bounded JPEG,
  // far below anything that would be worth sending here.
  if (base64.length > 3_000_000) return { message: 'Das Standbild ist zu groß.' };

  try {
    const tenant = await routeTenant();
    if (tenant === null) return { message: 'Keine aktive Organisation.' };

    // Proves the module is this workspace's before a key is built from its id:
    // the procedure is tenant-scoped and refuses a module it cannot find.
    await api.assessments.measurements.readiness({ moduleId });

    const key = analysisStillKey({
      organizationId: tenant.organizationId,
      moduleId,
      position,
      stillId: randomBytes(9).toString('base64url'),
    });

    const written = await putObject(key, Buffer.from(base64, 'base64'), STILL_CONTENT_TYPE);

    return written ? { key } : { message: 'Für Standbilder ist kein Speicher eingerichtet.' };
  } catch (error) {
    return { message: toMessage(error) };
  }
}

/**
 * Files what the analysis measured against the test it ran on.
 *
 * Separate from `saveVideoAnalysisAction` and called after it: the values are
 * the record, this is the shape of the movement behind them. A failure here
 * leaves the measurements stored — a report without a curve is a smaller loss
 * than a run whose numbers were thrown away.
 */
export async function recordMovementAnalysisAction(
  moduleId: string,
  movement: MovementAnalysisConfig,
): Promise<{ message?: string }> {
  try {
    await api.assessments.recordMovementAnalysis({ moduleId, movement });

    return {};
  } catch (error) {
    return { message: toMessage(error) };
  }
}
