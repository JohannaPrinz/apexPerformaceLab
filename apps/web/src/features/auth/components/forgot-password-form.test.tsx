import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { RESET_NOT_SENT, RESET_REQUESTED } from '../reset-messages';

import { ForgotPasswordForm } from './forgot-password-form';

/**
 * Asking for a reset link.
 *
 * The guarantee is that this form cannot be used to find out which addresses
 * have accounts. Better Auth answers identically on its side — it even
 * simulates the token work for an address it does not know — and the screen
 * must not undo that by saying something different. What is asserted here is
 * that a known and an unknown address produce **the same** words.
 *
 * The one thing it does report is the request not getting through at all — a
 * network or server failure, which says nothing about any address. A failed
 * *delivery* is deliberately not reported: Better Auth catches those in a
 * background task so a bounced mailbox cannot become the signal this flow
 * exists to withhold.
 */

const mocks = vi.hoisted<{
  calls: { email: string }[];
  answer: { error: { message?: string } | null };
}>(() => ({ calls: [], answer: { error: null } }));

vi.mock('@apex/auth/client', () => ({
  authClient: {
    requestPasswordReset: (input: { email: string }) => {
      mocks.calls.push(input);

      return Promise.resolve(mocks.answer);
    },
  },
}));

async function ask(email: string) {
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('E-Mail-Adresse'), email);
  await user.click(screen.getByRole('button', { name: 'Link anfordern' }));
}

beforeEach(() => {
  mocks.calls.length = 0;
  mocks.answer = { error: null };
});

describe('what the form gives away', () => {
  it('answers a known address and an unknown one with the same words', async () => {
    const { unmount } = render(<ForgotPasswordForm />);
    await ask('bekannt@example.org');
    const known = (await screen.findByText(RESET_REQUESTED)).textContent;
    unmount();

    render(<ForgotPasswordForm />);
    await ask('unbekannt@example.org');
    const unknown = (await screen.findByText(RESET_REQUESTED)).textContent;

    expect(unknown).toBe(known);
  });

  it('says nothing about whether an account exists', async () => {
    render(<ForgotPasswordForm />);
    await ask('irgendwer@example.org');

    const said = (await screen.findByText(RESET_REQUESTED)).textContent ?? '';

    expect(said).toMatch(/wenn es zu dieser adresse ein konto gibt/iu);
    expect(said).not.toMatch(/kein konto|nicht gefunden|unbekannt/iu);
  });

  it('hides the form afterwards, so the answer cannot be compared by repeating', async () => {
    render(<ForgotPasswordForm />);
    await ask('irgendwer@example.org');

    await screen.findByText(RESET_REQUESTED);
    expect(screen.queryByRole('button', { name: 'Link anfordern' })).toBeNull();
  });
});

describe('what it does report', () => {
  it('admits a request that did not get through rather than promising an inbox', async () => {
    mocks.answer = { error: { message: 'SMTP refused' } };
    render(<ForgotPasswordForm />);
    await ask('nora@example.org');

    expect(await screen.findByRole('alert')).toHaveProperty('textContent', RESET_NOT_SENT);
    expect(screen.queryByText(RESET_REQUESTED)).toBeNull();
  });

  it('never shows the library’s own wording', async () => {
    mocks.answer = { error: { message: 'SMTP refused' } };
    render(<ForgotPasswordForm />);
    await ask('nora@example.org');

    expect((await screen.findByRole('alert')).textContent).not.toContain('SMTP');
  });

  it('asks nothing at all for an address that is not one', async () => {
    render(<ForgotPasswordForm />);
    await ask('keine-adresse');

    expect(mocks.calls).toEqual([]);
    expect(screen.getByText('Bitte eine gültige E-Mail-Adresse eingeben.')).toBeTruthy();
  });
});
