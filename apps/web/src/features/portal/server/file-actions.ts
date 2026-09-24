'use server';

import { revalidatePath } from 'next/cache';

import { db } from '@apex/database';

import { routeTenant } from '@/server/tenant';
import { MAX_UPLOAD_BYTES, uploadAsset, type UploadRefusal } from '@/services/assets/files';
import { api } from '@/trpc/server';

/**
 * The athlete putting a file on their own record (§18, §21).
 *
 * ## Why the bytes come through an action and not through tRPC
 *
 * A procedure would carry a six-megabyte file base64-encoded inside JSON. The
 * analysis screen already faced this and answered it the same way: the
 * permission is asked of a **procedure**, and only the bytes travel in the
 * action. That split is the point — nothing here decides who may write.
 *
 * `portal.fileUploadTarget` runs on `athleteProcedure`, so it resolves the
 * athlete from the session and refuses a deactivated account before a single
 * byte is read.
 */
export interface FileUploadState {
  readonly message?: string;
}

/** What a person is told, per refusal. Each one has a different next step. */
const REFUSALS: Readonly<Record<UploadRefusal, string>> = {
  TOO_LARGE: `Die Datei ist zu groß. Zurzeit sind bis zu ${String(
    Math.round(MAX_UPLOAD_BYTES / 1024 / 1024),
  )} MB möglich — ein kürzeres Video oder ein kleineres Bild funktioniert.`,
  UNSUPPORTED_TYPE: 'Dieser Dateityp lässt sich hier nicht ablegen — Bilder, PDFs und Videos ja.',
  EMPTY: 'Die Datei ist leer.',
  STORAGE_FAILED: 'Der Speicher hat die Datei nicht angenommen. Bitte später erneut versuchen.',
};

export async function uploadPortalFileAction(form: FormData): Promise<FileUploadState> {
  try {
    const file = form.get('file');
    if (!(file instanceof File)) return { message: 'Bitte eine Datei auswählen.' };

    // Refused before anything is read, so a file that is too large never
    // becomes an object nobody asked for (§18).
    if (file.size > MAX_UPLOAD_BYTES) return { message: REFUSALS.TOO_LARGE };

    const target = await api.portal.fileUploadTarget();
    const tenant = await routeTenant();
    if (tenant === null) return { message: 'Keine aktive Sitzung.' };

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

    revalidatePath('/portal/dateien');

    return {};
  } catch (error) {
    return {
      message: error instanceof Error ? error.message : 'Die Datei konnte nicht abgelegt werden.',
    };
  }
}

/** Folder and file changes that carry no bytes. Thin, like every other action. */
export interface PortalFileState {
  readonly message?: string;
}

const failed = (error: unknown, fallback: string): PortalFileState => ({
  message: error instanceof Error ? error.message : fallback,
});

const refresh = () => {
  revalidatePath('/portal/dateien');
};

export async function createPortalFolderAction(
  name: string,
  description = '',
): Promise<PortalFileState> {
  try {
    await api.portal.createFileFolder({ name, description });
  } catch (error) {
    return failed(error, 'Der Ordner konnte nicht angelegt werden.');
  }

  refresh();

  return {};
}

export async function renamePortalFolderAction(
  folderId: string,
  name: string,
  description?: string,
): Promise<PortalFileState> {
  try {
    await api.portal.renameFileFolder({ folderId, name, description });
  } catch (error) {
    return failed(error, 'Der Ordner konnte nicht umbenannt werden.');
  }

  refresh();

  return {};
}

export async function deletePortalFolderAction(folderId: string): Promise<PortalFileState> {
  try {
    await api.portal.deleteFileFolder({ folderId });
  } catch (error) {
    return failed(error, 'Der Ordner konnte nicht entfernt werden.');
  }

  refresh();

  return {};
}

export async function deletePortalFileAction(assetId: string): Promise<PortalFileState> {
  try {
    await api.portal.deleteFile({ assetId });
  } catch (error) {
    return failed(error, 'Die Datei konnte nicht gelöscht werden.');
  }

  refresh();

  return {};
}

/** What a resumable upload needs before it starts, and after it finishes. */
export interface PortalTicketState {
  readonly ticket?: string;
  readonly message?: string;
}

/**
 * Asks the server for permission to write one object (§18, §21).
 *
 * No athlete travels here: `portal.createFileUploadTicket` runs on
 * `athleteProcedure` and issues the ticket for the record the session resolves
 * to.
 */
export async function createPortalUploadTicketAction(input: {
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly folderId: string | null;
}): Promise<PortalTicketState> {
  try {
    const { ticket } = await api.portal.createFileUploadTicket(input);

    return { ticket };
  } catch (error) {
    return failed(error, 'Der Upload konnte nicht vorbereitet werden.');
  }
}

/** Files the row, once the store confirms the bytes are there. */
export async function registerPortalUploadAction(ticket: string): Promise<PortalFileState> {
  try {
    await api.portal.registerFileUpload({ ticket });
  } catch (error) {
    return failed(error, 'Die Datei konnte nicht abgelegt werden.');
  }

  refresh();

  return {};
}
