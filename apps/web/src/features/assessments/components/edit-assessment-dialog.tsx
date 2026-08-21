'use client';

import { useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import { Pencil } from 'lucide-react';

import type { AssessmentStatus } from '@apex/domain';
import { Button, Dialog, DialogContent, DialogFooter, DialogTrigger } from '@apex/ui';

import { FOCUS_RING, TOUCH_BUTTON, TOUCH_FIELD } from '@/components/common/touch';

import { updateAssessmentAction } from '../server/actions';

import { ASSESSMENT_TYPE_LABELS_DE } from './labels';

/**
 * Correcting what a coach wrote on an examination.
 *
 * ## One date, two meanings
 *
 * An assessment carries a single date. While it is still `PLANNED` that date is
 * when it *shall* take place; once it has begun it is when it *did*. The label
 * follows the status rather than a second column doing so, because two dates
 * eventually disagree and then something has to decide which one the athlete's
 * timeline follows.
 *
 * ## Status is not here on purpose
 *
 * `PLANNED → IN_PROGRESS → COMPLETED` has its own transitions and its own
 * control beside this one. An ordinary edit must not be able to close a session
 * because a form posted every field it rendered.
 */
export interface AssessmentDialogValues {
  readonly id: string;
  readonly question: string;
  readonly description: string | null;
  readonly type: 'INITIAL' | 'RE_ASSESSMENT' | 'FOLLOW_UP';
  readonly performedAt: Date;
  readonly status: AssessmentStatus;
}

export function EditAssessmentDialog({
  assessment,
}: {
  readonly assessment: AssessmentDialogValues;
}) {
  const router = useRouter();
  const planned = assessment.status === 'PLANNED';

  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);

  const [question, setQuestion] = useState(assessment.question);
  const [description, setDescription] = useState(assessment.description ?? '');
  const [type, setType] = useState(assessment.type);
  const [date, setDate] = useState(toDateInput(assessment.performedAt));

  function reset() {
    setQuestion(assessment.question);
    setDescription(assessment.description ?? '');
    setType(assessment.type);
    setDate(toDateInput(assessment.performedAt));
    setError(null);
    setFieldError(null);
  }

  function submit() {
    if (question.trim() === '') {
      setFieldError('Bitte angeben, was dieses Assessment beantworten soll.');

      return;
    }

    const performedAt = fromDateInput(date);
    if (performedAt === null) {
      setFieldError('Bitte ein gültiges Datum angeben.');

      return;
    }

    setError(null);
    setFieldError(null);

    startTransition(async () => {
      const result = await updateAssessmentAction(assessment.id, {
        question: question.trim(),
        description: description.trim(),
        type,
        performedAt,
      });

      if (result.message) {
        setError(result.message);

        return;
      }

      setOpen(false);
      router.refresh();
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        // Reopening shows what is stored, not what was abandoned mid-edit.
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="ghost"
          className={TOUCH_BUTTON}
          // No `aria-label`: one would replace the visible "Bearbeiten" with a
          // name that does not contain it — the "label in name" failure.
        >
          <Pencil aria-hidden="true" className="size-4" />
          Bearbeiten
        </Button>
      </DialogTrigger>

      <DialogContent title="Assessment bearbeiten">
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="assessmentQuestion" className="text-sm font-medium">
              Fragestellung
            </label>
            <input
              id="assessmentQuestion"
              value={question}
              onChange={(event) => {
                setQuestion(event.target.value);
              }}
              placeholder="z. B. Warum bricht die Leistung im letzten Drittel ein?"
              aria-invalid={fieldError === null ? undefined : true}
              aria-describedby={fieldError === null ? undefined : 'assessmentQuestion-error'}
              className={`${TOUCH_FIELD} ${FOCUS_RING} w-full rounded-md border border-input bg-background px-3 shadow-sm aria-invalid:border-destructive`}
            />
            <p className="text-xs text-muted-foreground">
              Die Fragestellung ist zugleich der Titel des Assessments.
            </p>
            {fieldError === null ? null : (
              <p id="assessmentQuestion-error" role="alert" className="text-xs text-destructive">
                {fieldError}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="assessmentDescription" className="text-sm font-medium">
              Beschreibung <span className="text-muted-foreground">· optional</span>
            </label>
            <textarea
              id="assessmentDescription"
              value={description}
              onChange={(event) => {
                setDescription(event.target.value);
              }}
              rows={3}
              placeholder="Umstände, Absprachen, worauf zu achten ist"
              className={`${FOCUS_RING} w-full rounded-md border border-input bg-background px-3 py-2 text-base shadow-sm lg:text-sm`}
            />
            <p className="text-xs text-muted-foreground">
              Ein leeres Feld entfernt die gespeicherte Beschreibung.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex min-w-0 flex-col gap-1.5">
              <label htmlFor="assessmentDate" className="text-sm font-medium">
                {planned ? 'Geplant für' : 'Durchgeführt am'}
              </label>
              <input
                id="assessmentDate"
                type="date"
                value={date}
                onChange={(event) => {
                  setDate(event.target.value);
                }}
                className={`${TOUCH_FIELD} ${FOCUS_RING} w-full min-w-0 rounded-md border border-input bg-background px-3 shadow-sm`}
              />
            </div>

            <div className="flex min-w-0 flex-col gap-1.5">
              <label htmlFor="assessmentType" className="text-sm font-medium">
                Art
              </label>
              <select
                id="assessmentType"
                value={type}
                onChange={(event) => {
                  setType(event.target.value as AssessmentDialogValues['type']);
                }}
                className={`${TOUCH_FIELD} ${FOCUS_RING} w-full min-w-0 rounded-md border border-input bg-background px-3 shadow-sm`}
              >
                {(['INITIAL', 'RE_ASSESSMENT', 'FOLLOW_UP'] as const).map((entry) => (
                  <option key={entry} value={entry}>
                    {ASSESSMENT_TYPE_LABELS_DE[entry] ?? entry}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {error === null ? null : (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            className={TOUCH_BUTTON}
            onClick={() => {
              setOpen(false);
              reset();
            }}
          >
            Abbrechen
          </Button>
          <Button
            type="button"
            variant="accent"
            className={TOUCH_BUTTON}
            disabled={pending}
            onClick={submit}
          >
            {pending ? 'Wird gespeichert …' : 'Speichern'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * A `Date` as `<input type="date">` wants it.
 *
 * Local parts, not `toISOString()`: that converts to UTC first, so an
 * examination at 01:00 in Berlin would show the day before.
 */
function toDateInput(value: Date): string {
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');

  return `${String(value.getFullYear())}-${month}-${day}`;
}

/**
 * The date field back into the instant the procedure expects.
 *
 * Midday local time rather than midnight: an examination stored at 00:00 in a
 * zone behind UTC lands on the previous day the moment anything reads it in
 * UTC, and a date the coach typed must not move.
 */
function fromDateInput(value: string): string | null {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!parts) return null;

  const parsed = new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]), 12, 0, 0, 0);

  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}
