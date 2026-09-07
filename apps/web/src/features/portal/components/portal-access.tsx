'use client';

import { useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import { Button } from '@apex/ui';

import { FOCUS_RING, TOUCH_BUTTON, TOUCH_TARGET } from '@/components/common/touch';

import {
  type ActivationIssued,
  issueActivationAction,
  revokeActivationAction,
} from '../server/actions';

/**
 * Where a coach hands an athlete a way in (§21).
 *
 * ## What this control is, and what it is not
 *
 * It grants access to a record that already exists. It cannot create an
 * athlete, and it cannot choose which athlete — this is the athlete whose page
 * it sits on. That is the whole shape of the feature: the coach decides *who*,
 * the athlete decides *what their password is*.
 *
 * ## Why the link is shown as well as sent
 *
 * The same reason a share link is: a message can fail, and an athlete may say
 * they never got it. This is the only moment the link exists outside their
 * mailbox — only its hash is stored — so if it is not offered here it is gone
 * and a new one has to be issued.
 */
const DATE = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

export function PortalAccess({
  athleteId,
  email,
  hasAccount,
  archived,
  standing,
  mailReady,
}: {
  readonly athleteId: string;
  /** The athlete's address, or `null` where none is on file. */
  readonly email: string | null;
  /** Whether a user account is already linked. */
  readonly hasAccount: boolean;
  readonly archived: boolean;
  /** An offer still open, if there is one. */
  readonly standing: { readonly email: string; readonly expiresAt: Date } | null;
  readonly mailReady: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [issued, setIssued] = useState<NonNullable<ActivationIssued['issued']> | null>(null);
  const [copied, setCopied] = useState(false);

  const issue = () => {
    setError(null);
    startTransition(async () => {
      const result = await issueActivationAction(athleteId);
      if (result.message) setError(result.message);
      else {
        setIssued(result.issued ?? null);
        router.refresh();
      }
    });
  };

  const revoke = () => {
    setError(null);
    startTransition(async () => {
      const result = await revokeActivationAction(athleteId);
      if (result.message) setError(result.message);
      else {
        setIssued(null);
        router.refresh();
      }
    });
  };

  if (hasAccount) {
    return (
      <p className="text-xs text-pretty text-muted-foreground">
        Dieser Athlet hat einen eigenen Zugang und sieht ausschließlich seinen eigenen Datensatz.
      </p>
    );
  }

  // Every refusal names itself rather than greying a button out silently.
  const blocked = archived
    ? 'Dieser Athlet ist deaktiviert. Ein neuer Zugang wird erst nach der Reaktivierung eingerichtet.'
    : email === null
      ? 'Für einen Zugang wird eine E-Mail-Adresse gebraucht — der Link geht dorthin. Bitte im Athletendatensatz eintragen.'
      : mailReady
        ? null
        : 'Der E-Mail-Versand ist nicht eingerichtet. Ohne Absender kann kein Link rausgehen.';

  return (
    <div className="flex flex-col gap-3">
      <p className="max-w-prose text-xs text-pretty text-muted-foreground">
        {standing === null
          ? 'Der Athlet bekommt einen persönlichen Link, legt darüber sein eigenes Passwort fest und meldet sich danach normal an. Er sieht ausschließlich seinen eigenen Datensatz.'
          : `Ein Link an ${standing.email} ist offen, gültig bis ${DATE.format(standing.expiresAt)}. Ein neuer Link ersetzt ihn.`}
      </p>

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          variant={standing === null ? 'accent' : 'outline'}
          className={TOUCH_BUTTON}
          disabled={pending || blocked !== null}
          onClick={issue}
        >
          {pending
            ? 'Wird eingerichtet …'
            : standing === null
              ? 'Zugangslink senden'
              : 'Neuen Link senden'}
        </Button>

        {standing === null ? null : (
          <button
            type="button"
            className={`${TOUCH_TARGET} ${FOCUS_RING} rounded text-sm text-muted-foreground underline-offset-4 hover:underline`}
            disabled={pending}
            onClick={revoke}
          >
            Zurückziehen
          </button>
        )}
      </div>

      {blocked === null ? null : (
        <p className="max-w-prose text-xs text-pretty text-destructive">{blocked}</p>
      )}

      {error === null ? null : (
        <p role="alert" className="max-w-prose text-xs text-pretty text-destructive">
          {error}
        </p>
      )}

      {issued === null ? null : (
        <div className="flex flex-col gap-2 rounded-md border border-accent bg-accent-soft p-4 text-accent-soft-foreground">
          <p className="text-xs">
            Gesendet an <span className="font-medium">{issued.email}</span>. Gültig bis{' '}
            <span data-numeric>{DATE.format(new Date(issued.expiresAt))}</span>, und der Link
            funktioniert genau einmal.
          </p>

          <div className="flex flex-wrap items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded bg-background/60 px-2 py-1 text-xs">
              {issued.url}
            </code>
            <button
              type="button"
              className={`${TOUCH_TARGET} ${FOCUS_RING} rounded text-xs underline-offset-4 hover:underline`}
              onClick={() => {
                void navigator.clipboard.writeText(issued.url).then(
                  () => {
                    setCopied(true);
                    setTimeout(() => setCopied(false), 2000);
                  },
                  () => setError('Der Link konnte nicht kopiert werden. Bitte von Hand markieren.'),
                );
              }}
            >
              {copied ? 'Kopiert' : 'Kopieren'}
            </button>
          </div>

          <p className="text-xs">
            Danach ist der Link nur noch hier zu sehen — gespeichert wird lediglich seine Prüfsumme.
          </p>

          {issued.undelivered === undefined ? null : (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-xs text-destructive">
              Die E-Mail ging nicht raus: {issued.undelivered}. Der Zugang steht trotzdem — geben
              Sie den Link selbst weiter.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
