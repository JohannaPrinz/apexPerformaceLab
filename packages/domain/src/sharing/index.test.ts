import { describe, expect, it } from 'vitest';

import {
  DEFAULT_SHARE_DAYS,
  isShareActive,
  shareDaysLeft,
  shareExpiryFrom,
  shareState,
} from './index';

/**
 * Access, as a computed thing.
 *
 * The state is derived on purpose, so the tests here are about the two ways it
 * can end and the order they are reported in. A stored column would have needed
 * a job to keep it true; these are the rules that replace the job.
 */

const AT = (iso: string) => new Date(`${iso}T12:00:00.000Z`);

describe('what a share is right now', () => {
  it('is active while it has neither run out nor been withdrawn', () => {
    expect(shareState({ expiresAt: AT('2026-03-20'), revokedAt: null }, AT('2026-03-15'))).toBe(
      'ACTIVE',
    );
  });

  it('is expired once the moment has passed', () => {
    expect(shareState({ expiresAt: AT('2026-03-10'), revokedAt: null }, AT('2026-03-15'))).toBe(
      'EXPIRED',
    );
  });

  it('expires exactly on the moment, not a tick later', () => {
    const at = AT('2026-03-15');

    expect(shareState({ expiresAt: at, revokedAt: null }, at)).toBe('EXPIRED');
  });

  it('reports a withdrawal ahead of an expiry', () => {
    // Both apply. The coach did the first; the second merely happened, and the
    // screen should say what they did.
    expect(
      shareState({ expiresAt: AT('2026-03-10'), revokedAt: AT('2026-03-08') }, AT('2026-03-15')),
    ).toBe('REVOKED');
  });

  it('stays active without an expiry, until it is withdrawn', () => {
    expect(isShareActive({ expiresAt: null, revokedAt: null }, AT('2030-01-01'))).toBe(true);
    expect(isShareActive({ expiresAt: null, revokedAt: AT('2026-01-01') }, AT('2026-02-01'))).toBe(
      false,
    );
  });
});

describe('how long a link lasts', () => {
  it('defaults to five days', () => {
    expect(DEFAULT_SHARE_DAYS).toBe(5);
    expect(shareExpiryFrom(DEFAULT_SHARE_DAYS, AT('2026-03-12'))).toEqual(AT('2026-03-17'));
  });

  it('counts the days that remain, rounded up', () => {
    expect(shareDaysLeft(AT('2026-03-17'), AT('2026-03-12'))).toBe(5);
    expect(shareDaysLeft(AT('2026-03-13'), AT('2026-03-12'))).toBe(1);
    expect(shareDaysLeft(AT('2026-03-11'), AT('2026-03-12'))).toBe(-1);
  });

  it('still says five a second after a five-day link was granted', () => {
    // Flooring read as a mistake in a browser run: the coach chose 5 and the
    // athlete was told 4, because a few seconds had passed.
    const granted = new Date('2026-03-12T12:00:00.000Z');
    const expiry = shareExpiryFrom(5, granted);
    const moments = new Date(granted.getTime() + 4000);

    expect(shareDaysLeft(expiry, moments)).toBe(5);
  });

  it('has nothing to count without an expiry', () => {
    expect(shareDaysLeft(null)).toBeNull();
  });
});
