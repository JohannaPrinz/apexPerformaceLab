import Link from 'next/link';

import { Search } from 'lucide-react';

import { Badge, Button } from '@apex/ui';

import { FOCUS_RING, TOUCH_BUTTON, TOUCH_FIELD } from '@/components/common/touch';
import { CreateAthleteDialog, LoadMoreAthletes } from '@/features/athletes';
import { ATHLETE_STATUS_FILTERS, type AthleteStatusFilter } from '@/features/athletes/schemas';
import { api } from '@/trpc/server';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Athleten',
};

/** One screenful to scan, and the page size the API defaults to. */
const PAGE_SIZE = 25;

/** The working roster, the archive, or everything. */
const STATUS_LABELS: Readonly<Record<AthleteStatusFilter, string>> = {
  active: 'Aktive',
  archived: 'Deaktivierte',
  all: 'Alle',
};

/**
 * The athlete roster — the working surface, not the shortcut on the dashboard.
 *
 * All state in the URL: search, status and cursor. A filtered roster is a
 * shareable link, the back button works, and there is no second copy of the
 * state to keep in sync.
 *
 * **Cursor pagination with an honest total.** The cursor is what keeps paging
 * stable while the table is written to; the count is a separate query built
 * from the *same* `where`, so the headline can never describe a different set
 * from the rows below it.
 */
export default async function AthletesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; status?: string; cursor?: string }>;
}) {
  const params = await searchParams;
  const search = params.q?.trim() ?? '';
  const status =
    ATHLETE_STATUS_FILTERS.find((candidate) => candidate === params.status) ?? 'active';
  const cursor = params.cursor ?? '';

  const filters = { status, ...(search === '' ? {} : { search }) };

  const [page, total] = await Promise.all([
    api.athletes.list({ ...filters, cursor: cursor === '' ? null : cursor, limit: PAGE_SIZE }),
    api.athletes.count(filters),
  ]);

  const { items, nextCursor } = page;

  /** The current narrowing, carried across every link on the page. */
  const query = new URLSearchParams();
  if (search !== '') query.set('q', search);
  if (status !== 'active') query.set('status', status);
  if (cursor !== '') query.set('cursor', cursor);

  const narrowed = search !== '' || status !== 'active';

  return (
    <main className="mx-auto flex w-full max-w-content flex-col gap-8 px-6 py-12">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="eyebrow">Kartei</span>
          <h1 className="text-3xl font-semibold">Athleten</h1>
        </div>

        <CreateAthleteDialog />
      </header>

      {/* A GET form, so a search is a URL. The cursor is deliberately not a
          field: submitting drops it, which returns to the first page — the
          correct behaviour whenever the result set changes. */}
      <form
        className="flex flex-col gap-3 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-end"
        aria-label="Athleten suchen und filtern"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <label htmlFor="q" className="text-sm font-medium">
            Suche
          </label>
          <div className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            />
            <input
              id="q"
              name="q"
              defaultValue={search}
              placeholder="Vor- oder Nachname"
              className={`${TOUCH_FIELD} ${FOCUS_RING} w-full rounded-md border border-input bg-background pl-9 shadow-sm`}
            />
          </div>
        </div>

        <div className="flex flex-col gap-1.5 sm:w-44">
          <label htmlFor="status" className="text-sm font-medium">
            Status
          </label>
          <select
            id="status"
            name="status"
            defaultValue={status}
            className={`${TOUCH_FIELD} ${FOCUS_RING} w-full rounded-md border border-input bg-background px-3 shadow-sm`}
          >
            {ATHLETE_STATUS_FILTERS.map((candidate) => (
              <option key={candidate} value={candidate}>
                {STATUS_LABELS[candidate]}
              </option>
            ))}
          </select>
        </div>

        <div className="flex gap-2">
          <Button type="submit" variant="outline" className={TOUCH_BUTTON}>
            Anwenden
          </Button>
          {narrowed ? (
            <Button asChild variant="ghost" className={TOUCH_BUTTON}>
              <Link href="/athletes">Zurücksetzen</Link>
            </Button>
          ) : null}
        </div>
      </form>

      {/* Announced, because submitting reloads the page and moves focus to the
          top. The number counts the whole result, not the rows on screen. */}
      <p className="text-sm text-muted-foreground" role="status" aria-live="polite">
        {total === 0
          ? 'Keine Treffer'
          : `${String(total)} ${total === 1 ? 'Athlet' : 'Athleten'}${
              status === 'active' ? '' : ` · ${STATUS_LABELS[status].toLowerCase()}`
            }`}
      </p>

      {items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border px-4 py-12 text-center">
          <p className="text-sm text-pretty text-muted-foreground">
            {cursor !== '' && total > 0
              ? 'Diese Seite ist leer. Die Auswahl hat sich geändert, seit der Link entstanden ist.'
              : narrowed
                ? 'Kein Athlet passt zu dieser Auswahl.'
                : 'Noch keine Athleten angelegt.'}
          </p>

          {/* A stale cursor is the one dead end this list can produce, and only
              by hand-editing the URL. It gets a way out rather than an empty
              page with no controls. */}
          {cursor !== '' ? (
            <Button asChild variant="outline" className={TOUCH_BUTTON}>
              <Link href={startHref(query)}>Zum Anfang der Liste</Link>
            </Button>
          ) : narrowed ? (
            <Button asChild variant="outline" className={TOUCH_BUTTON}>
              <Link href="/athletes">Auswahl zurücksetzen</Link>
            </Button>
          ) : (
            <Button asChild variant="accent" className={TOUCH_BUTTON}>
              <Link href="/athletes/new">Ersten Athleten anlegen</Link>
            </Button>
          )}
        </div>
      ) : (
        <>
          <ul className="flex flex-col gap-2">
            {items.map((athlete) => (
              <li key={athlete.id}>
                <Link
                  href={`/athletes/${athlete.id}`}
                  className={`${FOCUS_RING} flex min-h-11 flex-wrap items-center justify-between gap-x-4 gap-y-1 rounded-md border border-border bg-card px-4 py-3 transition-colors hover:border-border-strong`}
                >
                  {/* `min-w-0` with `break-words`: a long double surname wraps
                      inside the row instead of widening the page, and the badge
                      cannot squeeze it off. */}
                  <span className="flex min-w-0 flex-col">
                    <span className="font-medium break-words">
                      {athlete.lastName}, {athlete.firstName}
                    </span>
                    <span className="text-xs break-words text-muted-foreground">
                      {facts(athlete)}
                    </span>
                  </span>

                  {/* Wording, not only colour: a status a coach can only see is
                      a status a screen reader cannot. */}
                  {athlete.archivedAt ? (
                    <Badge variant="secondary" className="shrink-0">
                      Deaktiviert
                    </Badge>
                  ) : null}
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

/** The identifying details a coach scans for, and nothing invented. */
function facts(athlete: { dateOfBirth: Date | null; email: string | null }): string {
  return [
    athlete.dateOfBirth === null ? null : `geb. ${athlete.dateOfBirth.toLocaleDateString('de-DE')}`,
    athlete.email,
  ]
    .filter((fact): fact is string => fact !== null && fact !== '')
    .join(' · ');
}

/** The same narrowing, back at the first page. */
function startHref(query: URLSearchParams): string {
  const start = new URLSearchParams(query);
  start.delete('cursor');
  const suffix = start.toString();

  return suffix === '' ? '/athletes' : `/athletes?${suffix}`;
}
