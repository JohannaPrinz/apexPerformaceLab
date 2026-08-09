import Link from 'next/link';

import { Button } from '@apex/ui';

export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-6 text-center">
      <p className="font-mono text-sm text-muted-foreground">404</p>
      <h1 className="font-display text-3xl font-semibold tracking-tight">Page not found</h1>
      <p className="max-w-sm text-pretty text-muted-foreground">
        The page you are looking for does not exist or has been moved.
      </p>
      <Button asChild variant="outline">
        <Link href="/">Back to start</Link>
      </Button>
    </main>
  );
}
