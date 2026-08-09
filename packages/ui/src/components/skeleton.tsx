import * as React from 'react';

import { cn } from '../lib/cn';

/**
 * Loading placeholder. Pairs with React Suspense boundaries in the app so that
 * a slow query degrades into a stable layout rather than a spinner and a jump.
 */
function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return (
    <div
      data-slot="skeleton"
      aria-hidden
      className={cn('animate-pulse rounded-md bg-muted', className)}
      {...props}
    />
  );
}

export { Skeleton };
