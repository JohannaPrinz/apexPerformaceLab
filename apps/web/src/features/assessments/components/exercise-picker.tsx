'use client';

import { useId, useMemo, useState } from 'react';

import { Check, Search } from 'lucide-react';

import { Badge } from '@apex/ui';

import { FOCUS_RING, TOUCH_FIELD, TOUCH_TARGET } from '@/components/common/touch';

/** The minimum the picker needs. Callers pass their own richer rows. */
export interface PickableExercise {
  readonly id: string;
  readonly name: string;
  /** `WORKSPACE` for an exercise this workspace owns, anything else for the catalogue. */
  readonly scope: string;
}

/**
 * Choosing exercises by name rather than by scrolling.
 *
 * The catalogue holds hundreds. Rendering them all — which is what the builder
 * did — is not a list a coach can use: the five their workspace added sit
 * somewhere among 276 shared ones, and finding a movement means reading the
 * whole page. Searching is the way in; the visible list is capped so it stays a
 * list rather than becoming the page.
 *
 * The origin badge is kept from the catalogue, because that distinction is
 * exactly what is otherwise invisible.
 *
 * **Owns its search.** Both callers only ever want "the chosen ids"; making
 * them each hold a needle and filter the same way twice invites the two lists
 * to drift apart.
 */
export function ExercisePicker({
  exercises,
  chosen,
  onToggle,
  label = 'Übungen',
  emptyHint = 'Optional — ein Test ohne Übung erfasst reine Messgrößen.',
  limit = 25,
}: {
  readonly exercises: readonly PickableExercise[];
  readonly chosen: readonly string[];
  readonly onToggle: (id: string) => void;
  readonly label?: string;
  readonly emptyHint?: string;
  readonly limit?: number;
}) {
  const [search, setSearch] = useState('');
  const searchId = useId();

  const matches = useMemo(() => {
    const needle = search.trim().toLowerCase();

    return exercises
      .filter((exercise) => needle === '' || exercise.name.toLowerCase().includes(needle))
      .slice(0, limit);
  }, [exercises, search, limit]);

  // A chosen exercise that the search has filtered out would look deselected.
  // It stays visible above the results instead, which is also how the coach
  // takes one back off the list without searching for it again.
  const selected = exercises.filter(
    (exercise) => chosen.includes(exercise.id) && !matches.some((m) => m.id === exercise.id),
  );

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={searchId} className="text-sm font-medium">
        {label}
      </label>

      <div className="relative">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <input
          id={searchId}
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
          }}
          placeholder="Übung suchen"
          className={`${TOUCH_FIELD} ${FOCUS_RING} w-full rounded-md border border-input bg-background pl-9 shadow-sm`}
        />
      </div>

      {matches.length === 0 && selected.length === 0 ? (
        <p className="px-1 py-3 text-sm text-muted-foreground">
          {exercises.length === 0
            ? 'Noch keine Übung im Katalog.'
            : 'Keine Übung passt zu dieser Suche.'}
        </p>
      ) : (
        <ul className="flex max-h-56 flex-col gap-1 overflow-y-auto">
          {[...selected, ...matches].map((exercise) => (
            <li key={exercise.id}>
              <button
                type="button"
                aria-pressed={chosen.includes(exercise.id)}
                onClick={() => {
                  onToggle(exercise.id);
                }}
                className={`${TOUCH_TARGET} ${FOCUS_RING} flex w-full items-center gap-2 rounded-md border px-3 text-left text-sm transition-colors ${
                  chosen.includes(exercise.id)
                    ? 'border-accent bg-accent-soft text-accent-soft-foreground'
                    : 'border-border hover:border-border-strong'
                }`}
              >
                <Check
                  aria-hidden="true"
                  className={`size-4 shrink-0 ${chosen.includes(exercise.id) ? '' : 'invisible'}`}
                />
                <span className="min-w-0 flex-1 break-words">{exercise.name}</span>
                {exercise.scope === 'WORKSPACE' ? (
                  <Badge variant="outline" className="shrink-0">
                    Eigene
                  </Badge>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      )}

      <p className="text-xs text-muted-foreground">
        {chosen.length === 0
          ? emptyHint
          : `${String(chosen.length)} ${chosen.length === 1 ? 'Übung' : 'Übungen'} ausgewählt`}
      </p>
    </div>
  );
}
