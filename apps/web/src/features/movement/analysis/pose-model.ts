import type { PoseLandmarker } from '@mediapipe/tasks-vision';

/**
 * Loading the pose model.
 *
 * One place, because the uploaded-video path and the live camera need the same
 * runtime and must not each pin their own version — two WASM builds in one page
 * is several megabytes of the same thing.
 *
 * ## The model still comes from a CDN
 *
 * Deliberately unchanged from the proof of concept, and deliberately called out:
 * it makes the feature unusable offline and adds a third party to the request
 * path. Moving the `.task` files and the WASM bundle into `public/` is a build
 * step and a licence note, not a code change — see the slice README. It is
 * listed there as the first thing to do before this is used in a gym with poor
 * reception.
 *
 * No video and no frame leaves the browser either way: what is fetched is the
 * model, and what runs is arithmetic on the device.
 */

/** Pinned to the installed version so the runtime matches the typings. */
const WASM_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm';

export const POSE_MODELS = {
  lite: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
  full: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task',
} as const;

export type PoseModelName = keyof typeof POSE_MODELS;

export const POSE_MODEL_LABELS: Readonly<Record<PoseModelName, string>> = {
  lite: 'Schnell (lite)',
  full: 'Genauer (full)',
};

/**
 * Creates a landmarker in `VIDEO` mode.
 *
 * The import is dynamic on purpose: the runtime is several megabytes, and only
 * the screens that actually analyse something should pay for it.
 */
export async function createPoseLandmarker(model: PoseModelName): Promise<PoseLandmarker> {
  const { FilesetResolver, PoseLandmarker } = await import('@mediapipe/tasks-vision');
  const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);

  return PoseLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: POSE_MODELS[model], delegate: 'GPU' },
    runningMode: 'VIDEO',
    numPoses: 1,
  });
}
