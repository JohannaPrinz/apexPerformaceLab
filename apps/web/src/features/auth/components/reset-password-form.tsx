'use client';

import { useState } from 'react';

import Link from 'next/link';

import { authClient } from '@apex/auth/client';
import { Button } from '@apex/ui';

import { FOCUS_RING, TOUCH_BUTTON } from '@/components/common/touch';

import { resetRefusal } from '../reset-messages';
import { MIN_PASSWORD_LENGTH } from '../schemas';

import { Field } from './field';

/**
 * Setting a new password from a reset link.
 *
 * Two fields, because a password nobody can read is a password worth typing
 * twice — the same shape the activation screen uses, for the same reason.
 *
 * ## Why it does not sign anybody in
 *
 * Resetting ends every session this account had (`revokeSessionsOnPasswordReset`),
 * which is the point: whoever had the old password is out. Signing the browser
 * straight back in would mean the link alone grants a session, so the screen
 * hands over to the sign-in form and the new password gets used once.
 */
export function ResetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);

  const tooShort = password.length < MIN_PASSWORD_LENGTH;
  // Only once something has been typed — an empty second field is not a
  // mistake yet, and saying so mid-typing is noise.
  const mismatch = repeat.length > 0 && password !== repeat;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setPending(true);

    const { error: refusal } = await authClient.resetPassword({ token, newPassword: password });

    setPending(false);

    if (refusal) {
      setError(resetRefusal(refusal, MIN_PASSWORD_LENGTH));

      return;
    }

    setDone(true);
  }

  if (done) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <span className="eyebrow">Apex OS</span>
          <h1 className="text-2xl font-semibold">Passwort geändert</h1>
          <p className="text-sm text-pretty text-muted-foreground">
            Melden Sie sich jetzt mit Ihrem neuen Passwort an. Andere Geräte wurden abgemeldet.
          </p>
        </div>

        <Link
          href="/sign-in"
          className={`${TOUCH_BUTTON} ${FOCUS_RING} inline-flex items-center justify-center rounded-md bg-accent px-4 font-medium text-accent-foreground`}
        >
          Zur Anmeldung
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <Field
        id="password"
        name="password"
        type="password"
        label="Neues Passwort"
        autoComplete="new-password"
        required
        value={password}
        onChange={(event) => {
          setPassword(event.target.value);
        }}
        hint={`Mindestens ${String(MIN_PASSWORD_LENGTH)} Zeichen.`}
      />

      <Field
        id="repeat"
        name="repeat"
        type="password"
        label="Passwort wiederholen"
        autoComplete="new-password"
        required
        value={repeat}
        onChange={(event) => {
          setRepeat(event.target.value);
        }}
        error={mismatch ? 'Die beiden Eingaben stimmen nicht überein.' : undefined}
      />

      {error === null ? null : (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <Button
        type="submit"
        disabled={pending || tooShort || password !== repeat}
        className={TOUCH_BUTTON}
      >
        {pending ? 'Wird gespeichert…' : 'Passwort speichern'}
      </Button>
    </form>
  );
}
