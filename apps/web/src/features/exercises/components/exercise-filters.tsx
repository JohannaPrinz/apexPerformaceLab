import Link from 'next/link';

import { Button } from '@apex/ui';

import { TOUCH_BUTTON, TOUCH_FIELD, TOUCH_TARGET } from '@/components/common/touch';

import {
  CATEGORY_LABELS,
  ORIGIN_LABELS,
  ORIGIN_OPTIONS,
  CATEGORY_OPTIONS,
  DIFFICULTY_LABELS,
  EQUIPMENT_LABELS,
  FORCE_TYPE_LABELS,
  MECHANIC_LABELS,
  MUSCLE_LABELS,
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
  readonly origin?: string | undefined;
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
        className={`${TOUCH_FIELD} w-full min-w-40 rounded-md border border-input bg-background px-2 text-foreground shadow-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none`}
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

/** The German word for what a filter is currently set to. */
const FIELD_LABELS: Readonly<Record<string, string>> = {
  q: 'Suche',
  origin: 'Herkunft',
  category: 'Kategorie',
  primaryMuscle: 'Primärer Muskel',
  secondaryMuscle: 'Sekundärer Muskel',
  equipment: 'Equipment',
  difficulty: 'Niveau',
  unilateral: 'Seitigkeit',
  forceType: 'Kraftrichtung',
  mechanic: 'Gelenkbeteiligung',
};

const VALUE_LABELS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  origin: ORIGIN_LABELS,
  category: CATEGORY_LABELS,
  primaryMuscle: MUSCLE_LABELS,
  secondaryMuscle: MUSCLE_LABELS,
  equipment: { none: 'Kein Equipment', ...EQUIPMENT_LABELS },
  difficulty: DIFFICULTY_LABELS,
  forceType: FORCE_TYPE_LABELS,
  mechanic: MECHANIC_LABELS,
  unilateral: { true: 'Einseitig', false: 'Beidseitig' },
};

/** The URL without one filter — the chip's remove link. */
function withoutField(values: ExerciseFilterValues, field: string): string {
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(values) as [string, string | undefined][]) {
    if (value !== undefined && value !== '' && key !== field) query.set(key, value);
  }
  const suffix = query.toString();

  return suffix === '' ? '/exercises' : `/exercises?${suffix}`;
}

/**
 * The eight filters, defined once.
 *
 * Rendered twice — once in the desktop row, once inside the mobile disclosure —
 * but written once. Two parallel lists were the previous shape and they drifted
 * within a day: the mobile branch kept only the search field, which left a
 * phone with no filters at all.
 */
function FilterFields({
  values,
  layout,
}: {
  readonly values: ExerciseFilterValues;
  readonly layout: 'row' | 'column';
}) {
  const wrapper = layout === 'row' ? 'flex flex-wrap items-end gap-3' : 'flex flex-col gap-3';

  return (
    <>
      <div className={wrapper}>
        <Select
          name="origin"
          label="Herkunft"
          value={values.origin}
          options={ORIGIN_OPTIONS}
          placeholder="Alle"
        />
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
          options={[{ value: 'none', label: 'Kein Equipment' }, ...EQUIPMENT_OPTIONS]}
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

        {layout === 'row' ? (
          <Button type="submit" variant="outline" className={TOUCH_BUTTON}>
            Anwenden
          </Button>
        ) : null}
      </div>

      <details
        open={
          values.secondaryMuscle !== undefined ||
          values.forceType !== undefined ||
          values.mechanic !== undefined
        }
      >
        <summary
          className={`${TOUCH_TARGET} flex w-fit cursor-pointer items-center text-sm text-muted-foreground`}
        >
          Weitere Filter
        </summary>

        <div className={`${wrapper} pt-3`}>
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
    </>
  );
}

export function ExerciseFilters({ values }: { readonly values: ExerciseFilterValues }) {
  const active = hasActiveFilters(values);

  const chips = (Object.entries(values) as [string, string | undefined][]).flatMap(
    ([field, value]) =>
      value === undefined || value === ''
        ? []
        : [
            {
              field,
              label: FIELD_LABELS[field] ?? field,
              value: VALUE_LABELS[field]?.[value] ?? value,
            },
          ],
  );

  return (
    <form
      /* Uncontrolled fields keep whatever the DOM holds when React reuses the
         element, so a reset changed the URL and left the inputs filled. Keying
         the form on the current narrowing remounts them. */
      key={JSON.stringify(values)}
      className="flex flex-col gap-4"
      aria-label="Übungen filtern"
    >
      {/* Search first and full width: it is the fastest way in, and a coach who
          knows the name should not have to pass the filters to reach it. */}
      <div className="flex gap-2">
        <input
          name="q"
          defaultValue={values.q ?? ''}
          placeholder="Übung suchen"
          aria-label="Übungen nach Namen suchen"
          className={`${TOUCH_FIELD} w-full rounded-md border border-input bg-background px-3 text-foreground shadow-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none`}
        />
        <Button type="submit" className={`${TOUCH_BUTTON} shrink-0`}>
          Suchen
        </Button>
      </div>

      {/* Desktop: always open. */}
      <div className="flex flex-col gap-4 max-sm:hidden">
        <FilterFields values={values} layout="row" />
      </div>

      {/* Phone: the same fields, folded away — six controls would otherwise
          fill the screen before the first result. The count tells the coach
          something is narrowed without opening it. */}
      <details className="sm:hidden">
        <summary
          className={`${TOUCH_TARGET} flex w-fit cursor-pointer items-center text-sm text-muted-foreground`}
        >
          Suchen und filtern{chips.length > 0 ? ` (${String(chips.length)})` : ''}
        </summary>

        <div className="flex flex-col gap-3 pt-3">
          <FilterFields values={values} layout="column" />
        </div>
      </details>

      {chips.length > 0 ? (
        <ul className="flex flex-wrap gap-2" aria-label="Aktive Filter">
          {chips.map((chip) => (
            <li key={chip.field}>
              {/* A chip removes exactly its own filter and keeps the rest — the
                  quickest correction after narrowing one step too far. */}
              <Link
                href={withoutField(values, chip.field)}
                className={`${TOUCH_TARGET} inline-flex items-center gap-1.5 rounded-full border border-border bg-muted px-3 text-xs transition-colors hover:border-border-strong focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none`}
              >
                <span className="text-muted-foreground">{chip.label}:</span>
                <span>{chip.value}</span>
                <span aria-hidden="true">×</span>
                <span className="sr-only">entfernen</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}

      <div className="flex items-center gap-2">
        <Button type="submit" variant="outline" className={`${TOUCH_BUTTON} sm:hidden`}>
          Anwenden
        </Button>

        {/* A reset is a navigation to the unfiltered list, so it is a link — the
            browser and a screen reader both take it as one. */}
        {active ? (
          <Button asChild variant="ghost" className={TOUCH_BUTTON}>
            <Link href="/exercises">Filter zurücksetzen</Link>
          </Button>
        ) : null}
      </div>
    </form>
  );
}
