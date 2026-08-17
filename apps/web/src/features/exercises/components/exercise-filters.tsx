import { Button } from '@apex/ui';

import {
  CATEGORY_OPTIONS,
  DIFFICULTY_OPTIONS,
  EQUIPMENT_OPTIONS,
  FORCE_TYPE_OPTIONS,
  MECHANIC_OPTIONS,
  MUSCLE_OPTIONS,
} from './labels';

/**
 * The filter bar.
 *
 * A plain GET form, like the search field it contains: submitting rewrites the
 * URL, and the URL is the only place filter state lives. No client store, no
 * effect syncing two sources of truth — the back button and a shared link work
 * because there is nothing to keep in sync.
 *
 * Five filters are open, three are folded into a `<details>`. That split is not
 * about importance but about how a coach narrows: category, muscle, equipment,
 * difficulty and sidedness answer "what am I looking for". Force type and
 * mechanic answer "how should it load", which is a second question and rarely
 * the first move.
 *
 * `page` is deliberately **not** rendered as a field. Submitting the form drops
 * it, which resets to page one — the correct behaviour when the result set
 * changes, and it comes for free rather than needing a handler.
 */

export interface ExerciseFilterValues {
  readonly q?: string | undefined;
  readonly category?: string | undefined;
  readonly primaryMuscle?: string | undefined;
  readonly secondaryMuscle?: string | undefined;
  readonly equipment?: string | undefined;
  readonly difficulty?: string | undefined;
  readonly unilateral?: string | undefined;
  readonly forceType?: string | undefined;
  readonly mechanic?: string | undefined;
}

/** Whether anything is narrowed, so the reset only appears when it does something. */
export function hasActiveFilters(values: ExerciseFilterValues): boolean {
  return Object.values(values).some((value) => value !== undefined && value !== '');
}

function Select({
  name,
  label,
  value,
  options,
  placeholder,
}: {
  readonly name: string;
  readonly label: string;
  readonly value: string | undefined;
  readonly options: readonly { readonly value: string; readonly label: string }[];
  readonly placeholder: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-muted-foreground">
      {label}
      <select
        name={name}
        defaultValue={value ?? ''}
        className="h-9 w-full min-w-40 rounded-md border border-input bg-background px-2 text-sm text-foreground shadow-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function ExerciseFilters({ values }: { readonly values: ExerciseFilterValues }) {
  const active = hasActiveFilters(values);

  return (
    <form className="flex flex-col gap-4" aria-label="Übungen filtern">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-xs text-muted-foreground">
          Suche
          <input
            name="q"
            defaultValue={values.q ?? ''}
            placeholder="Übung suchen"
            aria-label="Übungen nach Namen suchen"
            className="h-9 w-full max-w-xs min-w-48 rounded-md border border-input bg-background px-3 text-sm text-foreground shadow-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          />
        </label>

        <Select
          name="category"
          label="Kategorie"
          value={values.category}
          options={CATEGORY_OPTIONS}
          placeholder="Alle"
        />
        <Select
          name="primaryMuscle"
          label="Primärer Muskel"
          value={values.primaryMuscle}
          options={MUSCLE_OPTIONS}
          placeholder="Alle"
        />
        <Select
          name="equipment"
          label="Equipment"
          value={values.equipment}
          options={EQUIPMENT_OPTIONS}
          placeholder="Alle"
        />
        <Select
          name="difficulty"
          label="Niveau"
          value={values.difficulty}
          options={DIFFICULTY_OPTIONS}
          placeholder="Alle"
        />
        <Select
          name="unilateral"
          label="Seitigkeit"
          value={values.unilateral}
          options={[
            { value: 'true', label: 'Einseitig' },
            { value: 'false', label: 'Beidseitig' },
          ]}
          placeholder="Alle"
        />
      </div>

      <details
        open={
          values.secondaryMuscle !== undefined ||
          values.forceType !== undefined ||
          values.mechanic !== undefined
        }
      >
        <summary className="w-fit cursor-pointer text-sm text-muted-foreground">
          Weitere Filter
        </summary>

        <div className="flex flex-wrap items-end gap-3 pt-3">
          <Select
            name="secondaryMuscle"
            label="Sekundärer Muskel"
            value={values.secondaryMuscle}
            options={MUSCLE_OPTIONS}
            placeholder="Alle"
          />
          <Select
            name="forceType"
            label="Kraftrichtung"
            value={values.forceType}
            options={FORCE_TYPE_OPTIONS}
            placeholder="Alle"
          />
          <Select
            name="mechanic"
            label="Gelenkbeteiligung"
            value={values.mechanic}
            options={MECHANIC_OPTIONS}
            placeholder="Alle"
          />
        </div>
      </details>

      <div className="flex items-center gap-2">
        <Button type="submit" variant="outline" size="sm">
          Anwenden
        </Button>

        {/* A reset is a navigation to the unfiltered list, so it is a link — the
            browser and a screen reader both take it as one. */}
        {active ? (
          <Button asChild variant="ghost" size="sm">
            <a href="/exercises">Filter zurücksetzen</a>
          </Button>
        ) : null}
      </div>
    </form>
  );
}
