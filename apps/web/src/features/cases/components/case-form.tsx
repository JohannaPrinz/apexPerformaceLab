'use client';

import { useActionState, useState } from 'react';

import { Button } from '@apex/ui';

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
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        Open a case
      </Button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-md border border-border p-4">
      <input type="hidden" name="athleteId" value={athleteId} />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="title" className="text-sm font-medium text-foreground">
          Title
        </label>
        <input
          id="title"
          name="title"
          required
          placeholder="HYROX preparation"
          aria-invalid={state.errors?.['title'] ? true : undefined}
          className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none aria-invalid:border-destructive"
        />
        {state.errors?.['title'] ? (
          <p role="alert" className="text-xs text-destructive">
            {state.errors['title']}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="description" className="text-sm font-medium text-foreground">
          Description <span className="text-muted-foreground">· optional</span>
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
          Type
        </label>
        <select
          id="type"
          name="type"
          defaultValue="ONGOING"
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <option value="ONGOING">Ongoing engagement</option>
          <option value="SINGLE_ASSESSMENT">Single assessment</option>
        </select>
      </div>

      {state.message ? (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      ) : null}

      <div className="flex gap-3">
        <Button type="submit" variant="accent" size="sm" disabled={pending}>
          {pending ? 'Saving…' : 'Create case'}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
