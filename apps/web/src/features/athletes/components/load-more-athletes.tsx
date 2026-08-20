import Link from 'next/link';

import { Button } from '@apex/ui';

import { FOCUS_RING, TOUCH_BUTTON, TOUCH_TARGET } from '@/components/common/touch';

/**
 * Forward navigation through the roster's cursor pages.
 *
 * **A link, not a button that appends.** The service paginates by cursor
 * (`packages/types/src/common/pagination.ts`), and the roster is a Server
 * Component with all of its state in the URL — the same architecture the
 * exercise catalogue uses. Genuinely appending rows would need a client store
 * holding the pages fetched so far, which is exactly the thing this design does
 * without.
 *
 * So each press is a navigation to the next 25, and the browser's back button
 * is the way back. A "Zum Anfang" link sits beside it once a cursor is in play,
 * so a coach several pages deep is never stranded on a page they cannot leave
 * without the keyboard.
 *
 * `nextCursor` is `null` on the last page — the service says so by not filling
 * it — and then nothing renders. No count query is involved, and none is wanted:
 * a total would be a second query for a number nobody reads.
 */
export function LoadMoreAthletes({
  nextCursor,
  query,
}: {
  /** `null` on the last page. */
  readonly nextCursor: string | null;
  /** The current search and archive filter, preserved across the jump. */
  readonly query: URLSearchParams;
}) {
  const atStart = !query.has('cursor');

  if (nextCursor === null) {
    // The last page still needs a way home, unless it is also the first.
    return atStart ? null : <BackToStart query={query} />;
  }

  const next = new URLSearchParams(query);
  next.set('cursor', nextCursor);

  return (
    <div className="flex flex-wrap items-center gap-3">
      {/* The most-tapped control on a long roster, so it carries the touch
          size rather than the compact one. Measured at 375px: it was 32px. */}
      <Button asChild variant="outline" className={TOUCH_BUTTON}>
        <Link href={`/athletes?${next.toString()}`}>Weitere Athleten laden</Link>
      </Button>

      {atStart ? null : <BackToStart query={query} />}
    </div>
  );
}

function BackToStart({ query }: { readonly query: URLSearchParams }) {
  const start = new URLSearchParams(query);
  start.delete('cursor');
  const suffix = start.toString();

  return (
    <Link
      href={suffix === '' ? '/athletes' : `/athletes?${suffix}`}
      className={`${TOUCH_TARGET} ${FOCUS_RING} inline-flex items-center rounded px-2 text-sm text-muted-foreground hover:underline`}
    >
      Zum Anfang
    </Link>
  );
}
