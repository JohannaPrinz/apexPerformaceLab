import { describe, expect, it } from 'vitest';

import { resetMessage } from './reset-message';

/**
 * The message that carries a reset link.
 *
 * What it must contain: the link, when it stops working, and a way out for
 * somebody who did not ask. What it must not contain: a password, or anything
 * about the account beyond the fact that one was asked about — mail is
 * unencrypted and sits on other people's servers, which is the same rule that
 * governs the activation message beside it.
 */

const INPUT = {
  name: 'Nora Beispiel',
  url: 'https://apex.example/passwort-neu/tok_abc',
  expiresAt: new Date('2026-09-11T08:30:00.000Z'),
};

describe('what the message says', () => {
  it('carries the link, in both versions', () => {
    const message = resetMessage(INPUT);

    expect(message.text).toContain(INPUT.url);
    expect(message.html).toContain(INPUT.url);
  });

  it('names the deadline rather than a vague "soon"', () => {
    // Somebody who opens mail an hour late needs to know why it failed.
    const message = resetMessage(INPUT);

    expect(message.text).toMatch(/gilt bis \d{2}:\d{2} Uhr/u);
    expect(message.preheader).toMatch(/gilt bis \d{2}:\d{2} Uhr/u);
  });

  it('says the link works exactly once', () => {
    expect(resetMessage(INPUT).text).toMatch(/genau einmal/u);
  });

  it('tells somebody who did not ask what to do', () => {
    // An unexpected reset mail is the first sign an address is being probed.
    const message = resetMessage(INPUT);

    expect(message.text).toMatch(/ignoriere diese e-mail/iu);
    expect(message.text).toMatch(/bleibt unverändert/iu);
  });

  it('greets somebody whose name is not recorded without an empty gap', () => {
    expect(resetMessage({ ...INPUT, name: '   ' }).text.startsWith('Hallo,')).toBe(true);
  });
});

describe('what the message must not say', () => {
  it('carries no password', () => {
    const message = resetMessage(INPUT);

    expect(message.text).not.toMatch(/passwort lautet|dein passwort ist/iu);
  });

  it('names no coach, no workspace and no athlete data', () => {
    // A reset is asked for by whoever holds the mailbox. It must reveal nothing
    // about the practice the account belongs to.
    const message = resetMessage(INPUT);

    expect(message.text).not.toMatch(/coach|arbeitsbereich|athlet/iu);
  });

  it('escapes a name that would otherwise break out of the markup', () => {
    const message = resetMessage({ ...INPUT, name: '<script>alert(1)</script>' });

    expect(message.html).not.toContain('<script>');
    expect(message.html).toContain('&lt;script&gt;');
  });
});
