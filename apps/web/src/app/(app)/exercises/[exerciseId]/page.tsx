import Link from 'next/link';
import { notFound } from 'next/navigation';

import { TRPCError } from '@trpc/server';

import { Button } from '@apex/ui';

import { ExerciseDetail } from '@/features/exercises/components/exercise-detail';
import { ExerciseRelationships } from '@/features/exercises/components/exercise-relationships';
import { api } from '@/trpc/server';

/**
 * One exercise, with the exercises it is connected to.
 *
 * Follows the athlete detail page: a server component that fetches by id and
 * turns a tRPC `NOT_FOUND` into Next's `notFound()`. A workspace that cannot
 * see the row gets the same answer as one where the row does not exist — the
 * tenant rule the service already enforces, surfaced unchanged.
 */
export default async function ExerciseDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ exerciseId: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const [{ exerciseId }, { from }] = await Promise.all([params, searchParams]);

  // Both queries at once: the relationships do not depend on the exercise, and
  // waiting for one before starting the other doubles the wait for nothing.
  const [exercise, related] = await Promise.all([
    api.exercises.byId({ exerciseId }).catch((error: unknown) => {
      if (error instanceof TRPCError && error.code === 'NOT_FOUND') notFound();
      throw error;
    }),
    api.exercises.variants({ exerciseId }),
  ]);

  /**
   * Back to the list the coach came from, filters and page intact.
   *
   * Only a relative path is accepted: `from` arrives in the URL and could name
   * any host, which would turn this link into an open redirect.
   */
  const backHref =
    from !== undefined && from !== '' && !from.includes('//') ? `/exercises?${from}` : '/exercises';

  return (
    <main className="mx-auto flex w-full max-w-content flex-col gap-10 px-6 py-12">
      <Button asChild variant="ghost" size="sm" className="-ml-2 w-fit">
        <Link href={backHref}>← Zurück zur Liste</Link>
      </Button>

      <ExerciseDetail exercise={exercise} />

      <ExerciseRelationships exercises={related} />
    </main>
  );
}
