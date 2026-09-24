import Link from 'next/link';
import { notFound } from 'next/navigation';

import { TRPCError } from '@trpc/server';
import { ArrowLeft } from 'lucide-react';

import { TOUCH_TARGET } from '@/components/common/touch';
import { CoachFiles } from '@/features/athletes/components/coach-files';
import { api } from '@/trpc/server';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Dateien',
};

/**
 * The coach's view of one athlete's files (§18).
 *
 * A route of its own rather than a tenth section on the athlete page: filing is
 * a task somebody comes to do, not something read in passing, and the profile
 * is already long enough that the tracking was pushed below the fold once.
 *
 * The athlete is in the address here, which is right for a coach — they reach
 * every athlete of their workspace, and the procedure behind this says so. The
 * portal's page has no id at all.
 */
export default async function AthleteFilesPage({
  params,
  searchParams,
}: {
  params: Promise<{ athleteId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { athleteId } = await params;
  const { ordner } = await searchParams;

  const [athlete, files] = await Promise.all([
    api.athletes.byId({ athleteId }).catch((error: unknown) => {
      if (error instanceof TRPCError && error.code === 'NOT_FOUND') notFound();
      throw error;
    }),
    api.athletes.files({ athleteId }),
  ]);

  return (
    <main className="mx-auto flex w-full max-w-content flex-col gap-8 px-6 py-10">
      <div className="flex flex-col gap-2">
        <Link
          href={`/athletes/${athleteId}`}
          className={`${TOUCH_TARGET} inline-flex w-fit items-center gap-2 text-sm text-muted-foreground hover:text-foreground`}
        >
          <ArrowLeft aria-hidden="true" className="size-4" />
          Zurück zum Profil
        </Link>

        <h1 className="text-2xl font-semibold text-pretty">
          Dateien — {athlete.firstName} {athlete.lastName}
        </h1>
        <p className="max-w-prose text-sm text-pretty text-muted-foreground">
          Dokumente, Fotos und Videos zu diesem Athleten. Der Athlet sieht dieselbe Ablage in seinem
          Bereich und kann selbst hochladen.
        </p>
      </div>

      {/* The open folder is only a view: the shelf finds it among the folders
          this athlete has, and a stale or foreign id simply shows the overview. */}
      <CoachFiles
        athleteId={athleteId}
        folders={files.folders}
        files={files.assets}
        openFolderId={typeof ordner === 'string' ? ordner : null}
      />
    </main>
  );
}
