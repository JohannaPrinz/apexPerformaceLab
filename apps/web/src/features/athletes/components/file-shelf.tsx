'use client';

import { useRef, useState, useTransition } from 'react';

import { Activity, Download, FileText, FolderPlus, Trash2, Video } from 'lucide-react';

import { Button } from '@apex/ui';

import { FOCUS_RING, TOUCH_BUTTON, TOUCH_FIELD, TOUCH_TARGET } from '@/components/common/touch';
import type { PhotoFailure } from '@/lib/images/photo-plan';
import { isHeic, preparePhoto } from '@/lib/images/prepare-photo';
import { chooseUploadRoute, MAX_ASSET_MB } from '@/lib/uploads';
import { uploadResumable, type ResumableProgress } from '@/lib/uploads/resumable-upload';
import { compressVideo, type CompressionProgress } from '@/lib/video/compress-video';
import type { CompressionFailure } from '@/lib/video/compression-plan';

import type { WriteOutcome } from './writes';

/**
 * One athlete's files, on flat shelves (§18).
 *
 * ## One presentation, two doors
 *
 * The same component serves the coach's page and the athlete portal, exactly as
 * the tracking tables do: it names no athlete and imports no action. Whoever
 * renders it binds the writes, and each side binds its own procedures — a coach
 * reaches every athlete of their workspace, an athlete exactly one, and neither
 * rule can leak into the other through here.
 *
 * ## What it deliberately is not
 *
 * Not a media library. No previews, no drag and drop, no sub-folders, no
 * analysis. A shelf, the files on it, and the four things a person does with a
 * file: put one there, take one back, move nothing, throw one away.
 */

export interface ShelfFolder {
  readonly id: string;
  readonly name: string;
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
  readonly createFolder: (name: string) => Promise<WriteOutcome>;
  readonly renameFolder: (folderId: string, name: string) => Promise<WriteOutcome>;
  readonly deleteFolder: (folderId: string) => Promise<WriteOutcome>;
  readonly deleteFile: (assetId: string) => Promise<WriteOutcome>;
}

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
 * Why a video did not make it through, in a sentence the person can act on.
 *
 * Four causes, four next steps — and none of them is "we uploaded it anyway".
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

export function FileShelf({
  folders,
  files,
  writes,
  readOnly = false,
}: {
  readonly folders: readonly ShelfFolder[];
  readonly files: readonly ShelfFile[];
  readonly writes: ShelfWrites;
  /** A deactivated portal account keeps reading and loses writing (§21). */
  readonly readOnly?: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [newFolder, setNewFolder] = useState('');
  const [target, setTarget] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
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

  const run = (write: () => Promise<WriteOutcome>, after?: () => void) => {
    setError(null);
    startTransition(async () => {
      const result = await write();
      if (result.message) setError(result.message);
      else after?.();
    });
  };

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

  const loose = files.filter((file) => file.folderId === null);

  return (
    <div className="flex flex-col gap-6">
      {readOnly ? null : (
        <div className="flex flex-col gap-4 rounded-md border border-border bg-card p-4">
          {/* Upload and folder-making side by side: both are "put something
              here", and separating them onto two screens would make filing a
              two-step errand. */}
          <form
            className="flex flex-wrap items-end gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              const element = event.currentTarget;
              const form = new FormData(element);
              const chosen = form.get('file');

              if (!(chosen instanceof File)) {
                setError('Bitte eine Datei auswählen.');

                return;
              }

              setError(null);

              // Nothing is sent until there is something to send, and what is
              // sent is never the untouched original (§18).
              startTransition(async () => {
                const file = await prepared(chosen);
                if (file === null) return;

                const folder = form.get('folderId');
                const folderId = typeof folder === 'string' && folder !== '' ? folder : null;

                const result = await send(file, folderId, form);
                if (result.message) setError(result.message);
                else {
                  element.reset();
                  setTarget('');
                }
              });
            }}
          >
            <label className="flex min-w-56 flex-1 flex-col gap-1.5 text-sm">
              <span>Datei</span>
              <input
                ref={fileInput}
                type="file"
                name="file"
                required
                accept="image/*,video/*,application/pdf,.heic,.heif"
                className={`${TOUCH_FIELD} ${FOCUS_RING} rounded-md border border-input bg-background px-3 text-sm file:mr-3 file:rounded file:border-0 file:bg-muted file:px-3 file:py-1.5 file:text-sm`}
              />
            </label>

            <label className="flex min-w-44 flex-col gap-1.5 text-sm">
              <span>Ordner</span>
              <select
                name="folderId"
                value={target}
                onChange={(event) => {
                  setTarget(event.target.value);
                }}
                className={`${TOUCH_FIELD} ${FOCUS_RING} rounded-md border border-input bg-background px-3 text-base lg:text-sm`}
              >
                <option value="">Ohne Ordner</option>
                {folders.map((folder) => (
                  <option key={folder.id} value={folder.id}>
                    {folder.name}
                  </option>
                ))}
              </select>
            </label>

            <Button type="submit" variant="accent" className={TOUCH_BUTTON} disabled={pending}>
              {convertingPhoto
                ? 'Foto wird vorbereitet …'
                : preparing !== null
                  ? 'Video wird vorbereitet …'
                  : sending !== null
                    ? 'Video wird hochgeladen …'
                    : pending
                      ? 'Wird abgelegt …'
                      : 'Hochladen'}
            </Button>
          </form>

          {/* Real progress, read off the playback position of the pass that is
              running — not a spinner pretending to know something. */}
          {preparing === null ? null : (
            <div className="flex flex-col gap-1.5">
              <p className="text-xs text-muted-foreground" data-numeric>
                Video wird vorbereitet … Durchgang {preparing.attempt} von {preparing.attempts} ·{' '}
                {Math.round(preparing.ratio * 100)} %
              </p>
              <div
                role="progressbar"
                aria-label="Video wird vorbereitet"
                aria-valuenow={Math.round(preparing.ratio * 100)}
                aria-valuemin={0}
                aria-valuemax={100}
                className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
              >
                <span
                  className="block h-full bg-accent transition-[width]"
                  style={{ width: `${String(Math.round(preparing.ratio * 100))}%` }}
                />
              </div>
            </div>
          )}

          {sending === null ? null : (
            <div className="flex flex-col gap-1.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-xs text-muted-foreground" data-numeric>
                  Wird hochgeladen … {readableSize(sending.sent)} von {readableSize(sending.total)}{' '}
                  · {Math.round(sending.ratio * 100)} %
                </p>
                <button
                  type="button"
                  onClick={() => abortRef.current?.()}
                  className={`${TOUCH_TARGET} ${FOCUS_RING} rounded px-2 text-xs text-muted-foreground hover:text-destructive`}
                >
                  Abbrechen
                </button>
              </div>
              <div
                role="progressbar"
                aria-label="Datei wird hochgeladen"
                aria-valuenow={Math.round(sending.ratio * 100)}
                aria-valuemin={0}
                aria-valuemax={100}
                className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
              >
                <span
                  className="block h-full bg-accent transition-[width]"
                  style={{ width: `${String(Math.round(sending.ratio * 100))}%` }}
                />
              </div>
            </div>
          )}

          {saved === null ? null : (
            <p className="text-xs text-muted-foreground" data-numeric>
              Vorbereitet: {readableSize(saved.from)} → {readableSize(saved.to)} ({saved.type})
            </p>
          )}

          <p className="max-w-prose text-xs text-pretty text-muted-foreground">
            Bilder, PDFs und Videos bis {MAX_ASSET_MB} MB. Videos werden im Browser automatisch
            verkleinert — ohne Ton, höchstens 1280 × 720 — und Fotos vom iPhone in ein Format
            umgewandelt, das jeder öffnen kann. Erst danach wird hochgeladen.
          </p>

          <div className="flex flex-wrap items-end gap-3 border-t border-border pt-4">
            <label className="flex min-w-56 flex-1 flex-col gap-1.5 text-sm">
              <span>Neuer Ordner</span>
              <input
                value={newFolder}
                placeholder="z. B. Formcheck am 05.09.2026"
                onChange={(event) => {
                  setNewFolder(event.target.value);
                }}
                className={`${TOUCH_FIELD} ${FOCUS_RING} rounded-md border border-input bg-background px-3 text-base lg:text-sm`}
              />
            </label>

            <Button
              type="button"
              variant="outline"
              className={TOUCH_BUTTON}
              disabled={pending || newFolder.trim() === ''}
              onClick={() => {
                run(
                  () => writes.createFolder(newFolder),
                  () => {
                    setNewFolder('');
                  },
                );
              }}
            >
              <FolderPlus aria-hidden="true" className="size-4" />
              Ordner anlegen
            </Button>
          </div>
        </div>
      )}

      {error === null ? null : (
        <p role="alert" className="max-w-prose text-sm text-pretty text-destructive">
          {error}
        </p>
      )}

      {folders.map((folder) => (
        <Shelf
          key={folder.id}
          folder={folder}
          files={files.filter((file) => file.folderId === folder.id)}
          writes={writes}
          pending={pending}
          readOnly={readOnly}
          run={run}
        />
      ))}

      <Shelf
        folder={null}
        files={loose}
        writes={writes}
        pending={pending}
        readOnly={readOnly}
        run={run}
      />
    </div>
  );
}

/** One shelf: a heading, its files, and — for a real folder — its own controls. */
function Shelf({
  folder,
  files,
  writes,
  pending,
  readOnly,
  run,
}: {
  readonly folder: ShelfFolder | null;
  readonly files: readonly ShelfFile[];
  readonly writes: ShelfWrites;
  readonly pending: boolean;
  readonly readOnly: boolean;
  readonly run: (write: () => Promise<WriteOutcome>, after?: () => void) => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(folder?.name ?? '');

  // Nothing loose and no folder: an empty section headed "Ohne Ordner" is noise.
  if (folder === null && files.length === 0) return null;

  return (
    <section
      aria-label={folder?.name ?? 'Ohne Ordner'}
      className="flex flex-col gap-2 rounded-md border border-border p-4"
    >
      <div className="flex flex-wrap items-center justify-between gap-2">
        {renaming && folder !== null ? (
          <div className="flex flex-1 flex-wrap items-center gap-2">
            <input
              value={name}
              autoFocus
              onChange={(event) => {
                setName(event.target.value);
              }}
              className={`${TOUCH_FIELD} ${FOCUS_RING} min-w-44 flex-1 rounded-md border border-input bg-background px-3 text-base lg:text-sm`}
            />
            <Button
              type="button"
              variant="accent"
              className={TOUCH_BUTTON}
              disabled={pending || name.trim() === ''}
              onClick={() => {
                run(
                  () => writes.renameFolder(folder.id, name),
                  () => {
                    setRenaming(false);
                  },
                );
              }}
            >
              Speichern
            </Button>
            <Button
              type="button"
              variant="ghost"
              className={TOUCH_BUTTON}
              onClick={() => {
                setName(folder.name);
                setRenaming(false);
              }}
            >
              Abbrechen
            </Button>
          </div>
        ) : (
          <h3 className="text-sm font-medium">{folder?.name ?? 'Ohne Ordner'}</h3>
        )}

        {folder === null || readOnly || renaming ? null : (
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                setRenaming(true);
              }}
              className={`${TOUCH_TARGET} ${FOCUS_RING} rounded px-2 text-xs text-muted-foreground hover:text-foreground`}
            >
              Umbenennen
            </button>
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                run(() => writes.deleteFolder(folder.id));
              }}
              className={`${TOUCH_TARGET} ${FOCUS_RING} rounded px-2 text-xs text-muted-foreground hover:text-destructive`}
            >
              Ordner entfernen
            </button>
          </div>
        )}
      </div>

      {/* Said where the button is, because a cross beside a folder full of
          videos reads like a delete (§18). */}
      {folder === null || readOnly ? null : (
        <p className="text-xs text-muted-foreground">
          Einen Ordner zu entfernen löscht keine Datei — sie stehen danach unter &bdquo;Ohne
          Ordner&ldquo;.
        </p>
      )}

      {files.length === 0 ? (
        <p className="py-4 text-center text-xs text-muted-foreground">Noch nichts abgelegt.</p>
      ) : (
        <ul className="flex flex-col divide-y divide-border">
          {files.map((file) => (
            <li key={file.id} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2">
              {file.kind === 'VIDEO' ? (
                <Video aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
              ) : (
                <FileText aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
              )}

              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm">{file.fileName}</span>
                <span className="text-xs text-muted-foreground" data-numeric>
                  {file.mimeType} · {readableSize(file.sizeBytes)} · {DATE.format(file.createdAt)} ·{' '}
                  {file.uploadedByCoachId === null ? 'vom Athleten' : 'vom Coach'}
                </span>
              </span>

              {file.kind === 'VIDEO' && writes.analyseHref !== undefined ? (
                <a
                  href={writes.analyseHref(file.id)}
                  className={`${TOUCH_TARGET} ${FOCUS_RING} inline-flex items-center gap-1.5 rounded px-2 text-xs text-accent underline-offset-4 hover:underline`}
                >
                  <Activity aria-hidden="true" className="size-3.5" />
                  Video analysieren
                </a>
              ) : null}

              <a
                href={downloadHref(file.storageKey)}
                download={file.fileName}
                className={`${TOUCH_TARGET} ${FOCUS_RING} inline-flex items-center gap-1.5 rounded px-2 text-xs text-accent underline-offset-4 hover:underline`}
              >
                <Download aria-hidden="true" className="size-3.5" />
                Herunterladen
              </a>

              {readOnly ? null : (
                <button
                  type="button"
                  aria-label={`${file.fileName} löschen`}
                  disabled={pending}
                  onClick={() => {
                    run(() => writes.deleteFile(file.id));
                  }}
                  className={`${TOUCH_TARGET} ${FOCUS_RING} rounded px-2 text-muted-foreground hover:text-destructive`}
                >
                  <Trash2 aria-hidden="true" className="size-4" />
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
