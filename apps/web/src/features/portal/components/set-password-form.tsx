'use client';

import { useState, useTransition } from 'react';

import Link from 'next/link';

import { Button } from '@apex/ui';

import { FOCUS_RING, TOUCH_BUTTON, TOUCH_FIELD, TOUCH_TARGET } from '@/components/common/touch';

import { MIN_PORTAL_PASSWORD_LENGTH } from '../schemas';
import { redeemActivationAction } from '../server/actions';

/**
 * Where an athlete chooses their first password.
 *
 * ## What this screen deliberately does not offer
 *
 * No registration, no athlete to pick, no profile to fill in. The record
 * already exists and belongs to the coach who created it (§21); this form adds
 * exactly one thing to it — a way in. The name above the field is there so the
 * athlete can see the link is meant for them, not so they can change it.
 *
 * ## Why it ends at the sign-in page
 *
 * Setting the password does not sign anybody in. It costs one screen and buys
 * two things: the athlete proves the password works, and the session is opened
 * after the account is linked to the athlete rather than during it.
 */
export function SetPasswordForm({
  token,
  firstName,
  email,
}: {
  readonly token: string;
  readonly firstName: string;
  /** Shown, never editable: the account is created with the address the link went to. */
  readonly email: string;
}) {
  const [pending, startTransition] = useTransition();
  const [password, setPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  const tooShort = password.length < MIN_PORTAL_PASSWORD_LENGTH;
  // Only once something has been typed — an empty second field is not a mistake
  // yet, and saying so while somebody is still filling in the first one is noise.
  const mismatch = repeat.length > 0 && password !== repeat;

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const result = await redeemActivationAction(token, password);
      if (result.message) setError(result.message);
      else setDone(true);
    });
  };

  if (done) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <span className="eyebrow">Apex OS</span>
          <h1 className="text-2xl font-semibold">Zugang eingerichtet</h1>
          <p className="text-sm text-pretty text-muted-foreground">
            Ihr Passwort ist gesetzt. Melden Sie sich jetzt mit{' '}
            <span className="font-medium">{email}</span> an.
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
    <form
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="flex flex-col gap-2">
        <span className="eyebrow">Apex OS</span>
        <h1 className="text-2xl font-semibold">Hallo {firstName}</h1>
        <p className="text-sm text-pretty text-muted-foreground">
          Legen Sie ein Passwort für Ihren Athletenbereich fest. Danach melden Sie sich mit{' '}
          <span className="font-medium">{email}</span> an.
        </p>
      </div>

      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5 text-sm">
          <span>Passwort</span>
          <input
            type="password"
            value={password}
            autoComplete="new-password"
            required
            minLength={MIN_PORTAL_PASSWORD_LENGTH}
            onChange={(event) => {
              setPassword(event.target.value);
            }}
            className={`${TOUCH_FIELD} ${FOCUS_RING} rounded-md border border-input bg-background px-3 text-base lg:text-sm`}
          />
          <span className="text-xs text-muted-foreground">
            Mindestens {MIN_PORTAL_PASSWORD_LENGTH} Zeichen. Ihr Coach sieht es nicht.
          </span>
        </label>

        <label className="flex flex-col gap-1.5 text-sm">
          <span>Passwort wiederholen</span>
          <input
            type="password"
            value={repeat}
            autoComplete="new-password"
            required
            onChange={(event) => {
              setRepeat(event.target.value);
            }}
            className={`${TOUCH_FIELD} ${FOCUS_RING} rounded-md border border-input bg-background px-3 text-base lg:text-sm`}
          />
          {mismatch ? (
            <span className="text-xs text-destructive">
              Die beiden Eingaben stimmen nicht überein.
            </span>
          ) : null}
        </label>
      </div>

      {error === null ? null : (
        <p role="alert" className="text-sm text-pretty text-destructive">
          {error}
        </p>
      )}

      <Button
        type="submit"
        variant="accent"
        className={TOUCH_BUTTON}
        disabled={pending || tooShort || password !== repeat}
      >
        {pending ? 'Wird eingerichtet …' : 'Passwort festlegen'}
      </Button>

      <p className="text-sm text-muted-foreground">
        Sie haben schon ein Passwort?{' '}
        <Link
          href="/sign-in"
          className={`${TOUCH_TARGET} inline-flex items-center text-accent underline-offset-4 hover:underline`}
        >
          Anmelden
        </Link>
      </p>
    </form>
  );
}
