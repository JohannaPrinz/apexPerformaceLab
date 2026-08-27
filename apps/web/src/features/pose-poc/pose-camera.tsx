'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  initialRepState,
  median,
  pushAngle,
  squatAngles,
  type Landmark,
  type RepState,
  type SquatAngles,
} from '@apex/domain';

import type { PoseLandmarker } from '@mediapipe/tasks-vision';

/**
 * Proof of concept: pose estimation in the browser, nothing stored.
 *
 * ## What this is deliberately not
 *
 * It writes nothing, reads nothing, and knows about no assessment, athlete or
 * measurement. Deleting `features/pose-poc/` and `app/(poc)/` removes it
 * entirely — that isolation is the point, so the question "does this work on a
 * tablet" can be answered before anything is built on the answer.
 *
 * ## Why the model runs on the main thread here
 *
 * `detectForVideo` takes an `HTMLVideoElement`, which cannot cross into a
 * worker. Moving it would mean drawing each frame to an `OffscreenCanvas`,
 * transferring an `ImageBitmap`, and running the WASM runtime a second time —
 * real work, and worth it only if the main thread is actually the bottleneck.
 * The panel therefore reports inference time separately from frame rate, so
 * the measurement decides rather than the assumption.
 *
 * ## What it never says
 *
 * No verdict. An angle is a number and a repetition is a count; whether either
 * is good is not something this can know.
 */

/** Pinned to the installed version so the runtime matches the typings. */
const WASM_BASE = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm';

const MODELS = {
  lite: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task',
  full: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task',
} as const;

type ModelName = keyof typeof MODELS;

/** The pairs drawn as bones. Torso and legs only — this is a squat. */
const BONES: readonly (readonly [number, number])[] = [
  [11, 12],
  [11, 23],
  [12, 24],
  [23, 24],
  [23, 25],
  [24, 26],
  [25, 27],
  [26, 28],
  [27, 31],
  [28, 32],
];

type Status =
  | { kind: 'idle' }
  | { kind: 'loading'; step: string }
  | { kind: 'running' }
  | { kind: 'error'; message: string };

interface Diagnostics {
  /** Frames the loop actually processed in the last second. */
  readonly fps: number;
  /** Rolling mean of `detectForVideo`, in milliseconds. */
  readonly inferenceMs: number;
  /** Longest inference seen since the start — the stutter a coach notices. */
  readonly worstInferenceMs: number;
  /** Frames since the last usable pose. */
  readonly framesWithoutPose: number;
  readonly totalFrames: number;
}

const NO_DIAGNOSTICS: Diagnostics = {
  fps: 0,
  inferenceMs: 0,
  worstInferenceMs: 0,
  framesWithoutPose: 0,
  totalFrames: 0,
};

export function PoseCamera() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const landmarkerRef = useRef<PoseLandmarker | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const frameRef = useRef<number | null>(null);
  const repsRef = useRef<RepState>(initialRepState);
  const historyRef = useRef<number[]>([]);
  const lastVideoTimeRef = useRef(-1);

  const [status, setStatus] = useState<Status>({ kind: 'idle' });
  const [model, setModel] = useState<ModelName>('lite');
  const [angles, setAngles] = useState<SquatAngles | null>(null);
  const [reps, setReps] = useState<RepState>(initialRepState);
  const [diagnostics, setDiagnostics] = useState<Diagnostics>(NO_DIAGNOSTICS);

  const stop = useCallback(() => {
    if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
    frameRef.current = null;

    for (const track of streamRef.current?.getTracks() ?? []) track.stop();
    streamRef.current = null;

    landmarkerRef.current?.close();
    landmarkerRef.current = null;

    lastVideoTimeRef.current = -1;
    setStatus({ kind: 'idle' });
  }, []);

  // Releasing the camera when the page goes away is not optional: a stream left
  // running keeps the indicator lit and the sensor warm.
  useEffect(() => stop, [stop]);

  // Declared before `start`, which calls it: a `const` callback referenced
  // earlier in the body would throw before initialisation.
  const loop = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const landmarker = landmarkerRef.current;

    if (!video || !canvas || !landmarker) return;

    let framesThisSecond = 0;
    let secondStartedAt = performance.now();
    let inferenceMean = 0;
    let worst = 0;
    let withoutPose = 0;
    let total = 0;

    const step = () => {
      frameRef.current = requestAnimationFrame(step);

      // The camera delivers ~30 fps while the display refreshes at 60+. Running
      // the model on a frame it has already seen costs the same and tells you
      // nothing new.
      if (video.currentTime === lastVideoTimeRef.current) return;
      lastVideoTimeRef.current = video.currentTime;

      const startedAt = performance.now();
      const result = landmarker.detectForVideo(video, startedAt);
      const took = performance.now() - startedAt;

      inferenceMean = inferenceMean === 0 ? took : inferenceMean * 0.9 + took * 0.1;
      worst = Math.max(worst, took);
      total += 1;
      framesThisSecond += 1;

      const pose = result.landmarks[0] as Landmark[] | undefined;
      const aspect = video.videoWidth / video.videoHeight;
      const measured = pose ? squatAngles(pose, aspect) : null;

      draw(canvas, video, pose);

      if (measured === null) {
        withoutPose += 1;
        repsRef.current = pushAngle(repsRef.current, null, startedAt);
      } else {
        withoutPose = 0;

        // The knee that the model saw more confidently. A single camera sees
        // one side better than the other, and averaging the two would mix a
        // measured angle with a guessed one.
        const knee = Math.max(measured.leftKnee, measured.rightKnee);
        historyRef.current = [...historyRef.current.slice(-4), knee];
        repsRef.current = pushAngle(repsRef.current, median(historyRef.current), startedAt);
      }

      setAngles(measured);
      setReps(repsRef.current);

      const elapsed = performance.now() - secondStartedAt;
      if (elapsed >= 1000) {
        setDiagnostics({
          fps: Math.round((framesThisSecond * 1000) / elapsed),
          inferenceMs: Math.round(inferenceMean * 10) / 10,
          worstInferenceMs: Math.round(worst),
          framesWithoutPose: withoutPose,
          totalFrames: total,
        });
        framesThisSecond = 0;
        secondStartedAt = performance.now();
      }
    };

    frameRef.current = requestAnimationFrame(step);
  }, []);

  const start = useCallback(async () => {
    repsRef.current = initialRepState;
    historyRef.current = [];
    setReps(initialRepState);
    setAngles(null);
    setDiagnostics(NO_DIAGNOSTICS);

    try {
      setStatus({ kind: 'loading', step: 'Modell wird geladen' });

      // Imported here rather than at module scope: the WASM runtime is several
      // megabytes and nothing but this proof of concept should pay for it.
      const { FilesetResolver, PoseLandmarker } = await import('@mediapipe/tasks-vision');
      const fileset = await FilesetResolver.forVisionTasks(WASM_BASE);

      const landmarker = await PoseLandmarker.createFromOptions(fileset, {
        baseOptions: { modelAssetPath: MODELS[model], delegate: 'GPU' },
        runningMode: 'VIDEO',
        numPoses: 1,
      });
      landmarkerRef.current = landmarker;

      setStatus({ kind: 'loading', step: 'Kamera wird geöffnet' });

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: 'environment',
          width: { ideal: 1280 },
          height: { ideal: 720 },
          frameRate: { ideal: 30 },
        },
        audio: false,
      });
      streamRef.current = stream;

      const video = videoRef.current;
      if (!video) throw new Error('Kein Videoelement.');

      video.srcObject = stream;
      await video.play();

      setStatus({ kind: 'running' });
      loop();
    } catch (error) {
      stop();
      setStatus({
        kind: 'error',
        message: error instanceof Error ? error.message : 'Unbekannter Fehler.',
      });
    }
  }, [loop, model, stop]);

  const running = status.kind === 'running';

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={running ? stop : () => void start()}
          disabled={status.kind === 'loading'}
          className="h-11 rounded-md border border-input bg-accent px-4 text-sm font-medium text-accent-foreground disabled:opacity-50 lg:h-9"
        >
          {status.kind === 'loading' ? status.step + ' …' : running ? 'Stoppen' : 'Kamera starten'}
        </button>

        <label className="flex items-center gap-2 text-sm">
          Modell
          <select
            value={model}
            disabled={running || status.kind === 'loading'}
            onChange={(event) => {
              setModel(event.target.value as ModelName);
            }}
            className="h-11 rounded-md border border-input bg-background px-2 text-sm disabled:opacity-50 lg:h-9"
          >
            <option value="lite">lite (5,5 MB)</option>
            <option value="full">full (9,0 MB)</option>
          </select>
        </label>
      </div>

      {status.kind === 'error' ? (
        <p role="alert" className="rounded-md border border-destructive px-3 py-2 text-sm">
          {status.message}
        </p>
      ) : null}

      <div className="relative aspect-video w-full overflow-hidden rounded-md bg-black">
        {/* `playsInline` is what stops iOS taking the video fullscreen; muted
            and autoPlay are what let it start without a gesture on Android. */}
        <video
          ref={videoRef}
          playsInline
          muted
          autoPlay
          className="absolute inset-0 h-full w-full object-contain"
        />
        <canvas ref={canvasRef} className="absolute inset-0 h-full w-full" />

        {running && diagnostics.framesWithoutPose > 15 ? (
          <p className="absolute inset-x-0 bottom-0 bg-black/70 px-3 py-2 text-center text-sm text-white">
            Keine Person erkannt.
          </p>
        ) : null}
      </div>

      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Readout label="Wiederholungen" value={String(reps.reps.length)} />
        <Readout
          label="Knie"
          value={
            angles === null ? '—' : `${Math.round(Math.max(angles.leftKnee, angles.rightKnee))}°`
          }
        />
        <Readout
          label="Hüfte"
          value={
            angles === null ? '—' : `${Math.round(Math.max(angles.leftHip, angles.rightHip))}°`
          }
        />
        <Readout
          label="Rumpfneigung"
          value={angles === null ? '—' : `${Math.round(angles.trunkLean)}°`}
        />
      </dl>

      <details className="rounded-md border border-border">
        {/* A browser run measured this at 36px, below what a finger needs. */}
        <summary className="flex min-h-11 cursor-pointer items-center px-3 text-sm lg:min-h-9">
          Messwerte des Durchlaufs
        </summary>

        <dl className="grid grid-cols-2 gap-3 px-3 pb-3 sm:grid-cols-3">
          <Readout label="Bilder/s" value={String(diagnostics.fps)} />
          <Readout label="Inferenz ø" value={`${String(diagnostics.inferenceMs)} ms`} />
          <Readout label="Inferenz max" value={`${String(diagnostics.worstInferenceMs)} ms`} />
          <Readout label="Bilder gesamt" value={String(diagnostics.totalFrames)} />
          <Readout label="ohne Pose" value={String(diagnostics.framesWithoutPose)} />
          <Readout label="übersprungen" value={String(reps.skippedFrames)} />
          <Readout
            label="Sichtbarkeit"
            value={angles === null ? '—' : angles.confidence.toFixed(2)}
          />
          <Readout
            label="Knie 3D"
            value={
              angles === null
                ? '—'
                : `${String(Math.round(Math.max(angles.leftKnee3D, angles.rightKnee3D)))}°`
            }
          />
          <Readout label="Phase" value={reps.phase} />
        </dl>

        {reps.reps.length === 0 ? null : (
          <ul className="flex flex-col gap-1 px-3 pb-3 text-xs">
            {reps.reps.map((rep) => (
              <li key={rep.index}>
                #{rep.index} · tiefster Winkel {Math.round(rep.lowestPrimary)}° ·{' '}
                {(rep.durationMs / 1000).toFixed(1)} s
              </li>
            ))}
          </ul>
        )}
      </details>
    </div>
  );
}

function Readout({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 rounded-md border border-border p-2">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="text-lg font-semibold" data-numeric>
        {value}
      </dd>
    </div>
  );
}

/** Skeleton and joints, sized to the canvas rather than to the video. */
function draw(
  canvas: HTMLCanvasElement,
  video: HTMLVideoElement,
  pose: readonly Landmark[] | undefined,
) {
  const context = canvas.getContext('2d');
  if (!context) return;

  const { clientWidth: width, clientHeight: height } = canvas;
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }

  context.clearRect(0, 0, width, height);
  if (!pose) return;

  // `object-contain` letterboxes the video inside the canvas; without matching
  // that here the skeleton drifts off the body on any non-16:9 stream.
  const scale = Math.min(width / video.videoWidth, height / video.videoHeight);
  const drawnWidth = video.videoWidth * scale;
  const drawnHeight = video.videoHeight * scale;
  const offsetX = (width - drawnWidth) / 2;
  const offsetY = (height - drawnHeight) / 2;

  const at = (landmark: Landmark) => ({
    x: offsetX + landmark.x * drawnWidth,
    y: offsetY + landmark.y * drawnHeight,
  });

  context.strokeStyle = 'rgba(56, 189, 248, 0.9)';
  context.lineWidth = 3;

  for (const [from, to] of BONES) {
    const a = pose[from];
    const b = pose[to];
    if (!a || !b) continue;
    if ((a.visibility ?? 0) < 0.5 || (b.visibility ?? 0) < 0.5) continue;

    const start = at(a);
    const end = at(b);
    context.beginPath();
    context.moveTo(start.x, start.y);
    context.lineTo(end.x, end.y);
    context.stroke();
  }

  context.fillStyle = 'rgba(250, 250, 250, 0.95)';
  for (const landmark of pose) {
    if ((landmark.visibility ?? 0) < 0.5) continue;
    const { x, y } = at(landmark);
    context.beginPath();
    context.arc(x, y, 4, 0, Math.PI * 2);
    context.fill();
  }
}
