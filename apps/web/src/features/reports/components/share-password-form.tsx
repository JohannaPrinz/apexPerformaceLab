'use client';

import { useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import { Button, Input } from '@apex/ui';

import { FOCUS_RING, TOUCH_BUTTON, TOUCH_FIELD } from '@/components/common/touch';

import { unlockShareAction } from '../server/share-actions';

/**
 * The password gate.
 *
 * One field and one button. A wrong answer says only that it was wrong — not
 * whether the link exists, not how many tries are left, and not whose it is.
 */
export function SharePasswordForm({ token }: { readonly token: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      const result = await unlockShareAction(token, password);

      if (result.ok) router.refresh();
      else setError('Das Passwort stimmt nicht.');
    });
  };

  return (
    <form onSubmit={submit} className="flex w-full max-w-sm flex-col gap-3">
      <label htmlFor="share-password" className="text-sm font-medium">
        Passwort
      </label>
      <Input
        id="share-password"
        type="password"
        autoComplete="off"
        className={`${TOUCH_FIELD} ${FOCUS_RING}`}
        value={password}
        onChange={(event) => {
          setPassword(event.target.value);
        }}
      />

      <Button type="submit" variant="accent" className={TOUCH_BUTTON} disabled={pending}>
        {pending ? 'Wird geprüft …' : 'Auswertung öffnen'}
      </Button>

      {error === null ? null : (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </form>
  );
}
