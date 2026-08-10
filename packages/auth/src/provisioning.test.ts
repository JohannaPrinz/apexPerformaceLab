import { describe, expect, it } from 'vitest';

import { personalWorkspaceName, slugifyWorkspaceName } from './provisioning';

/**
 * Slug derivation is pure and easy to get quietly wrong: a regex that eats a
 * character class it should not eats digits out of every workspace URL, and
 * nothing fails loudly. These cases pin the behaviour that matters for a
 * German-language product.
 */
describe('slugifyWorkspaceName', () => {
  it('lowercases and joins words with a single hyphen', () => {
    expect(slugifyWorkspaceName('Apex Performance Lab')).toBe('apex-performance-lab');
  });

  it('keeps digits', () => {
    expect(slugifyWorkspaceName('Studio 21')).toBe('studio-21');
    expect(slugifyWorkspaceName('360 Grad')).toBe('360-grad');
  });

  it('folds German umlauts to their base letter', () => {
    expect(slugifyWorkspaceName('Jörg Müller')).toBe('jorg-muller');
    expect(slugifyWorkspaceName('Ärztehaus')).toBe('arztehaus');
  });

  it('expands ß rather than dropping it', () => {
    // NFKD leaves ß intact, so without the explicit expansion this would
    // collapse to "stra-er".
    expect(slugifyWorkspaceName('Straßer')).toBe('strasser');
  });

  it('strips punctuation and collapses separator runs', () => {
    expect(slugifyWorkspaceName('Müller & Söhne — Coaching!')).toBe('muller-sohne-coaching');
  });

  it('trims leading and trailing separators', () => {
    expect(slugifyWorkspaceName('  ...Apex...  ')).toBe('apex');
  });

  it('never ends on a hyphen after truncation', () => {
    const slug = slugifyWorkspaceName(`${'a'.repeat(39)} tail`);

    expect(slug.length).toBeLessThanOrEqual(40);
    expect(slug.endsWith('-')).toBe(false);
  });

  it('falls back when nothing survives', () => {
    expect(slugifyWorkspaceName('***')).toBe('workspace');
    expect(slugifyWorkspaceName('')).toBe('workspace');
  });
});

describe('personalWorkspaceName', () => {
  it("starts from the coach's own name", () => {
    expect(personalWorkspaceName('Johanna Prinz')).toBe('Johanna Prinz');
  });

  it('trims surrounding whitespace', () => {
    expect(personalWorkspaceName('  Johanna Prinz  ')).toBe('Johanna Prinz');
  });

  it('falls back when the name is empty', () => {
    // Better Auth requires a name, but an OAuth provider may return only
    // whitespace — the workspace still needs something to be called.
    expect(personalWorkspaceName('   ')).toBe('My Workspace');
  });
});
