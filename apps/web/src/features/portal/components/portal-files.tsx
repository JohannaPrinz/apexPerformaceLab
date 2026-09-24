'use client';

import {
  FileShelf,
  type ShelfFile,
  type ShelfFolder,
} from '@/features/athletes/components/file-shelf';

import {
  createPortalFolderAction,
  createPortalUploadTicketAction,
  deletePortalFileAction,
  deletePortalFolderAction,
  registerPortalUploadAction,
  renamePortalFolderAction,
  uploadPortalFileAction,
} from '../server/file-actions';

/**
 * The athlete's half of the file shelf (§18, §21).
 *
 * The counterpart to `CoachFiles`, and the only difference is which procedures
 * the writes go through — these resolve the athlete from the session, so none
 * of them takes an id at all.
 *
 * `readOnly` mirrors a deactivated account: the controls go, and the procedures
 * refuse regardless. Both, because a control nobody may use is still a control
 * somebody clicks.
 */
export function PortalFiles({
  folders,
  files,
  openFolderId,
  readOnly,
}: {
  readonly folders: readonly ShelfFolder[];
  readonly files: readonly ShelfFile[];
  readonly openFolderId: string | null;
  readonly readOnly: boolean;
}) {
  return (
    <FileShelf
      folders={folders}
      files={files}
      openFolderId={openFolderId}
      readOnly={readOnly}
      writes={{
        upload: uploadPortalFileAction,
        createTicket: createPortalUploadTicketAction,
        registerUpload: registerPortalUploadAction,
        createFolder: createPortalFolderAction,
        renameFolder: renamePortalFolderAction,
        deleteFolder: deletePortalFolderAction,
        deleteFile: deletePortalFileAction,
      }}
    />
  );
}
