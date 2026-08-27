import type { Landmark } from '@apex/domain';

import type { FrameReader, VideoClip } from './pipeline';
import type { PoseLandmarker } from '@mediapipe/tasks-vision';

/**
 * A `FrameReader` over a `<video>` element the browser already holds.
 *
 * ## The file never leaves the device
 *
 * The element is fed an object URL over the `File` the coach picked. Nothing is
 * uploaded, nothing is copied to a server, and the URL is revoked when the
 * screen is done with it. That is the whole privacy story of this MVP, and it
 * rests on this one file not growing a `fetch`.
 *
 * ## Rotation
 *
 * A phone records landscape frames and stores a rotation in the container. Every
 * browser this targets applies that rotation before exposing `videoWidth` and
 * `videoHeight`, so those two are the **displayed** dimensions and the aspect
 * ratio taken from them is the one the angle correction needs. Reading the frame
 * size from anywhere else — the file, a fixed 16:9 — is what silently turns every
 * portrait recording into wrong angles.
 *
 * ## Seeking rather than playing
 *
 * Playing the video would tie the analysis to real time: a two-minute recording
 * would take two minutes even on a machine that could do it in twenty seconds,
 * and on a slow one frames would pass unseen. Seeking to each sample point
 * decouples the two, and it is also what keeps the interface alive — each frame
 * ends at an `await`, so the event loop gets a turn between inferences.
 */

/** How long to wait for one seek before treating the frame as unreadable. */
const SEEK_TIMEOUT_MS = 5000;

/** Below this the browser is treated as already there. One frame at 60 fps. */
const SEEK_EPSILON_SEC = 0.016;

export interface LoadedVideo {
  readonly element: HTMLVideoElement;
  readonly clip: VideoClip;
  /** Revokes the object URL and detaches the source. */
  readonly release: () => void;
}

/**
 * Puts a picked file into a video element and waits until it can be measured.
 *
 * Resolves only once duration **and** dimensions are known: a video element
 * reports `readyState` before it reports a usable `videoWidth`, and an analysis
 * started at that moment computes every angle against an aspect ratio of zero.
 */
export function loadVideoFile(file: File): Promise<LoadedVideo> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const element = document.createElement('video');

    // `muted` and `playsInline` are what let iOS Safari decode at all without a
    // user gesture; the element is never shown playing, but it still has to be
    // allowed to decode.
    element.muted = true;
    element.playsInline = true;
    element.preload = 'auto';
    element.src = url;

    const release = () => {
      element.removeAttribute('src');
      element.load();
      URL.revokeObjectURL(url);
    };

    const fail = (message: string) => {
      cleanup();
      release();
      reject(new Error(message));
    };

    const onLoaded = () => {
      const durationMs = Number.isFinite(element.duration) ? element.duration * 1000 : 0;

      if (durationMs <= 0) {
        fail('Die Länge dieses Videos konnte nicht gelesen werden.');

        return;
      }

      if (element.videoWidth === 0 || element.videoHeight === 0) {
        fail('Die Bildgröße dieses Videos konnte nicht gelesen werden.');

        return;
      }

      cleanup();
      resolve({
        element,
        clip: { durationMs, width: element.videoWidth, height: element.videoHeight },
        release,
      });
    };

    const onError = () => {
      fail(
        'Dieses Video konnte nicht geöffnet werden. Möglicherweise ist das Format nicht unterstützt.',
      );
    };

    function cleanup() {
      element.removeEventListener('loadedmetadata', onLoaded);
      element.removeEventListener('error', onError);
    }

    element.addEventListener('loadedmetadata', onLoaded);
    element.addEventListener('error', onError);
    element.load();
  });
}

/** Moves the element to a point in the recording and waits for the frame. */
function seekTo(element: HTMLVideoElement, timeSec: number): Promise<void> {
  return new Promise((resolve, reject) => {
    if (Math.abs(element.currentTime - timeSec) < SEEK_EPSILON_SEC && element.readyState >= 2) {
      resolve();

      return;
    }

    const timer = setTimeout(() => {
      cleanup();
      reject(new Error('Zeitpunkt im Video nicht erreichbar.'));
    }, SEEK_TIMEOUT_MS);

    const onSeeked = () => {
      cleanup();
      resolve();
    };

    const onError = () => {
      cleanup();
      reject(new Error('Fehler beim Springen im Video.'));
    };

    function cleanup() {
      clearTimeout(timer);
      element.removeEventListener('seeked', onSeeked);
      element.removeEventListener('error', onError);
    }

    element.addEventListener('seeked', onSeeked);
    element.addEventListener('error', onError);
    element.currentTime = timeSec;
  });
}

/**
 * The reader the pipeline drives.
 *
 * `detectForVideo` insists on timestamps that never go backwards, so the reader
 * keeps its own monotonic clock instead of passing the video position: two
 * sample points can round to the same millisecond in a short clip, and the model
 * rejects the second one.
 */
export function createVideoFrameReader(
  video: LoadedVideo,
  landmarker: PoseLandmarker,
): FrameReader {
  let lastTimestamp = 0;

  return {
    clip: video.clip,
    async readAt(timeMs: number): Promise<readonly Landmark[] | null> {
      await seekTo(video.element, timeMs / 1000);

      lastTimestamp = Math.max(lastTimestamp + 1, Math.round(timeMs));

      const result = landmarker.detectForVideo(video.element, lastTimestamp);
      const pose = result.landmarks[0];

      return pose ?? null;
    },
  };
}
