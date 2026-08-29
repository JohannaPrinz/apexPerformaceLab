'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Download, FileVideo, Pause, Play, RotateCcw, ShieldCheck, Square } from 'lucide-react';

import {
  checkTargets,
  defaultAnalysisConfig,
  movementValues,
  MOVEMENT_REFUSAL_MESSAGES,
  profileForExercise,
  summariseBlocks,
  type AngleTargetConfig,
  type AnnotatedFrame,
  type ModuleConfiguration,
  type MovementProfile,
  type MovementRefusal,
  type MovementResult,
  type MovementSide,
  type SummaryBlock,
} from '@apex/domain';
import { Button } from '@apex/ui';

import { FOCUS_RING, TOUCH_BUTTON, TOUCH_TARGET } from '@/components/common/touch';

import { drawSkeleton } from '../analysis/draw';
import { captureKeyframes, type Keyframe } from '../analysis/keyframes';
import {
  analyseClip,
  DEFAULT_SAMPLE_FPS,
  frameCountOf,
  type AnalysisProgress,
} from '../analysis/pipeline';
import {
  createPoseLandmarker,
  POSE_MODEL_LABELS,
  type PoseModelName,
} from '../analysis/pose-model';
import { createVideoFrameReader, loadVideoFile, type LoadedVideo } from '../analysis/video-reader';
import { summaryLines } from '../export/overlay';
import { annotatedExportSupport, recordAnnotatedClip } from '../export/record';

import { AnalysisResults } from './analysis-results';
import { AnalysisSetup } from './analysis-setup';
import { AssignAnalysis, type AthleteChoice } from './assign-analysis';
import { KeyframeStrip } from './keyframe-strip';
import { SignalChart } from './signal-chart';

import type { PoseLandmarker } from '@mediapipe/tasks-vision';

/**
 * Choose an exercise, choose what to measure, analyse, keep the numbers.
 *
 * ## The order is the decision order
 *
 * Exercise → angles → optional targets → video → analyse. Each step narrows the
 * next: the exercise decides which angles exist, the angles decide which targets
 * are possible, and only then is there a point in picking a file. Asking for the
 * video first would mean measuring things the coach did not want and hiding them
 * afterwards.
 *
 * ## The recording never leaves the device
 *
 * The file goes into a `<video>` element by object URL and is read frame by
 * frame in this tab. Nothing is uploaded, and nothing about the video is stored
 * — not the file, not a still, not the landmarks. What can be saved is the
 * handful of derived numbers, and only when the coach presses save.
 */

/** An exercise the coach can analyse — one with a movement profile. */
export interface AnalysableExercise {
  readonly id: string;
  readonly key: string;
  readonly name: string;
}

export type AnalysisTarget =
  /** Started from inside a test — the values have a place already. */
  | {
      readonly kind: 'module';
      readonly moduleId: string;
      readonly assessmentId: string;
      readonly configuration: ModuleConfiguration | null;
      readonly types: Readonly<Record<string, { key: string; name: string; unit: string }>>;
      readonly exercises: readonly AnalysableExercise[];
    }
  /** Started on its own — the athlete is chosen after the analysis. */
  | {
      readonly kind: 'standalone';
      readonly athletes: readonly AthleteChoice[];
      readonly suggestedAthleteId?: string | undefined;
      readonly exercises: readonly AnalysableExercise[];
    };

type Phase =
  | { readonly kind: 'empty' }
  | { readonly kind: 'chosen'; readonly file: File; readonly video: LoadedVideo }
  | { readonly kind: 'preparing'; readonly step: string }
  | { readonly kind: 'running'; readonly progress: AnalysisProgress; readonly totalFrames: number }
  | {
      readonly kind: 'done';
      readonly result: MovementResult;
      readonly progress: AnalysisProgress;
      readonly recordedAt: string;
      readonly keyframes: readonly Keyframe[];
      /**
       * Every frame the analysis read, with the pose and angles it measured.
       *
       * Held here for as long as the results are on screen so the annotated
       * export can be drawn from the analysis's own numbers. Dropped with the
       * rest of the phase when the coach starts over — like the video, it is
       * never stored and never leaves the tab.
       */
      readonly annotations: readonly AnnotatedFrame[];
    }
  | { readonly kind: 'refused'; readonly refusal: MovementRefusal; readonly detail: string }
  | { readonly kind: 'error'; readonly message: string };

const SECONDS = new Intl.NumberFormat('de-DE', { maximumFractionDigits: 1 });

export function VideoAnalysis({ target }: { readonly target: AnalysisTarget }) {
  const [phase, setPhase] = useState<Phase>({ kind: 'empty' });
  const [model, setModel] = useState<PoseModelName>('lite');
  const [sampleFps, setSampleFps] = useState(DEFAULT_SAMPLE_FPS);

  // One exercise with a profile is not a choice, so it is not asked as one.
  const [exerciseId, setExerciseId] = useState(
    target.exercises.length === 1 ? (target.exercises[0]?.id ?? '') : '',
  );

  const exercise = target.exercises.find((entry) => entry.id === exerciseId) ?? null;
  const profile = useMemo(() => profileForExercise(exercise?.key), [exercise?.key]);

  const [tracks, setTracks] = useState<readonly string[]>([]);
  const [targets, setTargets] = useState<readonly AngleTargetConfig[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [excluded, setExcluded] = useState<string[]>([]);

  const videoRef = useRef<LoadedVideo | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const landmarkerRef = useRef<PoseLandmarker | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Every angle, until the coach says otherwise — the default the brief asks
  // for, applied whenever the exercise changes because the previous selection
  // named tracks another movement may not have.
  const profileKey = profile?.key ?? null;
  const [appliedProfile, setAppliedProfile] = useState<string | null>(null);

  if (profileKey !== appliedProfile) {
    setAppliedProfile(profileKey);
    setTracks(profile === null ? [] : (defaultAnalysisConfig(profile).tracks ?? []));
    setTargets([]);
  }

  const release = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    videoRef.current?.release();
    videoRef.current = null;
    landmarkerRef.current?.close();
    landmarkerRef.current = null;
  }, []);

  // Leaving the screen must not leave a decoded video and a WASM runtime behind:
  // both are tens of megabytes, and on a phone that is the difference between a
  // second analysis working and the tab being killed.
  useEffect(() => release, [release]);

  const choose = async (file: File | undefined) => {
    release();
    setPhase({ kind: 'preparing', step: 'Video wird geöffnet' });

    if (file === undefined) {
      setPhase({ kind: 'empty' });

      return;
    }

    try {
      const video = await loadVideoFile(file);
      videoRef.current = video;

      // Mounted rather than kept detached: watching the video scrub past while
      // the skeleton tracks it is the only feedback that says the model is
      // actually seeing the athlete — a bar at 40 % says nothing about that.
      const stage = stageRef.current;
      if (stage) {
        stage.replaceChildren();
        video.element.className = 'block max-h-[60vh] w-auto max-w-full';
        video.element.controls = false;
        stage.append(video.element);
      }

      setPhase({ kind: 'chosen', file, video });
    } catch (error) {
      setPhase({
        kind: 'error',
        message:
          error instanceof Error ? error.message : 'Dieses Video konnte nicht geöffnet werden.',
      });
    }
  };

  const analyse = async (file: File, video: LoadedVideo) => {
    if (profile === null) return;

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      setPhase({ kind: 'preparing', step: 'Modell wird geladen' });

      landmarkerRef.current ??= await createPoseLandmarker(model);

      const reader = createVideoFrameReader(video, landmarkerRef.current);
      const totalFrames = frameCountOf(video.clip, sampleFps);

      setPhase({
        kind: 'running',
        totalFrames,
        progress: {
          processedFrames: 0,
          totalFrames,
          positionMs: 0,
          inferenceMs: 0,
          worstInferenceMs: 0,
          elapsedMs: 0,
        },
      });

      const run = await analyseClip(reader, profile, tracks, {
        sampleFps,
        signal: controller.signal,
        // Kept so the annotated export can use the analysis's own landmarks and
        // angles. Asking the model again would produce a video whose numbers
        // disagree with the table beside it.
        collectFrames: true,
        onProgress: (progress) => setPhase({ kind: 'running', progress, totalFrames }),
        onFrame: (landmarks) => {
          const canvas = overlayRef.current;
          if (!canvas) return;

          const box = video.element.getBoundingClientRect();
          if (box.width === 0) return;

          if (canvas.width !== Math.round(box.width)) {
            canvas.width = Math.round(box.width);
            canvas.height = Math.round(box.height);
          }

          const context = canvas.getContext('2d');
          if (!context) return;

          context.clearRect(0, 0, canvas.width, canvas.height);
          if (landmarks === null) return;

          drawSkeleton(context, landmarks, canvas.width, canvas.height, canvas.width / 640);
        },
      });

      if (run.kind === 'failed') {
        setPhase({ kind: 'error', message: run.message });

        return;
      }

      if (!run.outcome.ok) {
        setPhase({
          kind: 'refused',
          refusal: run.outcome.refusal,
          detail: `${String(run.outcome.frames.usable)} von ${String(run.outcome.frames.total)} ausgewerteten Bildern zeigten eine Person.`,
        });

        return;
      }

      // No further inference: the stills are drawn from the poses the analysis
      // already measured, which is the only way picture and table can be talking
      // about the same thing.
      setPhase({ kind: 'preparing', step: 'Standbilder werden erzeugt' });

      const keyframes = await captureKeyframes(
        video,
        profile,
        tracks,
        run.keyFrames,
        run.outcome.result.clearerSide,
      );

      setPhase({
        kind: 'done',
        keyframes,
        annotations: run.annotations,
        result: run.outcome.result,
        progress: run.progress,
        // The file's own timestamp where the browser exposes one; otherwise now.
        recordedAt: new Date(file.lastModified > 0 ? file.lastModified : Date.now()).toISOString(),
      });
    } catch (error) {
      setPhase({
        kind: 'error',
        message:
          error instanceof Error
            ? error.message
            : 'Die Analyse konnte nicht gestartet werden. Läuft dieser Browser mit WebGL?',
      });
    } finally {
      abortRef.current = null;
    }
  };

  const reset = () => {
    release();
    setDrafts({});
    setExcluded([]);
    setPhase({ kind: 'empty' });
  };

  const values = useMemo(
    () => (phase.kind === 'done' && profile ? movementValues(phase.result, profile) : []),
    [phase, profile],
  );

  const edited = useMemo(
    () =>
      Object.fromEntries(
        Object.entries(drafts)
          .map(([id, raw]) => [id, Number(raw.replace(',', '.'))] as const)
          .filter(([, parsed]) => Number.isFinite(parsed)),
      ),
    [drafts],
  );

  const onDraft = (id: string, raw: string) => setDrafts((current) => ({ ...current, [id]: raw }));
  const onToggle = (ids: readonly string[], include: boolean) =>
    setExcluded((current) =>
      include ? current.filter((id) => !ids.includes(id)) : [...new Set([...current, ...ids])],
    );

  const configuring = phase.kind === 'empty' || phase.kind === 'chosen';

  return (
    <div className="flex flex-col gap-8">
      <p className="flex max-w-prose items-start gap-2 rounded-md bg-muted px-3 py-2 text-sm text-pretty">
        <ShieldCheck aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <span>
          Das Video wird ausschließlich auf diesem Gerät ausgewertet. Es wird nicht hochgeladen und
          nicht gespeichert. Gespeichert werden nur die berechneten Werte, wenn Sie sie übernehmen.
        </span>
      </p>

      {configuring ? (
        <>
          <section aria-label="Übung" className="flex flex-col gap-2">
            <h2 className="text-sm font-medium">Übung</h2>
            {target.exercises.length === 0 ? (
              <p role="alert" className="max-w-prose text-sm text-pretty text-destructive">
                Für keine Übung dieses Workspace ist bisher ein Bewegungsprofil hinterlegt. Zurzeit
                ist ausschließlich die Kniebeuge auswertbar.
              </p>
            ) : (
              <label className="flex max-w-sm flex-col gap-1.5 text-sm">
                <span className="sr-only">Übung wählen</span>
                <select
                  className={`${FOCUS_RING} h-11 rounded-md border border-input bg-background px-3 text-base lg:h-9 lg:text-sm`}
                  value={exerciseId}
                  onChange={(event) => setExerciseId(event.target.value)}
                >
                  <option value="">Bitte wählen</option>
                  {target.exercises.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.name}
                    </option>
                  ))}
                </select>
              </label>
            )}
          </section>

          {profile === null ? null : (
            <AnalysisSetup
              profile={profile}
              tracks={tracks}
              targets={targets}
              onTracksChange={setTracks}
              onTargetsChange={setTargets}
            />
          )}
        </>
      ) : null}

      {/* The video stays in the tree across every phase — the element is
          appended to it imperatively, so unmounting the wrapper would detach the
          very thing being read. Only the column beside it appears. */}
      <div
        className={
          phase.kind === 'done'
            ? 'grid items-start gap-6 lg:grid-cols-[minmax(0,auto)_minmax(18rem,1fr)]'
            : ''
        }
      >
        <section
          aria-label="Video"
          className={
            phase.kind === 'empty' || phase.kind === 'error' ? 'hidden' : 'flex flex-col gap-2'
          }
        >
          {/* `w-fit` so the wrapper hugs the video: the overlay is positioned
              against this box, and a wider wrapper would offset every bone. */}
          <div className="relative w-fit overflow-hidden rounded-md border border-border bg-muted">
            <div ref={stageRef} />
            <canvas
              ref={overlayRef}
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 h-full w-full"
            />
          </div>

          {phase.kind === 'running' ? (
            <p className="text-xs text-muted-foreground">
              Das Skelett zeigt, was das Modell im jeweils gelesenen Bild erkannt hat.
            </p>
          ) : null}

          {phase.kind === 'done' || phase.kind === 'refused' ? (
            <ReplayControls video={videoRef} overlay={overlayRef} />
          ) : null}

          {phase.kind === 'done' && profile ? (
            <ExportControl
              video={videoRef}
              overlay={overlayRef}
              annotations={phase.annotations}
              profile={profile}
              tracks={tracks}
              targets={targets}
              side={phase.result.clearerSide}
              summary={summaryLines(
                phase.result.repetitions,
                checkTargets(values, profile, targets, edited),
              )}
            />
          ) : null}
        </section>

        {phase.kind === 'done' && profile ? (
          <SummaryBlocks blocks={summariseBlocks(phase.result, profile, values, targets, edited)} />
        ) : null}
      </div>

      {phase.kind === 'done' && profile ? (
        <>
          <RunSummary progress={phase.progress} sampleFps={sampleFps} />

          <KeyframeStrip keyframes={phase.keyframes} />

          <section aria-label="Bewegungsverlauf" className="flex flex-col gap-2">
            <h2 className="text-sm font-medium">Bewegungsverlauf</h2>
            <SignalChart
              signal={phase.result.signal}
              reps={phase.result.reps}
              durationMs={phase.result.signal.at(-1)?.timestampMs ?? 0}
            />
          </section>

          {target.kind === 'standalone' ? (
            <AssignAnalysis
              profile={profile}
              tracks={tracks}
              targets={targets}
              values={values}
              drafts={drafts}
              onDraft={onDraft}
              excluded={excluded}
              onToggle={onToggle}
              summary={summariseBlocks(phase.result, profile, values, targets, edited)}
              athletes={target.athletes}
              suggestedAthleteId={target.suggestedAthleteId}
              exerciseId={exerciseId}
              recordedAt={phase.recordedAt}
              onRestart={reset}
            />
          ) : target.configuration === null ? null : (
            <AnalysisResults
              profile={profile}
              tracks={tracks}
              targets={targets}
              values={values}
              drafts={drafts}
              onDraft={onDraft}
              excluded={excluded}
              onToggle={onToggle}
              summary={summariseBlocks(phase.result, profile, values, targets, edited)}
              moduleId={target.moduleId}
              assessmentId={target.assessmentId}
              configuration={target.configuration}
              types={target.types}
              exerciseId={exerciseId}
              recordedAt={phase.recordedAt}
              onRestart={reset}
            />
          )}
        </>
      ) : null}

      {configuring ? (
        <section aria-label="Video wählen" className="flex flex-col gap-4">
          <h2 className="text-sm font-medium">Video</h2>

          <label
            className={`${TOUCH_TARGET} ${FOCUS_RING} flex w-fit cursor-pointer items-center gap-2 rounded-md border border-input bg-background px-4 text-sm font-medium hover:bg-muted`}
          >
            <FileVideo aria-hidden="true" className="size-4 shrink-0" />
            <span>{phase.kind === 'chosen' ? 'Anderes Video wählen' : 'Video auswählen'}</span>
            <input
              type="file"
              accept="video/*"
              className="sr-only"
              onChange={(event) => void choose(event.target.files?.[0])}
            />
          </label>

          {phase.kind === 'chosen' ? (
            <>
              <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm [&>dd]:min-w-0 [&>dd]:break-all">
                <dt className="text-muted-foreground">Datei</dt>
                <dd>{phase.file.name}</dd>

                <dt className="text-muted-foreground">Dauer</dt>
                <dd data-numeric>{SECONDS.format(phase.video.clip.durationMs / 1000)} s</dd>

                <dt className="text-muted-foreground">Bildgröße</dt>
                <dd data-numeric>
                  {phase.video.clip.width} × {phase.video.clip.height}
                  {phase.video.clip.width >= phase.video.clip.height
                    ? ' (Querformat)'
                    : ' (Hochformat)'}
                </dd>

                <dt className="text-muted-foreground">Auszuwertende Bilder</dt>
                <dd data-numeric>{frameCountOf(phase.video.clip, sampleFps)}</dd>
              </dl>

              <details className="text-sm">
                <summary
                  className={`${TOUCH_TARGET} ${FOCUS_RING} flex cursor-pointer items-center rounded text-muted-foreground hover:text-foreground`}
                >
                  Einstellungen
                </summary>
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <label className="flex flex-col gap-1.5">
                    <span className="font-medium">Modell</span>
                    <select
                      className={`${FOCUS_RING} h-11 rounded-md border border-input bg-background px-3 text-base lg:h-9 lg:text-sm`}
                      value={model}
                      onChange={(event) => {
                        landmarkerRef.current?.close();
                        landmarkerRef.current = null;
                        setModel(event.target.value as PoseModelName);
                      }}
                    >
                      {Object.entries(POSE_MODEL_LABELS).map(([name, label]) => (
                        <option key={name} value={name}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>

                  <label className="flex flex-col gap-1.5">
                    <span className="font-medium">Bilder pro Sekunde</span>
                    <select
                      className={`${FOCUS_RING} h-11 rounded-md border border-input bg-background px-3 text-base lg:h-9 lg:text-sm`}
                      value={String(sampleFps)}
                      onChange={(event) => setSampleFps(Number(event.target.value))}
                    >
                      {[10, 15, 20, 30].map((fps) => (
                        <option key={fps} value={fps}>
                          {fps} fps
                        </option>
                      ))}
                    </select>
                    <span className="text-xs text-pretty text-muted-foreground">
                      Weniger Bilder heißt schneller. Für eine Kniebeuge reichen 15.
                    </span>
                  </label>
                </div>
              </details>

              <Button
                variant="accent"
                className={`${TOUCH_BUTTON} w-full sm:w-fit`}
                disabled={profile === null || tracks.length === 0}
                onClick={() => void analyse(phase.file, phase.video)}
              >
                <Play aria-hidden="true" className="size-4" />
                Video analysieren
              </Button>
            </>
          ) : null}
        </section>
      ) : null}

      {phase.kind === 'preparing' ? (
        <p className="text-sm text-muted-foreground" role="status">
          {phase.step} …
        </p>
      ) : null}

      {phase.kind === 'running' ? (
        <section aria-label="Analyse läuft" className="flex flex-col gap-3">
          <Progress progress={phase.progress} />
          <Button
            variant="outline"
            className={`${TOUCH_BUTTON} w-fit`}
            onClick={() => abortRef.current?.abort()}
          >
            <Square aria-hidden="true" className="size-4" />
            Analyse stoppen
          </Button>
        </section>
      ) : null}

      {phase.kind === 'refused' ? (
        <section aria-label="Kein Ergebnis" className="flex flex-col gap-3">
          <p role="alert" className="max-w-prose text-sm text-pretty">
            {MOVEMENT_REFUSAL_MESSAGES[phase.refusal]}
          </p>
          <p className="text-sm text-muted-foreground">{phase.detail}</p>
          <Button variant="outline" className={`${TOUCH_BUTTON} w-fit`} onClick={reset}>
            Anderes Video wählen
          </Button>
        </section>
      ) : null}

      {phase.kind === 'error' ? (
        <section aria-label="Fehler" className="flex flex-col gap-3">
          <p role="alert" className="max-w-prose text-sm text-pretty text-destructive">
            {phase.message}
          </p>
          <Button variant="outline" className={`${TOUCH_BUTTON} w-fit`} onClick={reset}>
            Erneut versuchen
          </Button>
        </section>
      ) : null}
    </div>
  );
}

/**
 * The summary, in blocks rather than one paragraph.
 *
 * It sits beside the video because the two answer the same question — what
 * happened in this recording — and a coach reads them together.
 */
function SummaryBlocks({ blocks }: { readonly blocks: readonly SummaryBlock[] }) {
  return (
    <section aria-label="Ergebnis" className="flex flex-col gap-4">
      <h2 className="text-sm font-medium">Ergebnis</h2>

      <dl className="flex flex-col gap-3">
        {blocks.map((block) => (
          <div key={block.heading} className="flex flex-col gap-0.5">
            <dt className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              {block.heading}
            </dt>
            {block.lines.map((line) => (
              <dd key={line} className="max-w-prose text-sm text-pretty">
                {line}
              </dd>
            ))}
          </div>
        ))}
      </dl>
    </section>
  );
}

/**
 * Making the annotated video the coach can hand over.
 *
 * ## Why it is offered here and not on the results
 *
 * It is a thing done *to the video*, so it sits with the other video controls.
 * The results below are numbers; this is the recording with those numbers drawn
 * on it.
 *
 * ## What it does not do
 *
 * It does not store anything. The file goes straight to the coach's disk
 * through an object URL that is revoked the moment the download starts — there
 * is no upload, no link, and nothing left in the tab afterwards.
 *
 * ## Why the button can be disabled with a sentence
 *
 * `MediaRecorder` and `captureStream` are not everywhere. A button that failed
 * after a coach had waited through a whole recording would be worse than one
 * that says up front which part this browser is missing.
 */
function ExportControl({
  video,
  overlay,
  annotations,
  profile,
  tracks,
  targets,
  side,
  summary,
}: {
  readonly video: React.RefObject<LoadedVideo | null>;
  readonly overlay: React.RefObject<HTMLCanvasElement | null>;
  readonly annotations: readonly AnnotatedFrame[];
  readonly profile: MovementProfile;
  readonly tracks: readonly string[];
  readonly targets: readonly AngleTargetConfig[];
  readonly side: MovementSide;
  readonly summary: readonly string[];
}) {
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  /**
   * What this browser can do, asked once.
   *
   * A lazy initialiser rather than an effect: the answer cannot change while the
   * screen is open, and an effect would set state on the first render for no
   * reason. Safe from hydration trouble because this control only exists after
   * an analysis has run, which cannot happen on a server.
   */
  const [support] = useState(annotatedExportSupport);

  const running = progress !== null;

  const start = async () => {
    const loaded = video.current;
    if (!loaded) return;

    // The live overlay draws on a canvas laid over the element. The export
    // paints its own, so the two would otherwise show the skeleton twice.
    const canvas = overlay.current;
    const context = canvas?.getContext('2d');
    if (canvas && context) context.clearRect(0, 0, canvas.width, canvas.height);

    const controller = new AbortController();
    abortRef.current = controller;

    setError(null);
    setProgress(0);

    try {
      const produced = await recordAnnotatedClip({
        video: loaded.element,
        annotations,
        profile,
        tracks,
        targets,
        side,
        summary,
        signal: controller.signal,
        onProgress: setProgress,
      });

      const url = URL.createObjectURL(produced.blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `bewegungsanalyse.${produced.extension}`;
      link.click();
      URL.revokeObjectURL(url);
    } catch (caught) {
      // A cancelled export is not a failure — the coach asked for it to stop.
      if (controller.signal.aborted) setError(null);
      else {
        setError(
          caught instanceof Error
            ? caught.message
            : 'Das Analysevideo konnte nicht erzeugt werden.',
        );
      }
    } finally {
      abortRef.current = null;
      setProgress(null);
    }
  };

  if (!support.supported) {
    return (
      <p className="text-xs text-muted-foreground">
        Analysevideo hier nicht verfügbar: {support.reason}
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          className={TOUCH_BUTTON}
          disabled={running || annotations.length === 0}
          onClick={() => {
            void start();
          }}
        >
          <Download aria-hidden="true" className="size-4" />
          {running
            ? `Analysevideo wird erzeugt … ${String(Math.round((progress ?? 0) * 100))} %`
            : 'Analysevideo herunterladen'}
        </Button>

        {running ? (
          <Button
            variant="ghost"
            className={TOUCH_BUTTON}
            onClick={() => {
              abortRef.current?.abort();
            }}
          >
            Abbrechen
          </Button>
        ) : null}
      </div>

      <p className="max-w-prose text-xs text-pretty text-muted-foreground">
        {/* Said outright: the recording runs in real time because that is how a
            canvas is captured, and a coach who expected it to be instant would
            think it had hung. */}
        Das Video läuft dabei einmal in Echtzeit ab. Es enthält das Originalbild, das Skelett, die
        gewählten Winkel, die Wiederholungsnummer und zum Schluss das Ergebnis. Alles entsteht auf
        diesem Gerät; nichts wird hochgeladen oder gespeichert.
      </p>

      {error === null ? null : (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * Watching the recording again, without analysing it again.
 *
 * The element still holds the decoded file, so replay costs nothing. Slow motion
 * is the point rather than a flourish: the moment a coach wants to look at twice
 * is a tenth of a second long at full speed.
 */
function ReplayControls({
  video,
  overlay,
}: {
  readonly video: React.RefObject<LoadedVideo | null>;
  readonly overlay: React.RefObject<HTMLCanvasElement | null>;
}) {
  const [rate, setRate] = useState(1);
  const [playing, setPlaying] = useState(false);

  // Read inside the handlers, never during render: the element is mutated here
  // (play, rate, position), and a value derived while rendering must not be.
  const elementOf = () => video.current?.element ?? null;

  const clearOverlay = () => {
    const canvas = overlay.current;
    const context = canvas?.getContext('2d');
    if (canvas && context) context.clearRect(0, 0, canvas.width, canvas.height);
  };

  const toggle = () => {
    const element = elementOf();
    if (!element) return;
    clearOverlay();

    if (element.paused) {
      element.playbackRate = rate;
      void element.play();
      setPlaying(true);
    } else {
      element.pause();
      setPlaying(false);
    }
  };

  const restart = () => {
    const element = elementOf();
    if (!element) return;
    clearOverlay();
    element.currentTime = 0;
    element.playbackRate = rate;
    void element.play();
    setPlaying(true);
  };

  useEffect(() => {
    const element = video.current?.element ?? null;
    if (!element) return;

    const sync = () => setPlaying(!element.paused && !element.ended);

    element.addEventListener('play', sync);
    element.addEventListener('pause', sync);
    element.addEventListener('ended', sync);

    return () => {
      element.removeEventListener('play', sync);
      element.removeEventListener('pause', sync);
      element.removeEventListener('ended', sync);
    };
  }, [video]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" className={TOUCH_BUTTON} onClick={toggle}>
        {playing ? (
          <Pause aria-hidden="true" className="size-4" />
        ) : (
          <Play aria-hidden="true" className="size-4" />
        )}
        {playing ? 'Pause' : 'Video abspielen'}
      </Button>

      <Button variant="outline" className={TOUCH_BUTTON} onClick={restart}>
        <RotateCcw aria-hidden="true" className="size-4" />
        Von vorn
      </Button>

      <div
        role="group"
        aria-label="Wiedergabegeschwindigkeit"
        className="flex items-center gap-1 rounded-md border border-input p-1"
      >
        {[0.25, 0.5, 1].map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={rate === option}
            className={`${FOCUS_RING} ${TOUCH_TARGET} rounded px-3 text-sm ${
              rate === option ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'
            }`}
            onClick={() => {
              setRate(option);

              const element = elementOf();
              if (element) element.playbackRate = option;
            }}
          >
            {String(option).replace('.', ',')}×
          </button>
        ))}
      </div>
    </div>
  );
}

function Progress({ progress }: { readonly progress: AnalysisProgress }) {
  const share = progress.totalFrames === 0 ? 0 : progress.processedFrames / progress.totalFrames;
  const percent = Math.round(share * 100);

  return (
    <div className="flex flex-col gap-2">
      <div
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label="Fortschritt der Analyse"
        className="h-2 w-full overflow-hidden rounded-full bg-muted"
      >
        <div
          className="h-full bg-accent transition-[width]"
          style={{ width: `${String(percent)}%` }}
        />
      </div>

      <p className="text-sm text-muted-foreground" data-numeric>
        {percent} % — Bild {progress.processedFrames} von {progress.totalFrames}, Sekunde{' '}
        {SECONDS.format(progress.positionMs / 1000)}
      </p>
    </div>
  );
}

/** What the run cost. Shown because a coach on a slow device deserves the number. */
function RunSummary({
  progress,
  sampleFps,
}: {
  readonly progress: AnalysisProgress;
  readonly sampleFps: number;
}) {
  return (
    <details className="text-sm">
      <summary
        className={`${TOUCH_TARGET} ${FOCUS_RING} flex cursor-pointer items-center rounded text-muted-foreground hover:text-foreground`}
      >
        Messwerte des Durchlaufs
      </summary>
      <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 [&>dd]:min-w-0">
        <dt className="text-muted-foreground">Dauer der Analyse</dt>
        <dd data-numeric>{SECONDS.format(progress.elapsedMs / 1000)} s</dd>

        <dt className="text-muted-foreground">Bilder</dt>
        <dd data-numeric>
          {progress.processedFrames} bei {sampleFps} fps
        </dd>

        <dt className="text-muted-foreground">Ø je Bild</dt>
        <dd data-numeric>{SECONDS.format(progress.inferenceMs)} ms</dd>

        <dt className="text-muted-foreground">Längstes Bild</dt>
        <dd data-numeric>{progress.worstInferenceMs} ms</dd>

        <dt className="text-muted-foreground">Verarbeitungsrate</dt>
        <dd data-numeric>
          {progress.elapsedMs === 0
            ? '—'
            : `${SECONDS.format((progress.processedFrames * 1000) / progress.elapsedMs)} Bilder/s`}
        </dd>
      </dl>
    </details>
  );
}
