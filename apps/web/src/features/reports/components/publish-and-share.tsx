'use client';

import { useState, useTransition } from 'react';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { ExternalLink } from 'lucide-react';

import { DEFAULT_SHARE_DAYS } from '@apex/domain';
import { Badge, Button } from '@apex/ui';

import { FOCUS_RING, TOUCH_BUTTON, TOUCH_FIELD, TOUCH_TARGET } from '@/components/common/touch';

import { MIN_SHARE_PASSWORD_LENGTH, PASSWORD_DELAY_MINUTES } from '../schemas';
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

/** When the second message is due. The hour is what a coach checks against. */
const TIME = new Intl.DateTimeFormat('de-DE', { hour: '2-digit', minute: '2-digit' });

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
  recipient,
  mailReady,
}: {
  readonly assessmentId: string;
  readonly reportId: string;
  readonly published: boolean;
  readonly shares: readonly ShareRow[];
  readonly hasIncludedTests: boolean;
  /** The athlete's address, or `null` where none is on file. */
  readonly recipient: string | null;
  /** Whether a sender is configured at all — see `integrations/email`. */
  readonly mailReady: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<NonNullable<ShareCreated['share']> | null>(null);
  const [days, setDays] = useState(DEFAULT_SHARE_DAYS);
  const [password, setPassword] = useState('');
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
      const result = await createShareAction(assessmentId, reportId, days, password);
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
          <div className="flex flex-col gap-4 rounded-md border border-border p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <h3 className="text-sm font-medium">Mit dem Athleten teilen</h3>
              <Link
                href={`/druck/auswertung/${assessmentId}`}
                target="_blank"
                className={`${FOCUS_RING} ${TOUCH_TARGET} inline-flex items-center gap-1.5 rounded text-xs text-accent hover:underline`}
              >
                <ExternalLink aria-hidden="true" className="size-3.5" />
                Ganze Seite öffnen und drucken
              </Link>
            </div>

            {/* The document itself stands above this panel — it *is* the
                preview, and rendering it a second time inside a scroll box
                would be the same page twice on one screen. The link beside the
                heading opens it laid out for paper, which is the form the
                athlete saves. */}
            <p className="max-w-prose text-xs text-pretty text-muted-foreground">
              Der Athlet bekommt genau das Dokument, das oben steht — mit der Möglichkeit, es als
              PDF zu speichern.
            </p>

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

              <label className="flex min-w-56 flex-1 flex-col gap-1.5 text-sm">
                <span>Passwort</span>
                <input
                  type="text"
                  value={password}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="mindestens 12 Zeichen"
                  onChange={(event) => {
                    setPassword(event.target.value);
                  }}
                  className={`${TOUCH_FIELD} ${FOCUS_RING} rounded-md border border-input bg-background px-3 text-base lg:text-sm`}
                />
              </label>

              <Button
                type="button"
                variant="accent"
                className={TOUCH_BUTTON}
                disabled={
                  pending ||
                  recipient === null ||
                  !mailReady ||
                  password.trim().length < MIN_SHARE_PASSWORD_LENGTH
                }
                onClick={share}
              >
                {pending ? 'Wird gesendet …' : 'Freigeben und senden'}
              </Button>
            </div>

            {/* Every refusal names itself. "Nicht möglich" sends somebody
                hunting through three screens for the reason. */}
            {recipient === null ? (
              <p className="text-xs text-pretty text-destructive">
                Für diesen Athleten ist keine E-Mail-Adresse hinterlegt. Tragen Sie eine im
                Athletendatensatz ein, dann lässt sich die Auswertung senden.
              </p>
            ) : mailReady ? (
              <p className="max-w-prose text-xs text-pretty text-muted-foreground">
                Geht an <span className="font-medium">{recipient}</span>, mit dem Angebot einer
                dauerhaften Betreuung. Das Passwort legen Sie fest; es folgt{' '}
                {PASSWORD_DELAY_MINUTES} Minuten später in einer eigenen Nachricht — ein Link und
                sein Passwort im selben Postfach schützen nichts mehr. Gespeichert wird nur seine
                Prüfsumme, angezeigt wird es nie wieder.
              </p>
            ) : (
              <p className="text-xs text-pretty text-destructive">
                Der E-Mail-Versand ist nicht eingerichtet. Ohne Absender kann nichts rausgehen.
              </p>
            )}
          </div>

          {created === undefined || created === null ? null : (
            <div className="flex flex-col gap-3 rounded-md border border-accent bg-accent-soft p-4 text-accent-soft-foreground">
              <div className="flex flex-col gap-1">
                <h3 className="text-sm font-medium">Gesendet</h3>
                <p className="text-xs">
                  An <span className="font-medium">{created.recipient}</span>. Das Passwort folgt um{' '}
                  <span data-numeric>{TIME.format(new Date(created.passwordDueAt))}</span> Uhr. Der
                  Link ist gültig bis{' '}
                  <span data-numeric>{DATE.format(new Date(created.expiresAt))}</span>.
                </p>
              </div>

              {/* The coach keeps the link as well — they may be asked for it. */}
              <Field
                label="Link"
                value={created.url}
                onCopy={() => {
                  copy('url', created.url);
                }}
                copied={copied === 'url'}
              />

              {created.undelivered === undefined ? null : (
                <div className="flex flex-col gap-1 rounded-md bg-destructive/10 px-3 py-2 text-destructive">
                  <span className="text-xs font-medium">Nicht zugestellt</span>
                  {created.undelivered.link === null ? null : (
                    <p className="text-xs text-pretty">
                      Nachricht mit dem Link: {created.undelivered.link}
                    </p>
                  )}
                  {created.undelivered.password === null ? null : (
                    <p className="text-xs text-pretty">
                      Nachricht mit dem Passwort: {created.undelivered.password}
                    </p>
                  )}
                  <p className="text-xs text-pretty">
                    Der Zugang steht trotzdem — geben Sie Link und Passwort selbst weiter.
                  </p>
                </div>
              )}
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
