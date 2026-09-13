'use client';

import { useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import { ShieldOff } from 'lucide-react';

import { Button, Dialog, DialogContent, DialogFooter, DialogTrigger } from '@apex/ui';

import { ActionMenuItem } from '@/components/common/action-menu';
import { TOUCH_BUTTON } from '@/components/common/touch';

import { revokePortalAccessAction } from '../server/actions';

/**
 * Taking an activated athlete's portal access away (§21).
 *
 * ## Why it asks first
 *
 * Deactivating an athlete is reversible with one click and says so, so
 * `ArchiveButton` runs straight away. This is not that: the account is gone,
 * the password stops working, and getting the athlete back in means issuing a
 * new link and asking them to choose a new password. A coach who reached for
 * "Deaktivieren" and hit this one instead should find out before it happens,
 * not after — so it asks, and the question names both halves: what ends, and
 * what stays.
 *
 * ## Why it stays open afterwards
 *
 * The menu is not a place a confirmation survives — `ActionMenu` keeps itself
 * open precisely so a mutation's result is visible, and the entry that opened
 * this dialog disappears the moment the page re-reads, taking any message with
 * it. So the dialog itself reports, and the page is only re-read once the coach
 * closes it.
 */
export function RevokePortalAccessDialog({
  athleteId,
  athleteName,
}: {
  readonly athleteId: string;
  readonly athleteName: string;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [revoked, setRevoked] = useState<{ from: string | null } | null>(null);

  const close = () => {
    setOpen(false);
    setError(null);

    // Only now: the badge, the access panel and this very menu entry all change
    // with it, and re-reading while the confirmation is on screen would remove
    // the confirmation.
    if (revoked !== null) {
      setRevoked(null);
      router.refresh();
    }
  };

  const revoke = () => {
    setError(null);
    startTransition(async () => {
      const result = await revokePortalAccessAction(athleteId);

      if (result.message) setError(result.message);
      else setRevoked({ from: result.revokedFrom ?? null });
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setOpen(true);
        else close();
      }}
    >
      <DialogTrigger asChild>
        <ActionMenuItem>
          <ShieldOff aria-hidden="true" />
          Portalzugang entziehen
        </ActionMenuItem>
      </DialogTrigger>

      <DialogContent
        title="Portalzugang entziehen"
        description={
          revoked === null
            ? `${athleteName} kann sich danach nicht mehr im Athletenbereich anmelden.`
            : `${athleteName} hat keinen Zugang mehr zum Athletenbereich.`
        }
      >
        {revoked === null ? (
          <div className="flex flex-col gap-4">
            <p className="text-sm text-pretty">
              Das Benutzerkonto wird aufgelöst und offene Sitzungen werden sofort beendet — auch
              solche, die gerade geöffnet sind. Das bisherige Passwort funktioniert danach nicht
              mehr.
            </p>

            <p className="rounded-md border border-border bg-muted px-4 py-3 text-sm text-pretty text-muted-foreground">
              Es wird nichts gelöscht: Der Athletendatensatz, alle Assessments, Messwerte,
              Auswertungen, Dateien und Tracking-Einträge bleiben vollständig erhalten und für Sie
              sichtbar. Der Athlet bleibt aktiv — dies ist keine Deaktivierung.
            </p>

            <p className="text-sm text-pretty text-muted-foreground">
              Einen neuen Zugang können Sie jederzeit wieder über „Zugangslink senden“ einrichten.
            </p>

            {error === null ? null : (
              <p role="alert" className="text-sm text-pretty text-destructive">
                {error}
              </p>
            )}
          </div>
        ) : (
          <p role="status" className="text-sm text-pretty">
            Der Portalzugang wurde entzogen.{' '}
            {revoked.from === null
              ? 'Eine Anmeldung ist nicht mehr möglich.'
              : `Eine Anmeldung mit ${revoked.from} ist nicht mehr möglich.`}{' '}
            Der Datensatz und die gesamte Historie bleiben unverändert erhalten.
          </p>
        )}

        <DialogFooter>
          {revoked === null ? (
            <>
              <Button variant="outline" className={TOUCH_BUTTON} disabled={pending} onClick={close}>
                Abbrechen
              </Button>

              <Button
                variant="destructive"
                className={TOUCH_BUTTON}
                disabled={pending}
                onClick={revoke}
              >
                {pending ? 'Wird entzogen…' : 'Zugang entziehen'}
              </Button>
            </>
          ) : (
            <Button variant="outline" className={TOUCH_BUTTON} onClick={close}>
              {/* Not "Schließen": the dialog's own corner control already
                  carries that name, and two of them read as two different
                  ways out. */}
              Fertig
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
