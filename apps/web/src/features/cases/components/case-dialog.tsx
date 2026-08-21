'use client';

import { useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import { Pencil, Plus } from 'lucide-react';

import { Button, Dialog, DialogContent, DialogFooter, DialogTrigger } from '@apex/ui';

import { FOCUS_RING, TOUCH_BUTTON, TOUCH_FIELD } from '@/components/common/touch';

import { createCaseAction, updateCaseAction } from '../server/actions';

/**
 * Opening an engagement, and correcting one — the same three fields either way.
 *
 * One component in two modes rather than two forms. What a coach writes about a
 * case is identical whether it is new or being fixed; only the action differs,
 * and two forms would drift apart the way the exercise filter bar did.
 *
 * ## Status is not here on purpose
 *
 * `OPEN → CLOSED → ARCHIVED` has its own transitions and its own control. An
 * ordinary edit must not be able to close an engagement by accident, which is
 * exactly what a status field in this dialog would allow.
 */
export interface CaseDialogValues {
  readonly id: string;
  readonly title: string;
  readonly description: string | null;
  readonly type: 'ONGOING' | 'SINGLE_ASSESSMENT';
}

export function CaseDialog({
  athleteId,
  performanceCase,
}: {
  readonly athleteId: string;
  /** Absent when opening a new engagement. */
  readonly performanceCase?: CaseDialogValues;
}) {
  const router = useRouter();
  const editing = performanceCase !== undefined;

  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);

  const [title, setTitle] = useState(performanceCase?.title ?? '');
  const [description, setDescription] = useState(performanceCase?.description ?? '');
  const [type, setType] = useState<CaseDialogValues['type']>(performanceCase?.type ?? 'ONGOING');

  function submit() {
    if (title.trim() === '') {
      setFieldError('Bitte einen Titel für den Betreuungsfall angeben.');

      return;
    }

    setError(null);
    setFieldError(null);

    startTransition(async () => {
      const result = editing
        ? await updateCaseAction(performanceCase.id, athleteId, {
            title: title.trim(),
            description: description.trim(),
            type,
          })
        : await createCaseAction(athleteId, {
            title: title.trim(),
            description: description.trim(),
            type,
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
        if (next) return;

        // Reopening shows what is stored, not what was abandoned mid-edit.
        setTitle(performanceCase?.title ?? '');
        setDescription(performanceCase?.description ?? '');
        setType(performanceCase?.type ?? 'ONGOING');
        setError(null);
        setFieldError(null);
      }}
    >
      <DialogTrigger asChild>
        {editing ? (
          <Button
            variant="ghost"
            className={TOUCH_BUTTON}
            // No `aria-label` here: one would replace the visible "Bearbeiten"
            // with a name that does not contain it — the "label in name"
            // failure. The dialog it opens says which case it belongs to.
          >
            <Pencil aria-hidden="true" className="size-4" />
            Bearbeiten
          </Button>
        ) : (
          <Button variant="outline" className={TOUCH_BUTTON}>
            <Plus aria-hidden="true" className="size-4" />
            Betreuungsfall anlegen
          </Button>
        )}
      </DialogTrigger>

      <DialogContent
        title={editing ? 'Betreuungsfall bearbeiten' : 'Betreuungsfall anlegen'}
        description={
          editing ? undefined : 'Der Rahmen, in dem Sie Assessments zu einer Fragestellung bündeln.'
        }
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="caseTitle" className="text-sm font-medium">
              Titel
            </label>
            <input
              id="caseTitle"
              value={title}
              onChange={(event) => {
                setTitle(event.target.value);
              }}
              placeholder="z. B. Wettkampfvorbereitung Saison 2027"
              aria-invalid={fieldError === null ? undefined : true}
              aria-describedby={fieldError === null ? undefined : 'caseTitle-error'}
              className={`${TOUCH_FIELD} ${FOCUS_RING} w-full rounded-md border border-input bg-background px-3 shadow-sm aria-invalid:border-destructive`}
            />
            {fieldError === null ? null : (
              <p id="caseTitle-error" role="alert" className="text-xs text-destructive">
                {fieldError}
              </p>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="caseDescription" className="text-sm font-medium">
              Beschreibung <span className="text-muted-foreground">· optional</span>
            </label>
            <textarea
              id="caseDescription"
              value={description}
              onChange={(event) => {
                setDescription(event.target.value);
              }}
              rows={3}
              placeholder="Worum geht es in dieser Betreuung?"
              className={`${FOCUS_RING} w-full rounded-md border border-input bg-background px-3 py-2 text-base shadow-sm lg:text-sm`}
            />
            {editing ? (
              <p className="text-xs text-muted-foreground">
                Ein leeres Feld entfernt die gespeicherte Beschreibung.
              </p>
            ) : null}
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="caseType" className="text-sm font-medium">
              Art
            </label>
            <select
              id="caseType"
              value={type}
              onChange={(event) => {
                setType(event.target.value as CaseDialogValues['type']);
              }}
              className={`${TOUCH_FIELD} ${FOCUS_RING} w-full rounded-md border border-input bg-background px-3 shadow-sm`}
            >
              <option value="ONGOING">Laufende Betreuung</option>
              <option value="SINGLE_ASSESSMENT">Einzelnes Assessment</option>
            </select>
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
            {pending
              ? 'Wird gespeichert…'
              : editing
                ? 'Änderungen speichern'
                : 'Betreuungsfall anlegen'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
