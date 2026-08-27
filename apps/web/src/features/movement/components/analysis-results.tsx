'use client';

import { useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import { Check, Info, Save } from 'lucide-react';

import {
  isJointDimension,
  isPositionDimension,
  NO_DECISIONS,
  planMeasurements,
  storableOf,
  type AngleTargetConfig,
  type ModuleConfiguration,
  type MovementProfile,
  type MovementValue,
  type PlanDecisions,
  type PlanRefusal,
  type SummaryBlock,
} from '@apex/domain';
import { Button, Input } from '@apex/ui';

import { FOCUS_RING, TOUCH_BUTTON, TOUCH_FIELD } from '@/components/common/touch';

import { saveVideoAnalysisAction } from '../server/actions';

import { AngleTable } from './angle-table';

/**
 * Filing an analysis into the test it was started from.
 *
 * ## What this screen adds over the standalone one
 *
 * A coach's own test has its own configuration — it may record sides or not,
 * declare axes or not, work in exercises and stages. So this screen has to say,
 * per value, whether the test can actually hold it and why not. The standalone
 * flow needs none of that: the test it files into is opened to fit.
 *
 * ## No verdict
 *
 * Angles, ranges, counts, durations, and a comparison against a target the coach
 * typed. Nothing here says whether the movement was good — the platform ships no
 * reference ranges, and a grade without one is an opinion in the clothes of a
 * measurement.
 */

const REFUSAL_LABELS: Readonly<Record<PlanRefusal, string>> = {
  NO_CATALOGUE_TYPE: 'Für diese Größe gibt es noch keine Messgröße im Katalog.',
  TYPE_NOT_CONFIGURED: 'Dieser Test erfasst diese Messgröße nicht.',
  JOINT_NOT_DISTINGUISHABLE:
    'Dieser Test hat keine Dimension „Gelenk“ — die Winkel wären nicht unterscheidbar.',
  JOINT_VALUE_MISSING: 'Bitte unten zuordnen, welcher Wert der Dimension „Gelenk“ gemeint ist.',
  POSITION_NOT_DISTINGUISHABLE:
    'Dieser Test hat keine Dimension „Position“ — die Positionen wären nicht unterscheidbar.',
  POSITION_VALUE_MISSING:
    'Bitte unten zuordnen, welcher Wert der Dimension „Position“ gemeint ist.',
  DIMENSION_UNFILLABLE: 'Für diesen Wert fehlt eine Angabe, die dieser Test verlangt.',
  SIDE_NOT_RECORDED: 'Dieser Test erfasst keine Seiten.',
  EXERCISE_MISSING: 'Bitte oben die Übung wählen.',
  PASS_MISSING: 'Bitte oben die Stufe wählen.',
};

export function AnalysisResults({
  profile,
  tracks,
  targets,
  values,
  drafts,
  onDraft,
  excluded,
  onToggle,
  summary,
  moduleId,
  assessmentId,
  configuration,
  types,
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
  readonly moduleId: string;
  readonly assessmentId: string;
  readonly configuration: ModuleConfiguration;
  readonly types: Readonly<Record<string, { key: string; name: string; unit: string }>>;
  readonly exerciseId: string;
  readonly recordedAt: string;
  readonly onRestart: () => void;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [passIndex, setPassIndex] = useState<number | null>(null);
  const [dimensionValues, setDimensionValues] = useState<Record<string, string>>({});
  const [noteDraft, setNoteDraft] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<number | null>(null);

  const flat = summary.map((block) => `${block.heading}: ${block.lines.join(' ')}`).join('\n\n');
  const note = noteDraft ?? flat;

  const otherDimensions = configuration.dimensions.filter(
    (dimension) => !isJointDimension(dimension.key) && !isPositionDimension(dimension.key),
  );

  const decisions: PlanDecisions = {
    ...NO_DECISIONS,
    // The exercise chosen at the top of the analysis, where this test works in
    // exercises at all. Never guessed: the plan refuses rather than picking one.
    exerciseId: configuration.exerciseIds.includes(exerciseId) ? exerciseId : null,
    passIndex,
    dimensionValues,
    edited: Object.fromEntries(
      Object.entries(drafts)
        .map(([id, raw]) => [id, Number(raw.replace(',', '.'))] as const)
        .filter(([, parsed]) => Number.isFinite(parsed)),
    ),
    excluded,
  };

  const entries = planMeasurements(
    values,
    configuration,
    Object.fromEntries(Object.entries(types).map(([id, type]) => [id, type.key])),
    decisions,
    'Aus Videoanalyse berechnet.',
  );

  const storable = storableOf(entries);
  const refused = entries.filter((entry) => entry.kind === 'refused');

  const save = () => {
    setError(null);

    startTransition(async () => {
      const state = await saveVideoAnalysisAction(moduleId, storable, note, recordedAt);

      if (state.message !== undefined) {
        setError(state.message);

        return;
      }

      setSaved(state.savedCount ?? 0);
      router.refresh();
    });
  };

  if (saved !== null) {
    return (
      <section aria-label="Gespeichert" className="flex flex-col gap-4">
        <p className="flex items-center gap-2 rounded-md bg-accent-soft px-3 py-2 text-sm text-accent-soft-foreground">
          <Check aria-hidden="true" className="size-4 shrink-0" />
          {saved === 0
            ? 'Die Auswertung wurde als Notiz zum Test gespeichert.'
            : `${String(saved)} ${saved === 1 ? 'Wert wurde' : 'Werte wurden'} zum Test gespeichert.`}
        </p>
        <div className="flex flex-wrap gap-2">
          <Button variant="accent" className={TOUCH_BUTTON} asChild>
            <a href={`/assessments/${assessmentId}/tests/${moduleId}`}>Zurück zum Test</a>
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

      {configuration.passes > 1 || otherDimensions.length > 0 ? (
        <section aria-label="Zuordnung" className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <h2 className="text-sm font-medium">Zuordnung</h2>
            <p className="max-w-prose text-sm text-pretty text-muted-foreground">
              Was dieser Test zu jedem Wert verlangt. Ohne diese Angaben lässt sich nichts
              speichern.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            {configuration.passes > 1 ? (
              <label className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium">Stufe</span>
                <select
                  className={`${TOUCH_FIELD} ${FOCUS_RING} w-full rounded-md border border-input bg-background px-3`}
                  value={passIndex === null ? '' : String(passIndex)}
                  onChange={(event) =>
                    setPassIndex(event.target.value === '' ? null : Number(event.target.value))
                  }
                >
                  <option value="">Bitte wählen</option>
                  {Array.from({ length: configuration.passes }, (_entry, index) => index + 1).map(
                    (pass) => (
                      <option key={pass} value={pass}>
                        Stufe {pass}
                      </option>
                    ),
                  )}
                </select>
              </label>
            ) : null}

            {otherDimensions.map((dimension) => (
              <label key={dimension.key} className="flex flex-col gap-1.5 text-sm">
                <span className="font-medium break-words">{dimension.label}</span>
                {dimension.values && dimension.values.length > 0 ? (
                  <select
                    className={`${TOUCH_FIELD} ${FOCUS_RING} w-full rounded-md border border-input bg-background px-3`}
                    value={dimensionValues[dimension.key] ?? ''}
                    onChange={(event) =>
                      setDimensionValues((current) => ({
                        ...current,
                        [dimension.key]: event.target.value,
                      }))
                    }
                  >
                    <option value="">Bitte wählen</option>
                    {dimension.values.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                ) : (
                  <Input
                    className={TOUCH_FIELD}
                    value={dimensionValues[dimension.key] ?? ''}
                    onChange={(event) =>
                      setDimensionValues((current) => ({
                        ...current,
                        [dimension.key]: event.target.value,
                      }))
                    }
                  />
                )}
              </label>
            ))}
          </div>
        </section>
      ) : null}

      {refused.length === 0 ? null : (
        <section aria-label="Nicht speicherbar" className="flex flex-col gap-2">
          <h2 className="text-sm font-medium">Was dieser Test nicht aufnehmen kann</h2>
          <ul className="flex flex-col gap-1.5 text-sm">
            {refused.map((entry) => (
              <li key={entry.value.id} className="flex flex-wrap gap-x-2 text-muted-foreground">
                <span className="font-medium break-words text-foreground">{entry.value.label}</span>
                <span className="text-pretty">
                  {entry.kind === 'refused' ? REFUSAL_LABELS[entry.refusal] : ''}
                </span>
              </li>
            ))}
          </ul>
        </section>
      )}

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
          aria-label="Auswertung zum Test"
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
            disabled={pending || (storable.length === 0 && note.trim() === '')}
            onClick={save}
          >
            <Save aria-hidden="true" className="size-4" />
            {pending ? 'Wird gespeichert …' : 'Ergebnisse speichern'}
          </Button>
          <span className="text-sm text-muted-foreground">
            {storable.length === 0
              ? 'Kein Wert speicherbar — nur die Auswertung wird gesichert.'
              : `${String(storable.length)} ${storable.length === 1 ? 'Wert' : 'Werte'} werden gespeichert.`}
          </span>
        </div>

        <p className="flex max-w-prose items-start gap-1.5 text-xs text-muted-foreground">
          <Info aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
          Gespeichert werden ausschließlich die berechneten Werte und Ihre Auswertung. Das Video
          bleibt auf diesem Gerät und wird nicht hochgeladen.
        </p>
      </div>
    </div>
  );
}
