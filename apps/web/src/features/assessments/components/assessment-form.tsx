'use client';

import { useActionState, useState } from 'react';

import { Button } from '@apex/ui';

import { createAssessmentAction, type AssessmentFormState } from '../server/actions';

/**
 * Starts an assessment.
 *
 * **The question is required** (§10, §26.6). It is what stops an assessment
 * being a bag of measurements, and making it optional would mean it is left
 * empty — so the form asks for it first and offers nothing else until it is
 * answered.
 *
 * No case is chosen: the open one is found or created automatically (§8).
 */
export function AssessmentForm({ athleteId }: { athleteId: string }) {
  const [open, setOpen] = useState(false);
  const [handled, setHandled] = useState<string | null>(null);
  const [state, formAction, pending] = useActionState<AssessmentFormState, FormData>(
    createAssessmentAction,
    {},
  );

  // Adjusted during render rather than in an effect — see the case form.
  if (state.assessmentId && state.assessmentId !== handled) {
    setHandled(state.assessmentId);
    setOpen(false);
  }

  if (!open) {
    return (
      <Button variant="accent" size="sm" onClick={() => setOpen(true)}>
        Start assessment
      </Button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-md border border-border p-4">
      <input type="hidden" name="athleteId" value={athleteId} />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="question" className="text-sm font-medium text-foreground">
          What should this assessment answer?
        </label>
        <input
          id="question"
          name="question"
          required
          placeholder="Where is the aerobic threshold?"
          aria-invalid={state.errors?.['question'] ? true : undefined}
          className="flex h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none aria-invalid:border-destructive"
        />
        <p className="text-xs text-muted-foreground">
          Every assessment answers exactly one question. It is what the report will be written
          against.
        </p>
        {state.errors?.['question'] ? (
          <p role="alert" className="text-xs text-destructive">
            {state.errors['question']}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="type" className="text-sm font-medium text-foreground">
          Type
        </label>
        <select
          id="type"
          name="type"
          defaultValue="INITIAL"
          className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        >
          <option value="INITIAL">Initial</option>
          <option value="RE_ASSESSMENT">Re-assessment</option>
          <option value="FOLLOW_UP">Follow-up</option>
        </select>
      </div>

      {state.message ? (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      ) : null}

      <div className="flex gap-3">
        <Button type="submit" variant="accent" size="sm" disabled={pending}>
          {pending ? 'Saving…' : 'Create assessment'}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={() => setOpen(false)}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
