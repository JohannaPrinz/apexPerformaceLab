'use server';

import { revalidatePath } from 'next/cache';

import { db } from '@apex/database';

import { routeTenant } from '@/server/tenant';
import { MAX_UPLOAD_BYTES, uploadAsset, type UploadRefusal } from '@/services/assets/files';
import { api } from '@/trpc/server';

/**
 * The coach putting a file on an athlete's record (§18).
 *
 * The coach's half of the pair; the athlete's is
 * `features/portal/server/file-actions.ts`. Same services underneath, and
 * deliberately **not** the same permission: `athletes.fileUploadTarget` runs on
 * `withCoachPermission('athlete:write')` and resolves the athlete from the
 * request, which is right for a coach and would be a leak in the portal.
 *
 * The bytes travel in the action rather than through tRPC, exactly as analysis
 * stills already do — a procedure would base64 a six-megabyte file into JSON.
 * What never travels here is the decision about who may write.
 */
export interface CoachFileState {
  readonly message?: string;
}

const REFUSALS: Readonly<Record<UploadRefusal, string>> = {
  TOO_LARGE: `Die Datei ist zu groß. Zurzeit sind bis zu ${String(
    Math.round(MAX_UPLOAD_BYTES / 1024 / 1024),
  )} MB möglich.`,
  UNSUPPORTED_TYPE: 'Dieser Dateityp lässt sich hier nicht ablegen — Bilder, PDFs und Videos ja.',
  EMPTY: 'Die Datei ist leer.',
  STORAGE_FAILED: 'Der Speicher hat die Datei nicht angenommen. Bitte später erneut versuchen.',
};

const failed = (error: unknown, fallback: string): CoachFileState => ({
  message: error instanceof Error ? error.message : fallback,
});

const refresh = (athleteId: string) => {
  revalidatePath(`/athletes/${athleteId}/dateien`);
};

export async function uploadAthleteFileAction(
  athleteId: string,
  form: FormData,
): Promise<CoachFileState> {
  try {
    const file = form.get('file');
    if (!(file instanceof File)) return { message: 'Bitte eine Datei auswählen.' };

    // Checked before the bytes are read: a refused upload must leave no object.
    if (file.size > MAX_UPLOAD_BYTES) return { message: REFUSALS.TOO_LARGE };

    const target = await api.athletes.fileUploadTarget({ athleteId });
    const tenant = await routeTenant();
    if (tenant === null) return { message: 'Keine aktive Organisation.' };

    const folderId = form.get('folderId');

    const result = await uploadAsset(db, tenant, {
      athleteId: target.athleteId,
      fileName: file.name,
      mimeType: file.type,
      bytes: Buffer.from(await file.arrayBuffer()),
      folderId: typeof folderId === 'string' && folderId !== '' ? folderId : null,
      uploadedByCoachId: target.uploadedByCoachId,
    });

    if (!result.ok) return { message: REFUSALS[result.refusal] };

    refresh(athleteId);

    return {};
  } catch (error) {
    return failed(error, 'Die Datei konnte nicht abgelegt werden.');
  }
}

export async function createAthleteFolderAction(
  athleteId: string,
  name: string,
): Promise<CoachFileState> {
  try {
    await api.athletes.createAssetFolder({ athleteId, name });
  } catch (error) {
    return failed(error, 'Der Ordner konnte nicht angelegt werden.');
  }

  refresh(athleteId);

  return {};
}

export async function renameAthleteFolderAction(
  athleteId: string,
  folderId: string,
  name: string,
): Promise<CoachFileState> {
  try {
    await api.athletes.renameAssetFolder({ athleteId, folderId, name });
  } catch (error) {
    return failed(error, 'Der Ordner konnte nicht umbenannt werden.');
  }

  refresh(athleteId);

  return {};
}

export async function deleteAthleteFolderAction(
  athleteId: string,
  folderId: string,
): Promise<CoachFileState> {
  try {
    await api.athletes.deleteAssetFolder({ athleteId, folderId });
  } catch (error) {
    return failed(error, 'Der Ordner konnte nicht entfernt werden.');
  }

  refresh(athleteId);

  return {};
}

export async function deleteAthleteFileAction(
  athleteId: string,
  assetId: string,
): Promise<CoachFileState> {
  try {
    await api.athletes.deleteAssetFile({ athleteId, assetId });
  } catch (error) {
    return failed(error, 'Die Datei konnte nicht gelöscht werden.');
  }

  refresh(athleteId);

  return {};
}

/** What a resumable upload needs before it starts, and after it finishes. */
export interface UploadTicketState {
  readonly ticket?: string;
  readonly message?: string;
}

/**
 * Asks the server for permission to write one object (§18).
 *
 * Thin, like every action here: `athletes.createUploadTicket` does the deciding
 * behind `withCoachPermission('athlete:write')`, and what comes back is a
 * signed ticket the browser cannot edit.
 */
export async function createAthleteUploadTicketAction(
  athleteId: string,
  input: {
    readonly fileName: string;
    readonly mimeType: string;
    readonly sizeBytes: number;
    readonly folderId: string | null;
  },
): Promise<UploadTicketState> {
  try {
    const { ticket } = await api.athletes.createUploadTicket({ athleteId, ...input });

    return { ticket };
  } catch (error) {
    return failed(error, 'Der Upload konnte nicht vorbereitet werden.');
  }
}

/** Files the row, once the store confirms the bytes are there. */
export async function registerAthleteUploadAction(
  athleteId: string,
  ticket: string,
): Promise<CoachFileState> {
  try {
    await api.athletes.registerUpload({ ticket });
  } catch (error) {
    return failed(error, 'Die Datei konnte nicht abgelegt werden.');
  }

  refresh(athleteId);

  return {};
}

/**
 * Takes the hold on a stored video, for an analysis that is starting (§18).
 *
 * Called by the analysis screen as it fetches the bytes. Deliberately not while
 * the page renders: Next re-renders a page after every Server Action, and a
 * hold taken during a render would be re-taken the instant it was released.
 *
 * A refusal comes back as a message rather than an exception, because the one
 * that matters — somebody else is already analysing this video — is a normal
 * answer a coach needs to read.
 */
export async function startAnalysisAction(
  athleteId: string,
  assetId: string,
): Promise<{ ok: boolean; message?: string }> {
  try {
    await api.athletes.startAnalysis({ athleteId, assetId });

    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      message:
        error instanceof Error && error.message !== ''
          ? error.message
          : 'Dieses Video steht gerade nicht für eine Auswertung zur Verfügung.',
    };
  }
}

/**
 * Lets a stored video go again after an analysis (§18).
 *
 * Called on every ending — finished, refused, failed — and once more when the
 * screen unmounts, which reaches the server as long as the document survives
 * the departure: a link inside the app does, a closed tab does not. Quiet by
 * design: a release that never arrives leaves a hold that expires on its own,
 * and there is nothing useful to say to a coach who has already moved on.
 */
export async function releaseAnalysisSourceAction(
  athleteId: string,
  assetId: string,
  outcome: 'FINISHED' | 'FAILED' = 'FINISHED',
): Promise<CoachFileState> {
  try {
    await api.athletes.releaseAnalysisSource({ assetId, outcome });
  } catch (error) {
    return failed(error, 'Die Analyse-Sperre konnte nicht aufgehoben werden.');
  }

  refresh(athleteId);

  return {};
}

/**
 * Says the analysis is still running, so the hold does not expire (§18).
 *
 * Quiet by design: a heartbeat that does not arrive is not something to
 * interrupt a coach about, and the lease simply runs out if the screen is gone.
 */
export async function heartbeatAnalysisAction(assetId: string): Promise<{ held: boolean }> {
  try {
    return await api.athletes.heartbeatAnalysis({ assetId });
  } catch {
    return { held: false };
  }
}
