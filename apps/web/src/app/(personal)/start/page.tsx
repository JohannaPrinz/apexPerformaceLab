import Link from 'next/link';
import { redirect } from 'next/navigation';

import { ArrowRight } from 'lucide-react';

import { Badge } from '@apex/ui';

import { FOCUS_RING } from '@/components/common/touch';
import { WORKSPACE_ROLE_LABELS } from '@/features/auth/labels';
import { api } from '@/trpc/server';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Meine Übersicht',
};

/**
 * The personal level: who I am, and which workspaces I work in.
 *
 * **Two blocks, and deliberately no more.** Appointments, open evaluations and
 * activity all belong here eventually — and all three lack both a service and,
 * in the case of "evaluation outstanding", a domain rule. An empty card
 * promising them would be a worse answer than their absence.
 *
 * `protectedProcedure` data only: nothing on this page is workspace-scoped,
 * which is what makes it readable before a workspace is chosen.
 */
export default async function StartPage() {
  const [workspaces, coach] = await Promise.all([api.auth.myWorkspaces(), api.auth.coachProfile()]);

  // A signed-in user without a coach profile is not a coach — an athlete portal
  // account will land here eventually and nothing on this page is meant for
  // them.
  if (!coach) redirect('/');

  const name = coach.displayName ?? 'Coach';

  return (
    <main className="mx-auto flex w-full max-w-content flex-col gap-10 px-6 py-12">
      <header className="flex flex-col gap-1">
        <span className="eyebrow">Persönliche Übersicht</span>
        <h1 className="text-3xl font-semibold text-pretty">Willkommen, {name}</h1>
        {coach.professionalTitle ? (
          <p className="text-sm text-muted-foreground">{coach.professionalTitle}</p>
        ) : null}
      </header>

      <section className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <h2 className="text-lg font-semibold">
            {workspaces.length === 1 ? 'Mein Arbeitsbereich' : 'Meine Arbeitsbereiche'}
          </h2>
          <p className="text-sm text-pretty text-muted-foreground">
            {workspaces.length === 1
              ? 'Hier arbeiten Sie mit Ihren Athleten.'
              : 'Wählen Sie den Bereich, in dem Sie arbeiten möchten.'}
          </p>
        </div>

        {workspaces.length === 0 ? (
          <p className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-muted-foreground">
            Sie gehören noch zu keinem Arbeitsbereich.
          </p>
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {workspaces.map((workspace) => (
              <li key={workspace.id} className="min-w-0">
                {/* Every tile leads to `/dashboard`. The active workspace is
                    session state (§ MVP), so choosing one is a switch, not a
                    different address — see the switcher in the app shell. */}
                <Link
                  href="/dashboard"
                  className={`${FOCUS_RING} flex min-h-11 flex-col gap-2 rounded-lg border border-border bg-card p-5 transition-colors hover:border-border-strong`}
                >
                  <span className="flex items-start justify-between gap-3">
                    <span className="min-w-0 font-medium break-words">{workspace.name}</span>
                    <ArrowRight aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
                  </span>

                  <Badge variant="outline" className="w-fit">
                    {WORKSPACE_ROLE_LABELS[workspace.role] ?? workspace.role}
                  </Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-semibold">Meine Daten</h2>

        <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm [&>dd]:min-w-0 [&>dd]:break-words">
          <dt className="text-muted-foreground">Name</dt>
          <dd>{coach.displayName ?? '—'}</dd>
          <dt className="text-muted-foreground">Titel</dt>
          <dd>{coach.professionalTitle ?? '—'}</dd>
          <dt className="text-muted-foreground">Dabei seit</dt>
          <dd data-numeric>{coach.createdAt.toLocaleDateString('de-DE')}</dd>
        </dl>
      </section>
    </main>
  );
}
