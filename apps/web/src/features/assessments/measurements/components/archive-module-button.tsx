'use client';

import { useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import { Archive, ArchiveRestore } from 'lucide-react';

import { Button } from '@apex/ui';

import { TOUCH_BUTTON } from '@/components/common/touch';

import { setModuleArchivedAction } from '../../server/actions';

/**
 * Takes a test out of the working view, or brings it back.
 *
 * **Not a deletion, and it never asks as if it were.** A test holding
 * measurements can never be removed (§13) — archiving is what a coach reaches
 * for instead, and it is fully reversible, so a confirmation step would be
 * ceremony without a purpose.
 *
 * The status is untouched: an archived test that was completed still reads as
 * completed when it is shown again.
 */
export function ArchiveModuleButton({
  moduleId,
  assessmentId,
  archived,
}: {
  readonly moduleId: string;
  readonly assessmentId: string;
  readonly archived: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      <Button
        variant="ghost"
        className={TOUCH_BUTTON}
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await setModuleArchivedAction(moduleId, assessmentId, !archived);
            if (result.message) setError(result.message);
            else router.refresh();
          });
        }}
      >
        {archived ? (
          <>
            <ArchiveRestore aria-hidden="true" className="size-4" />
            Test wieder aufnehmen
          </>
        ) : (
          <>
            <Archive aria-hidden="true" className="size-4" />
            {/* Named after what it acts on: the assessment header on the same
                page carries "Assessment archivieren". */}
            Test archivieren
          </>
        )}
      </Button>

      {error === null ? null : (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </>
  );
}
