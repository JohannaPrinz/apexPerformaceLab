'use client';

import { useActionState, useState } from 'react';

import { Button } from '@apex/ui';

import { FOCUS_RING, TOUCH_BUTTON, TOUCH_FIELD } from '@/components/common/touch';

import { createCaseAction, type CaseFormState } from '../server/actions';

/**
 * Opens a case deliberately.
 *
 * Collapsed until asked for, because in the ordinary flow a coach never opens
 * one: starting an assessment creates the case on its own (§8). This is the
 * exception — a long-running engagement someone wants to name up front.
 */
export function CaseForm({ athleteId }: { athleteId: string }) {
  const [open, setOpen] = useState(false);
  const [handled, setHandled] = useState<string | null>(null);
  const [state, formAction, pending] = useActionState<CaseFormState, FormData>(
    createCaseAction,
    {},
  );

  // Adjusting state during render rather than in an effect: the effect version
  // renders once with the form still open and then again to close it, which is
  // the cascade the React Compiler rules warn about. `handled` makes this run
  // once per created case, so reopening the form afterwards still works.
  //
  // No `router.refresh()` — `revalidatePath` in the action already invalidates
  // this route, and the list re-renders on the server with the new case.
  if (state.caseId && state.caseId !== handled) {
    setHandled(state.caseId);
    setOpen(false);
  }

  if (!open) {
    return (
      <Button variant="outline" className={TOUCH_BUTTON} onClick={() => setOpen(true)}>
        Betreuungsfall eröffnen
      </Button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-md border border-border p-4">
      <input type="hidden" name="athleteId" value={athleteId} />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="title" className="text-sm font-medium text-foreground">
          Titel
        </label>
        <input
          id="title"
          name="title"
          required
          placeholder="HYROX-Vorbereitung"
          aria-invalid={state.errors?.['title'] ? true : undefined}
          className={`${TOUCH_FIELD} flex w-full rounded-md border border-input bg-background px-3 shadow-sm aria-invalid:border-destructive ${FOCUS_RING}`}
        />
        {state.errors?.['title'] ? (
          <p role="alert" className="text-xs text-destructive">
            {state.errors['title']}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="description" className="text-sm font-medium text-foreground">
          Beschreibung <span className="text-muted-foreground">· optional</span>
        </label>
        <textarea
          id="description"
          name="description"
          rows={2}
          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="type" className="text-sm font-medium text-foreground">
          Art
        </label>
        <select
          id="type"
          name="type"
          defaultValue="ONGOING"
          className={`${TOUCH_FIELD} w-full rounded-md border border-input bg-background px-3 shadow-sm ${FOCUS_RING}`}
        >
          <option value="ONGOING">Laufende Betreuung</option>
          <option value="SINGLE_ASSESSMENT">Einzelnes Assessment</option>
        </select>
      </div>

      {state.message ? (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      ) : null}

      <div className="flex gap-3">
        <Button type="submit" variant="accent" className={TOUCH_BUTTON} disabled={pending}>
          {pending ? 'Wird gespeichert…' : 'Betreuungsfall anlegen'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className={TOUCH_BUTTON}
          onClick={() => setOpen(false)}
        >
          Abbrechen
        </Button>
      </div>
    </form>
  );
}
