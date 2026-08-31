'use client';

import { useState, useTransition } from 'react';

import { useRouter } from 'next/navigation';

import { Check, Share2, X } from 'lucide-react';

import { Button, Dialog, DialogContent, DialogTrigger } from '@apex/ui';

import { ActionMenuItem } from '@/components/common/action-menu';
import { FOCUS_RING, TOUCH_BUTTON, TOUCH_FIELD } from '@/components/common/touch';

import {
  confirmAthleteShareAction,
  revokeAthleteShareAction,
  shareAthleteAction,
} from '../server/actions';

/**
 * Releasing an athlete to a colleague in the same workspace.
 *
 * ## What a release is, and is not
 *
 * It is a permission inside one workspace: an athlete belongs to the coach who
 * records them, and this names the exceptions. It has nothing to do with the
 * link a report is shared by — that hands a document to the athlete, this hands
 * the record to a colleague, and conflating them would put an athlete's whole
 * history behind a password meant for one document.
 *
 * ## Why an offer is not yet access
 *
 * An athlete's record is theirs before it is the workspace's. A release stands
 * as an offer until somebody records that the athlete agreed; until then the
 * colleague sees nothing, and the list below says so in as many words rather
 * than showing a permission that does not work.
 *
 * The confirmation is entered by a coach today. When athletes have accounts it
 * becomes theirs to give — the record already keeps who confirmed it and when.
 */
export function ShareAthleteDialog({
  athleteId,
  athleteName,
  coaches,
  shares,
}: {
  readonly athleteId: string;
  readonly athleteName: string;
  /** Coaches of this workspace, the caller excluded. */
  readonly coaches: readonly { id: string; name: string }[];
  readonly shares: readonly { coachId: string; coachName: string; confirmedAt: Date | null }[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [chosen, setChosen] = useState('');

  const run = (act: () => Promise<{ message?: string }>) => {
    setError(null);
    startTransition(async () => {
      const result = await act();
      if (result.message) setError(result.message);
      else router.refresh();
    });
  };

  const shared = new Set(shares.map((entry) => entry.coachId));
  const offerable = coaches.filter((entry) => !shared.has(entry.id));

  return (
    <Dialog>
      <DialogTrigger asChild>
        <ActionMenuItem>
          <Share2 aria-hidden="true" />
          Athlet teilen
        </ActionMenuItem>
      </DialogTrigger>

      <DialogContent
        title={`${athleteName} teilen`}
        description="Für andere Coaches dieses Arbeitsbereichs freigeben. Die Freigabe wirkt, sobald das Einverständnis des Athleten festgehalten ist."
      >
        <div className="flex flex-col gap-4">
          {shares.length === 0 ? null : (
            <ul className="flex flex-col gap-2">
              {shares.map((entry) => (
                <li
                  key={entry.coachId}
                  className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md border border-border px-3 py-2"
                >
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="text-sm font-medium break-words">{entry.coachName}</span>
                    <span className="text-xs text-muted-foreground">
                      {entry.confirmedAt === null
                        ? 'Wartet auf das Einverständnis des Athleten — noch kein Zugriff.'
                        : `Freigegeben seit ${entry.confirmedAt.toLocaleDateString('de-DE')}`}
                    </span>
                  </span>

                  {entry.confirmedAt === null ? (
                    <Button
                      variant="outline"
                      className={TOUCH_BUTTON}
                      disabled={pending}
                      onClick={() => {
                        run(() => confirmAthleteShareAction(athleteId, entry.coachId));
                      }}
                    >
                      <Check aria-hidden="true" className="size-4" />
                      Einverständnis festhalten
                    </Button>
                  ) : null}

                  <Button
                    variant="ghost"
                    className={TOUCH_BUTTON}
                    disabled={pending}
                    aria-label={`Freigabe zurückziehen: ${entry.coachName}`}
                    onClick={() => {
                      run(() => revokeAthleteShareAction(athleteId, entry.coachId));
                    }}
                  >
                    <X aria-hidden="true" className="size-4" />
                    Zurückziehen
                  </Button>
                </li>
              ))}
            </ul>
          )}

          {offerable.length === 0 ? (
            <p className="text-sm text-pretty text-muted-foreground">
              {coaches.length === 0
                ? 'In diesem Arbeitsbereich arbeitet bisher kein weiterer Coach.'
                : 'Dieser Athlet ist bereits für alle Coaches dieses Arbeitsbereichs freigegeben.'}
            </p>
          ) : (
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span className="text-sm font-medium">Coach</span>
                <select
                  value={chosen}
                  disabled={pending}
                  onChange={(event) => {
                    setChosen(event.target.value);
                  }}
                  className={`${FOCUS_RING} ${TOUCH_FIELD} rounded-md border border-input bg-background px-3`}
                >
                  <option value="">Bitte wählen</option>
                  {offerable.map((entry) => (
                    <option key={entry.id} value={entry.id}>
                      {entry.name}
                    </option>
                  ))}
                </select>
              </label>

              <Button
                variant="accent"
                className={TOUCH_BUTTON}
                disabled={pending || chosen === ''}
                onClick={() => {
                  run(() => shareAthleteAction(athleteId, chosen));
                }}
              >
                Freigeben
              </Button>
            </div>
          )}

          {error === null ? null : (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
