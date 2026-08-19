'use client';

import { useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import { Button } from '@apex/ui';

import { setAthleteArchivedAction } from '../server/actions';

/**
 * Archives or reactivates an athlete.
 *
 * **Never a delete.** An athlete's performance history outlives the coaching
 * relationship (§22), and the findings drawn from it are the coach's
 * professional documentation — so this is reversible, and the label says so.
 */
export function ArchiveButton({ athleteId, archived }: { athleteId: string; archived: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant={archived ? 'accent' : 'outline'}
        size="sm"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await setAthleteArchivedAction(athleteId, !archived);
            if (result.message) setError(result.message);
            else router.refresh();
          });
        }}
      >
        {pending ? 'Wird gespeichert…' : archived ? 'Reaktivieren' : 'Deaktivieren'}
      </Button>

      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
