import { beforeEach, describe, expect, it, vi } from 'vitest';

import {
  deliverPasswordReset,
  registerPasswordResetSender,
  RESET_TOKEN_SECONDS,
  type PasswordResetDelivery,
} from './password-reset';

/**
 * The seam between "Better Auth wants to send" and "the app knows how".
 *
 * Two guarantees. That a registered sender receives exactly what it was handed
 * — the address, the link and the deadline travel unchanged — and that an
 * *unregistered* one is loud rather than quiet. The second matters more: a
 * reset that silently sends nothing leaves somebody staring at an inbox while
 * the screen tells them to wait.
 */

const DELIVERY: PasswordResetDelivery = {
  to: 'nora@example.org',
  name: 'Nora Beispiel',
  url: 'https://apex.example/passwort-neu/abc123',
  expiresAt: new Date('2026-09-11T10:00:00.000Z'),
};

beforeEach(() => {
  // Each test states its own wiring; a leftover sender would hide a missing one.
  registerPasswordResetSender(() => Promise.reject(new Error('not the sender under test')));
});

describe('handing a reset link over', () => {
  it('gives the registered sender exactly what it was handed', async () => {
    const sent: PasswordResetDelivery[] = [];
    registerPasswordResetSender((delivery) => {
      sent.push(delivery);

      return Promise.resolve();
    });

    await deliverPasswordReset(DELIVERY);

    expect(sent).toEqual([DELIVERY]);
  });

  it('lets a failed send through rather than swallowing it', async () => {
    // The screen must be able to say the mail did not go out.
    registerPasswordResetSender(() => Promise.reject(new Error('SMTP refused')));

    await expect(deliverPasswordReset(DELIVERY)).rejects.toThrow('SMTP refused');
  });

  it('refuses loudly where nothing is registered', async () => {
    // Reaching into the module rather than exporting a reset: the point of the
    // test is the state a misconfigured deployment would actually be in.
    registerPasswordResetSender(null as unknown as () => Promise<void>);

    await expect(deliverPasswordReset(DELIVERY)).rejects.toThrow(/registered/iu);
  });

  it('replaces a previous sender rather than adding to it', async () => {
    const first = vi.fn(() => Promise.resolve());
    const second = vi.fn(() => Promise.resolve());

    registerPasswordResetSender(first);
    registerPasswordResetSender(second);
    await deliverPasswordReset(DELIVERY);

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledTimes(1);
  });
});

describe('how long a link lasts', () => {
  it('is an hour, and short on purpose', () => {
    // The link is the credential while it lives, and it lives in a mailbox.
    expect(RESET_TOKEN_SECONDS).toBe(60 * 60);
  });
});
