'use client';

import { useActionState, useState } from 'react';

import { Button } from '@apex/ui';

import { FOCUS_RING, TOUCH_BUTTON, TOUCH_FIELD } from '@/components/common/touch';

import { createAssessmentAction, type AssessmentFormState } from '../server/actions';

import { ASSESSMENT_TYPE_LABELS_DE } from './labels';

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
      <Button variant="accent" className={TOUCH_BUTTON} onClick={() => setOpen(true)}>
        Assessment starten
      </Button>
    );
  }

  return (
    <form action={formAction} className="flex flex-col gap-4 rounded-md border border-border p-4">
      <input type="hidden" name="athleteId" value={athleteId} />

      <div className="flex flex-col gap-1.5">
        <label htmlFor="question" className="text-sm font-medium text-foreground">
          Welche Frage soll dieses Assessment beantworten?
        </label>
        <input
          id="question"
          name="question"
          required
          placeholder="Wo liegt die aerobe Schwelle?"
          aria-invalid={state.errors?.['question'] ? true : undefined}
          className={`${TOUCH_FIELD} flex w-full rounded-md border border-input bg-background px-3 shadow-sm aria-invalid:border-destructive ${FOCUS_RING}`}
        />
        <p className="text-xs text-muted-foreground">
          Jedes Assessment beantwortet genau eine Frage. An ihr wird später der Bericht
          ausgerichtet.
        </p>
        {state.errors?.['question'] ? (
          <p role="alert" className="text-xs text-destructive">
            {state.errors['question']}
          </p>
        ) : null}
      </div>

      <div className="flex flex-col gap-1.5">
        <label htmlFor="type" className="text-sm font-medium text-foreground">
          Art
        </label>
        <select
          id="type"
          name="type"
          defaultValue="INITIAL"
          className={`${TOUCH_FIELD} w-full rounded-md border border-input bg-background px-3 shadow-sm ${FOCUS_RING}`}
        >
          <option value="INITIAL">{ASSESSMENT_TYPE_LABELS_DE['INITIAL']}</option>
          <option value="RE_ASSESSMENT">{ASSESSMENT_TYPE_LABELS_DE['RE_ASSESSMENT']}</option>
          <option value="FOLLOW_UP">{ASSESSMENT_TYPE_LABELS_DE['FOLLOW_UP']}</option>
        </select>
      </div>

      {state.message ? (
        <p role="alert" className="text-sm text-destructive">
          {state.message}
        </p>
      ) : null}

      <div className="flex gap-3">
        <Button type="submit" variant="accent" className={TOUCH_BUTTON} disabled={pending}>
          {pending ? 'Wird gespeichert…' : 'Assessment anlegen'}
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
