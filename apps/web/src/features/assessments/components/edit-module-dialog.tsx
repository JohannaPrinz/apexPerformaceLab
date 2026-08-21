'use client';

import { useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import { Pencil } from 'lucide-react';

import { Button, Dialog, DialogContent, DialogFooter, DialogTrigger } from '@apex/ui';

import { FOCUS_RING, TOUCH_BUTTON, TOUCH_FIELD } from '@/components/common/touch';

import { updateModuleAction } from '../server/actions';

/**
 * Renaming a test, or saying what it is for.
 *
 * **Not the protocol.** Stages, sides, quantities and exercises live in the
 * configuration and are changed under "Konfigurieren", which revalidates the
 * whole thing against the catalogue and can refuse. Fixing a typo in a name
 * must not be able to fail because an exercise was archived last week — and a
 * test whose configuration no longer validates must still be nameable.
 *
 * The name may be cleared. It then falls back to the type's label everywhere,
 * which is what tests written before names existed already do.
 */
export function EditModuleDialog({
  moduleId,
  assessmentId,
  name,
  description,
  typeLabel,
}: {
  readonly moduleId: string;
  readonly assessmentId: string;
  readonly name: string | null;
  readonly description: string | null;
  /** Shown as the placeholder — what the test is called when it has no name. */
  readonly typeLabel: string;
}) {
  const router = useRouter();

  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const [draftName, setDraftName] = useState(name ?? '');
  const [draftDescription, setDraftDescription] = useState(description ?? '');

  function reset() {
    setDraftName(name ?? '');
    setDraftDescription(description ?? '');
    setError(null);
  }

  function submit() {
    setError(null);
    startTransition(async () => {
      const result = await updateModuleAction(moduleId, assessmentId, {
        name: draftName.trim(),
        description: draftDescription.trim(),
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
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" className={TOUCH_BUTTON}>
          <Pencil aria-hidden="true" className="size-4" />
          Bearbeiten
        </Button>
      </DialogTrigger>

      <DialogContent
        title="Test bearbeiten"
        description="Name und Beschreibung. Der Ablauf des Tests wird unter „Konfigurieren“ geändert."
      >
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="moduleName" className="text-sm font-medium">
              Name <span className="text-muted-foreground">· optional</span>
            </label>
            <input
              id="moduleName"
              value={draftName}
              onChange={(event) => {
                setDraftName(event.target.value);
              }}
              placeholder={typeLabel}
              className={`${TOUCH_FIELD} ${FOCUS_RING} w-full rounded-md border border-input bg-background px-3 shadow-sm`}
            />
            <p className="text-xs text-muted-foreground">
              Was diesen Test von anderen desselben Typs unterscheidet — „Sprint 1“ neben „Sprint
              2“. Leer bedeutet: der Test heißt wie sein Typ.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="moduleDescription" className="text-sm font-medium">
              Beschreibung <span className="text-muted-foreground">· optional</span>
            </label>
            <textarea
              id="moduleDescription"
              value={draftDescription}
              onChange={(event) => {
                setDraftDescription(event.target.value);
              }}
              rows={3}
              placeholder="Wozu dieser Test in diesem Assessment dient"
              className={`${FOCUS_RING} w-full rounded-md border border-input bg-background px-3 py-2 text-base shadow-sm lg:text-sm`}
            />
            <p className="text-xs text-muted-foreground">
              Belastungsstufen, Geräteeinstellungen und Bedingungen gehören in die Protokollnotizen
              der Konfiguration.
            </p>
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
