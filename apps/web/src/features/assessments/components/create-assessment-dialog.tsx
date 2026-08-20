'use client';

import { useActionState, useEffect, useState } from 'react';

import { useRouter } from 'next/navigation';

import { Plus } from 'lucide-react';

import { Button, Dialog, DialogContent, DialogFooter, DialogTrigger } from '@apex/ui';

import { FOCUS_RING, TOUCH_BUTTON, TOUCH_FIELD } from '@/components/common/touch';

import { createAssessmentAction, type AssessmentFormState } from '../server/actions';

import { ASSESSMENT_TYPE_LABELS_DE } from './labels';

/**
 * Creating an assessment from inside the engagement it belongs to.
 *
 * ## Only what is needed to exist
 *
 * The question it answers, and what kind of examination it is. Nothing about
 * tests, measurements or protocols — those are the next step, and asking about
 * them here would make a coach configure a thing before they have decided to
 * create it.
 *
 * ## The case is not a field
 *
 * It is passed in, because the button sits inside the case. That is the whole
 * point of the nesting: the coach picked the engagement by choosing where to
 * click, so the dialog states it rather than asking. §8 still holds when no
 * case is named at all — the service falls back to adopting or opening one.
 */
export function CreateAssessmentDialog({
  athleteId,
  caseId,
  caseTitle,
}: {
  readonly athleteId: string;
  readonly caseId: string;
  readonly caseTitle: string;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<AssessmentFormState, FormData>(
    createAssessmentAction,
    {},
  );

  /**
   * Whether the coach asked for the dialog — not whether it is showing.
   *
   * Open is *derived*: the dialog is up while it was asked for and the action
   * has not produced an id. Closing it on success through an effect would
   * schedule a second render pass to undo the first, which is the cascading
   * update React warns about. This way success closes it during the same
   * render.
   */
  const [requested, setRequested] = useState(false);
  const open = requested && state.assessmentId === undefined;

  const setOpen = (next: boolean): void => {
    setRequested(next);
  };

  // The refresh is a side effect and belongs in an effect; it sets no state.
  useEffect(() => {
    if (state.assessmentId !== undefined) router.refresh();
  }, [state.assessmentId, router]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="accent" className={`${TOUCH_BUTTON} w-fit`}>
          <Plus aria-hidden="true" className="size-4" />
          Assessment anlegen
        </Button>
      </DialogTrigger>

      <DialogContent
        title="Assessment anlegen"
        description={`Im Betreuungsfall „${caseTitle}“. Die Tests fügen Sie im nächsten Schritt hinzu.`}
      >
        <form id="create-assessment" action={formAction} className="flex flex-col gap-4">
          <input type="hidden" name="athleteId" value={athleteId} />
          <input type="hidden" name="caseId" value={caseId} />

          <div className="flex flex-col gap-1.5">
            <label htmlFor="question" className="text-sm font-medium">
              Welche Frage soll dieses Assessment beantworten?
            </label>
            <input
              id="question"
              name="question"
              required
              placeholder="z. B. Wo liegt die aerobe Schwelle?"
              aria-invalid={state.errors?.['question'] === undefined ? undefined : true}
              aria-describedby={
                state.errors?.['question'] === undefined ? undefined : 'question-error'
              }
              className={`${TOUCH_FIELD} ${FOCUS_RING} w-full rounded-md border border-input bg-background px-3 shadow-sm aria-invalid:border-destructive`}
            />
            <p className="text-xs text-pretty text-muted-foreground">
              Jedes Assessment beantwortet genau eine Frage. An ihr wird später der Bericht
              ausgerichtet.
            </p>
            {state.errors?.['question'] === undefined ? null : (
              <p id="question-error" role="alert" className="text-xs text-destructive">
                {state.errors['question']}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="type" className="text-sm font-medium">
              Art
            </label>
            <select
              id="type"
              name="type"
              defaultValue="INITIAL"
              className={`${TOUCH_FIELD} ${FOCUS_RING} w-full rounded-md border border-input bg-background px-3 shadow-sm`}
            >
              {(['INITIAL', 'RE_ASSESSMENT', 'FOLLOW_UP'] as const).map((value) => (
                <option key={value} value={value}>
                  {ASSESSMENT_TYPE_LABELS_DE[value]}
                </option>
              ))}
            </select>
          </div>

          {state.message === undefined ? null : (
            <p role="alert" className="text-sm text-destructive">
              {state.message}
            </p>
          )}
        </form>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            className={TOUCH_BUTTON}
            onClick={() => {
              setOpen(false);
            }}
          >
            Abbrechen
          </Button>
          <Button
            type="submit"
            form="create-assessment"
            variant="accent"
            className={TOUCH_BUTTON}
            disabled={pending}
          >
            {pending ? 'Wird angelegt…' : 'Assessment anlegen'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
