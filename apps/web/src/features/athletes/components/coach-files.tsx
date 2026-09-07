'use client';

import {
  createAthleteFolderAction,
  createAthleteUploadTicketAction,
  deleteAthleteFileAction,
  deleteAthleteFolderAction,
  registerAthleteUploadAction,
  renameAthleteFolderAction,
  uploadAthleteFileAction,
} from '../server/file-actions';

import { FileShelf, type ShelfFile, type ShelfFolder } from './file-shelf';

/**
 * The coach's half of the file shelf (§18).
 *
 * Three lines of binding, like `coachWrites` for the tracking tables: the shelf
 * names no athlete, so the id is bound once here and every write below goes
 * through a coach procedure. The portal binds the same five to its own.
 */
export function CoachFiles({
  athleteId,
  folders,
  files,
}: {
  readonly athleteId: string;
  readonly folders: readonly ShelfFolder[];
  readonly files: readonly ShelfFile[];
}) {
  return (
    <FileShelf
      folders={folders}
      files={files}
      writes={{
        upload: (form) => uploadAthleteFileAction(athleteId, form),
        // The existing analysis screen, pointed at a stored video. Only here:
        // the portal binds no such link, because the analysis is the coach's
        // tool (§21).
        analyseHref: (assetId) =>
          `/videoanalyse?athlete=${encodeURIComponent(athleteId)}&asset=${encodeURIComponent(assetId)}`,
        createTicket: (input) => createAthleteUploadTicketAction(athleteId, input),
        registerUpload: (ticket) => registerAthleteUploadAction(athleteId, ticket),
        createFolder: (name) => createAthleteFolderAction(athleteId, name),
        renameFolder: (folderId, name) => renameAthleteFolderAction(athleteId, folderId, name),
        deleteFolder: (folderId) => deleteAthleteFolderAction(athleteId, folderId),
        deleteFile: (assetId) => deleteAthleteFileAction(athleteId, assetId),
      }}
    />
  );
}
