'use client';

import { useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import { RotateCcw, UserMinus } from 'lucide-react';

import { Button } from '@apex/ui';

import { ActionMenuItem } from '@/components/common/action-menu';
import { TOUCH_BUTTON } from '@/components/common/touch';

import { setAthleteArchivedAction } from '../server/actions';

/**
 * Archives or reactivates an athlete.
 *
 * **Never a delete.** An athlete's performance history outlives the coaching
 * relationship (§22), and the findings drawn from it are the coach's
 * professional documentation — so this is reversible, and the label says so.
 */
export function ArchiveButton({
  athleteId,
  archived,
  /**
   * Where it is rendered.
   *
   * The same action, and deliberately the same component: a second copy inside
   * a menu would be a second place for the wording, the pending state and the
   * error to drift. Only the chrome differs.
   */
  as = 'button',
}: {
  athleteId: string;
  archived: boolean;
  as?: 'button' | 'menuitem';
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = () => {
    setError(null);
    startTransition(async () => {
      const result = await setAthleteArchivedAction(athleteId, !archived);
      if (result.message) setError(result.message);
      else router.refresh();
    });
  };

  const label = pending ? 'Wird gespeichert…' : archived ? 'Reaktivieren' : 'Deaktivieren';

  if (as === 'menuitem') {
    return (
      <>
        <ActionMenuItem disabled={pending} onClick={run}>
          {archived ? <RotateCcw aria-hidden="true" /> : <UserMinus aria-hidden="true" />}
          {label}
        </ActionMenuItem>

        {error ? (
          <p role="alert" className="px-2 pb-1 text-xs text-destructive">
            {error}
          </p>
        ) : null}
      </>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant={archived ? 'accent' : 'outline'}
        className={TOUCH_BUTTON}
        disabled={pending}
        onClick={run}
      >
        {label}
      </Button>

      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
