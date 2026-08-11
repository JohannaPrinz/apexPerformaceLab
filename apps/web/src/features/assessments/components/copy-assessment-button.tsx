'use client';

import { useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import { Button } from '@apex/ui';

import { copyAssessmentAction } from '../server/actions';

/**
 * Reuses a configured assessment.
 *
 * The copy takes the question and every test's configuration. It takes **no
 * measurements** — the new assessment is an independent examination, and
 * carrying the values across would fabricate a record of a test that was never
 * performed (§4). The label says "reuse the setup" rather than "duplicate"
 * because that is what happens.
 */
export function CopyAssessmentButton({ assessmentId }: { assessmentId: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex flex-col items-end gap-1">
      <Button
        variant="outline"
        size="sm"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await copyAssessmentAction(assessmentId);
            if (result.message) setError(result.message);
            else if (result.assessmentId) router.push(`/assessments/${result.assessmentId}`);
          });
        }}
      >
        {pending ? 'Copying…' : 'Reuse setup'}
      </Button>

      {error ? (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      ) : null}
    </div>
  );
}
