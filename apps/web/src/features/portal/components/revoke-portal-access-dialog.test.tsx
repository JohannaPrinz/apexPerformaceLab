import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RevokePortalAccessDialog } from './revoke-portal-access-dialog';

/**
 * Taking an activated athlete's portal access away, from the coach's side (§21).
 *
 * Two things are asserted, and they are the two that make this safe to put in a
 * menu next to "Deaktivieren":
 *
 * 1. **Nothing happens until it is confirmed.** Opening the dialog must not
 *    revoke anything, and neither must closing it.
 * 2. **The question names both halves.** What ends is an account; what stays is
 *    the record. A coach who reads only the title cannot tell those apart, and
 *    the difference is the whole feature.
 */

const revoke = vi.fn((_athleteId: string) =>
  Promise.resolve<{ message?: string; revokedFrom?: string | null }>({}),
);
const refresh = vi.fn();

vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));
vi.mock('../server/actions', () => ({
  revokePortalAccessAction: (athleteId: string) => revoke(athleteId),
}));

beforeEach(() => {
  revoke.mockClear();
  refresh.mockClear();
  revoke.mockResolvedValue({ revokedFrom: 'lena@example.org' });
});

const open = async () => {
  const user = userEvent.setup();
  render(<RevokePortalAccessDialog athleteId="ath_1" athleteName="Lena Hofmann" />);

  await user.click(screen.getByRole('menuitem', { name: 'Portalzugang entziehen' }));

  return user;
};

describe('the withdrawal dialog', () => {
  it('asks before it does anything', async () => {
    await open();

    expect(screen.getByRole('dialog')).toBeVisible();
    expect(revoke).not.toHaveBeenCalled();
  });

  it('says what ends and what stays', async () => {
    await open();

    const said = screen.getByRole('dialog').textContent ?? '';

    // What ends.
    expect(said).toMatch(/nicht mehr im Athletenbereich anmelden/iu);
    expect(said).toMatch(/Sitzungen/iu);
    // What stays — including that this is not a deactivation, which is the
    // neighbouring entry in the same menu.
    expect(said).toMatch(/bleiben vollständig erhalten/iu);
    expect(said).toMatch(/keine Deaktivierung/iu);
    // And that it is not a one-way door.
    expect(said).toMatch(/neuen Zugang/iu);
  });

  it('does nothing when the coach backs out', async () => {
    const user = await open();

    await user.click(screen.getByRole('button', { name: 'Abbrechen' }));

    expect(revoke).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('withdraws the access when it is confirmed, and says so', async () => {
    const user = await open();

    await user.click(screen.getByRole('button', { name: 'Zugang entziehen' }));

    expect(revoke).toHaveBeenCalledWith('ath_1');
    // Named, because a coach who withdrew the wrong person's access needs to
    // see whose it was while the dialog is still open.
    expect((await screen.findByRole('status')).textContent).toMatch(/lena@example\.org/u);
  });

  it('re-reads the page only once the confirmation has been read', async () => {
    // The entry that opened this dialog disappears with the access, taking the
    // dialog and its message with it — so the refresh waits for the close.
    const user = await open();

    await user.click(screen.getByRole('button', { name: 'Zugang entziehen' }));
    const done = await screen.findByRole('button', { name: 'Fertig' });
    expect(refresh).not.toHaveBeenCalled();

    await user.click(done);
    expect(refresh).toHaveBeenCalled();
  });

  it('keeps the question open when the withdrawal fails', async () => {
    revoke.mockResolvedValue({ message: 'Der Portalzugang konnte nicht entzogen werden.' });
    const user = await open();

    await user.click(screen.getByRole('button', { name: 'Zugang entziehen' }));

    expect((await screen.findByRole('alert')).textContent).toMatch(/konnte nicht entzogen werden/u);
    // Still offering the action, rather than reporting a success that did not
    // happen. Found rather than got: the pending label only clears once the
    // transition has settled, which under a loaded run is a render later.
    expect(await screen.findByRole('button', { name: 'Zugang entziehen' })).toBeVisible();
  });
});
