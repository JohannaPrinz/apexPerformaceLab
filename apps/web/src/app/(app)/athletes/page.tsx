import Link from 'next/link';

import { Badge, Button, Card, CardContent } from '@apex/ui';

import { api } from '@/trpc/server';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Athletes',
};

/**
 * The roster.
 *
 * Archived athletes are hidden unless asked for: they are never deleted (§22),
 * but they do not belong in the working list either.
 */
export default async function AthletesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; archived?: string }>;
}) {
  const { q, archived } = await searchParams;
  const includeArchived = archived === '1';

  const { items } = await api.athletes.list({
    cursor: null,
    limit: 25,
    includeArchived,
    ...(q ? { search: q } : {}),
  });

  return (
    <main className="mx-auto flex w-full max-w-content flex-col gap-8 px-6 py-12">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="eyebrow">Roster</span>
          <h1 className="text-3xl font-semibold">Athletes</h1>
        </div>

        <Button asChild variant="accent">
          <Link href="/athletes/new">Add athlete</Link>
        </Button>
      </header>

      <form className="flex flex-wrap items-center gap-3">
        <input
          name="q"
          defaultValue={q ?? ''}
          placeholder="Search by name"
          aria-label="Search athletes by name"
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
          Include deactivated
        </label>
        <Button type="submit" variant="outline" size="sm">
          Apply
        </Button>
      </form>

      {items.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sm text-muted-foreground">
              {q ? `No athlete matches “${q}”.` : 'No athletes yet.'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((athlete) => (
            <li key={athlete.id}>
              <Link
                href={`/athletes/${athlete.id}`}
                className="flex items-center justify-between gap-4 rounded-md border border-border bg-card px-4 py-3 transition-colors hover:border-border-strong"
              >
                <span className="flex flex-col">
                  <span className="font-medium">
                    {athlete.lastName}, {athlete.firstName}
                  </span>
                  {athlete.email ? (
                    <span className="text-xs text-muted-foreground">{athlete.email}</span>
                  ) : null}
                </span>

                {athlete.archivedAt ? <Badge variant="secondary">Deactivated</Badge> : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
