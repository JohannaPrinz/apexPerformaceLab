'use client';

import { useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import { CheckCircle2 } from 'lucide-react';

import { Button } from '@apex/ui';

import { ActionMenuItem } from '@/components/common/action-menu';
import { TOUCH_BUTTON } from '@/components/common/touch';

import { setCaseStatusAction } from '../server/actions';

import type { CaseStatusInput } from '../schemas';

/**
 * Moves a case along `OPEN → CLOSED → ARCHIVED`, and back to `OPEN`.
 *
 * One button rather than a menu: at any point there is exactly one obvious next
 * step, and a case is not a thing a coach touches often enough to warrant a
 * control that has to be learned.
 */
const NEXT: Record<CaseStatusInput, { status: CaseStatusInput; label: string }> = {
  OPEN: { status: 'CLOSED', label: 'Abschließen' },
  CLOSED: { status: 'ARCHIVED', label: 'Archivieren' },
  ARCHIVED: { status: 'OPEN', label: 'Wieder öffnen' },
};

export function CaseStatusButton({
  caseId,
  athleteId,
  status,
  /** Where it is rendered. The same action either way — see `ArchiveButton`. */
  as = 'button',
}: {
  caseId: string;
  athleteId: string;
  status: CaseStatusInput;
  as?: 'button' | 'menuitem';
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const next = NEXT[status];

  const run = () => {
    setError(null);
    startTransition(async () => {
      const result = await setCaseStatusAction(caseId, next.status, athleteId);
      if (result.message) setError(result.message);
      else router.refresh();
    });
  };

  const label = pending ? 'Wird gespeichert…' : next.label;

  if (as === 'menuitem') {
    return (
      <>
        <ActionMenuItem disabled={pending} onClick={run}>
          <CheckCircle2 aria-hidden="true" />
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
      <Button variant="outline" className={TOUCH_BUTTON} disabled={pending} onClick={run}>
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
