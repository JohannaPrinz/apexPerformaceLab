import { Skeleton } from '@apex/ui';

/**
 * Shown while the catalogue loads.
 *
 * Eight placeholder rows of the same height as a real one, so the page does not
 * jump when the list arrives. A spinner would say "something is happening"; this
 * says what is coming.
 */
export default function Loading() {
  return (
    <main className="mx-auto flex w-full max-w-content flex-col gap-8 px-6 py-12">
      <header className="flex flex-col gap-2">
        <Skeleton className="h-3 w-16" />
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-28" />
      </header>

      <Skeleton className="h-9 w-full max-w-xs" />

      <ul className="flex flex-col gap-2" aria-label="Übungen werden geladen">
        {Array.from({ length: 8 }, (_, index) => (
          <li key={index}>
            <Skeleton className="h-[86px] w-full rounded-md" />
          </li>
        ))}
      </ul>
    </main>
  );
}
