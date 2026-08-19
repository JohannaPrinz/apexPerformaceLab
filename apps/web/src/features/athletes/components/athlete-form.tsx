'use client';

import { useActionState, useEffect } from 'react';

import { useRouter } from 'next/navigation';

import { Button } from '@apex/ui';

import { createAthleteAction, updateAthleteAction, type AthleteFormState } from '../server/actions';

import { DuplicateWarning } from './duplicate-warning';

/**
 * Creates *and* edits an athlete — one form, two modes.
 *
 * Not two components. The fields, their validation messages and the German
 * decimal handling are the same in both cases, and a second form would drift
 * from this one within a release: the exercise filter bar did exactly that when
 * it was written twice, and a phone was left with no filters at all.
 *
 * What actually differs is three things, and they are all derived from whether
 * an `athlete` was passed: which Server Action runs, what the fields start with,
 * and what the submit button says.
 *
 * `athleteId` is **bound to the action**, never rendered as a hidden field. A
 * hidden input would let the browser name the record to write. The tenant filter
 * in `updateAthlete` still stands behind it, so this is defence in depth — but
 * the cheapest place to not have the problem is here.
 */

export interface AthleteFormValues {
  readonly id: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly dateOfBirth: Date | null;
  readonly email: string | null;
  readonly phone: string | null;
  readonly heightCm: number | null;
  readonly weightKg: number | null;
}

/**
 * `yyyy-mm-dd`, which is what `<input type="date">` reads and writes.
 *
 * The column is `@db.Date`, so Prisma hands back midnight UTC and the ISO slice
 * is exact. Building this from `toLocaleDateString` would hand the input a
 * German string it cannot parse, and the field would silently start empty.
 */
const dateValue = (value: Date | null): string => value?.toISOString().slice(0, 10) ?? '';

/**
 * A stored figure, shown the way it will be typed back.
 *
 * German writes `64,5`. The schema accepts both separators, so displaying the
 * comma costs nothing and round-trips: what the coach sees is what they would
 * have entered.
 */
const decimalValue = (value: number | null): string =>
  value === null ? '' : String(value).replace('.', ',');

export function AthleteForm({ athlete }: { athlete?: AthleteFormValues }) {
  const router = useRouter();
  const editing = athlete !== undefined;

  const [state, formAction, pending] = useActionState<AthleteFormState, FormData>(
    // `bind` supplies the id server-side; it never travels as form data.
    editing ? updateAthleteAction.bind(null, athlete.id) : createAthleteAction,
    {},
  );

  useEffect(() => {
    if (state.athleteId) router.push(`/athletes/${state.athleteId}`);
  }, [state.athleteId, router]);

  return (
    <form action={formAction} className="flex flex-col gap-4" aria-label="Athletenstammdaten">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="firstName"
          label="Vorname"
          required
          defaultValue={athlete?.firstName ?? ''}
          error={state.errors?.['firstName']}
        />
        <Field
          id="lastName"
          label="Nachname"
          required
          defaultValue={athlete?.lastName ?? ''}
          error={state.errors?.['lastName']}
        />
      </div>

      <Field
        id="dateOfBirth"
        label="Geburtsdatum"
        type="date"
        defaultValue={dateValue(athlete?.dateOfBirth ?? null)}
        error={state.errors?.['dateOfBirth']}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="email"
          label="E-Mail"
          type="email"
          defaultValue={athlete?.email ?? ''}
          error={state.errors?.['email']}
        />
        <Field
          id="phone"
          label="Telefon"
          type="tel"
          defaultValue={athlete?.phone ?? ''}
          error={state.errors?.['phone']}
        />
      </div>

      {/* `inputMode="decimal"` on a text field rather than `type="number"`: a
          number input rejects the decimal comma in several browsers before the
          value ever reaches the schema, and the comma is the ordinary German
          input. The keypad is still numeric on a phone. */}
      <div className="grid gap-4 sm:grid-cols-2">
        <Field
          id="heightCm"
          label="Größe in cm"
          inputMode="decimal"
          placeholder="z. B. 178"
          defaultValue={decimalValue(athlete?.heightCm ?? null)}
          error={state.errors?.['heightCm']}
        />
        <Field
          id="weightKg"
          label="Aktuelles Gewicht in kg"
          inputMode="decimal"
          placeholder="z. B. 64,5"
          defaultValue={decimalValue(athlete?.weightKg ?? null)}
          error={state.errors?.['weightKg']}
        />
      </div>

      {state.message ? (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      ) : null}

      {/* Nothing was written when this is present — the coach is being asked,
          not told (§7). It sits above the buttons so the confirmation is read
          before it is pressed. */}
      {state.duplicates && state.duplicates.length > 0 ? (
        <DuplicateWarning candidates={state.duplicates} />
      ) : null}

      <div className="flex gap-3">
        <Button type="submit" variant="accent" disabled={pending}>
          {pending ? 'Wird gespeichert…' : editing ? 'Änderungen speichern' : 'Athlet anlegen'}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.back()}>
          Abbrechen
        </Button>
      </div>

      {editing ? (
        <p className="text-xs text-pretty text-muted-foreground">
          Ein leeres Feld entfernt den gespeicherten Wert. Vor- und Nachname müssen gefüllt bleiben.
        </p>
      ) : null}
    </form>
  );
}

/**
 * Local to this form. It differs from the auth slice's field in one way that
 * matters — it is uncontrolled, because a Server Action reads the DOM through
 * `FormData` rather than component state.
 */
function Field({
  id,
  label,
  error,
  ...props
}: React.ComponentProps<'input'> & { id: string; label: string; error?: string | undefined }) {
  const errorId = `${id}-error`;

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-foreground">
        {label}
        {props.required ? null : <span className="text-muted-foreground"> · optional</span>}
      </label>

      <input
        id={id}
        name={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className="flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none aria-invalid:border-destructive aria-invalid:ring-destructive/30"
        {...props}
      />

      {error ? (
        <p id={errorId} role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
