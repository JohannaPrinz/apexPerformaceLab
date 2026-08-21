'use client';

import { useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import { Check, Play, X } from 'lucide-react';

import {
  allowedAssessmentTransitions,
  type AssessmentProgress,
  type AssessmentStatus,
} from '@apex/domain';
import { Button, Dialog, DialogContent, DialogFooter } from '@apex/ui';

import { TOUCH_BUTTON } from '@/components/common/touch';

import { setAssessmentStatusAction } from '../server/actions';

import { ASSESSMENT_STATUS_LABELS_DE } from './labels';

/**
 * The one thing to do next, and the ways out beside it.
 *
 * ## One primary action per state
 *
 * A planned examination is started, a running one is continued or finished, a
 * finished one is only read. Offering all of them at once — five buttons of
 * equal weight — is the shape this replaced, and it forces the coach to work
 * out which applies instead of being told.
 *
 * What is offered comes from `allowedAssessmentTransitions`, so the interface
 * cannot drift from the rule. The server checks it again regardless: a rule
 * that lives in a button is not a rule.
 *
 * ## Abandoning asks first
 *
 * Aborting ends the session. It destroys nothing — every measurement stays —
 * but it is not something to do by a mis-tap, so it is confirmed and the dialog
 * says plainly what survives.
 */
export function AssessmentStatusActions({
  assessmentId,
  status,
  progress,
  nextModuleHref,
}: {
  readonly assessmentId: string;
  readonly status: AssessmentStatus;
  readonly progress: AssessmentProgress;
  /**
   * Where "start" and "continue" lead — the next test awaiting work.
   *
   * `null` when the examination has no test to run yet; the button then still
   * starts it, and the coach lands on the assessment with its tests listed.
   */
  readonly nextModuleHref: string | null;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [confirmingAbort, setConfirmingAbort] = useState(false);

  const allowed = allowedAssessmentTransitions(status);

  function move(next: AssessmentStatus, thenGoTo?: string | null) {
    setError(null);
    startTransition(async () => {
      const result = await setAssessmentStatusAction(assessmentId, next);

      if (result.message) {
        setError(result.message);

        return;
      }

      setConfirmingAbort(false);
      if (thenGoTo != null) router.push(thenGoTo);
      else router.refresh();
    });
  }

  return (
    <div className="flex flex-col items-end gap-2">
      {/* Secondary actions first, the primary one last: it then sits on the
          right wherever the row fits, and at the end of the stack where it
          wraps. On a phone that also puts it closest to the thumb. */}
      <div className="flex flex-wrap items-center justify-start gap-2 sm:justify-end">
        {allowed.includes('ARCHIVED') ? (
          <Button
            variant="ghost"
            className={TOUCH_BUTTON}
            disabled={pending}
            onClick={() => {
              move('ARCHIVED');
            }}
          >
            {/* Named, because a test tile on the same page carries a button
                labelled "Archivieren" too. Unqualified, the two are one word
                apart from putting away a single test and putting away the whole
                examination — and the second is the one nobody means to press.
                Its neighbours already say "Assessment starten" and "Assessment
                abschließen"; this now matches them. */}
            Assessment archivieren
          </Button>
        ) : null}

        {status === 'IN_PROGRESS' ? (
          <Button
            variant="ghost"
            className={TOUCH_BUTTON}
            disabled={pending}
            onClick={() => {
              setConfirmingAbort(true);
            }}
          >
            Abbrechen
          </Button>
        ) : null}

        {(status === 'COMPLETED' || status === 'ABORTED') && allowed.includes('IN_PROGRESS') ? (
          <Button
            variant="outline"
            className={TOUCH_BUTTON}
            disabled={pending}
            onClick={() => {
              move('IN_PROGRESS');
            }}
          >
            {status === 'COMPLETED' ? 'Wieder öffnen' : 'Wieder aufnehmen'}
          </Button>
        ) : null}

        {status === 'IN_PROGRESS' ? (
          <Button
            variant={nextModuleHref === null ? 'accent' : 'outline'}
            className={TOUCH_BUTTON}
            // Refused server-side while a test is open; disabling it here says
            // so before the coach finds out by pressing it.
            disabled={pending || !progress.settled}
            title={
              progress.settled
                ? undefined
                : 'Es sind noch Tests offen. Schließen Sie sie ab oder überspringen Sie sie.'
            }
            onClick={() => {
              move('COMPLETED');
            }}
          >
            <Check aria-hidden="true" className="size-4" />
            Assessment abschließen
          </Button>
        ) : null}

        {status === 'IN_PROGRESS' && nextModuleHref !== null ? (
          <Button variant="accent" className={TOUCH_BUTTON} asChild>
            <a href={nextModuleHref}>
              <Play aria-hidden="true" className="size-4" />
              Fortsetzen
            </a>
          </Button>
        ) : null}

        {status === 'PLANNED' && allowed.includes('IN_PROGRESS') ? (
          <Button
            variant="accent"
            className={TOUCH_BUTTON}
            disabled={pending}
            onClick={() => {
              move('IN_PROGRESS', nextModuleHref);
            }}
          >
            <Play aria-hidden="true" className="size-4" />
            Assessment starten
          </Button>
        ) : null}
      </div>

      {error === null ? null : (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <Dialog open={confirmingAbort} onOpenChange={setConfirmingAbort}>
        <DialogContent
          title="Assessment abbrechen?"
          description="Der Ablauf wird beendet. Bereits erfasste Messwerte bleiben vollständig erhalten und bleiben sichtbar."
        >
          <p className="text-sm text-pretty text-muted-foreground">
            Das Assessment erhält den Status „{ASSESSMENT_STATUS_LABELS_DE['ABORTED']}“. Sie können
            es später wieder aufnehmen.
          </p>

          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              className={TOUCH_BUTTON}
              onClick={() => {
                setConfirmingAbort(false);
              }}
            >
              Zurück
            </Button>
            <Button
              type="button"
              variant="outline"
              className={TOUCH_BUTTON}
              disabled={pending}
              onClick={() => {
                move('ABORTED');
              }}
            >
              <X aria-hidden="true" className="size-4" />
              Ja, abbrechen
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
