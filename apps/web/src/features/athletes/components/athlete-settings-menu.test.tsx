import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { AthleteSettingsMenu } from './athlete-settings-menu';

/**
 * What can be *set* about an athlete.
 *
 * The rule under test is what the menu must **not** contain. Analysing a video
 * is an act of examination that produces measurements against a test; putting it
 * beside "deactivate" would file it as a property of the person. This test is
 * what stops it drifting back in.
 */

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

vi.mock('../server/actions', () => ({
  setAthleteArchivedAction: () => Promise.resolve({}),
  shareAthleteAction: () => Promise.resolve({}),
  confirmAthleteShareAction: () => Promise.resolve({}),
  revokeAthleteShareAction: () => Promise.resolve({}),
}));

vi.mock('@/features/portal/server/actions', () => ({
  revokePortalAccessAction: () => Promise.resolve({}),
}));

/** Two colleagues in the same workspace — what a release may be offered to. */
const COACHES = [
  { id: 'coach_b', name: 'Bea Trainerin' },
  { id: 'coach_c', name: 'Cem Trainer' },
];

const open = async () => {
  const user = userEvent.setup();
  render(
    <AthleteSettingsMenu
      athleteId="ath_1"
      firstName="Lena"
      lastName="Hofmann"
      archived={false}
      coaches={COACHES}
      shares={[]}
    />,
  );

  await user.click(screen.getByRole('button', { name: 'Einstellungen: Lena Hofmann' }));

  return user;
};

describe('the athlete settings menu', () => {
  it('offers editing the master data', async () => {
    await open();

    expect(screen.getByRole('menuitem', { name: /Stammdaten bearbeiten/ })).toHaveAttribute(
      'href',
      '/athletes/ath_1/edit',
    );
  });

  it('offers deactivating, which is never a delete', async () => {
    // §22: an athlete's performance history outlives the coaching relationship.
    await open();

    expect(screen.getByRole('menuitem', { name: 'Deaktivieren' })).toBeVisible();
    expect(screen.queryByRole('menuitem', { name: /Löschen/ })).toBeNull();
  });

  it('offers taking a deactivated athlete back', async () => {
    const user = userEvent.setup();
    render(
      <AthleteSettingsMenu
        athleteId="ath_1"
        firstName="Lena"
        lastName="Hofmann"
        archived
        coaches={COACHES}
        shares={[]}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Einstellungen: Lena Hofmann' }));

    expect(screen.getByRole('menuitem', { name: 'Reaktivieren' })).toBeVisible();
  });

  it('offers releasing the athlete to a colleague', async () => {
    await open();

    expect(screen.getByRole('menuitem', { name: /Athlet teilen/ })).toBeVisible();
  });

  it('offers withdrawing the portal access where there is one', async () => {
    const user = userEvent.setup();
    render(
      <AthleteSettingsMenu
        athleteId="ath_1"
        firstName="Lena"
        lastName="Hofmann"
        archived={false}
        hasPortalAccess
        coaches={COACHES}
        shares={[]}
      />,
    );

    await user.click(screen.getByRole('button', { name: 'Einstellungen: Lena Hofmann' }));

    expect(screen.getByRole('menuitem', { name: 'Portalzugang entziehen' })).toBeVisible();
    // Beside "Deaktivieren", never instead of it: one ends an account, the
    // other suspends the coaching, and §21 lets an athlete have either without
    // the other.
    expect(screen.getByRole('menuitem', { name: 'Deaktivieren' })).toBeVisible();
  });

  it('says nothing about a portal access the athlete does not have', async () => {
    // An entry that refused itself would leave a coach guessing which of the
    // two withdrawals they were looking at.
    await open();

    expect(screen.queryByRole('menuitem', { name: /Portalzugang/ })).toBeNull();
  });

  it('does not offer the video analysis', async () => {
    // The one thing this menu must never grow. Analysing a video produces
    // measurements against a test; it is not a setting of the person.
    await open();

    expect(screen.queryByText(/Videoanalyse/i)).toBeNull();
    expect(screen.queryByRole('menuitem', { name: /Video/i })).toBeNull();
  });

  it('says nothing at all until it is opened', () => {
    render(
      <AthleteSettingsMenu
        athleteId="ath_1"
        firstName="Lena"
        lastName="Hofmann"
        archived={false}
        coaches={COACHES}
        shares={[]}
      />,
    );

    expect(screen.queryByRole('menuitem')).toBeNull();
  });

  it('names the athlete, so a roster of menus is distinguishable', () => {
    render(
      <AthleteSettingsMenu
        athleteId="ath_1"
        firstName="Lena"
        lastName="Hofmann"
        archived={false}
        coaches={COACHES}
        shares={[]}
      />,
    );

    expect(screen.getByRole('button', { name: 'Einstellungen: Lena Hofmann' })).toHaveAttribute(
      'aria-haspopup',
      'menu',
    );
  });
});
