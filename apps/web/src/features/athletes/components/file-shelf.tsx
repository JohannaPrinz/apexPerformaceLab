'use client';

import { useRef, useState, useTransition } from 'react';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

import {
  Activity,
  ArrowLeft,
  Download,
  FileImage,
  FileText,
  Folder,
  FolderOpen,
  FolderPlus,
  Pencil,
  Plus,
  Trash2,
  Upload,
  Video,
} from 'lucide-react';

import { Button, Dialog, DialogContent, DialogFooter } from '@apex/ui';

import { FOCUS_RING, TOUCH_BUTTON, TOUCH_FIELD, TOUCH_TARGET } from '@/components/common/touch';
import type { PhotoFailure } from '@/lib/images/photo-plan';
import { isHeic, preparePhoto } from '@/lib/images/prepare-photo';
import { chooseUploadRoute, MAX_ASSET_MB } from '@/lib/uploads';
import { uploadResumable, type ResumableProgress } from '@/lib/uploads/resumable-upload';
import { compressVideo, type CompressionProgress } from '@/lib/video/compress-video';
import type { CompressionFailure } from '@/lib/video/compression-plan';

import type { WriteOutcome } from './writes';

/**
 * One athlete's files, in folders (§18).
 *
 * ## One presentation, two doors
 *
 * The same component serves the coach's page and the athlete portal, exactly as
 * the tracking tables do: it names no athlete and imports no action. Whoever
 * renders it binds the writes, and each side binds its own procedures — a coach
 * reaches every athlete of their workspace, an athlete exactly one, and neither
 * rule can leak into the other through here.
 *
 * ## Two levels, and the address says which
 *
 * The overview shows the folders as tiles; opening one shows what is in it. The
 * open folder is `?ordner=` in the address rather than state in this component,
 * so the browser's back button leaves a folder the way a person expects, and a
 * folder can be linked to.
 *
 * ## Why putting something here is a dialog
 *
 * Uploading and making a folder used to sit open above the shelves, which put
 * a form in front of the files on every visit — and most visits are for the
 * files. Both now live behind one "+ Neu", because both are "put something
 * here" and the question of which comes first.
 *
 * ## What it deliberately is not
 *
 * Not a media library. No previews, no drag and drop, no sub-folders. Folders,
 * the files in them, and what a person does with a file: put one there, take
 * one back, analyse a video where the door allows it, throw one away.
 */

export interface ShelfFolder {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly createdAt: Date;
  /** The coach who created it, by name — `null` where the athlete did (§18). */
  readonly createdByName: string | null;
}

export interface ShelfFile {
  readonly id: string;
  readonly kind: 'DOCUMENT' | 'VIDEO';
  readonly fileName: string;
  readonly mimeType: string;
  readonly sizeBytes: number;
  readonly createdAt: Date;
  readonly folderId: string | null;
  /** Null where the athlete uploaded it — shown, because it matters (§18). */
  readonly uploadedByCoachId: string | null;
  readonly storageKey: string;
}

export interface ShelfWrites {
  /**
   * Where a stored video can be analysed, if this door offers that at all.
   *
   * The coach's does; the portal's does not, and passes nothing. §21 keeps the
   * analysis a coach's tool, so the absence is the permission — not a hidden
   * button (§18).
   */
  readonly analyseHref?: ((assetId: string) => string) | undefined;
  readonly upload: (form: FormData) => Promise<WriteOutcome>;
  /**
   * Permission to write one object, for a file too big for a single request.
   *
   * Two halves rather than one, because a resumable upload happens **between**
   * them: the server authorises, the browser sends the chunks through the
   * proxy, and only then is the row filed (§18).
   */
  readonly createTicket: (input: {
    readonly fileName: string;
    readonly mimeType: string;
    readonly sizeBytes: number;
    readonly folderId: string | null;
  }) => Promise<{ ticket?: string; message?: string }>;
  readonly registerUpload: (ticket: string) => Promise<WriteOutcome>;
  readonly createFolder: (name: string, description: string) => Promise<WriteOutcome>;
  readonly renameFolder: (
    folderId: string,
    name: string,
    description: string,
  ) => Promise<WriteOutcome>;
  readonly deleteFolder: (folderId: string) => Promise<WriteOutcome>;
  readonly deleteFile: (assetId: string) => Promise<WriteOutcome>;
}

/** The address value of the shelf that is not a folder. */
export const LOOSE_FILES = 'ohne';

/** The same limits the service enforces, so the form never promises more. */
const MAX_FOLDER_NAME = 80;
const MAX_FOLDER_DESCRIPTION = 280;

/**
 * Where the bytes come from.
 *
 * The route that already serves private media, which decides for itself who is
 * asking — a coach against their workspace, an athlete against their own record
 * (see `app/api/report-media`). Nothing is signed into a URL here, and the
 * bucket stays private.
 */
const downloadHref = (storageKey: string): string =>
  `/api/report-media/${storageKey
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/')}`;

/**
 * Why a photo or a video did not make it through, in a sentence the person can
 * act on.
 *
 * §18 forbids the untouched original as a fallback, so every one of these ends
 * the attempt.
 */
const PHOTO_MESSAGES: Readonly<Record<PhotoFailure, string>> = {
  HEIC_UNSUPPORTED:
    'Dieses Foto ließ sich in diesem Browser nicht umwandeln. Bitte als JPEG exportieren — das Original wird bewusst nicht abgelegt.',
  DECODE_FAILED:
    'Dieses Foto ließ sich nicht öffnen. Bitte als JPEG exportieren — das Original wird bewusst nicht abgelegt.',
};

const COMPRESSION_MESSAGES: Readonly<Record<CompressionFailure, string>> = {
  NO_ENCODER:
    'Dieser Browser kann Videos nicht verkleinern. Bitte Chrome oder Firefox verwenden — das Original wird bewusst nicht hochgeladen.',
  DECODE_FAILED:
    'Dieses Video lässt sich im Browser nicht öffnen. Bitte ein anderes Format wählen.',
  ENCODE_FAILED: 'Das Video konnte nicht verarbeitet werden. Bitte noch einmal versuchen.',
  STILL_TOO_LARGE: 'Das Video konnte nicht auf die zulässige Größe komprimiert werden.',
};

const DATE = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

/** A size somebody reads, not a number of bytes. */
function readableSize(bytes: number): string {
  if (bytes < 1024) return `${String(bytes)} B`;
  if (bytes < 1024 * 1024)
    return `${new Intl.NumberFormat('de-DE').format(Math.round(bytes / 1024))} KB`;

  return `${new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 }).format(
    bytes / 1024 / 1024,
  )} MB`;
}

const countOf = (files: number) => (files === 1 ? '1 Datei' : `${String(files)} Dateien`);

/** What kind of file this is, in the word a person uses for it. */
function typeOf(file: ShelfFile): { label: string; icon: typeof FileText } {
  if (file.kind === 'VIDEO') return { label: 'Video', icon: Video };
  if (file.mimeType.startsWith('image/')) return { label: 'Bild', icon: FileImage };
  if (file.mimeType === 'application/pdf') return { label: 'PDF', icon: FileText };

  return { label: 'Datei', icon: FileText };
}

type NewStep = 'choose' | 'folder' | 'file';

export function FileShelf({
  folders,
  files,
  writes,
  openFolderId = null,
  readOnly = false,
}: {
  readonly folders: readonly ShelfFolder[];
  readonly files: readonly ShelfFile[];
  readonly writes: ShelfWrites;
  /** The folder in the address, `LOOSE_FILES` for the unfiled ones, or none. */
  readonly openFolderId?: string | null;
  /** A deactivated portal account keeps reading and loses writing (§21). */
  readonly readOnly?: boolean;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  /** Which dialog is open, if any. Owned here, so no menu can take it down mid-upload. */
  const [newStep, setNewStep] = useState<NewStep | null>(null);
  const [editing, setEditing] = useState(false);
  const [removingFolder, setRemovingFolder] = useState(false);
  const [removingFile, setRemovingFile] = useState<ShelfFile | null>(null);

  const loose = files.filter((file) => file.folderId === null);
  const open =
    openFolderId === LOOSE_FILES
      ? ('loose' as const)
      : (folders.find((folder) => folder.id === openFolderId) ?? null);

  /** A folder removed in another tab, or a stale link, opens the overview instead. */
  const showing = open === 'loose' && loose.length === 0 ? null : open;

  const run = (write: () => Promise<WriteOutcome>, after?: () => void) => {
    setError(null);
    startTransition(async () => {
      const result = await write();
      if (result.message) setError(result.message);
      else after?.();
    });
  };

  const inFolder = showing === null ? [] : showing === 'loose' ? loose : filesOf(files, showing.id);

  return (
    <div className="flex flex-col gap-6">
      {showing === null ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground" data-numeric>
            {folders.length === 1 ? '1 Ordner' : `${String(folders.length)} Ordner`} ·{' '}
            {countOf(files.length)}
          </p>

          {readOnly ? null : (
            <NewButton
              onClick={() => {
                setNewStep('choose');
              }}
            />
          )}
        </div>
      ) : (
        <FolderHeader
          folder={showing}
          fileCount={inFolder.length}
          overviewHref={pathname}
          readOnly={readOnly}
          pending={pending}
          onNew={() => {
            setNewStep('choose');
          }}
          onEdit={() => {
            setEditing(true);
          }}
          onRemove={() => {
            setRemovingFolder(true);
          }}
        />
      )}

      {showing === null ? (
        <FolderGrid
          folders={folders}
          files={files}
          looseCount={loose.length}
          hrefOf={(id) => `${pathname}?ordner=${encodeURIComponent(id)}`}
          readOnly={readOnly}
        />
      ) : (
        <FileGrid
          files={inFolder}
          writes={writes}
          readOnly={readOnly}
          pending={pending}
          onRemove={setRemovingFile}
        />
      )}

      {readOnly ? null : (
        <NewDialog
          step={newStep}
          onStep={setNewStep}
          folders={folders}
          defaultFolderId={showing === null || showing === 'loose' ? '' : showing.id}
          writes={writes}
        />
      )}

      {showing !== null && showing !== 'loose' && !readOnly ? (
        <>
          <FolderFormDialog
            open={editing}
            title="Ordner bearbeiten"
            submitLabel="Speichern"
            initial={showing}
            onClose={() => {
              setEditing(false);
            }}
            onSubmit={(name, description) => writes.renameFolder(showing.id, name, description)}
          />

          <ConfirmDialog
            open={removingFolder}
            title={`Ordner „${showing.name}“ entfernen?`}
            description="Die Dateien darin werden nicht gelöscht — sie stehen danach unter „Ohne Ordner“."
            confirmLabel="Ordner entfernen"
            pending={pending}
            error={error}
            onClose={() => {
              setError(null);
              setRemovingFolder(false);
            }}
            onConfirm={() => {
              run(
                () => writes.deleteFolder(showing.id),
                () => {
                  setRemovingFolder(false);
                  router.replace(pathname);
                },
              );
            }}
          />
        </>
      ) : null}

      {readOnly ? null : (
        <ConfirmDialog
          open={removingFile !== null}
          title={`„${removingFile?.fileName ?? ''}“ löschen?`}
          description="Die Datei wird endgültig gelöscht und lässt sich nicht wiederherstellen."
          confirmLabel="Endgültig löschen"
          pending={pending}
          error={error}
          onClose={() => {
            setError(null);
            setRemovingFile(null);
          }}
          onConfirm={() => {
            const file = removingFile;
            if (file === null) return;

            run(
              () => writes.deleteFile(file.id),
              () => {
                setRemovingFile(null);
              },
            );
          }}
        />
      )}
    </div>
  );
}

const filesOf = (files: readonly ShelfFile[], folderId: string) =>
  files.filter((file) => file.folderId === folderId);

function NewButton({ onClick }: { readonly onClick: () => void }) {
  return (
    <Button type="button" variant="accent" className={TOUCH_BUTTON} onClick={onClick}>
      <Plus aria-hidden="true" className="size-4" />
      Neu
    </Button>
  );
}

// ── The overview ───────────────────────────────────────────────────────────

function FolderGrid({
  folders,
  files,
  looseCount,
  hrefOf,
  readOnly,
}: {
  readonly folders: readonly ShelfFolder[];
  readonly files: readonly ShelfFile[];
  readonly looseCount: number;
  readonly hrefOf: (id: string) => string;
  readonly readOnly: boolean;
}) {
  if (folders.length === 0 && looseCount === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border px-6 py-12 text-center">
        <FolderOpen aria-hidden="true" className="size-8 text-muted-foreground" />
        <p className="text-sm font-medium">Noch nichts abgelegt</p>
        {readOnly ? null : (
          <p className="max-w-prose text-sm text-pretty text-muted-foreground">
            Über „Neu“ legen Sie einen Ordner an oder laden direkt eine Datei hoch.
          </p>
        )}
      </div>
    );
  }

  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4" aria-label="Ordner">
      {folders.map((folder) => (
        <li key={folder.id}>
          <FolderTile
            href={hrefOf(folder.id)}
            name={folder.name}
            description={folder.description}
            meta={[
              `Angelegt am ${DATE.format(folder.createdAt)}`,
              folder.createdByName === null ? 'vom Athleten' : `von ${folder.createdByName}`,
            ]}
            count={filesOf(files, folder.id).length}
          />
        </li>
      ))}

      {/* Only where there is something unfiled: an empty "Ohne Ordner" tile
          would be a folder nobody made. */}
      {looseCount === 0 ? null : (
        <li>
          <FolderTile
            href={hrefOf(LOOSE_FILES)}
            name="Ohne Ordner"
            description="Dateien, die keinem Ordner zugeordnet sind."
            meta={[]}
            count={looseCount}
            loose
          />
        </li>
      )}
    </ul>
  );
}

function FolderTile({
  href,
  name,
  description,
  meta,
  count,
  loose = false,
}: {
  readonly href: string;
  readonly name: string;
  readonly description: string | null;
  readonly meta: readonly string[];
  readonly count: number;
  readonly loose?: boolean;
}) {
  return (
    /* The link is stretched across the tile rather than wrapping it, as on the
       athlete tiles: one tap target, and nothing interactive nested inside. */
    <div
      className={`relative flex h-full min-h-40 flex-col gap-3 rounded-lg border bg-card p-4 transition-colors hover:border-border-strong ${
        loose ? 'border-dashed border-border' : 'border-border'
      }`}
    >
      <Link
        href={href}
        aria-label={`Ordner öffnen: ${name}`}
        className={`${FOCUS_RING} absolute inset-0 rounded-lg`}
      />

      <div className="flex items-start justify-between gap-3">
        <span
          aria-hidden="true"
          className={`grid size-10 shrink-0 place-items-center rounded-md ${
            loose ? 'bg-muted text-muted-foreground' : 'bg-accent-soft text-accent-soft-foreground'
          }`}
        >
          <Folder className="size-5" />
        </span>
        <span
          className="rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground"
          data-numeric
        >
          {countOf(count)}
        </span>
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <h3 className="font-medium break-words hyphens-auto" lang="de">
          {name}
        </h3>
        {description === null ? null : (
          <p className="line-clamp-2 text-sm text-pretty text-muted-foreground">{description}</p>
        )}
      </div>

      {meta.length === 0 ? null : (
        <div className="flex flex-col gap-0.5 text-xs text-muted-foreground" data-numeric>
          {meta.map((line) => (
            <span key={line} className="truncate">
              {line}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── One folder ─────────────────────────────────────────────────────────────

function FolderHeader({
  folder,
  fileCount,
  overviewHref,
  readOnly,
  pending,
  onNew,
  onEdit,
  onRemove,
}: {
  readonly folder: ShelfFolder | 'loose';
  readonly fileCount: number;
  readonly overviewHref: string;
  readonly readOnly: boolean;
  readonly pending: boolean;
  readonly onNew: () => void;
  readonly onEdit: () => void;
  readonly onRemove: () => void;
}) {
  const real = folder === 'loose' ? null : folder;

  return (
    <div className="flex flex-col gap-3">
      <Link
        href={overviewHref}
        className={`${TOUCH_TARGET} ${FOCUS_RING} inline-flex w-fit items-center gap-2 rounded text-sm text-muted-foreground hover:text-foreground`}
      >
        <ArrowLeft aria-hidden="true" className="size-4" />
        Alle Ordner
      </Link>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="text-xl font-semibold break-words hyphens-auto" lang="de">
            {real?.name ?? 'Ohne Ordner'}
          </h2>
          {real?.description ? (
            <p className="max-w-prose text-sm text-pretty text-muted-foreground">
              {real.description}
            </p>
          ) : null}
          <p className="text-xs text-muted-foreground" data-numeric>
            {real === null
              ? countOf(fileCount)
              : `Angelegt am ${DATE.format(real.createdAt)} · ${
                  real.createdByName === null ? 'vom Athleten' : `von ${real.createdByName}`
                } · ${countOf(fileCount)}`}
          </p>
        </div>

        {readOnly ? null : (
          <div className="flex flex-wrap items-center gap-2">
            {real === null ? null : (
              <>
                <Button
                  type="button"
                  variant="outline"
                  className={TOUCH_BUTTON}
                  disabled={pending}
                  onClick={onEdit}
                >
                  <Pencil aria-hidden="true" className="size-4" />
                  Bearbeiten
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  className={`${TOUCH_BUTTON} text-muted-foreground hover:text-destructive`}
                  disabled={pending}
                  onClick={onRemove}
                >
                  <Trash2 aria-hidden="true" className="size-4" />
                  Ordner entfernen
                </Button>
              </>
            )}
            {/* First on a phone, where the buttons stack and the one people
                come for should not be the one left over on a line below. */}
            <div className="order-first sm:order-last">
              <NewButton onClick={onNew} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function FileGrid({
  files,
  writes,
  readOnly,
  pending,
  onRemove,
}: {
  readonly files: readonly ShelfFile[];
  readonly writes: ShelfWrites;
  readonly readOnly: boolean;
  readonly pending: boolean;
  readonly onRemove: (file: ShelfFile) => void;
}) {
  if (files.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border px-6 py-12 text-center">
        <FolderOpen aria-hidden="true" className="size-8 text-muted-foreground" />
        <p className="text-sm font-medium">Dieser Ordner ist leer</p>
        {readOnly ? null : (
          <p className="max-w-prose text-sm text-pretty text-muted-foreground">
            Über „Neu“ laden Sie eine Datei direkt in diesen Ordner hoch.
          </p>
        )}
      </div>
    );
  }

  return (
    <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Dateien">
      {files.map((file) => {
        const type = typeOf(file);
        const Icon = type.icon;

        return (
          <li
            key={file.id}
            className="flex h-full flex-col gap-4 rounded-lg border border-border bg-card p-4"
          >
            <div className="flex items-start gap-3">
              <span
                aria-hidden="true"
                className={`grid size-10 shrink-0 place-items-center rounded-md ${
                  file.kind === 'VIDEO'
                    ? 'bg-accent-soft text-accent-soft-foreground'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                <Icon className="size-5" />
              </span>

              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <p className="text-sm font-medium break-all" title={file.fileName}>
                  {file.fileName}
                </p>
                <p className="text-xs text-muted-foreground" data-numeric>
                  {type.label} · {readableSize(file.sizeBytes)}
                </p>
                <p className="text-xs text-muted-foreground" data-numeric>
                  {DATE.format(file.createdAt)} ·{' '}
                  {file.uploadedByCoachId === null ? 'vom Athleten' : 'vom Coach'}
                </p>
              </div>

              {/* In the head, as an icon: a third labelled button did not fit a
                  card beside "Herunterladen" and "Analysieren", and wrapped onto
                  a line of its own. Nothing is lost by the move — it still asks
                  before anything is deleted. */}
              {readOnly ? null : (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  aria-label={`${file.fileName} löschen`}
                  title="Löschen"
                  className={`${TOUCH_TARGET} -mt-1 -mr-1 min-w-11 shrink-0 text-muted-foreground hover:text-destructive lg:min-w-8`}
                  disabled={pending}
                  onClick={() => {
                    onRemove(file);
                  }}
                >
                  <Trash2 aria-hidden="true" className="size-4" />
                </Button>
              )}
            </div>

            <div className="mt-auto flex flex-wrap items-center gap-2 border-t border-border pt-3">
              <Button asChild variant="outline" className={TOUCH_BUTTON}>
                <a href={downloadHref(file.storageKey)} download={file.fileName}>
                  <Download aria-hidden="true" className="size-4" />
                  Herunterladen
                </a>
              </Button>

              {file.kind === 'VIDEO' && writes.analyseHref !== undefined ? (
                <Button asChild variant="outline" className={TOUCH_BUTTON}>
                  <a href={writes.analyseHref(file.id)}>
                    <Activity aria-hidden="true" className="size-4" />
                    Analysieren
                  </a>
                </Button>
              ) : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

// ── Dialogs ────────────────────────────────────────────────────────────────

/** "+ Neu": choose, then either form. One dialog, so the choice is not a page. */
function NewDialog({
  step,
  onStep,
  folders,
  defaultFolderId,
  writes,
}: {
  readonly step: NewStep | null;
  readonly onStep: (step: NewStep | null) => void;
  readonly folders: readonly ShelfFolder[];
  readonly defaultFolderId: string;
  readonly writes: ShelfWrites;
}) {
  const [busy, setBusy] = useState(false);

  return (
    <Dialog
      open={step !== null}
      onOpenChange={(next) => {
        // A dialog that closes mid-upload would hide the progress of something
        // still running — so while it runs, it stays.
        if (!next && !busy) onStep(null);
      }}
    >
      {step === null ? null : step === 'choose' ? (
        <DialogContent title="Neu anlegen" description="Was möchten Sie hinzufügen?">
          <div className="grid gap-3 sm:grid-cols-2">
            <ChoiceButton
              icon={<FolderPlus aria-hidden="true" className="size-5" />}
              title="Ordner"
              text="Mit Name und optionaler Beschreibung."
              onClick={() => {
                onStep('folder');
              }}
            />
            <ChoiceButton
              icon={<Upload aria-hidden="true" className="size-5" />}
              title="Datei"
              text={`Bild, PDF oder Video bis ${String(MAX_ASSET_MB)} MB.`}
              onClick={() => {
                onStep('file');
              }}
            />
          </div>
        </DialogContent>
      ) : step === 'folder' ? (
        <FolderForm
          title="Neuer Ordner"
          submitLabel="Ordner anlegen"
          initial={null}
          onBack={() => {
            onStep('choose');
          }}
          onClose={() => {
            onStep(null);
          }}
          onSubmit={writes.createFolder}
        />
      ) : (
        <UploadForm
          folders={folders}
          defaultFolderId={defaultFolderId}
          writes={writes}
          onBusy={setBusy}
          onBack={() => {
            onStep('choose');
          }}
          onDone={() => {
            onStep(null);
          }}
        />
      )}
    </Dialog>
  );
}

function ChoiceButton({
  icon,
  title,
  text,
  onClick,
}: {
  readonly icon: React.ReactNode;
  readonly title: string;
  readonly text: string;
  readonly onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${FOCUS_RING} flex flex-col items-start gap-2 rounded-lg border border-border bg-background p-4 text-left transition-colors hover:border-border-strong hover:bg-muted`}
    >
      <span className="grid size-10 place-items-center rounded-md bg-accent-soft text-accent-soft-foreground">
        {icon}
      </span>
      <span className="font-medium">{title}</span>
      <span className="text-sm text-pretty text-muted-foreground">{text}</span>
    </button>
  );
}

/** Editing an existing folder: the same form, in a dialog of its own. */
function FolderFormDialog({
  open,
  title,
  submitLabel,
  initial,
  onClose,
  onSubmit,
}: {
  readonly open: boolean;
  readonly title: string;
  readonly submitLabel: string;
  readonly initial: ShelfFolder;
  readonly onClose: () => void;
  readonly onSubmit: (name: string, description: string) => Promise<WriteOutcome>;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      {open ? (
        <FolderForm
          title={title}
          submitLabel={submitLabel}
          initial={initial}
          onClose={onClose}
          onSubmit={onSubmit}
        />
      ) : null}
    </Dialog>
  );
}

function FolderForm({
  title,
  submitLabel,
  initial,
  onBack,
  onClose,
  onSubmit,
}: {
  readonly title: string;
  readonly submitLabel: string;
  readonly initial: ShelfFolder | null;
  readonly onBack?: () => void;
  readonly onClose: () => void;
  readonly onSubmit: (name: string, description: string) => Promise<WriteOutcome>;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [description, setDescription] = useState(initial?.description ?? '');
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <DialogContent title={title}>
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          startTransition(async () => {
            const result = await onSubmit(name, description);
            if (result.message) setError(result.message);
            else onClose();
          });
        }}
      >
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">Name</span>
          <input
            value={name}
            required
            autoFocus
            maxLength={MAX_FOLDER_NAME}
            placeholder="z. B. Formcheck September"
            onChange={(event) => {
              setName(event.target.value);
            }}
            className={`${TOUCH_FIELD} ${FOCUS_RING} rounded-md border border-input bg-background px-3`}
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="flex items-baseline justify-between gap-2">
            <span className="font-medium">Beschreibung</span>
            <span className="text-xs text-muted-foreground">optional</span>
          </span>
          <textarea
            value={description}
            rows={3}
            maxLength={MAX_FOLDER_DESCRIPTION}
            placeholder="Wofür ist dieser Ordner?"
            onChange={(event) => {
              setDescription(event.target.value);
            }}
            className={`${FOCUS_RING} rounded-md border border-input bg-background px-3 py-2 text-base lg:text-sm`}
          />
          <span className="self-end text-xs text-muted-foreground" data-numeric>
            {description.length} / {MAX_FOLDER_DESCRIPTION}
          </span>
        </label>

        {error === null ? null : (
          <p role="alert" className="text-sm text-pretty text-destructive">
            {error}
          </p>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className={TOUCH_BUTTON}
            disabled={pending}
            onClick={onBack ?? onClose}
          >
            {onBack === undefined ? 'Abbrechen' : 'Zurück'}
          </Button>
          <Button
            type="submit"
            variant="accent"
            className={TOUCH_BUTTON}
            disabled={pending || name.trim() === ''}
          >
            {pending ? 'Wird gespeichert …' : submitLabel}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function UploadForm({
  folders,
  defaultFolderId,
  writes,
  onBusy,
  onBack,
  onDone,
}: {
  readonly folders: readonly ShelfFolder[];
  readonly defaultFolderId: string;
  readonly writes: ShelfWrites;
  readonly onBusy: (busy: boolean) => void;
  readonly onBack: () => void;
  readonly onDone: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [target, setTarget] = useState(defaultFolderId);
  /** Set while a video is being squeezed. Real progress, from playback. */
  const [preparing, setPreparing] = useState<CompressionProgress | null>(null);
  /** What the last compression saved, so the wait is visibly worth something. */
  const [saved, setSaved] = useState<{ from: number; to: number; type: string } | null>(null);
  /** Set while a photo is being converted. Short, and without a percentage. */
  const [convertingPhoto, setConvertingPhoto] = useState(false);
  /** Set while the bytes are travelling in chunks. */
  const [sending, setSending] = useState<ResumableProgress | null>(null);
  /** How to stop a resumable upload that is under way. */
  const abortRef = useRef<(() => void) | null>(null);

  /**
   * Puts a file through the browser before the upload starts.
   *
   * Two kinds get worked on, for the same reason and to the same end: a HEIC
   * photograph becomes a JPEG every reader can open, and a video is compressed
   * to §18's profile. Everything else is passed along untouched.
   *
   * Returns `null` where the file did not make it, having already said why.
   * **It never returns the original**, which is the rule this path exists for
   * — neither the HEIC nor the uncompressed recording.
   */
  const prepared = async (file: File): Promise<File | null> => {
    /**
     * A phone photograph is HEIC, which most browsers cannot open and none of
     * the record's readers should have to. It becomes a JPEG here, and the
     * original is **not** stored alongside — it is an input format, not a kept
     * one (§18).
     */
    if (isHeic(file)) {
      setSaved(null);
      setConvertingPhoto(true);

      try {
        const photo = await preparePhoto(file);

        if (!photo.ok) {
          setError(PHOTO_MESSAGES[photo.reason]);

          return null;
        }

        setSaved({ from: file.size, to: photo.file.size, type: photo.file.type });

        return photo.file;
      } finally {
        setConvertingPhoto(false);
      }
    }

    if (!file.type.startsWith('video/')) return file;

    setSaved(null);
    setPreparing({ attempt: 1, attempts: 3, ratio: 0 });

    try {
      const result = await compressVideo(file, {
        // §18's own figures now that the resumable road exists: aim at 30 MB,
        // refuse above 50. Anything over 6 MB simply takes the other road.
        onProgress: setPreparing,
      });

      if (!result.ok) {
        setError(COMPRESSION_MESSAGES[result.reason]);

        return null;
      }

      setSaved({
        from: result.video.originalSizeBytes,
        to: result.video.sizeBytes,
        type: result.video.mimeType,
      });

      return result.video.file;
    } finally {
      setPreparing(null);
    }
  };

  /**
   * Puts one finished file on its road (§18).
   *
   * The size decides, and it is the size of what came out of `prepared` — a
   * compressed video or a converted photo. An original never reaches this
   * function, so it can never reach either road.
   */
  const send = async (
    file: File,
    folderId: string | null,
    form: FormData,
  ): Promise<WriteOutcome> => {
    const route = chooseUploadRoute(file.size);

    if (route === 'TOO_LARGE') {
      return {
        message: `Die Datei ist auch nach der Vorbereitung zu groß (höchstens ${String(MAX_ASSET_MB)} MB).`,
      };
    }

    if (route === 'STANDARD') {
      form.set('file', file, file.name);

      return writes.upload(form);
    }

    // Over the ordinary limit: the bytes go in chunks, and the server decides
    // where before any of them move.
    const permission = await writes.createTicket({
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      folderId,
    });

    if (permission.ticket === undefined) {
      return { message: permission.message ?? 'Der Upload konnte nicht vorbereitet werden.' };
    }

    setSending({ sent: 0, total: file.size, ratio: 0 });

    try {
      const handle = uploadResumable(file, permission.ticket, setSending);
      abortRef.current = handle.abort;

      const outcome = await handle.done;
      if (!outcome.ok) return { message: outcome.message };

      // Only now, and only because the store is asked whether the object is
      // really there — storage first, row second (§18).
      return writes.registerUpload(permission.ticket);
    } finally {
      abortRef.current = null;
      setSending(null);
    }
  };

  return (
    <DialogContent
      title="Datei hochladen"
      description={`Bilder, PDFs und Videos bis ${String(MAX_ASSET_MB)} MB.`}
      hideClose={pending}
    >
      <form
        className="flex flex-col gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          const form = new FormData(event.currentTarget);
          const chosen = form.get('file');

          if (!(chosen instanceof File) || chosen.size === 0) {
            setError('Bitte eine Datei auswählen.');

            return;
          }

          setError(null);
          onBusy(true);

          // Nothing is sent until there is something to send, and what is sent
          // is never the untouched original (§18).
          startTransition(async () => {
            try {
              const file = await prepared(chosen);
              if (file === null) return;

              const folderId = target === '' ? null : target;
              form.set('folderId', target);

              const result = await send(file, folderId, form);
              if (result.message) setError(result.message);
              else onDone();
            } finally {
              onBusy(false);
            }
          });
        }}
      >
        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">Datei</span>
          <input
            type="file"
            name="file"
            required
            disabled={pending}
            accept="image/*,video/*,application/pdf,.heic,.heif"
            className={`${TOUCH_FIELD} ${FOCUS_RING} rounded-md border border-input bg-background px-3 text-sm file:mr-3 file:rounded file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm`}
          />
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span className="font-medium">Ordner</span>
          <select
            name="folderId"
            value={target}
            disabled={pending}
            onChange={(event) => {
              setTarget(event.target.value);
            }}
            className={`${TOUCH_FIELD} ${FOCUS_RING} rounded-md border border-input bg-background px-3`}
          >
            <option value="">Ohne Ordner</option>
            {folders.map((folder) => (
              <option key={folder.id} value={folder.id}>
                {folder.name}
              </option>
            ))}
          </select>
        </label>

        {/* Real progress, read off the playback position of the pass that is
            running — not a spinner pretending to know something. */}
        {preparing === null ? null : (
          <Progress
            label="Video wird vorbereitet"
            ratio={preparing.ratio}
            text={`Video wird vorbereitet … Durchgang ${String(preparing.attempt)} von ${String(preparing.attempts)}`}
          />
        )}

        {sending === null ? null : (
          <div className="flex flex-col gap-1.5">
            <Progress
              label="Datei wird hochgeladen"
              ratio={sending.ratio}
              text={`Wird hochgeladen … ${readableSize(sending.sent)} von ${readableSize(sending.total)}`}
            />
            <button
              type="button"
              onClick={() => abortRef.current?.()}
              className={`${TOUCH_TARGET} ${FOCUS_RING} self-end rounded px-2 text-xs text-muted-foreground hover:text-destructive`}
            >
              Upload abbrechen
            </button>
          </div>
        )}

        {saved === null ? null : (
          <p className="text-xs text-muted-foreground" data-numeric>
            Vorbereitet: {readableSize(saved.from)} → {readableSize(saved.to)} ({saved.type})
          </p>
        )}

        <p className="text-xs text-pretty text-muted-foreground">
          Videos werden im Browser automatisch verkleinert — ohne Ton, höchstens 1280 × 720 — und
          Fotos vom iPhone in ein Format umgewandelt, das jeder öffnen kann. Erst danach wird
          hochgeladen.
        </p>

        {error === null ? null : (
          <p role="alert" className="text-sm text-pretty text-destructive">
            {error}
          </p>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            className={TOUCH_BUTTON}
            disabled={pending}
            onClick={onBack}
          >
            Zurück
          </Button>
          <Button type="submit" variant="accent" className={TOUCH_BUTTON} disabled={pending}>
            <Upload aria-hidden="true" className="size-4" />
            {convertingPhoto
              ? 'Foto wird vorbereitet …'
              : preparing !== null
                ? 'Video wird vorbereitet …'
                : sending !== null
                  ? 'Wird hochgeladen …'
                  : pending
                    ? 'Wird abgelegt …'
                    : 'Hochladen'}
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

function Progress({
  label,
  ratio,
  text,
}: {
  readonly label: string;
  readonly ratio: number;
  readonly text: string;
}) {
  const percent = Math.round(ratio * 100);

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-xs text-muted-foreground" data-numeric>
        {text} · {percent} %
      </p>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuenow={percent}
        aria-valuemin={0}
        aria-valuemax={100}
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
      >
        <span
          className="block h-full bg-accent transition-[width]"
          style={{ width: `${String(percent)}%` }}
        />
      </div>
    </div>
  );
}

function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  pending,
  error,
  onClose,
  onConfirm,
}: {
  readonly open: boolean;
  readonly title: string;
  readonly description: string;
  readonly confirmLabel: string;
  readonly pending: boolean;
  /** A refusal belongs where the question was asked, not behind the dialog. */
  readonly error: string | null;
  readonly onClose: () => void;
  readonly onConfirm: () => void;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && !pending) onClose();
      }}
    >
      {open ? (
        <DialogContent title={title} description={description}>
          {error === null ? null : (
            <p role="alert" className="text-sm text-pretty text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              className={TOUCH_BUTTON}
              disabled={pending}
              onClick={onClose}
            >
              Abbrechen
            </Button>
            <Button
              type="button"
              variant="destructive"
              className={TOUCH_BUTTON}
              disabled={pending}
              onClick={onConfirm}
            >
              {pending ? 'Wird ausgeführt …' : confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      ) : null}
    </Dialog>
  );
}
