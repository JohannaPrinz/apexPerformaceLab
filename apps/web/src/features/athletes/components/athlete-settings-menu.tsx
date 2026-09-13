import Link from 'next/link';

import { Pencil, Settings } from 'lucide-react';

import { ActionMenu, ActionMenuItem } from '@/components/common/action-menu';
import { RevokePortalAccessDialog } from '@/features/portal/components/revoke-portal-access-dialog';

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
  hasPortalAccess = false,
  coaches,
  shares,
}: {
  readonly athleteId: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly archived: boolean;
  /**
   * Whether a portal account is linked — and therefore whether there is
   * anything to take away (§21).
   *
   * Defaults to `false`, which is what the roster tile passes by omission. Not
   * an oversight: the controls that hand access out live on the athlete's own
   * record, beside the address a link needs, and a destructive act on somebody's
   * access belongs on the screen that shows what they have — not on a card in a
   * list of forty.
   */
  readonly hasPortalAccess?: boolean;
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

      {/* Only where there is an access to end. An entry that refused itself
          would leave a coach wondering which of the two they were looking at —
          and this one is easy enough to mistake for "Deaktivieren" already. */}
      {hasPortalAccess ? (
        <RevokePortalAccessDialog athleteId={athleteId} athleteName={who} />
      ) : null}
    </ActionMenu>
  );
}
