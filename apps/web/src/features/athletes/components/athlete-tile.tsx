import Link from 'next/link';

import { Badge } from '@apex/ui';

import { FOCUS_RING } from '@/components/common/touch';

import { AthleteSettingsMenu } from './athlete-settings-menu';

/**
 * One athlete on the workspace overview.
 *
 * **A shortcut, not the roster.** The tile carries what a coach needs to
 * recognise someone and get into their record; searching and filtering stay at
 * `/athletes`, which the overview links to.
 *
 * ## Only fields that have a query behind them
 *
 * Name, the date the record was created and the number of assessments — that
 * last one derived through `Athlete → PerformanceCase → Assessment`, which has
 * exactly one meaning. Uploads, comments and share status are modelled but have
 * no service, so they are **absent rather than empty**: a tile with four blank
 * rows reads as a broken screen, not as a product that is still growing.
 *
 * The picture is a placeholder in every case. `Athlete` carries no image field
 * and the `Asset` table has no way to mark one as the profile picture, so the
 * initials are the honest answer — the same reasoning as `ExerciseThumbnail`,
 * where the placeholder is the normal case rather than the error case.
 */
export interface AthleteTileData {
  readonly id: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly createdAt: Date;
  /**
   * How many assessments this athlete has.
   *
   * Optional, because the roster does not carry it: counting across every
   * athlete's cases is a second query the overview already pays for and the
   * roster has no use for. Absent means the badge is not shown — never zero.
   */
  readonly assessmentCount?: number;
  /** Shown when known; absent facts are omitted rather than dashed. */
  readonly dateOfBirth?: Date | null;
  readonly heightCm?: number | null;
  readonly weightKg?: number | null;
  readonly archivedAt?: Date | null;
}

export function AthleteTile({
  athlete,
  coaches = [],
  shares = [],
}: {
  readonly athlete: AthleteTileData;
  /** Coaches of this workspace, the caller excluded. Empty, sharing offers none. */
  readonly coaches?: readonly { id: string; name: string }[];
  readonly shares?: readonly { coachId: string; coachName: string; confirmedAt: Date | null }[];
}) {
  const initials = `${athlete.firstName.slice(0, 1)}${athlete.lastName.slice(0, 1)}`.toUpperCase();

  const facts = [
    athlete.dateOfBirth == null ? null : `geb. ${athlete.dateOfBirth.toLocaleDateString('de-DE')}`,
    athlete.heightCm == null ? null : `${athlete.heightCm.toLocaleString('de-DE')} cm`,
    athlete.weightKg == null ? null : `${athlete.weightKg.toLocaleString('de-DE')} kg`,
  ].filter((fact): fact is string => fact !== null);

  return (
    /* The card is the frame; the link fills it and the menu sits above it.
       A nested button inside an anchor is invalid and unreachable by keyboard,
       so the link is a sibling stretched across the card rather than its
       parent — the whole tile stays one tap target, and the menu keeps its
       own. */
    <div className="relative flex h-full min-h-11 items-start gap-3 rounded-lg border border-border bg-card p-4 transition-colors hover:border-border-strong">
      <Link
        href={`/athletes/${athlete.id}`}
        aria-label={`${athlete.firstName} ${athlete.lastName}`}
        className={`${FOCUS_RING} absolute inset-0 rounded-lg`}
      />

      <span
        aria-hidden="true"
        className="grid size-11 shrink-0 place-items-center rounded-full bg-muted text-sm font-medium text-muted-foreground"
      >
        {initials}
      </span>

      {/* Everything else in one column. The count used to sit beside the name
          and competed for its width, which broke "Schwarzenbach-Hohenlohe"
          mid-word; below it, the name gets the whole tile. */}
      <span className="flex min-w-0 flex-col gap-1">
        <span className="font-medium break-words hyphens-auto" lang="de">
          {athlete.firstName} {athlete.lastName}
        </span>
        <span className="text-xs text-muted-foreground" data-numeric>
          seit {athlete.createdAt.toLocaleDateString('de-DE')}
        </span>

        {/* Only what is known. An absent height is left out rather than shown
            as a dash — a tile of em dashes reads as a broken record. */}
        {facts.length === 0 ? null : (
          <span className="text-xs text-muted-foreground" data-numeric>
            {facts.join(' · ')}
          </span>
        )}

        <span className="mt-1 flex flex-wrap items-center gap-1.5">
          {athlete.archivedAt ? <Badge variant="secondary">Deaktiviert</Badge> : null}
          {athlete.assessmentCount !== undefined && athlete.assessmentCount > 0 ? (
            <Badge variant="secondary">
              {athlete.assessmentCount}{' '}
              {athlete.assessmentCount === 1 ? 'Assessment' : 'Assessments'}
            </Badge>
          ) : null}
        </span>
      </span>

      {/* Above the link, so it is clickable, and in the head of the card as
          everywhere else. */}
      <div className="relative z-10 ml-auto">
        <AthleteSettingsMenu
          athleteId={athlete.id}
          firstName={athlete.firstName}
          lastName={athlete.lastName}
          archived={athlete.archivedAt !== null}
          coaches={coaches}
          shares={shares}
        />
      </div>
    </div>
  );
}
