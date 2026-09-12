import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RESET_LINK_CLOSED } from '../reset-messages';

import { ResetPasswordForm } from './reset-password-form';

/**
 * Setting a new password from a reset link.
 *
 * The four outcomes a link can have, at the boundary the person actually sees:
 * it works, it was never valid, it has expired, or somebody already used it.
 * Better Auth owns the token itself — it is consumed in one atomic read — so
 * what is asserted here is that each answer reaches the screen as the right
 * German sentence, and that a successful reset hands over to the sign-in form
 * rather than signing the browser in.
 *
 * The auth client is stubbed: this is about what the screen does with an
 * answer, not about how the token is checked.
 */

const mocks = vi.hoisted<{
  calls: { token: string; newPassword: string }[];
  answer: { error: { code?: string; message?: string } | null };
}>(() => ({ calls: [], answer: { error: null } }));

vi.mock('@apex/auth/client', () => ({
  authClient: {
    resetPassword: (input: { token: string; newPassword: string }) => {
      mocks.calls.push(input);

      return Promise.resolve(mocks.answer);
    },
  },
}));

const GOOD = 'ein-sehr-langes-passwort';

async function fillIn(password = GOOD, repeat = password) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Neues Passwort'), password);
  await user.type(screen.getByLabelText('Passwort wiederholen'), repeat);

  return user;
}

beforeEach(() => {
  mocks.calls.length = 0;
  mocks.answer = { error: null };
});

describe('a link that works', () => {
  it('sets the password and points at the sign-in screen', async () => {
    render(<ResetPasswordForm token="tok_gut" />);

    const user = await fillIn();
    await user.click(screen.getByRole('button', { name: 'Passwort speichern' }));

    expect(mocks.calls).toEqual([{ token: 'tok_gut', newPassword: GOOD }]);
    expect(await screen.findByText('Passwort geändert')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Zur Anmeldung' }).getAttribute('href')).toBe(
      '/sign-in',
    );
  });

  it('says that other devices were signed out', async () => {
    // `revokeSessionsOnPasswordReset` makes that true, and somebody resetting
    // because they lost a device needs to read it.
    render(<ResetPasswordForm token="tok_gut" />);

    const user = await fillIn();
    await user.click(screen.getByRole('button', { name: 'Passwort speichern' }));

    expect((await screen.findByText(/abgemeldet/iu)).textContent).toMatch(/andere geräte/iu);
  });

  it('does not sign the browser in by itself', async () => {
    // The link would otherwise be a session in its own right. The new password
    // gets used once, on the sign-in form.
    render(<ResetPasswordForm token="tok_gut" />);

    const user = await fillIn();
    await user.click(screen.getByRole('button', { name: 'Passwort speichern' }));

    await screen.findByText('Passwort geändert');
    expect(screen.queryByText(/angemeldet/iu)).toBeNull();
  });
});

describe('a link that does not', () => {
  for (const [what, code] of [
    ['was never valid', 'INVALID_TOKEN'],
    ['has expired', 'TOKEN_EXPIRED'],
    ['was already used', 'INVALID_TOKEN'],
  ] as const) {
    it(`says so in German when the token ${what}`, async () => {
      mocks.answer = { error: { code } };
      render(<ResetPasswordForm token="tok_tot" />);

      const user = await fillIn();
      await user.click(screen.getByRole('button', { name: 'Passwort speichern' }));

      expect(await screen.findByRole('alert')).toHaveProperty('textContent', RESET_LINK_CLOSED);
      expect(screen.queryByText('Passwort geändert')).toBeNull();
    });
  }

  it('lets the person try again rather than dead-ending', async () => {
    mocks.answer = { error: { code: 'INVALID_TOKEN' } };
    render(<ResetPasswordForm token="tok_tot" />);

    const user = await fillIn();
    await user.click(screen.getByRole('button', { name: 'Passwort speichern' }));
    await screen.findByRole('alert');

    expect(
      screen.getByRole('button', { name: 'Passwort speichern' }).hasAttribute('disabled'),
    ).toBe(false);
  });
});

describe('what the form refuses before asking', () => {
  it('will not submit a password that is too short', async () => {
    render(<ResetPasswordForm token="tok_gut" />);

    await fillIn('kurz', 'kurz');

    expect(
      screen.getByRole('button', { name: 'Passwort speichern' }).hasAttribute('disabled'),
    ).toBe(true);
    expect(mocks.calls).toEqual([]);
  });

  it('will not submit two that differ, and says which field', async () => {
    render(<ResetPasswordForm token="tok_gut" />);

    await fillIn(GOOD, `${GOOD}x`);

    expect(screen.getByText('Die beiden Eingaben stimmen nicht überein.')).toBeTruthy();
    expect(
      screen.getByRole('button', { name: 'Passwort speichern' }).hasAttribute('disabled'),
    ).toBe(true);
  });
});
