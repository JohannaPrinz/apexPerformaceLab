import Link from 'next/link';
import { redirect } from 'next/navigation';

import { ArrowLeft, ArrowRight, Dumbbell, Plus } from 'lucide-react';

import { Button } from '@apex/ui';

import { FOCUS_RING, TOUCH_TARGET } from '@/components/common/touch';
import { AthleteTile } from '@/features/athletes';
import { WORKSPACE_ROLE_LABELS } from '@/features/auth/labels';
import { api } from '@/trpc/server';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Übersicht',
};

/** Enough to recognise the roster, short enough to stay a shortcut. */
const RECENT_LIMIT = 6;

/**
 * The workspace overview — where the work is, not where the account is.
 *
 * Read top to bottom it answers, in order: which workspace am I in, how large
 * is it, whom did I last work with, and where do I go next. That order is the
 * hierarchy; there is no second column competing with it.
 *
 * **Every figure here has a query behind it.** The athlete counts are two
 * `count`s, and the assessment number on a tile is derived through
 * `Athlete → PerformanceCase → Assessment`. Appointments, uploads, comments and
 * share status are modelled but have no service, and "evaluation outstanding"
 * has no domain rule yet — none of them appear, not even as an empty frame.
 *
 * The tiles are a shortcut and say so: the roster with search and filters is
 * `/athletes`, and the link to it is part of the section rather than an
 * afterthought.
 */
export default async function DashboardPage() {
  const [workspace, coach, overview] = await Promise.all([
    api.auth.currentWorkspace(),
    api.auth.coachProfile(),
    api.athletes.overview({ limit: RECENT_LIMIT }),
  ]);

  if (!coach) redirect('/');

  const { counts, recent } = overview;

  return (
    <main className="mx-auto flex w-full max-w-content flex-col gap-10 px-6 py-12">
      <header className="flex flex-col gap-1">
        {/* A real touch target. At 375px this was 16px tall — a link a thumb
            cannot reliably hit is not a way back. */}
        <Link
          href="/start"
          className={`${FOCUS_RING} ${TOUCH_TARGET} -ml-2 inline-flex w-fit max-w-full items-center gap-1.5 rounded px-2 text-sm text-muted-foreground hover:text-foreground`}
        >
          <ArrowLeft aria-hidden="true" className="size-4 shrink-0" />
          Meine Übersicht
        </Link>
        <span className="eyebrow">Arbeitsbereich</span>
        <h1 className="text-3xl font-semibold text-pretty">{workspace.name}</h1>
        <p className="text-sm text-muted-foreground">
          Angemeldet als {coach.displayName ?? 'Coach'} ·{' '}
          {WORKSPACE_ROLE_LABELS[workspace.role] ?? workspace.role}
        </p>
      </header>

      {/* Two numbers, both counted. Archived is shown beside active rather than
          folded into it: an archived athlete is history and must not inflate the
          roster (§22). */}
      <section aria-label="Kennzahlen" className="grid gap-3 sm:grid-cols-2">
        <Figure label="Aktive Athleten" value={counts.active} />
        <Figure label="Deaktivierte Athleten" value={counts.archived} />
      </section>

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 className="text-lg font-semibold">Zuletzt bearbeitet</h2>
            <p className="text-sm text-muted-foreground">
              Eine Auswahl — die vollständige Kartei mit Suche und Filtern liegt unter Athleten.
            </p>
          </div>

          <Button asChild variant="accent" className="h-11 lg:h-9">
            <Link href="/athletes/new">
              <Plus aria-hidden="true" className="size-4" />
              Athlet anlegen
            </Link>
          </Button>
        </div>

        {recent.length === 0 ? (
          <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border px-4 py-12 text-center">
            <p className="text-sm text-muted-foreground">
              Noch keine Athleten in diesem Arbeitsbereich.
            </p>
            <Button asChild variant="outline" className="h-11 lg:h-9">
              <Link href="/athletes/new">Ersten Athleten anlegen</Link>
            </Button>
          </div>
        ) : (
          <>
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {recent.map((athlete) => (
                <li key={athlete.id} className="min-w-0">
                  <AthleteTile athlete={athlete} />
                </li>
              ))}
            </ul>

            <Link
              href="/athletes"
              className={`${FOCUS_RING} inline-flex min-h-11 w-fit items-center gap-1.5 rounded text-sm text-accent hover:underline`}
            >
              Alle Athleten anzeigen
              <ArrowRight aria-hidden="true" className="size-4" />
            </Link>
          </>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-lg font-semibold">Übungsdatenbank</h2>
        <Link
          href="/exercises"
          className={`${FOCUS_RING} flex min-h-11 items-center gap-3 rounded-lg border border-border bg-card p-4 transition-colors hover:border-border-strong`}
        >
          <Dumbbell aria-hidden="true" className="size-5 shrink-0 text-muted-foreground" />
          <span className="flex min-w-0 flex-col">
            <span className="font-medium">Übungen nachschlagen</span>
            <span className="text-xs text-pretty text-muted-foreground">
              Der gemeinsame Katalog und die Übungen dieses Arbeitsbereichs.
            </span>
          </span>
          <ArrowRight aria-hidden="true" className="ml-auto size-4 shrink-0" />
        </Link>
      </section>
    </main>
  );
}

/** A counted figure. Never a computed one — nothing here is an estimate. */
function Figure({ label, value }: { readonly label: string; readonly value: number }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-card p-5">
      <span className="text-3xl font-semibold" data-numeric>
        {value}
      </span>
      <span className="text-sm text-muted-foreground">{label}</span>
    </div>
  );
}
