'use client';

import { useState, useTransition } from 'react';

import Link from 'next/link';

import { Check, Info, Save } from 'lucide-react';

import {
  NO_DECISIONS,
  type AngleTargetConfig,
  type MovementProfile,
  type MovementValue,
  type SummaryBlock,
  remarkFrom,
  type MovementAnalysisConfig,
} from '@apex/domain';
import { Button, Input } from '@apex/ui';

import { FOCUS_RING, TOUCH_BUTTON, TOUCH_FIELD } from '@/components/common/touch';

import { encodeStill } from '../analysis/still';
import { saveStandaloneAnalysisAction, uploadAnalysisStillAction } from '../server/actions';

import { AngleTable } from './angle-table';

import type { Keyframe } from '../analysis/keyframes';

/**
 * Filing a standalone analysis under an athlete.
 *
 * ## Why the athlete is chosen last
 *
 * A coach films first and sorts afterwards. Demanding the athlete before the
 * analysis would make the quick case — "let me just see what this looks like" —
 * impossible, and it is the case this screen exists for.
 *
 * ## What the coach types is not decoration
 *
 * The purpose becomes the **question of the assessment** that gets opened, and
 * every assessment answers a question. Generating that sentence would be a
 * fabrication, so it is asked for — once, in the coach's own words, and reused
 * as the remark on every value.
 */

const DATE = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: '2-digit',
});

export interface AthleteChoice {
  readonly id: string;
  readonly name: string;
}

/** One examination this analysis could be filed into. */
export interface AssessmentChoice {
  readonly id: string;
  readonly athleteId: string;
  readonly question: string;
  readonly performedAt: Date;
}

export function AssignAnalysis({
  profile,
  tracks,
  targets,
  values,
  drafts,
  onDraft,
  excluded,
  onToggle,
  summary,
  athletes,
  assessments,
  suggestedAthleteId,
  exerciseId,
  recordedAt,
  keyframes,
  movement,
  onRestart,
}: {
  readonly profile: MovementProfile;
  readonly tracks: readonly string[];
  readonly targets: readonly AngleTargetConfig[];
  readonly values: readonly MovementValue[];
  readonly drafts: Readonly<Record<string, string>>;
  readonly onDraft: (id: string, raw: string) => void;
  readonly excluded: readonly string[];
  readonly onToggle: (ids: readonly string[], include: boolean) => void;
  readonly summary: readonly SummaryBlock[];
  /** The stills of the representative repetition — temporary, see `keyframes`. */
  readonly keyframes: readonly Keyframe[];
  /** What the run measured. Filed with the test, so a profile can draw it. */
  readonly movement: MovementAnalysisConfig;
  readonly athletes: readonly AthleteChoice[];
  /** The workspace's open examinations; narrowed to the chosen athlete here. */
  readonly assessments: readonly AssessmentChoice[];
  readonly suggestedAthleteId?: string | undefined;
  readonly exerciseId: string;
  readonly recordedAt: string;
  readonly onRestart: () => void;
}) {
  const [pending, startTransition] = useTransition();

  const [athleteId, setAthleteId] = useState(suggestedAthleteId ?? '');
  /** Empty means "open an examination for this analysis" — see `openAnalysisTarget`. */
  const [assessmentId, setAssessmentId] = useState('');
  const [purpose, setPurpose] = useState('');
  const [noteDraft, setNoteDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<{
    count: number;
    refused: number;
    assessmentId: string;
    moduleId: string;
    createdTest: boolean;
  } | null>(null);

  /**
   * The note follows the analysis until the coach types. Once they do, the
   * draft is theirs and nothing overwrites it — the rule the report drafts
   * already follow.
   */
  // Without the range-of-motion block — see `remarkFrom`.
  const flat = remarkFrom(summary);
  const note = noteDraft ?? flat;

  /** This athlete's examinations, newest first — the list arrives that way. */
  const open = assessments.filter((entry) => entry.athleteId === athleteId);

  const save = () => {
    setError(null);

    startTransition(async () => {
      const state = await saveStandaloneAnalysisAction({
        athleteId,
        purpose: purpose.trim(),
        assessmentId: assessmentId === '' ? undefined : assessmentId,
        profileKey: profile.key,
        tracks,
        targets,
        exerciseId,
        values,
        decisions: {
          ...NO_DECISIONS,
          edited: Object.fromEntries(
            Object.entries(drafts)
              .map(([id, raw]) => [id, Number(raw.replace(',', '.'))] as const)
              .filter(([, parsed]) => Number.isFinite(parsed)),
          ),
          excluded,
        },
        note,
        capturedAt: recordedAt,
        movement,
      });

      if (state.message !== undefined || state.assessmentId === undefined) {
        setError(state.message ?? 'Die Analyse konnte nicht zugeordnet werden.');

        return;
      }

      /**
       * The stills, now that the test exists.
       *
       * This path could not upload them before: the test is opened on the
       * server, so the browser did not know its id until this answer came back.
       * Swallowed on failure — an analysis whose numbers are stored must not
       * report itself as failed because a workspace has no bucket.
       */
      for (const frame of keyframes) {
        try {
          await uploadAnalysisStillAction(
            state.moduleId ?? '',
            frame.position,
            await encodeStill(frame.dataUrl),
          );
        } catch {
          break;
        }
      }

      setSaved({
        count: state.savedCount ?? 0,
        refused: state.refused ?? 0,
        assessmentId: state.assessmentId,
        moduleId: state.moduleId ?? '',
        createdTest: state.createdTest ?? false,
      });
    });
  };

  if (saved !== null) {
    return (
      <section aria-label="Zugeordnet" className="flex flex-col gap-4">
        <p className="flex items-start gap-2 rounded-md bg-accent-soft px-3 py-2 text-sm text-pretty text-accent-soft-foreground">
          <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          <span>
            {saved.count === 0
              ? 'Die Auswertung wurde als Notiz gespeichert.'
              : `${String(saved.count)} ${saved.count === 1 ? 'Wert wurde' : 'Werte wurden'} gespeichert.`}
            {saved.createdTest ? ' Der Test „Videoanalyse“ wurde dafür angelegt.' : ''}
            {saved.refused > 0
              ? ` ${String(saved.refused)} ${saved.refused === 1 ? 'Wert konnte' : 'Werte konnten'} dieser Test nicht aufnehmen.`
              : ''}
          </span>
        </p>

        <div className="flex flex-wrap gap-2">
          <Button variant="accent" className={TOUCH_BUTTON} asChild>
            <Link href={`/assessments/${saved.assessmentId}/tests/${saved.moduleId}`}>
              Zur Videoanalyse
            </Link>
          </Button>
          <Button variant="outline" className={TOUCH_BUTTON} onClick={onRestart}>
            Nächstes Video
          </Button>
        </div>
      </section>
    );
  }

  return (
    <div className="flex flex-col gap-8">
      <AngleTable
        profile={profile}
        tracks={tracks}
        values={values}
        targets={targets}
        drafts={drafts}
        onDraft={onDraft}
        excluded={excluded}
        onToggle={onToggle}
      />

      <section aria-label="Zuordnung" className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-medium">Athlet zuordnen</h2>
          <p className="max-w-prose text-sm text-pretty text-muted-foreground">
            Die Analyse wird als Test abgelegt — in einem bestehenden Assessment oder in einem, das
            dafür angelegt wird.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium">Athlet</span>
            <select
              className={`${TOUCH_FIELD} ${FOCUS_RING} w-full rounded-md border border-input bg-background px-3`}
              value={athleteId}
              onChange={(event) => {
                setAthleteId(event.target.value);
                // The examinations belong to the athlete that was chosen; a
                // leftover id would file this analysis under the wrong one, and
                // the server would refuse it anyway.
                setAssessmentId('');
              }}
            >
              <option value="">Bitte wählen</option>
              {athletes.map((athlete) => (
                <option key={athlete.id} value={athlete.id}>
                  {athlete.name}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium">Assessment</span>
            <select
              className={`${TOUCH_FIELD} ${FOCUS_RING} w-full rounded-md border border-input bg-background px-3`}
              value={assessmentId}
              disabled={athleteId === ''}
              onChange={(event) => setAssessmentId(event.target.value)}
            >
              <option value="">Neues Assessment für diese Analyse</option>
              {open.map((assessment) => (
                <option key={assessment.id} value={assessment.id}>
                  {DATE.format(assessment.performedAt)} · {assessment.question}
                </option>
              ))}
            </select>
            <span className="text-xs text-pretty text-muted-foreground">
              In einem bestehenden Assessment steht die Analyse neben den übrigen Tests und geht mit
              deren Auswertung an den Athleten.
            </span>
          </label>

          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium">Wofür wurde diese Analyse gemacht?</span>
            <Input
              className={TOUCH_FIELD}
              value={purpose}
              placeholder="z. B. Kniebeugentiefe vor Saisonstart"
              onChange={(event) => setPurpose(event.target.value)}
            />
            <span className="text-xs text-pretty text-muted-foreground">
              Benennt die Analyse und steht als Vermerk an jedem Wert.
            </span>
          </label>
        </div>
      </section>

      <section aria-label="Auswertung" className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-sm font-medium">Auswertung</h2>
          <p className="max-w-prose text-sm text-pretty text-muted-foreground">
            Wird als Notiz am Test gespeichert. Der Vorschlag nennt nur, was gemessen wurde, und die
            Ziele, die Sie festgelegt haben.
          </p>
        </div>
        <textarea
          className={`${FOCUS_RING} min-h-32 w-full rounded-md border border-input bg-background px-3 py-2 text-base lg:text-sm`}
          value={note}
          onChange={(event) => setNoteDraft(event.target.value)}
          aria-label="Auswertung zur Analyse"
        />
      </section>

      {error === null ? null : (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-center gap-3">
          <Button
            variant="accent"
            className={TOUCH_BUTTON}
            disabled={pending || athleteId === '' || purpose.trim() === ''}
            onClick={save}
          >
            <Save aria-hidden="true" className="size-4" />
            {pending ? 'Wird zugeordnet …' : 'Athlet zuordnen und speichern'}
          </Button>
          <Button variant="outline" className={TOUCH_BUTTON} onClick={onRestart} disabled={pending}>
            Verwerfen
          </Button>
        </div>

        <p className="flex max-w-prose items-start gap-1.5 text-xs text-muted-foreground">
          <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
          Gespeichert werden nur die berechneten Werte und Ihre Auswertung. Das Video und die
          Standbilder bleiben auf diesem Gerät.
        </p>
      </div>
    </div>
  );
}
