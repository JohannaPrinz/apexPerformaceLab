import * as tus from 'tus-js-client';

import { RESUMABLE_CHUNK_BYTES, RESUMABLE_ENDPOINT, UPLOAD_TICKET_HEADER } from '../uploads';

/**
 * Sending a large file in chunks, through the server's own proxy (§18).
 *
 * ## What the browser is trusted with
 *
 * A **ticket**, and nothing else. It carries no bucket, no workspace, no
 * athlete and no storage key — those were decided by a procedure that already
 * knew who was calling, and they travel signed inside it. The endpoint below is
 * this application's own route, which unseals the ticket and forwards to the
 * store with a credential the browser never sees.
 *
 * ## Why `tus-js-client`
 *
 * The protocol is not something to write twice. This is the client half of the
 * same protocol the store speaks upstream; between them sits the proxy, which
 * forwards rather than reimplements.
 *
 * ## What resuming means here
 *
 * The library remembers where it got to, keyed by the file and the endpoint, so
 * an interrupted upload of the same file continues rather than starting again.
 * The fingerprint is dropped on success — a second, deliberate upload of the
 * same photo is a second file, not a resumption of a finished one.
 */

export interface ResumableProgress {
  readonly sent: number;
  readonly total: number;
  /** 0 to 1, for a bar somebody watches. */
  readonly ratio: number;
}

export interface ResumableHandle {
  /** Stops the upload. What is already in the store is never registered. */
  readonly abort: () => void;
  readonly done: Promise<{ ok: true } | { ok: false; message: string }>;
}

/**
 * Starts one upload and hands back a way to watch it and to stop it.
 *
 * The promise never rejects: a failure is a value, because every caller has to
 * say something to a person either way.
 */
export function uploadResumable(
  file: File,
  ticket: string,
  onProgress: (progress: ResumableProgress) => void,
): ResumableHandle {
  let settle: (result: { ok: true } | { ok: false; message: string }) => void = () => {
    // Replaced synchronously below; a no-op only if the promise is never built.
  };

  const done = new Promise<{ ok: true } | { ok: false; message: string }>((resolve) => {
    settle = resolve;
  });

  const upload = new tus.Upload(file, {
    endpoint: RESUMABLE_ENDPOINT,
    // Six megabytes, because that is what the store requires of every chunk but
    // the last — see `RESUMABLE_CHUNK_BYTES`.
    chunkSize: RESUMABLE_CHUNK_BYTES,
    headers: { [UPLOAD_TICKET_HEADER]: ticket },
    // A dropped connection retries on its own before the person is told.
    retryDelays: [0, 1000, 3000, 6000, 12000],
    removeFingerprintOnSuccess: true,
    uploadSize: file.size,
    onProgress: (sent, total) => {
      onProgress({ sent, total, ratio: total > 0 ? sent / total : 0 });
    },
    onSuccess: () => {
      settle({ ok: true });
    },
    onError: (error) => {
      settle({
        ok: false,
        message:
          error instanceof Error && error.message !== ''
            ? error.message
            : 'Der Upload wurde unterbrochen.',
      });
    },
  });

  /**
   * Continue where a previous attempt stopped, if there was one.
   *
   * `findPreviousUploads` reads the library's own record of unfinished uploads
   * for this file. Resuming is the point of taking this road at all — a phone
   * that changed network mid-way should not start over.
   */
  void upload.findPreviousUploads().then((previous) => {
    const first = previous[0];
    if (first !== undefined) upload.resumeFromPreviousUpload(first);

    upload.start();
  });

  return {
    abort: () => {
      void upload.abort(true).then(
        () => {
          settle({ ok: false, message: 'Der Upload wurde abgebrochen.' });
        },
        () => {
          settle({ ok: false, message: 'Der Upload wurde abgebrochen.' });
        },
      );
    },
    done,
  };
}
