'use client';

import { useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import { Archive, Plus, Trash2 } from 'lucide-react';

import { Button, Dialog, DialogContent, DialogFooter } from '@apex/ui';

import { TOUCH_BUTTON } from '@/components/common/touch';

import {
  archiveAnalysisAction,
  createAnalysisAction,
  deleteAnalysisAction,
} from '../server/actions';

/**
 * What a coach does *with* an analysis, as opposed to what they write in it.
 *
 * ## The lifecycle these buttons follow
 *
 * - **Neue Auswertung** starts a draft over every test that has values. An
 *   assessment may hold several drafts, so two analyses over different tests
 *   can exist side by side.
 * - **Löschen** is offered while an analysis has not been shared. A draft is
 *   working notes, and notes may be thrown away.
 * - **Archivieren** is what is left once it has been shared: the athlete was
 *   given that document, so it stays in the record — but archiving takes it
 *   out of the working view and ends every link to it.
 *
 * Both of the last two ask first, and say what will follow.
 */

export function NewAnalysisButton({
  assessmentId,
  variant = 'accent',
  label = 'Neue Auswertung',
}: {
  readonly assessmentId: string;
  readonly variant?: 'accent' | 'outline';
  readonly label?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const create = () => {
    setError(null);
    startTransition(async () => {
      const result = await createAnalysisAction(assessmentId, 'Auswertung');

      if (result.message !== undefined || result.reportId === undefined) {
        setError(result.message ?? 'Die Auswertung konnte nicht angelegt werden.');

        return;
      }

      router.push(`/assessments/${assessmentId}/auswertung/${result.reportId}`);
    });
  };

  return (
    <div className="flex flex-col items-start gap-2">
      <Button
        type="button"
        variant={variant}
        className={TOUCH_BUTTON}
        disabled={pending}
        onClick={create}
      >
        <Plus aria-hidden="true" className="size-4" />
        {pending ? 'Wird angelegt …' : label}
      </Button>

      {error === null ? null : (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  );
}

export function DeleteAnalysisButton({
  assessmentId,
  reportId,
}: {
  readonly assessmentId: string;
  readonly reportId: string;
}) {
  return (
    <LifecycleButton
      icon={<Trash2 aria-hidden="true" className="size-4" />}
      label="Entwurf löschen"
      title="Auswertung löschen?"
      description="Der Entwurf wird endgültig gelöscht — die Testauswahl und alles, was Sie hineingeschrieben haben. Die Tests und ihre Messwerte bleiben unverändert."
      confirmLabel="Endgültig löschen"
      destructive
      run={() => deleteAnalysisAction(assessmentId, reportId)}
      thenGoTo={`/assessments/${assessmentId}/auswertung`}
    />
  );
}

export function ArchiveAnalysisButton({
  assessmentId,
  reportId,
  activeShares,
}: {
  readonly assessmentId: string;
  readonly reportId: string;
  /** How many links the athlete can open right now — named in the question. */
  readonly activeShares: number;
}) {
  return (
    <LifecycleButton
      icon={<Archive aria-hidden="true" className="size-4" />}
      label="Archivieren"
      title="Auswertung archivieren?"
      description={
        activeShares === 0
          ? 'Die Auswertung wird archiviert und verschwindet aus dem Athletenportal. Sie bleibt für Sie lesbar.'
          : `Die Auswertung wird archiviert. ${activeShares === 1 ? 'Der aktive Link wird' : `Alle ${String(activeShares)} aktiven Links werden`} zurückgezogen, und der Athlet sieht sie nicht mehr. Für Sie bleibt sie lesbar.`
      }
      confirmLabel="Archivieren"
      run={() => archiveAnalysisAction(assessmentId, reportId)}
    />
  );
}

function LifecycleButton({
  icon,
  label,
  title,
  description,
  confirmLabel,
  destructive = false,
  run,
  thenGoTo,
}: {
  readonly icon: React.ReactNode;
  readonly label: string;
  readonly title: string;
  readonly description: string;
  readonly confirmLabel: string;
  readonly destructive?: boolean;
  readonly run: () => Promise<{ message?: string }>;
  /** Where to go afterwards, where the page itself is gone. */
  readonly thenGoTo?: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const confirm = () => {
    setError(null);
    startTransition(async () => {
      const result = await run();

      if (result.message) {
        setError(result.message);

        return;
      }

      setOpen(false);
      if (thenGoTo === undefined) router.refresh();
      else router.push(thenGoTo);
    });
  };

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        className={`${TOUCH_BUTTON} text-muted-foreground ${destructive ? 'hover:text-destructive' : ''}`}
        onClick={() => {
          setError(null);
          setOpen(true);
        }}
      >
        {icon}
        {label}
      </Button>

      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next && !pending) setOpen(false);
        }}
      >
        {open ? (
          <DialogContent title={title} description={description}>
            {error === null ? null : (
              <p role="alert" className="text-sm text-pretty text-destructive">
                {error}
              </p>
            )}
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                className={TOUCH_BUTTON}
                disabled={pending}
                onClick={() => {
                  setOpen(false);
                }}
              >
                Abbrechen
              </Button>
              <Button
                type="button"
                variant={destructive ? 'destructive' : 'accent'}
                className={TOUCH_BUTTON}
                disabled={pending}
                onClick={confirm}
              >
                {pending ? 'Wird ausgeführt …' : confirmLabel}
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>
    </>
  );
}
