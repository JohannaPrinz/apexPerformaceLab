'use client';

import { useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import { Button } from '@apex/ui';

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
  OPEN: { status: 'CLOSED', label: 'Close' },
  CLOSED: { status: 'ARCHIVED', label: 'Archive' },
  ARCHIVED: { status: 'OPEN', label: 'Reopen' },
};

export function CaseStatusButton({
  caseId,
  athleteId,
  status,
}: {
  caseId: string;
  athleteId: string;
  status: CaseStatusInput;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const next = NEXT[status];

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await setCaseStatusAction(caseId, next.status, athleteId);
            if (result.message) setError(result.message);
            else router.refresh();
          });
        }}
      >
        {pending ? 'Saving…' : next.label}
      </Button>

      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
