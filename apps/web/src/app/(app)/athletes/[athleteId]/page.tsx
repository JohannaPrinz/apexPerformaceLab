import Link from 'next/link';
import { notFound } from 'next/navigation';

import { TRPCError } from '@trpc/server';

import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@apex/ui';

import { ArchiveButton } from '@/features/athletes';
import { CaseForm, CaseList } from '@/features/cases';
import { api } from '@/trpc/server';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Athlete',
};

/**
 * Athlete detail.
 *
 * The lookup is tenant-scoped inside the procedure, so an id from another
 * workspace produces `NOT_FOUND` — indistinguishable from an id that never
 * existed, which is deliberate (docs/SECURITY.md §4).
 */
export default async function AthletePage({ params }: { params: Promise<{ athleteId: string }> }) {
  const { athleteId } = await params;

  const athlete = await api.athletes.byId({ athleteId }).catch((error: unknown) => {
    if (error instanceof TRPCError && error.code === 'NOT_FOUND') notFound();
    throw error;
  });

  const cases = await api.cases.listForAthlete({ athleteId });

  return (
    <main className="mx-auto flex w-full max-w-content flex-col gap-8 px-6 py-12">
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <Link href="/athletes" className="text-xs text-muted-foreground hover:underline">
            ← Athletes
          </Link>
          <h1 className="text-3xl font-semibold">
            {athlete.firstName} {athlete.lastName}
          </h1>
          <div className="flex items-center gap-2">
            {athlete.archivedAt ? (
              <Badge variant="secondary">Deactivated</Badge>
            ) : (
              <Badge variant="accent">Active</Badge>
            )}
            {athlete.userId ? <Badge variant="outline">Portal access</Badge> : null}
          </div>
        </div>

        <ArchiveButton athleteId={athlete.id} archived={athlete.archivedAt !== null} />
      </header>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Details</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-sm">
              <dt className="text-muted-foreground">Date of birth</dt>
              <dd data-numeric>{athlete.dateOfBirth?.toLocaleDateString('de-DE') ?? '—'}</dd>
              <dt className="text-muted-foreground">Email</dt>
              <dd>{athlete.email ?? '—'}</dd>
              <dt className="text-muted-foreground">Phone</dt>
              <dd>{athlete.phone ?? '—'}</dd>
              <dt className="text-muted-foreground">Added</dt>
              <dd data-numeric>{athlete.createdAt.toLocaleDateString('de-DE')}</dd>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Portal access</CardTitle>
            <CardDescription>
              An athlete needs no account (§21). Activation arrives with the portal slice.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              {athlete.userId ? 'Linked to a user account.' : 'No account linked.'}
            </p>
          </CardContent>
        </Card>
      </div>

      <section className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex flex-col gap-1">
            <span className="eyebrow">Performance cases</span>
            <h2 className="text-xl font-semibold">Journey</h2>
          </div>

          <CaseForm athleteId={athlete.id} />
        </div>

        <CaseList athleteId={athlete.id} cases={cases} />
      </section>

      {athlete.archivedAt ? (
        <p className="text-sm text-pretty text-muted-foreground">
          This athlete is deactivated. Nothing has been deleted — the record and its history stay
          intact, and reactivating restores full access.
        </p>
      ) : null}
    </main>
  );
}
