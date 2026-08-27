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
} from '@apex/domain';
import { Button, Input } from '@apex/ui';

import { FOCUS_RING, TOUCH_BUTTON, TOUCH_FIELD } from '@/components/common/touch';

import { saveStandaloneAnalysisAction } from '../server/actions';

import { AngleTable } from './angle-table';

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

export interface AthleteChoice {
  readonly id: string;
  readonly name: string;
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
  suggestedAthleteId,
  exerciseId,
  recordedAt,
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
  readonly athletes: readonly AthleteChoice[];
  readonly suggestedAthleteId?: string | undefined;
  readonly exerciseId: string;
  readonly recordedAt: string;
  readonly onRestart: () => void;
}) {
  const [pending, startTransition] = useTransition();

  const [athleteId, setAthleteId] = useState(suggestedAthleteId ?? '');
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
  const flat = summary.map((block) => `${block.heading}: ${block.lines.join(' ')}`).join('\n\n');
  const note = noteDraft ?? flat;

  const save = () => {
    setError(null);

    startTransition(async () => {
      const state = await saveStandaloneAnalysisAction({
        athleteId,
        purpose: purpose.trim(),
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
      });

      if (state.message !== undefined || state.assessmentId === undefined) {
        setError(state.message ?? 'Die Analyse konnte nicht zugeordnet werden.');

        return;
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
            Die Analyse wird im Test „Videoanalyse“ dieses Athleten abgelegt. Ist noch keiner
            vorhanden, wird er angelegt.
          </p>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <label className="flex flex-col gap-1.5 text-sm">
            <span className="font-medium">Athlet</span>
            <select
              className={`${TOUCH_FIELD} ${FOCUS_RING} w-full rounded-md border border-input bg-background px-3`}
              value={athleteId}
              onChange={(event) => setAthleteId(event.target.value)}
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
            <span className="font-medium">Wofür wurde diese Analyse gemacht?</span>
            <Input
              className={TOUCH_FIELD}
              value={purpose}
              placeholder="z. B. Kniebeugentiefe vor Saisonstart"
              onChange={(event) => setPurpose(event.target.value)}
            />
            <span className="text-xs text-pretty text-muted-foreground">
              Steht als Frage über dem Assessment und als Vermerk an jedem Wert.
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
