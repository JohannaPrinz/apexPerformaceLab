import { describe, expect, it } from 'vitest';

import { RESET_FAILED, RESET_LINK_CLOSED, RESET_REQUESTED, resetRefusal } from './reset-messages';

/**
 * What a reset screen is allowed to say.
 *
 * Two rules, and both are security rules rather than copy decisions.
 *
 * **A dead link gets one sentence.** Never valid, expired, and already used are
 * three different histories, and Better Auth reports all three as
 * `INVALID_TOKEN` on purpose — the token is consumed in one atomic read, so
 * telling them apart would need a look-ahead that both races the consumption
 * and lets somebody probe which tokens once existed. The sentence therefore
 * names all three possibilities and claims to know none of them.
 *
 * **Asking for a link has no failure message about the address.** A different
 * answer for a known address would turn the form into a way of testing which
 * addresses are registered.
 */

const MINIMUM = 12;

describe('a link that does not open', () => {
  it('says the same thing for a token that was never valid', () => {
    expect(resetRefusal({ code: 'INVALID_TOKEN' }, MINIMUM)).toBe(RESET_LINK_CLOSED);
  });

  it('says the same thing for a token that has expired', () => {
    // Better Auth answers an expired token as invalid; if a later version ever
    // separates them, this keeps the screen's wording unchanged.
    expect(resetRefusal({ code: 'TOKEN_EXPIRED' }, MINIMUM)).toBe(RESET_LINK_CLOSED);
  });

  it('says the same thing for a token that was already used', () => {
    // Reuse reaches this code as `INVALID_TOKEN` too: the row is consumed by
    // the first reset, so the second finds nothing.
    expect(resetRefusal({ code: 'INVALID_TOKEN' }, MINIMUM)).toBe(RESET_LINK_CLOSED);
  });

  it('tells the three apart to nobody', () => {
    const answers = new Set(
      ['INVALID_TOKEN', 'TOKEN_EXPIRED'].map((code) => resetRefusal({ code }, MINIMUM)),
    );

    expect(answers.size).toBe(1);
  });

  it('names all three reasons, so nobody is left guessing what to do', () => {
    expect(RESET_LINK_CLOSED).toMatch(/abgelaufen/iu);
    expect(RESET_LINK_CLOSED).toMatch(/benutzt/iu);
    expect(RESET_LINK_CLOSED).toMatch(/neuen/iu);
  });
});

describe('a password the server would not take', () => {
  it('says how long it has to be', () => {
    expect(resetRefusal({ code: 'PASSWORD_TOO_SHORT' }, MINIMUM)).toBe(
      'Bitte mindestens 12 Zeichen verwenden.',
    );
  });
});

describe('anything unrecognised', () => {
  it('falls back to a German sentence rather than the library’s English', () => {
    expect(resetRefusal({ code: 'SOMETHING_NEW', message: 'Internal failure' }, MINIMUM)).toBe(
      RESET_FAILED,
    );
  });

  it('copes with no error object at all', () => {
    expect(resetRefusal(null, MINIMUM)).toBe(RESET_FAILED);
  });

  it('never shows the library’s own wording', () => {
    const raw = 'Invalid token';

    expect(resetRefusal({ message: raw }, MINIMUM)).not.toContain(raw);
  });
});

describe('asking for a link', () => {
  it('promises nothing about whether the address exists', () => {
    expect(RESET_REQUESTED).toMatch(/wenn es zu dieser adresse ein konto gibt/iu);
  });
});
