import Link from 'next/link';

import { Pencil, Settings } from 'lucide-react';

import { ActionMenu, ActionMenuItem } from '@/components/common/action-menu';

import { ArchiveButton } from './archive-button';
import { ShareAthleteDialog } from './share-athlete-dialog';

/**
 * What can be *set* about an athlete.
 *
 * ## Why the video analysis is not in here
 *
 * Analysing a video is something a coach **does with** an athlete, not a setting
 * of the athlete: it produces measurements that belong to a test, and it is
 * reached from the profile as its own action and from the test it files into.
 * Filing it under settings would put an act of examination beside "deactivate",
 * which is the wrong shelf and the wrong weight.
 *
 * A test holds this: adding it here later would be a decision, not an accident.
 */
export function AthleteSettingsMenu({
  athleteId,
  firstName,
  lastName,
  archived,
  coaches,
  shares,
}: {
  readonly athleteId: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly archived: boolean;
  /** Coaches of this workspace, the caller excluded. */
  readonly coaches: readonly { id: string; name: string }[];
  readonly shares: readonly { coachId: string; coachName: string; confirmedAt: Date | null }[];
}) {
  const who = `${firstName} ${lastName}`.trim();

  return (
    <ActionMenu
      label={`Einstellungen: ${who}`}
      icon={<Settings aria-hidden="true" className="size-4" />}
    >
      <ActionMenuItem asChild>
        {/* The accessible name contains the visible label, so this is not the
            "label in name" failure. It is needed because the engagements below
            carry a "Bearbeiten" each. */}
        <Link href={`/athletes/${athleteId}/edit`} aria-label={`Stammdaten bearbeiten: ${who}`}>
          <Pencil aria-hidden="true" />
          Stammdaten bearbeiten
        </Link>
      </ActionMenuItem>

      <ShareAthleteDialog
        athleteId={athleteId}
        athleteName={who}
        coaches={coaches}
        shares={shares}
      />

      <ArchiveButton athleteId={athleteId} archived={archived} as="menuitem" />
    </ActionMenu>
  );
}
