'use client';

import { useEffect, useId, useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import { Button } from '@apex/ui';

import { FOCUS_RING, TOUCH_BUTTON, TOUCH_TARGET } from '@/components/common/touch';

import { copyModuleAction, copyTargetsAction } from '../server/actions';

export interface CopyTarget {
  id: string;
  question: string;
}

/**
 * Copies a configured test — into this assessment or another one.
 *
 * **This assessment is the first option, and it is why the button exists.** The
 * common case is a second run of a test in the same session: three sprints, two
 * jumps. Copying used to be refused there, because an assessment recorded each
 * test type once; §11 abolished that and the unique index went with it, but the
 * refusal outlived both — which made this button do nothing at all for an
 * athlete with a single assessment.
 *
 * The other assessments of the athlete follow, for carrying a carefully
 * configured test over to the next session.
 *
 * ## Why the other assessments are fetched here
 *
 * They used to come with the page, which meant every assessment render read the
 * athlete's whole examination list for a menu that is shut — and rendered it
 * once per test card. The list is read when the menu opens instead, from the
 * same procedure as before.
 */
export function CopyModuleButton({
  moduleId,
  assessmentId,
  athleteId,
}: {
  moduleId: string;
  assessmentId: string;
  /** Whose other assessments to offer. Names them; grants nothing (§7). */
  athleteId: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const panelId = useId();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  /** The athlete's *other* assessments. This one is always the first option. */
  const [targets, setTargets] = useState<readonly CopyTarget[] | null>(null);
  const [targetsError, setTargetsError] = useState<string | null>(null);

  function loadTargets() {
    setTargetsError(null);
    void copyTargetsAction(athleteId, assessmentId).then(
      (result) => {
        if (result.ok) setTargets(result.targets);
        else setTargetsError(result.message);
      },
      () => {
        setTargetsError('Die anderen Assessments konnten nicht geladen werden.');
      },
    );
  }

  useEffect(() => {
    if (!open) return undefined;

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className="relative">
      <Button
        variant="ghost"
        className={TOUCH_BUTTON}
        // Without these the panel opens silently: a screen reader announces a
        // button that appears to do nothing.
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => {
          setOpen((previous) => {
            // Beim Öffnen einmal laden; ein zweites Öffnen findet die Liste vor.
            if (!previous && targets === null && targetsError === null) loadTargets();

            return !previous;
          });
        }}
      >
        Kopieren
      </Button>

      {open ? (
        <div
          id={panelId}
          // 18rem is wider than a 375px viewport once the page padding is
          // taken off, and an absolutely positioned panel does not shrink
          // to fit — it pushes the document sideways. The cap is what
          // keeps the overflow out of the page.
          className="absolute right-0 z-10 mt-1 flex w-72 max-w-[calc(100vw-3rem)] flex-col gap-1 rounded-md border border-border bg-card p-2 shadow-md"
        >
          <p className="px-2 py-1 text-xs text-muted-foreground">
            Die Konfiguration wird übernommen, die Messwerte nicht.
          </p>

          {[{ id: assessmentId, question: 'In dieses Assessment' }, ...(targets ?? [])].map(
            (target, index) => (
              <button
                key={target.id}
                type="button"
                disabled={pending}
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
                className={`${TOUCH_TARGET} ${FOCUS_RING} flex flex-col justify-center rounded px-2 text-left text-sm transition-colors hover:bg-muted disabled:opacity-40 disabled:hover:bg-transparent`}
              >
                <span className="line-clamp-1">{target.question}</span>
                {index === 0 ? (
                  <span className="text-xs text-muted-foreground">
                    zweiter Durchgang desselben Tests
                  </span>
                ) : null}
              </button>
            ),
          )}

          {/* Dieses Assessment steht sofort bereit; die übrigen Ziele kommen
              nach. Der Hinweis erscheint deshalb unter der Liste, nicht
              anstelle von ihr. */}
          {targets === null && targetsError === null ? (
            <p role="status" className="px-2 py-1 text-xs text-muted-foreground">
              Weitere Assessments werden geladen …
            </p>
          ) : null}

          {targetsError !== null ? (
            <div className="flex flex-col items-start gap-1 px-2 py-1">
              <p role="alert" className="text-xs text-destructive">
                {targetsError}
              </p>
              <button
                type="button"
                onClick={loadTargets}
                className={`${FOCUS_RING} rounded text-xs underline underline-offset-4`}
              >
                Erneut versuchen
              </button>
            </div>
          ) : null}

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
