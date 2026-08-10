'use client';

import { useActionState, useEffect } from 'react';

import { useRouter } from 'next/navigation';

import { Button } from '@apex/ui';

import { createAthleteAction, type AthleteFormState } from '../server/actions';

/**
 * Creates an athlete.
 *
 * Only the two names are required. The default case is an athlete without an
 * account and often without contact details (§21) — a coach entering someone
 * during a first consultation may know nothing else, and demanding an email
 * would make the commonest path the awkward one.
 */
export function AthleteForm() {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<AthleteFormState, FormData>(
    createAthleteAction,
    {},
  );

  useEffect(() => {
    if (state.athleteId) router.push(`/athletes/${state.athleteId}`);
  }, [state.athleteId, router]);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="firstName" label="First name" required error={state.errors?.['firstName']} />
        <Field id="lastName" label="Last name" required error={state.errors?.['lastName']} />
      </div>

      <Field
        id="dateOfBirth"
        label="Date of birth"
        type="date"
        error={state.errors?.['dateOfBirth']}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="email" label="Email" type="email" error={state.errors?.['email']} />
        <Field id="phone" label="Phone" type="tel" error={state.errors?.['phone']} />
      </div>

      {state.message ? (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      ) : null}

      <div className="flex gap-3">
        <Button type="submit" variant="accent" disabled={pending}>
          {pending ? 'Saving…' : 'Create athlete'}
        </Button>
        <Button type="button" variant="ghost" onClick={() => router.back()}>
          Cancel
        </Button>
      </div>
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
