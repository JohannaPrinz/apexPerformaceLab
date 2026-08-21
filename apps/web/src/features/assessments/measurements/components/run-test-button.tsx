'use client';

import { useState, useTransition } from 'react';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { Play } from 'lucide-react';

import type { AssessmentModuleStatus } from '@apex/domain';
import { Button } from '@apex/ui';

import { TOUCH_BUTTON } from '@/components/common/touch';

import { setModuleStatusAction } from '../server/actions';

/**
 * Opens the entry screen — and, on a finished test, records that it was reopened.
 *
 * A plain link would lose that. `reopenedAt` is half of what the overview
 * reports about changes made after the fact: without it a reopened test is
 * `IN_PROGRESS` again and indistinguishable from one that was never finished,
 * and "nach Abschluss geändert" has nothing to stand on.
 *
 * A test that was never completed just navigates. Nothing is written for
 * looking at a plan.
 */
export function RunTestButton({
  moduleId,
  href,
  status,
  performed,
}: {
  readonly moduleId: string;
  readonly href: string;
  readonly status: AssessmentModuleStatus;
  readonly performed: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  if (status !== 'COMPLETED') {
    return (
      <Button variant="accent" className={TOUCH_BUTTON} asChild>
        <Link href={href}>
          <Play aria-hidden="true" className="size-4" />
          {performed ? 'Erneut durchführen' : 'Durchführen'}
        </Link>
      </Button>
    );
  }

  return (
    <>
      <Button
        variant="accent"
        className={TOUCH_BUTTON}
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            const result = await setModuleStatusAction(moduleId, 'IN_PROGRESS');
            if (result.message) {
              setError(result.message);

              return;
            }

            router.push(href);
          });
        }}
      >
        <Play aria-hidden="true" className="size-4" />
        {pending ? 'Wird geöffnet …' : 'Erneut durchführen'}
      </Button>

      {error === null ? null : (
        <p role="alert" className="text-xs text-destructive">
          {error}
        </p>
      )}
    </>
  );
}
