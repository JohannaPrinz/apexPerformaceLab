'use client';

import { useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import { Button } from '@apex/ui';

import { copyModuleAction } from '../server/actions';

export interface CopyTarget {
  id: string;
  question: string;
  /** Module keys that assessment already holds — it records each test once. */
  moduleKeys: readonly string[];
}

/**
 * Copies a configured test into another assessment.
 *
 * **Not into the same one.** An assessment records each test once
 * (`@@unique([assessmentId, moduleKey])`), so a copy alongside the original is
 * not something the model permits — and that constraint is deliberate, not an
 * obstacle to work around. The useful case is the one this offers: carrying a
 * test a coach has configured carefully over to the athlete's next assessment.
 *
 * Targets that already hold this test are shown and disabled rather than hidden,
 * so the reason is visible instead of the option merely being absent.
 */
export function CopyModuleButton({
  moduleId,
  moduleKey,
  assessmentId,
  targets,
}: {
  moduleId: string;
  moduleKey: string;
  assessmentId: string;
  targets: readonly CopyTarget[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (targets.length === 0) {
    return (
      <Button
        variant="ghost"
        size="sm"
        disabled
        title="This athlete has no other assessment to copy this test into."
      >
        Copy
      </Button>
    );
  }

  return (
    <div className="relative">
      <Button variant="ghost" size="sm" onClick={() => setOpen((previous) => !previous)}>
        Copy
      </Button>

      {open ? (
        <div className="absolute right-0 z-10 mt-1 flex w-72 flex-col gap-1 rounded-md border border-border bg-card p-2 shadow-md">
          <p className="px-2 py-1 text-xs text-muted-foreground">
            Copy into another assessment. The configuration travels; the measurements do not.
          </p>

          {targets.map((target) => {
            const alreadyHolds = target.moduleKeys.includes(moduleKey);

            return (
              <button
                key={target.id}
                type="button"
                disabled={alreadyHolds || pending}
                onClick={() => {
                  setError(null);
                  startTransition(async () => {
                    const result = await copyModuleAction(moduleId, assessmentId, target.id);
                    if (result.message) setError(result.message);
                    else {
                      setOpen(false);
                      router.refresh();
                    }
                  });
                }}
                className="rounded px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent"
              >
                <span className="line-clamp-1">{target.question}</span>
                {alreadyHolds ? (
                  <span className="text-xs text-muted-foreground">already holds this test</span>
                ) : null}
              </button>
            );
          })}

          {error ? (
            <p role="alert" className="px-2 text-xs text-destructive">
              {error}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
