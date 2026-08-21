'use client';

import { useState } from 'react';

import { Badge, Button, Input } from '@apex/ui';

import { TOUCH_BUTTON, TOUCH_FIELD } from '@/components/common/touch';

import { ExercisePicker } from '../exercise-picker';

import {
  toDimensionKey,
  withDimension,
  withDimensionValues,
  withExercise,
  withNotes,
  withoutDimension,
  withoutExercise,
  withPasses,
  withRecordsSide,
  type BuilderDraft,
} from './draft';

export interface ExerciseOption {
  id: string;
  name: string;
  ownedByWorkspace: boolean;
}

/**
 * How the test is carried out: passes, sides, dimensions, exercises.
 *
 * Each of these maps onto a field the configuration already declares (§16).
 * Nothing here invents a second way to say the same thing — in particular, side
 * is `recordsSide` and never a dimension, because it has a typed column on the
 * Measurement and a fixed enum.
 */
export function ProtocolStep({
  draft,
  exercises,
  onChange,
}: {
  draft: BuilderDraft;
  exercises: readonly ExerciseOption[];
  onChange: (draft: BuilderDraft) => void;
}) {
  const [dimensionLabel, setDimensionLabel] = useState('');
  /**
   * What the coach has typed into each value list, before it is split.
   *
   * Needed because the field displays `values.join(', ')` while the draft
   * stores a cleaned array: typing "Knie," produced `['Knie']`, which rendered
   * as "Knie" — the comma vanished under the cursor and a second value could
   * never be entered. The draft still holds the cleaned list; this holds the
   * text it came from, for as long as the field is being edited.
   */
  const [valueText, setValueText] = useState<Record<string, string>>({});
  const chosenExercises = new Set(draft.exerciseIds);

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">Stufen</h3>
        <p className="text-xs text-muted-foreground">
          Wie oft der gesamte Satz erfasst wird. Ein Laktatstufentest trägt hier die Anzahl der
          Stufen ein; eine Körperfettmessung erfasst einmal.
        </p>

        <div className="flex items-center gap-3">
          <Input
            type="number"
            min={1}
            max={50}
            value={draft.passes}
            onChange={(event) => onChange(withPasses(draft, Number(event.target.value)))}
            aria-label="Anzahl der Stufen"
            className={`${TOUCH_FIELD} w-24`}
            data-numeric
          />
          <span className="text-sm text-muted-foreground">
            {draft.passes > 1
              ? `${String(draft.passes)} Stufen, jede erfasst den gesamten Satz`
              : 'Eine einzelne Erfassung — die Werte tragen keine Stufennummer'}
          </span>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">Seiten</h3>
        <p className="text-xs text-muted-foreground">
          Einschalten, wenn der Vergleich links gegen rechts der Zweck des Tests ist. Eine
          Langhantelübung wird beidseitig erfasst, ein Dynamometer je Seite einzeln.
        </p>

        <label className="flex w-fit items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={draft.recordsSide}
            onChange={(event) => onChange(withRecordsSide(draft, event.target.checked))}
            className="size-4 rounded border-input"
          />
          Jeden Wert je Seite erfassen
        </label>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-medium">Merkmale</h3>
          <p className="text-xs text-muted-foreground">
            Weitere Achsen, entlang derer dieselbe Messgröße erfasst wird — ein Gelenk, eine
            Muskelstelle, eine Körperregion. Werte leer lassen, um sie während der Messung frei zu
            benennen.
          </p>
        </div>

        {draft.dimensions.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {draft.dimensions.map((dimension) => (
              <li
                key={dimension.key}
                className="flex flex-wrap items-center gap-3 rounded-md border border-border bg-card p-3"
              >
                <div className="flex flex-1 flex-col gap-1">
                  <span className="text-sm font-medium">{dimension.label}</span>
                  <Input
                    value={valueText[dimension.key] ?? (dimension.values ?? []).join(', ')}
                    onChange={(event) => {
                      const text = event.target.value;
                      setValueText((current) => ({ ...current, [dimension.key]: text }));
                      onChange(withDimensionValues(draft, dimension.key, text.split(',')));
                    }}
                    placeholder="Leer lassen, um sie während der Messung zu benennen"
                    aria-label={`Werte für ${dimension.label}`}
                    className={TOUCH_FIELD}
                  />
                </div>
                <Badge variant="outline">
                  {dimension.values && dimension.values.length > 0
                    ? `${String(dimension.values.length)} Werte`
                    : 'Frei'}
                </Badge>
                <Button
                  variant="ghost"
                  className={TOUCH_BUTTON}
                  onClick={() => onChange(withoutDimension(draft, dimension.key))}
                >
                  Entfernen
                </Button>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="flex gap-2">
          <Input
            value={dimensionLabel}
            onChange={(event) => setDimensionLabel(event.target.value)}
            placeholder="z. B. Gelenk"
            aria-label="Neues Merkmal"
            className={`${TOUCH_FIELD} w-full max-w-xs`}
          />
          <Button
            variant="outline"
            className={TOUCH_BUTTON}
            disabled={dimensionLabel.trim() === '' || toDimensionKey(dimensionLabel) === ''}
            onClick={() => {
              onChange(
                withDimension(draft, {
                  key: toDimensionKey(dimensionLabel),
                  label: dimensionLabel.trim(),
                }),
              );
              setDimensionLabel('');
            }}
          >
            Merkmal hinzufügen
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-medium">Übungen</h3>
          <p className="text-xs text-muted-foreground">
            Welche Bewegungen dieser Test abdeckt. Jede Messgröße wird dann einmal je Übung erfasst,
            sodass ein Test Bankdrücken und Kreuzheben zusammen führen kann. Leer lassen, wo der
            Begriff nicht greift — ein Laktattest hat keine Bewegung zu benennen.
          </p>
        </div>

        <ExercisePicker
          exercises={exercises.map((exercise) => ({
            id: exercise.id,
            name: exercise.name,
            scope: exercise.ownedByWorkspace ? 'WORKSPACE' : 'SYSTEM',
          }))}
          chosen={draft.exerciseIds}
          onToggle={(id) => {
            onChange(
              chosenExercises.has(id) ? withoutExercise(draft, id) : withExercise(draft, id),
            );
          }}
          label="Übung suchen und auswählen"
          emptyHint="Leer lassen, wo der Begriff nicht greift."
        />
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">Protokollnotizen</h3>
        <p className="text-xs text-muted-foreground">
          Belastungsstufen, Geräteeinstellungen, Bedingungen — alles, was die nächste Person wissen
          muss, die diesen Test durchführt.
        </p>
        <textarea
          value={draft.notes}
          onChange={(event) => onChange(withNotes(draft, event.target.value))}
          rows={3}
          aria-label="Protokollnotizen"
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </section>
    </div>
  );
}
