import Link from 'next/link';
import { notFound } from 'next/navigation';

import { TRPCError } from '@trpc/server';

import { AthleteForm } from '@/features/athletes';
import { api } from '@/trpc/server';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Athlet bearbeiten',
};

/**
 * Edits an athlete's master data.
 *
 * The lookup is the same tenant-scoped procedure the detail page uses, so an id
 * from another workspace produces NOT_FOUND here too — indistinguishable from an
 * id that never existed, which is deliberate (docs/SECURITY.md §4). The edit
 * screen must not be the one place that answers differently.
 */
export default async function EditAthletePage({
  params,
}: {
  params: Promise<{ athleteId: string }>;
}) {
  const { athleteId } = await params;

  const athlete = await api.athletes.byId({ athleteId }).catch((error: unknown) => {
    if (error instanceof TRPCError && error.code === 'NOT_FOUND') notFound();
    throw error;
  });

  return (
    <main className="mx-auto flex w-full max-w-narrow flex-col gap-8 px-6 py-12">
      <div className="flex flex-col gap-1">
        <Link
          href={`/athletes/${athlete.id}`}
          className="text-xs text-muted-foreground hover:underline"
        >
          ← {athlete.firstName} {athlete.lastName}
        </Link>
        <h1 className="text-3xl font-semibold">Stammdaten bearbeiten</h1>
      </div>

      <AthleteForm athlete={athlete} />
    </main>
  );
}
