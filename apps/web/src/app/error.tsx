'use client';

import { useEffect } from 'react';

import { Button } from '@apex/ui';

/**
 * Root error boundary.
 *
 * Next.js renders this for any uncaught error in the route subtree. The raw
 * message is shown only in development — in production users get a stable
 * message plus the `digest`, which is what correlates their report with the
 * server log.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Replace with the observability sink (PostHog / Sentry) once configured.
    console.error(error);
  }, [error]);

  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center">
      <h1 className="font-display text-3xl font-semibold tracking-heading">Something went wrong</h1>
      <p className="max-w-sm text-pretty text-muted-foreground">
        An unexpected error occurred. The team has been notified.
      </p>

      {process.env.NODE_ENV === 'development' && (
        <pre className="max-w-xl overflow-x-auto rounded-md bg-muted p-4 text-left font-mono text-xs text-muted-foreground">
          {error.message}
        </pre>
      )}

      {error.digest && (
        <p className="font-mono text-xs text-muted-foreground">Reference: {error.digest}</p>
      )}

      <Button onClick={reset}>Try again</Button>
    </main>
  );
}
