import Link from 'next/link';

import { Badge, Button, Card, CardContent } from '@apex/ui';

import { LoadMoreAthletes } from '@/features/athletes';
import { api } from '@/trpc/server';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Athleten',
};

/** One screenful to scan, and the page size the API defaults to. */
const PAGE_SIZE = 25;

/**
 * The roster.
 *
 * All state in the URL — search, the archive filter and the cursor — so the back
 * button works and a filtered roster is a shareable link. Same architecture as
 * the exercise catalogue, and for the same reason: there is no second copy of
 * the state to keep in sync.
 *
 * Pagination is by cursor, which is the API-wide default: offset pagination
 * skips and repeats rows when the underlying table is written to mid-scroll, and
 * a roster is written to while it is being read. No total is fetched — a count
 * query for a number nobody reads is a query too many.
 *
 * Archived athletes are hidden unless asked for: they are never deleted (§22),
 * but they do not belong in the working list either.
 */
export default async function AthletesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; archived?: string; cursor?: string }>;
}) {
  const { q, archived, cursor } = await searchParams;
  const includeArchived = archived === '1';
  const search = q?.trim() ?? '';

  const { items, nextCursor } = await api.athletes.list({
    cursor: cursor ?? null,
    limit: PAGE_SIZE,
    includeArchived,
    ...(search === '' ? {} : { search }),
  });

  /** The current narrowing, carried across every link on the page. */
  const query = new URLSearchParams();
  if (search !== '') query.set('q', search);
  if (includeArchived) query.set('archived', '1');
  if (cursor) query.set('cursor', cursor);

  const emptyMessage =
    search === '' ? 'Noch keine Athleten angelegt.' : `Kein Athlet passt zu dieser Suche.`;

  return (
    <main className="mx-auto flex w-full max-w-content flex-col gap-8 px-6 py-12">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="eyebrow">Kartei</span>
          <h1 className="text-3xl font-semibold">Athleten</h1>
          {/* Announced, because submitting the form reloads the page and moves
              focus to the top — without this a screen reader user gets no sign
              that the list changed. No total: the cursor model does not know
              one, and asking for it would cost a second query. */}
          <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
            {items.length === 0
              ? 'Keine Treffer'
              : `${String(items.length)} ${items.length === 1 ? 'Athlet' : 'Athleten'}${
                  nextCursor === null ? '' : ' · weitere verfügbar'
                }`}
          </p>
        </div>

        <Button asChild variant="accent">
          <Link href="/athletes/new">Athlet anlegen</Link>
        </Button>
      </header>

      {/* A GET form, so a search is a URL. `cursor` is deliberately not a field:
          submitting drops it, which returns to the first page — the correct
          behaviour when the result set changes. */}
      <form className="flex flex-wrap items-center gap-3" aria-label="Athleten filtern">
        <input
          name="q"
          defaultValue={search}
          placeholder="Nach Namen suchen"
          aria-label="Athleten nach Namen suchen"
          className="h-9 w-full max-w-xs rounded-md border border-input bg-background px-3 text-sm shadow-sm focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
        />
        <label className="flex items-center gap-2 text-sm text-muted-foreground">
          <input
            type="checkbox"
            name="archived"
            value="1"
            defaultChecked={includeArchived}
            className="size-4 rounded-xs border-input"
          />
          Deaktivierte einschließen
        </label>
        <Button type="submit" variant="outline" size="sm">
          Anwenden
        </Button>
      </form>

      {items.length === 0 ? (
        <Card>
          <CardContent className="flex flex-col items-center gap-3 py-12 text-center">
            <p className="text-sm text-muted-foreground">{emptyMessage}</p>
            {search === '' ? null : (
              <Button asChild variant="outline" size="sm">
                <Link href="/athletes">Suche zurücksetzen</Link>
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            {items.map((athlete) => (
              <li key={athlete.id}>
                <Link
                  href={`/athletes/${athlete.id}`}
                  className="flex items-center justify-between gap-4 rounded-md border border-border bg-card px-4 py-3 transition-colors hover:border-border-strong focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  <span className="flex flex-col">
                    <span className="font-medium">
                      {athlete.lastName}, {athlete.firstName}
                    </span>
                    {athlete.email ? (
                      <span className="text-xs text-muted-foreground">{athlete.email}</span>
                    ) : null}
                  </span>

                  {athlete.archivedAt ? <Badge variant="secondary">Deaktiviert</Badge> : null}
                </Link>
              </li>
            ))}
          </ul>

          <LoadMoreAthletes nextCursor={nextCursor} query={query} />
        </>
      )}
    </main>
  );
}
