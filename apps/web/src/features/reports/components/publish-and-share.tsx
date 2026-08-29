'use client';

import { useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import { DEFAULT_SHARE_DAYS } from '@apex/domain';
import { Badge, Button } from '@apex/ui';

import { FOCUS_RING, TOUCH_BUTTON, TOUCH_FIELD, TOUCH_TARGET } from '@/components/common/touch';

import {
  createShareAction,
  publishReportAction,
  revokeShareAction,
  type ShareCreated,
} from '../server/actions';

/**
 * Finishing an analysis, and handing it over.
 *
 * ## Two steps, because they are two statements
 *
 * Finishing says something about the **content**: this is what I found, and it
 * will not change. Sharing says something about **access**: this person may read
 * it, until this date. §17 keeps them apart, and so does this screen — a coach
 * may finish a document and share it a week later, or never.
 *
 * ## The password is shown once
 *
 * Only a hash is stored, so nothing in this system can ever display it again.
 * That is deliberate, and the screen says so plainly: a coach who closes the
 * panel without noting it down has to create a new link, which is a small cost
 * for the guarantee that a leaked database contains no passwords.
 *
 * It is also **not** in the message. Sending the key through the same channel
 * as the door is not a protection.
 */

const DATE = new Intl.DateTimeFormat('de-DE', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const STATE_LABELS: Readonly<Record<string, string>> = {
  ACTIVE: 'Aktiv',
  REVOKED: 'Zurückgezogen',
  EXPIRED: 'Abgelaufen',
};

export interface ShareRow {
  readonly id: string;
  readonly state: string;
  readonly expiresAt: Date | null;
  readonly revokedAt: Date | null;
  readonly createdAt: Date;
}

export function PublishAndShare({
  assessmentId,
  reportId,
  published,
  shares,
  hasIncludedTests,
}: {
  readonly assessmentId: string;
  readonly reportId: string;
  readonly published: boolean;
  readonly shares: readonly ShareRow[];
  readonly hasIncludedTests: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<NonNullable<ShareCreated['share']> | null>(null);
  const [days, setDays] = useState(DEFAULT_SHARE_DAYS);
  const [withOffer, setWithOffer] = useState(true);
  const [copied, setCopied] = useState<string | null>(null);

  const copy = (what: string, value: string) => {
    void navigator.clipboard.writeText(value).then(
      () => {
        setCopied(what);
        setTimeout(() => setCopied(null), 2000);
      },
      () => setError('Der Text konnte nicht kopiert werden. Bitte von Hand markieren.'),
    );
  };

  const publish = () => {
    setError(null);
    startTransition(async () => {
      const result = await publishReportAction(assessmentId, reportId);
      if (result.message) setError(result.message);
      else router.refresh();
    });
  };

  const share = () => {
    setError(null);
    startTransition(async () => {
      const result = await createShareAction(assessmentId, reportId, days, withOffer);
      if (result.message) setError(result.message);
      else {
        setCreated(result.share ?? null);
        router.refresh();
      }
    });
  };

  const revoke = (shareId: string) => {
    setError(null);
    startTransition(async () => {
      const result = await revokeShareAction(assessmentId, shareId);
      if (result.message) setError(result.message);
      else router.refresh();
    });
  };

  return (
    <section aria-labelledby="handover" className="flex flex-col gap-4 border-t border-border pt-6">
      <div className="flex flex-col gap-1">
        <h2 id="handover" className="text-lg font-semibold">
          Abschließen und teilen
        </h2>
        <p className="max-w-prose text-sm text-pretty text-muted-foreground">
          {published
            ? 'Diese Auswertung ist abgeschlossen und ändert sich nicht mehr. Sie können sie jetzt teilen.'
            : 'Beim Abschließen wird festgehalten, was jetzt darin steht. Danach lässt sie sich nicht mehr bearbeiten — eine spätere Änderung wird eine neue Version.'}
        </p>
      </div>

      {published ? null : (
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="accent"
            className={TOUCH_BUTTON}
            disabled={pending || !hasIncludedTests}
            title={hasIncludedTests ? undefined : 'Diese Auswertung zieht keinen Test heran.'}
            onClick={publish}
          >
            {pending ? 'Wird abgeschlossen …' : 'Auswertung abschließen'}
          </Button>
        </div>
      )}

      {published ? (
        <>
          {/* Granting a link. Deliberately not automatic on publishing: a
              finished document is not the same as a document handed over. */}
          <div className="flex flex-col gap-3 rounded-md border border-border p-4">
            <h3 className="text-sm font-medium">Neuen Link erstellen</h3>

            <div className="flex flex-wrap items-end gap-4">
              <label className="flex flex-col gap-1.5 text-sm">
                <span>Gültig für</span>
                <select
                  className={`${TOUCH_FIELD} ${FOCUS_RING} rounded-md border border-input bg-background px-3 text-base lg:text-sm`}
                  value={days}
                  onChange={(event) => {
                    setDays(Number(event.target.value));
                  }}
                >
                  {[3, 5, 7, 14, 30].map((option) => (
                    <option key={option} value={option}>
                      {option} Tage
                    </option>
                  ))}
                </select>
              </label>

              <label className={`${TOUCH_TARGET} flex items-center gap-2.5 text-sm`}>
                <input
                  type="checkbox"
                  checked={withOffer}
                  onChange={(event) => {
                    setWithOffer(event.target.checked);
                  }}
                  className="size-4 rounded border-input"
                />
                <span>Angebot für eine Betreuung anhängen</span>
              </label>

              <Button
                type="button"
                variant="accent"
                className={TOUCH_BUTTON}
                disabled={pending}
                onClick={share}
              >
                Link erstellen
              </Button>
            </div>

            <p className="max-w-prose text-xs text-pretty text-muted-foreground">
              Der Link wird mit einem Passwort geschützt. Sie sehen es genau einmal — gespeichert
              wird nur seine Prüfsumme, damit es auch aus der Datenbank nicht auslesbar ist.
            </p>
          </div>

          {created === undefined || created === null ? null : (
            <div className="flex flex-col gap-4 rounded-md border border-accent bg-accent-soft p-4 text-accent-soft-foreground">
              <div className="flex flex-col gap-1">
                <h3 className="text-sm font-medium">Link erstellt</h3>
                <p className="text-xs">
                  Gültig bis <span data-numeric>{DATE.format(new Date(created.expiresAt))}</span>.
                </p>
              </div>

              <Field
                label="Passwort — jetzt notieren, es wird nicht wieder angezeigt"
                value={created.password}
                onCopy={() => {
                  copy('password', created.password);
                }}
                copied={copied === 'password'}
                emphasis
              />

              <Field
                label="Link"
                value={created.url}
                onCopy={() => {
                  copy('url', created.url);
                }}
                copied={copied === 'url'}
              />

              <div className="flex flex-col gap-2">
                <span className="text-xs font-medium">Nachricht an den Athleten</span>
                <textarea
                  readOnly
                  rows={10}
                  value={created.message.text}
                  aria-label="Nachricht an den Athleten"
                  className={`${FOCUS_RING} w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground`}
                />
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className={TOUCH_BUTTON}
                    onClick={() => {
                      copy('message', created.message.text);
                    }}
                  >
                    {copied === 'message' ? 'Kopiert' : 'Nachricht kopieren'}
                  </Button>
                  <Button variant="outline" className={TOUCH_BUTTON} asChild>
                    <a href={created.message.mailto}>Im Mailprogramm öffnen</a>
                  </Button>
                </div>
                <p className="text-xs">
                  Das Passwort steht bewusst nicht in der Nachricht — schicken Sie es auf einem
                  anderen Weg.
                </p>
              </div>
            </div>
          )}

          {shares.length === 0 ? null : (
            <div className="flex flex-col gap-2">
              <h3 className="text-sm font-medium">Vergebene Links</h3>
              <ul className="flex flex-col gap-2">
                {shares.map((entry) => (
                  <li
                    key={entry.id}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-border p-3 text-sm"
                  >
                    <Badge variant={entry.state === 'ACTIVE' ? 'accent' : 'outline'}>
                      {STATE_LABELS[entry.state] ?? entry.state}
                    </Badge>
                    <span className="text-xs text-muted-foreground" data-numeric>
                      erstellt {DATE.format(entry.createdAt)}
                      {entry.expiresAt === null
                        ? ''
                        : ` · gültig bis ${DATE.format(entry.expiresAt)}`}
                    </span>
                    {entry.state === 'ACTIVE' ? (
                      <Button
                        type="button"
                        variant="ghost"
                        className={`${TOUCH_BUTTON} ml-auto`}
                        disabled={pending}
                        onClick={() => {
                          revoke(entry.id);
                        }}
                      >
                        Zugang zurückziehen
                      </Button>
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      ) : null}

      {error === null ? null : (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
    </section>
  );
}

/** One value to copy. Read-only, selectable, with the copy beside it. */
function Field({
  label,
  value,
  onCopy,
  copied,
  emphasis = false,
}: {
  readonly label: string;
  readonly value: string;
  readonly onCopy: () => void;
  readonly copied: boolean;
  readonly emphasis?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium">{label}</span>
      <div className="flex flex-wrap items-center gap-2">
        <input
          readOnly
          value={value}
          aria-label={label}
          className={`${FOCUS_RING} ${TOUCH_FIELD} min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-foreground ${
            emphasis ? 'font-mono text-base tracking-wide' : 'text-sm'
          }`}
        />
        <Button type="button" variant="outline" className={TOUCH_BUTTON} onClick={onCopy}>
          {copied ? 'Kopiert' : 'Kopieren'}
        </Button>
      </div>
    </div>
  );
}
