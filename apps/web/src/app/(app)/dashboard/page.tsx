import { redirect } from 'next/navigation';

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@apex/ui';

import { SignOutButton } from '@/features/auth';
import { api } from '@/trpc/server';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Dashboard',
};

/**
 * The workspace the coach lands in after registering or signing in.
 *
 * Both values are read through tRPC procedures rather than queried here: the
 * procedures carry the authorization, and `organizationProcedure` is what
 * guarantees the workspace shown is one the user actually belongs to.
 *
 * Placeholder content — the real dashboard arrives with the athletes slice.
 */
export default async function DashboardPage() {
  const [workspace, coach] = await Promise.all([
    api.auth.currentWorkspace(),
    api.auth.coachProfile(),
  ]);

  // A signed-in user without a coach profile is not a coach — an athlete portal
  // account will land here eventually. Nothing on this page is meaningful for
  // them, so send them away rather than rendering an empty coach dashboard.
  if (!coach) redirect('/');

  return (
    <main className="mx-auto flex w-full max-w-content flex-col gap-8 px-6 py-12">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span className="eyebrow">Workspace</span>
          <h1 className="text-3xl font-semibold">{workspace.name}</h1>
          <p className="text-sm text-muted-foreground">
            Signed in as {coach.displayName ?? 'Coach'} · {workspace.role}
          </p>
        </div>

        <SignOutButton />
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Your workspace</CardTitle>
            <CardDescription>
              An ordinary organization you own — not a special personal mode. Joining a practice
              later is one more membership, and this one stays exactly as it is.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted-foreground">Name</dt>
              <dd>{workspace.name}</dd>
              <dt className="text-muted-foreground">Slug</dt>
              <dd className="font-mono text-xs" data-numeric>
                {workspace.slug}
              </dd>
              <dt className="text-muted-foreground">Your role</dt>
              <dd>{workspace.role}</dd>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Coach profile</CardTitle>
            <CardDescription>
              Your profile belongs to you, not to this workspace. It travels with you between
              organizations.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted-foreground">Display name</dt>
              <dd>{coach.displayName ?? '—'}</dd>
              <dt className="text-muted-foreground">Title</dt>
              <dd>{coach.professionalTitle ?? '—'}</dd>
            </dl>
          </CardContent>
        </Card>
      </div>

      <p className="text-sm text-muted-foreground">
        Athletes, cases and assessments arrive in the next slices.
      </p>
    </main>
  );
}
