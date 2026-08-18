import { Skeleton } from '@apex/ui';

/**
 * Shown while one exercise loads.
 *
 * Mirrors the real page's shape — heading, media band, a few instruction lines,
 * an attribute grid — so the layout does not jump when the content lands.
 */
export default function Loading() {
  return (
    <main className="mx-auto flex w-full max-w-content flex-col gap-10 px-6 py-12">
      <Skeleton className="h-8 w-32" />

      <div className="flex flex-col gap-3">
        <Skeleton className="h-9 w-2/3" />
        <Skeleton className="h-4 w-full max-w-prose" />
      </div>

      <Skeleton className="h-16 w-full max-w-sm" />

      <div className="flex flex-col gap-2">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-4 w-full" />
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-10" />
        ))}
      </div>
    </main>
  );
}
