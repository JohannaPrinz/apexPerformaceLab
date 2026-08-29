'use client';

import { useState } from 'react';

import { Badge, Button, Input } from '@apex/ui';

import { TOUCH_BUTTON, TOUCH_FIELD, TOUCH_TARGET } from '@/components/common/touch';

import { ExercisePicker } from '../exercise-picker';

import {
  toDimensionKey,
  withDimension,
  withDimensionValues,
  withExercise,
  withLoadMeasurementType,
  toProtocolKey,
  withNotes,
  withoutDimension,
  withoutExercise,
  withPasses,
  withProtocol,
  withRecordsSide,
  type BuilderDraft,
} from './draft';

import type { MeasurementTypeOption } from './measurement-picker';

export interface ExerciseOption {
  id: string;
  /** The catalogue key, so a template can name a movement without an id. */
  key: string;
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
  measurementTypes,
  onChange,
}: {
  draft: BuilderDraft;
  exercises: readonly ExerciseOption[];
  /** The catalogue, so the load quantity can be offered by name and unit. */
  measurementTypes: readonly MeasurementTypeOption[];
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
  /** Only what this test records: an axis needs a value on every stage. */
  const loadOptions = draft.measurementTypes.flatMap((entry) => {
    const option = measurementTypes.find((type) => type.id === entry.measurementTypeId);

    return option ? [option] : [];
  });

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

      {draft.passes > 1 ? (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-medium">Belastungsgröße</h3>
          <p className="text-xs text-muted-foreground">
            Welche der erfassten Messgrößen angibt, was eine Stufe gefordert hat — beim Laufband
            entweder die Geschwindigkeit oder die Pace. Der Verlauf trägt sie als x-Achse auf. Ohne
            Angabe zeigt der Verlauf die Stufenfolge und weist darauf hin, dass Stufe 3 zweier Tests
            nicht dieselbe Belastung gewesen sein muss.
          </p>

          {loadOptions.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Noch keine Messgröße ausgewählt, die als Belastung infrage kommt.
            </p>
          ) : (
            <label className="flex flex-wrap items-center gap-2 text-sm">
              <span className="sr-only">Belastungsgröße</span>
              <select
                value={draft.loadMeasurementTypeId ?? ''}
                onChange={(event) => {
                  onChange(
                    withLoadMeasurementType(
                      draft,
                      event.target.value === '' ? null : event.target.value,
                    ),
                  );
                }}
                aria-label="Belastungsgröße"
                className={`${TOUCH_FIELD} max-w-full rounded-md border border-input bg-background px-2 text-sm`}
              >
                <option value="">Keine — nur Stufenfolge</option>
                {loadOptions.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.name} ({option.unit})
                  </option>
                ))}
              </select>
            </label>
          )}
        </section>
      ) : null}

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

      <ProtocolFields draft={draft} onChange={onChange} />

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

/**
 * The conditions this test is carried out under.
 *
 * ## Why it is asked for here, and why almost nothing is asked
 *
 * A test only becomes repeatable once the conditions are written down, and a
 * comparison between two runs is only honest if both were run the same way. But
 * most tests need none of this — a caliper measurement has no distance and no
 * venue — so the screen asks for **one thing**, a name, and puts everything else
 * behind a disclosure together with the reason to open it.
 *
 * A standardised template fills all of it in, and the coach then sees a line of
 * badges rather than a form.
 *
 * ## No technical vocabulary reaches the screen
 *
 * The coach types "1 km Bahn, frisch". The comparison identity is derived from
 * that once, silently, and then **frozen**: renaming afterwards must not cut a
 * series in half, which is exactly why `protocolKey` ignores the label. The
 * screen says so, because a coach who renames something is entitled to know
 * whether it costs them their history.
 *
 * ## Nothing here is prefilled by the platform
 *
 * No distances, no loads, no repetition counts of its own. What the four
 * standardised templates carry is part of *those* tests' definition; a test
 * built by hand starts empty.
 */
function ProtocolFields({
  draft,
  onChange,
}: {
  draft: BuilderDraft;
  onChange: (draft: BuilderDraft) => void;
}) {
  const { protocol } = draft;
  const set = (patch: Partial<typeof protocol>) =>
    onChange(withProtocol(draft, { ...protocol, ...patch }));

  const declared = protocol.key.trim() !== '';

  /**
   * The name, and — the first time only — the identity derived from it.
   *
   * Frozen afterwards so a reworded name keeps the series it belongs to. A
   * genuinely different setup differs in one of the conditions below, and those
   * do split it.
   */
  const rename = (label: string) =>
    set({ label, ...(protocol.key.trim() === '' ? { key: toProtocolKey(label) } : {}) });

  const conditions = [
    protocol.distanceM.trim() === '' ? null : `${protocol.distanceM} m`,
    protocol.division.trim() === '' ? null : protocol.division,
    protocol.device.trim() === '' ? null : protocol.device,
    protocol.venue.trim() === '' ? null : protocol.venue,
    protocol.betterDirection === 'lower'
      ? 'kleinerer Wert ist das Ziel'
      : protocol.betterDirection === 'higher'
        ? 'größerer Wert ist das Ziel'
        : null,
  ].filter((entry) => entry !== null);

  return (
    <section className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-medium">Testbedingungen</h3>
        <p className="max-w-prose text-xs text-pretty text-muted-foreground">
          Optional. Benannt wird dieser Test wiederholbar: Ein späterer Test mit denselben
          Bedingungen wird damit vergleichbar, einer mit abweichenden ausdrücklich nicht. Leer
          gelassen verhält sich alles wie bisher.
        </p>
      </div>

      <label className="flex flex-col gap-1.5 text-sm">
        <span>Name der Bedingungen</span>
        <Input
          className={TOUCH_FIELD}
          value={protocol.label}
          placeholder="z. B. 1 km Bahn, frisch"
          aria-label="Name der Testbedingungen"
          onChange={(event) => {
            rename(event.target.value);
          }}
        />
        {declared ? (
          <span className="text-xs text-muted-foreground">
            Der Name lässt sich jederzeit ändern, ohne den Vergleich mit früheren Tests zu
            verlieren.
          </span>
        ) : null}
      </label>

      {!declared ? null : (
        <>
          {conditions.length === 0 ? null : (
            <div className="flex flex-wrap items-center gap-1.5">
              {conditions.map((entry) => (
                <Badge key={entry} variant="outline">
                  {entry}
                </Badge>
              ))}
            </div>
          )}

          <details className="rounded-md border border-border">
            <summary className={`${TOUCH_TARGET} flex cursor-pointer items-center px-3 text-sm`}>
              Weitere Bedingungen
            </summary>

            <div className="flex flex-col gap-3 border-t border-border px-3 py-3">
              <p className="max-w-prose text-xs text-pretty text-muted-foreground">
                Nur ausfüllen, was das Ergebnis tatsächlich verändert. Jede Angabe hier trennt
                diesen Test von früheren, die sie anders oder gar nicht führen.
              </p>

              <div className="grid gap-3 sm:grid-cols-2">
                <label className="flex flex-col gap-1.5 text-sm">
                  <span>Distanz in Metern</span>
                  <Input
                    className={TOUCH_FIELD}
                    inputMode="decimal"
                    value={protocol.distanceM}
                    aria-label="Distanz in Metern"
                    onChange={(event) => {
                      set({ distanceM: event.target.value });
                    }}
                  />
                </label>

                <label className="flex flex-col gap-1.5 text-sm">
                  <span>Klasse oder Division</span>
                  <Input
                    className={TOUCH_FIELD}
                    value={protocol.division}
                    aria-label="Klasse oder Division"
                    onChange={(event) => {
                      set({ division: event.target.value });
                    }}
                  />
                </label>

                <label className="flex flex-col gap-1.5 text-sm">
                  <span>Gerät</span>
                  <Input
                    className={TOUCH_FIELD}
                    value={protocol.device}
                    placeholder="nur wenn es das Ergebnis verändert"
                    aria-label="Gerät"
                    onChange={(event) => {
                      set({ device: event.target.value });
                    }}
                  />
                </label>

                <label className="flex flex-col gap-1.5 text-sm">
                  <span>Ort</span>
                  <Input
                    className={TOUCH_FIELD}
                    value={protocol.venue}
                    placeholder="nur wenn er das Ergebnis verändert"
                    aria-label="Ort"
                    onChange={(event) => {
                      set({ venue: event.target.value });
                    }}
                  />
                </label>
              </div>

              <fieldset className="flex flex-col gap-2">
                <legend className="text-sm font-medium">Angestrebte Richtung</legend>
                {/* The only place a direction is ever set, and a person sets it.
                    It decides one thing: whether one of the two extremes may be
                    called the best value. It never produces "besser". */}
                <p className="max-w-prose text-xs text-pretty text-muted-foreground">
                  Ohne Angabe nennt die Auswertung den höchsten und den niedrigsten Wert. Mit Angabe
                  darf sie einen davon als Bestwert bezeichnen. Eine Bewertung der Veränderung
                  findet in keinem Fall statt.
                </p>
                <div className="flex flex-wrap gap-2">
                  {(
                    [
                      { value: null, label: 'Keine Angabe' },
                      { value: 'lower' as const, label: 'Kleiner ist das Ziel' },
                      { value: 'higher' as const, label: 'Größer ist das Ziel' },
                    ] as const
                  ).map((option) => (
                    <Button
                      key={option.label}
                      type="button"
                      variant={protocol.betterDirection === option.value ? 'accent' : 'outline'}
                      className={TOUCH_BUTTON}
                      aria-pressed={protocol.betterDirection === option.value}
                      onClick={() => {
                        set({ betterDirection: option.value });
                      }}
                    >
                      {option.label}
                    </Button>
                  ))}
                </div>
              </fieldset>
            </div>
          </details>
        </>
      )}
    </section>
  );
}
