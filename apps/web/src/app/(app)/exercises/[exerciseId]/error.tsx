'use client';

import { useEffect } from 'react';

import { Button } from '@apex/ui';

/**
 * Error boundary for the catalogue.
 *
 * Scoped to this route rather than relying on the root boundary, so a failed
 * catalogue read leaves the rest of the application usable and offers a retry
 * in place. The raw message stays in development; in production the `digest` is
 * what connects a coach's report to the server log.
 */
export default function ExercisesError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Replace with the observability sink once configured — same as the root.
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex w-full max-w-content flex-col items-start gap-4 px-6 py-12">
      <h1 className="text-3xl font-semibold">Der Katalog konnte nicht geladen werden</h1>
      <p className="max-w-prose text-pretty text-muted-foreground">
        Die Übungen sind gerade nicht abrufbar. Ein erneuter Versuch hilft meistens.
      </p>

      {process.env.NODE_ENV === 'development' ? (
        <pre className="max-w-full overflow-x-auto rounded-md border border-border bg-muted p-3 text-xs">
          {error.message}
        </pre>
      ) : error.digest ? (
        <p className="text-xs text-muted-foreground">Referenz: {error.digest}</p>
      ) : null}

      <Button onClick={reset} variant="outline" size="sm">
        Erneut versuchen
      </Button>
    </main>
  );
}
