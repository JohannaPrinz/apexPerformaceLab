import Link from 'next/link';

import { Button } from '@apex/ui';

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center">
      <p className="font-mono text-sm text-muted-foreground">404</p>
      <h1 className="font-display text-3xl font-semibold tracking-heading">Seite nicht gefunden</h1>
      <p className="max-w-sm text-pretty text-muted-foreground">
        Diese Seite gibt es nicht oder sie ist umgezogen.
      </p>
      <Button asChild variant="outline">
        <Link href="/">Zurück zum Start</Link>
      </Button>
    </main>
  );
}
