'use client';

import { useState, useTransition } from 'react';

import Link from 'next/link';
import { useRouter } from 'next/navigation';

import { ExternalLink } from 'lucide-react';

import { DEFAULT_SHARE_DAYS } from '@apex/domain';
import { Badge, Button, Dialog, DialogContent, DialogFooter } from '@apex/ui';

import { FOCUS_RING, TOUCH_BUTTON, TOUCH_FIELD, TOUCH_TARGET } from '@/components/common/touch';

import { MIN_SHARE_PASSWORD_LENGTH } from '../schemas';
import { createShareAction, revokeShareAction, type ShareCreated } from '../server/actions';

/**
 * Handing an analysis to the athlete (§17).
 *
 * ## Sharing is what finishes an analysis
 *
 * There used to be a separate "Auswertung abschließen" before anything could
 * be shared. An analysis is now finished at the one moment that matters to the
 * athlete: when they get it. Until then it is a draft — tests go in and out,
 * the text changes, and it can be thrown away. The first link freezes it; from
 * then on it can be shared again with further links, and put away by
 * archiving, but never changed or deleted.
 *
 * Because that first share cannot be undone, it asks once more before it
 * happens, and says what will follow.
 *
 * ## The password is chosen, sent separately, and shown nowhere
 *
 * Only a hash is stored, so nothing in this system can ever display it again.
 * It is not in the message with the link either — sending the key through the
 * same channel as the door is not a protection.
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

export type AnalysisStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';

export function ShareAnalysis({
  assessmentId,
  reportId,
  status,
  shares,
  hasIncludedTests,
  recipient,
  mailReady,
}: {
  readonly assessmentId: string;
  readonly reportId: string;
  readonly status: AnalysisStatus;
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
  const [confirming, setConfirming] = useState(false);
  /**
   * Only ever used where the record has no address.
   *
   * Not an override: an athlete who has one is sent to it, and correcting it is
   * a change to their record, which belongs on their record — not in a send box
   * where a slip would go unnoticed.
   */
  const [email, setEmail] = useState('');
  const [copied, setCopied] = useState<string | null>(null);

  const draft = status === 'DRAFT';
  const archived = status === 'ARCHIVED';

  /**
   * Whether there is somewhere to send to.
   *
   * A shape check, not a validation: `z.email` on the procedure is what decides,
   * and repeating its rules here would only produce a second opinion to keep in
   * step. This exists so the button says "not yet" instead of the send failing.
   */
  const addressed = recipient !== null || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());

  const ready =
    addressed &&
    mailReady &&
    password.trim().length >= MIN_SHARE_PASSWORD_LENGTH &&
    (!draft || hasIncludedTests);

  const copy = (what: string, value: string) => {
    void navigator.clipboard.writeText(value).then(
      () => {
        setCopied(what);
        setTimeout(() => setCopied(null), 2000);
      },
      () => setError('Der Text konnte nicht kopiert werden. Bitte von Hand markieren.'),
    );
  };

  const share = () => {
    setError(null);
    startTransition(async () => {
      const result = await createShareAction(assessmentId, reportId, days, password, email);
      setConfirming(false);

      if (result.message) setError(result.message);
      else {
        setCreated(result.share ?? null);
        setPassword('');
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

  const printHref = `/druck/auswertung/${assessmentId}?auswertung=${encodeURIComponent(reportId)}`;

  return (
    <section aria-labelledby="handover" className="flex flex-col gap-4 border-t border-border pt-6">
      <div className="flex flex-col gap-1">
        <h2 id="handover" className="text-lg font-semibold">
          {draft ? 'Mit dem Athleten teilen' : archived ? 'Vergebene Links' : 'Geteilt'}
        </h2>
        <p className="max-w-prose text-sm text-pretty text-muted-foreground">
          {draft
            ? 'Mit dem Teilen ist die Auswertung abgeschlossen: Sie wird so festgehalten, wie sie jetzt ist, und lässt sich danach nicht mehr ändern oder löschen — nur noch archivieren.'
            : archived
              ? 'Diese Auswertung ist archiviert. Alle Links wurden dabei zurückgezogen, und der Athlet sieht sie nicht mehr.'
              : 'Diese Auswertung ist abgeschlossen, weil sie geteilt wurde, und ändert sich nicht mehr. Sie können weitere Links vergeben.'}
        </p>
      </div>

      {archived ? null : (
        <div className="flex flex-col gap-4 rounded-md border border-border p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <h3 className="text-sm font-medium">
              {draft ? 'Link senden' : 'Weiteren Link senden'}
            </h3>
            {/* Before the irreversible step, not after it: the last chance to
                read the document properly, on paper, falls here. */}
            {!draft || hasIncludedTests ? (
              <Link
                href={printHref}
                target="_blank"
                className={`${FOCUS_RING} ${TOUCH_TARGET} inline-flex items-center gap-1.5 rounded text-xs text-accent hover:underline`}
              >
                <ExternalLink aria-hidden="true" className="size-3.5" />
                {draft ? 'Vorschau als PDF' : 'Ganze Seite öffnen und drucken'}
              </Link>
            ) : null}
          </div>

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

            {recipient === null ? (
              <label className="flex min-w-64 flex-1 flex-col gap-1.5 text-sm">
                <span>E-Mail-Adresse des Athleten</span>
                <input
                  type="email"
                  value={email}
                  autoComplete="off"
                  spellCheck={false}
                  placeholder="name@beispiel.de"
                  onChange={(event) => {
                    setEmail(event.target.value);
                  }}
                  className={`${TOUCH_FIELD} ${FOCUS_RING} rounded-md border border-input bg-background px-3 text-base lg:text-sm`}
                />
              </label>
            ) : null}

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
              disabled={pending || !ready}
              title={
                draft && !hasIncludedTests ? 'Diese Auswertung zieht keinen Test heran.' : undefined
              }
              onClick={() => {
                if (draft) setConfirming(true);
                else share();
              }}
            >
              {pending ? 'Wird gesendet …' : draft ? 'Teilen und abschließen' : 'Link senden'}
            </Button>
          </div>

          {/* Every refusal names itself. "Nicht möglich" sends somebody
              hunting through three screens for the reason. */}
          {draft && !hasIncludedTests ? (
            <p className="max-w-prose text-xs text-pretty text-destructive">
              Diese Auswertung zieht keinen Test heran. Nehmen Sie mindestens einen Test hinein,
              bevor Sie sie teilen.
            </p>
          ) : recipient === null ? (
            <p className="max-w-prose text-xs text-pretty text-muted-foreground">
              Für diesen Athleten ist noch keine E-Mail-Adresse hinterlegt. Die hier eingetragene
              Adresse wird im Athletendatensatz gespeichert und ist danach auch die Adresse für den
              Zugang zum Athletenportal.
            </p>
          ) : mailReady ? (
            <p className="max-w-prose text-xs text-pretty text-muted-foreground">
              Geht an <span className="font-medium">{recipient}</span>, mit dem Angebot einer
              dauerhaften Betreuung. Das Passwort legen Sie fest; es kommt in einer zweiten
              Nachricht. Gespeichert wird nur seine Prüfsumme, angezeigt wird es nie wieder.
            </p>
          ) : (
            <p className="text-xs text-pretty text-destructive">
              Der E-Mail-Versand ist nicht eingerichtet. Ohne Absender kann nichts rausgehen.
            </p>
          )}
        </div>
      )}

      {created === null ? null : (
        <div
          role="status"
          className="flex flex-col gap-3 rounded-md border border-accent bg-accent-soft p-4 text-accent-soft-foreground"
        >
          <div className="flex flex-col gap-1">
            <h3 className="text-sm font-medium">Geteilt</h3>
            <p className="text-xs">
              Zwei Nachrichten an <span className="font-medium">{created.recipient}</span> — die
              Auswertung und das Passwort. Der Link ist gültig bis{' '}
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
          {archived ? null : <h3 className="text-sm font-medium">Vergebene Links</h3>}
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
                  {entry.expiresAt === null ? '' : ` · gültig bis ${DATE.format(entry.expiresAt)}`}
                </span>
                {entry.state === 'ACTIVE' && !archived ? (
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

      {error === null ? null : (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}

      <Dialog
        open={confirming}
        onOpenChange={(next) => {
          if (!next && !pending) setConfirming(false);
        }}
      >
        {confirming ? (
          <DialogContent
            title="Auswertung teilen und abschließen?"
            description="Der Athlet bekommt einen Link zu genau dieser Fassung."
          >
            <div className="flex flex-col gap-3 text-sm text-pretty">
              <p>
                Danach ist die Auswertung abgeschlossen: Tests lassen sich nicht mehr hinzufügen
                oder entfernen, der Text nicht mehr ändern, und löschen lässt sie sich auch nicht
                mehr — nur noch archivieren.
              </p>
              <p className="text-muted-foreground">
                Für eine andere Zusammensetzung legen Sie jederzeit eine neue Auswertung an.
              </p>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                className={TOUCH_BUTTON}
                disabled={pending}
                onClick={() => {
                  setConfirming(false);
                }}
              >
                Abbrechen
              </Button>
              <Button
                type="button"
                variant="accent"
                className={TOUCH_BUTTON}
                disabled={pending}
                onClick={share}
              >
                {pending ? 'Wird geteilt …' : 'Teilen und abschließen'}
              </Button>
            </DialogFooter>
          </DialogContent>
        ) : null}
      </Dialog>
    </section>
  );
}

/** One value to copy. Read-only, selectable, with the copy beside it. */
function Field({
  label,
  value,
  onCopy,
  copied,
}: {
  readonly label: string;
  readonly value: string;
  readonly onCopy: () => void;
  readonly copied: boolean;
}) {
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-xs font-medium">{label}</span>
      <div className="flex flex-wrap items-center gap-2">
        <input
          readOnly
          value={value}
          aria-label={label}
          className={`${FOCUS_RING} ${TOUCH_FIELD} min-w-0 flex-1 rounded-md border border-input bg-background px-3 text-sm text-foreground`}
        />
        <Button type="button" variant="outline" className={TOUCH_BUTTON} onClick={onCopy}>
          {copied ? 'Kopiert' : 'Kopieren'}
        </Button>
      </div>
    </div>
  );
}
