'use client';

import { useState } from 'react';

import { Info } from 'lucide-react';

import { Button } from '@apex/ui';

import { TOUCH_BUTTON } from '@/components/common/touch';

/**
 * What happens to a stored video once its analysis has run (§18).
 *
 * ## Why the offer waits for the analysis to be kept
 *
 * A form-check recording usually has no reason to outlive its analysis, and the
 * plan this product runs on is 1 GB — so deleting it is offered. It used to be
 * offered the moment the run finished, under a sentence saying the analysis was
 * already stored. It was not: until the analysis is saved, the values and the
 * stills live only on this screen. A coach took the sentence at its word, deleted the video
 * to not forget it, and lost an analysis they had not yet read.
 *
 * So until the analysis is kept, this says so and offers nothing. Once it is,
 * the offer appears, and what it promises is then true: the values are on the
 * test and the stills are in the store, neither of which needs the video.
 */
export function StoredVideoRemoval({
  saved,
  remove,
}: {
  /** Whether the analysis has been filed — values on a test, stills uploaded. */
  readonly saved: boolean;
  readonly remove: () => Promise<{ message?: string }>;
}) {
  const [dismissed, setDismissed] = useState(false);
  const [removing, setRemoving] = useState(false);
  const [removed, setRemoved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!saved) {
    return (
      <p
        role="status"
        className="flex max-w-prose items-start gap-2 rounded-md border border-border bg-muted px-4 py-3 text-sm text-pretty"
      >
        <Info aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
        <span>
          Die Auswertung ist noch nicht gespeichert. Speichern Sie sie oben, sonst geht sie beim
          Verlassen dieser Seite verloren. Danach können Sie das Video löschen.
        </span>
      </p>
    );
  }

  if (removed) {
    return (
      <p
        role="status"
        className="rounded-md border border-border bg-muted px-4 py-3 text-sm text-muted-foreground"
      >
        Das Video wurde gelöscht. Die gespeicherte Auswertung und ihre Standbilder bleiben erhalten.
      </p>
    );
  }

  if (dismissed) return null;

  const run = () => {
    setRemoving(true);
    setError(null);

    void remove().then(
      (result) => {
        setRemoving(false);
        if (result.message) setError(result.message);
        else setRemoved(true);
      },
      () => {
        setRemoving(false);
        setError('Das Video konnte nicht gelöscht werden.');
      },
    );
  };

  return (
    <section
      aria-label="Video löschen?"
      className="flex flex-col gap-3 rounded-md border border-accent bg-accent-soft p-4 text-accent-soft-foreground"
    >
      <div className="flex flex-col gap-1">
        <h3 className="text-sm font-medium">Video jetzt löschen?</h3>
        <p className="max-w-prose text-xs text-pretty">
          Die Auswertung ist gespeichert und bleibt erhalten, auch ohne das Video. Die Standbilder
          werden nicht gelöscht. Wenn Sie die Aufnahme nicht mehr brauchen, hält das Löschen den
          Speicher klein.
        </p>
      </div>

      {error === null ? null : (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          className={TOUCH_BUTTON}
          disabled={removing}
          onClick={run}
        >
          {removing ? 'Wird gelöscht …' : 'Video löschen'}
        </Button>
        <Button
          type="button"
          variant="ghost"
          className={TOUCH_BUTTON}
          disabled={removing}
          onClick={() => {
            setDismissed(true);
          }}
        >
          Video behalten
        </Button>
      </div>
    </section>
  );
}
