'use client';

import { useState } from 'react';

import { Badge, Button, Input } from '@apex/ui';

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
  const chosenExercises = new Set(draft.exerciseIds);

  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">Passes</h3>
        <p className="text-xs text-muted-foreground">
          How many times the whole set is recorded. A lactate step test sets this to the number of
          stages; a body-fat measurement records once.
        </p>

        <div className="flex items-center gap-3">
          <Input
            type="number"
            min={1}
            max={50}
            value={draft.passes}
            onChange={(event) => onChange(withPasses(draft, Number(event.target.value)))}
            aria-label="Number of passes"
            className="h-9 w-24"
            data-numeric
          />
          <span className="text-sm text-muted-foreground">
            {draft.passes > 1
              ? `${String(draft.passes)} stages, each recording the whole set`
              : 'A single pass — values carry no stage number at all'}
          </span>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">Sides</h3>
        <p className="text-xs text-muted-foreground">
          Turn this on where left against right is the comparison the test exists for. A barbell
          lift is taken with both sides at once; a dynamometer takes each separately.
        </p>

        <label className="flex w-fit items-center gap-2 text-sm">
          <input
            type="checkbox"
            checked={draft.recordsSide}
            onChange={(event) => onChange(withRecordsSide(draft, event.target.checked))}
            className="size-4 rounded border-input"
          />
          Record each value per side
        </label>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-medium">Dimensions</h3>
          <p className="text-xs text-muted-foreground">
            Further axes the same quantity is recorded along — a joint, a muscle site, a body
            region. Leave the values empty to name them freely while measuring.
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
                    value={(dimension.values ?? []).join(', ')}
                    onChange={(event) =>
                      onChange(
                        withDimensionValues(draft, dimension.key, event.target.value.split(',')),
                      )
                    }
                    placeholder="Leave empty to name them while measuring"
                    aria-label={`Values for ${dimension.label}`}
                    className="h-8 text-sm"
                  />
                </div>
                <Badge variant="outline">
                  {dimension.values && dimension.values.length > 0
                    ? `${String(dimension.values.length)} values`
                    : 'Free'}
                </Badge>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onChange(withoutDimension(draft, dimension.key))}
                >
                  Remove
                </Button>
              </li>
            ))}
          </ul>
        ) : null}

        <div className="flex gap-2">
          <Input
            value={dimensionLabel}
            onChange={(event) => setDimensionLabel(event.target.value)}
            placeholder="e.g. Joint"
            aria-label="New dimension"
            className="h-9 max-w-xs"
          />
          <Button
            variant="outline"
            size="sm"
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
            Add dimension
          </Button>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h3 className="text-sm font-medium">Exercises</h3>
          <p className="text-xs text-muted-foreground">
            Which movements this test covers. Every quantity is then recorded once per exercise, so
            one test can hold a bench press and a deadlift together. Leave empty where the notion
            does not apply — a lactate test has no movement to name.
          </p>
        </div>

        {exercises.length === 0 ? (
          <p className="text-xs text-muted-foreground">No exercise in the catalogue yet.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {exercises.map((exercise) => {
              const chosen = chosenExercises.has(exercise.id);

              return (
                <li key={exercise.id}>
                  <button
                    type="button"
                    aria-pressed={chosen}
                    onClick={() =>
                      onChange(
                        chosen
                          ? withoutExercise(draft, exercise.id)
                          : withExercise(draft, exercise.id),
                      )
                    }
                    className={`flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-sm transition-colors ${
                      chosen
                        ? 'border-accent bg-accent-soft text-accent-soft-foreground'
                        : 'border-border hover:border-border-strong hover:bg-muted'
                    }`}
                  >
                    {exercise.name}
                    {exercise.ownedByWorkspace ? (
                      <Badge variant="secondary" className="text-[10px]">
                        Own
                      </Badge>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">Protocol notes</h3>
        <p className="text-xs text-muted-foreground">
          Load steps, device settings, conditions — anything the next person performing this test
          needs to know.
        </p>
        <textarea
          value={draft.notes}
          onChange={(event) => onChange(withNotes(draft, event.target.value))}
          rows={3}
          aria-label="Protocol notes"
          className="rounded-md border border-input bg-background px-3 py-2 text-sm"
        />
      </section>
    </div>
  );
}
