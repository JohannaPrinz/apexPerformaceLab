import Link from 'next/link';

import { Button } from '@apex/ui';

import type { DuplicateWarning as Candidate } from '../server/actions';

/**
 * The duplicate warning shown before an athlete is created (§7).
 *
 * **It warns, it does not block.** Twins exist, and so do two clients with the
 * same common name; a coach who has looked at the list knows better than the
 * rule does. What the warning owes them is enough to decide: who the existing
 * record is, why it matched, and — crucially — whether it is archived, because
 * an archived athlete is invisible in the roster and is the likeliest thing to
 * be re-entered by accident.
 *
 * Each candidate links to its detail page. `target="_blank"` on purpose: the
 * form is uncontrolled, so navigating away in the same tab would throw away
 * everything the coach just typed.
 */

const REASONS: Readonly<Record<Candidate['reason'], string>> = {
  email: 'Gleiche E-Mail-Adresse',
  name_and_birthdate: 'Gleicher Name und gleiches Geburtsdatum',
  name: 'Gleicher Name',
};

const formatBirthdate = (value: string | null): string =>
  value === null ? 'kein Geburtsdatum' : new Date(value).toLocaleDateString('de-DE');

export function DuplicateWarning({ candidates }: { readonly candidates: readonly Candidate[] }) {
  return (
    <section
      // `alert` rather than a plain region: this appears after a submit the
      // coach expected to succeed, and it has to interrupt.
      role="alert"
      aria-labelledby="duplicate-warning-title"
      className="flex flex-col gap-3 rounded-md border border-border-strong bg-muted p-4"
    >
      <div className="flex flex-col gap-1">
        <h2 id="duplicate-warning-title" className="text-sm font-semibold">
          {candidates.length === 1
            ? 'Es gibt bereits einen ähnlichen Athleten'
            : `Es gibt bereits ${String(candidates.length)} ähnliche Athleten`}
        </h2>
        <p className="text-sm text-pretty text-muted-foreground">
          Es wurde noch nichts gespeichert. Bitte prüfen Sie, ob einer dieser Datensätze gemeint
          ist.
        </p>
      </div>

      <ul className="flex flex-col gap-2">
        {candidates.map((candidate) => (
          <li key={candidate.id}>
            <Link
              href={`/athletes/${candidate.id}`}
              // A new tab, because the form is uncontrolled: leaving this page
              // would discard everything typed so far.
              target="_blank"
              rel="noreferrer"
              className="flex flex-col gap-0.5 rounded-md border border-border bg-card px-3 py-2 transition-colors hover:border-border-strong focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <span className="flex flex-wrap items-center gap-2 text-sm font-medium">
                {candidate.lastName}, {candidate.firstName}
                {candidate.archived ? (
                  <span className="rounded-full border border-border px-2 py-0.5 text-xs font-normal text-muted-foreground">
                    Deaktiviert
                  </span>
                ) : null}
              </span>
              <span className="text-xs text-muted-foreground">
                {REASONS[candidate.reason]} · {formatBirthdate(candidate.dateOfBirth)}
                {candidate.email === null ? '' : ` · ${candidate.email}`}
              </span>
            </Link>
          </li>
        ))}
      </ul>

      {/* The name and value of a submit button reach `FormData` only when that
          button submitted the form. So the confirmation is carried by pressing
          this one, with no hidden field and no client state to keep in sync —
          and it cannot be sent by accident on the first attempt. */}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" name="confirmDuplicate" value="1" variant="outline" size="sm">
          Trotzdem neu anlegen
        </Button>
        <span className="text-xs text-muted-foreground">
          Andernfalls oben die Eingaben anpassen oder einen der Datensätze öffnen.
        </span>
      </div>
    </section>
  );
}
