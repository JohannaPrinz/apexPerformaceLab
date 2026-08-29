import { describe, expect, it } from 'vitest';

import { shareMessage, type ShareMessageInput } from './share-message';

/**
 * What the message may and may not say.
 *
 * These are not wording tests. They are the privacy rules of the feature, and
 * each one is a thing that would be invisible if it broke: a password that
 * slipped into the same mail as the link, an athlete's name on a lock screen, a
 * finding in an unencrypted channel.
 */

const INPUT: ShareMessageInput = {
  athleteFirstName: 'Anna',
  coachName: 'Johanna Prinz',
  performedAt: new Date('2026-03-12T09:00:00.000Z'),
  expiresAt: new Date('2026-03-17T09:00:00.000Z'),
  url: 'https://example.test/geteilt/abc123',
  withOffer: true,
};

const both = (message: { text: string; html: string }) => `${message.text} ${message.html}`;

describe('what the message contains', () => {
  it('greets the athlete by their first name, informally', () => {
    const message = shareMessage(INPUT);

    expect(message.text).toContain('Hallo Anna,');
    expect(message.html).toContain('Hallo Anna,');
    // "du", never "Sie".
    expect(message.text).toContain('kannst du gerne jederzeit auf mich zukommen');
    expect(both(message)).not.toContain('Ihnen');
  });

  it('names the date of the examination and the day the link runs out', () => {
    const message = shareMessage(INPUT);

    expect(message.text).toContain('12. März 2026');
    expect(message.text).toContain('17. März 2026');
  });

  it('carries the link once, and it is the one it was given', () => {
    const message = shareMessage(INPUT);

    expect(message.text).toContain('https://example.test/geteilt/abc123');
    expect(message.html).toContain('href="https://example.test/geteilt/abc123"');
  });

  it('says that a password exists and that it comes separately', () => {
    const message = shareMessage(INPUT);

    expect(both(message)).toContain('separat');
    expect(both(message)).toContain('Passwort');
  });

  it('says the access can be withdrawn', () => {
    expect(both(shareMessage(INPUT))).toContain('zurück');
  });

  it('signs with the coach', () => {
    expect(shareMessage(INPUT).text).toContain('Johanna Prinz');
  });
});

describe('what the message must never contain', () => {
  it('keeps the athlete off the subject line', () => {
    // Subject lines show on a lock screen. "Deine Auswertung ist fertig" says
    // enough to the right person and nothing to a stranger.
    const message = shareMessage(INPUT);

    expect(message.subject).toBe('Deine Auswertung ist fertig');
    expect(message.subject).not.toContain('Anna');
    expect(message.subject).not.toContain('März');
  });

  it('never mentions a comparison with earlier tests', () => {
    // A shared analysis is a one-off examination for somebody who is not being
    // coached yet. Promising a comparison would promise a history they do not
    // have — which is what the closing offer is for instead.
    const text = both(shareMessage(INPUT));

    expect(text).not.toContain('früheren Test');
    expect(text).not.toContain('Vergleich');
    expect(text).not.toContain('Verlauf');
  });

  it('carries no measured value, no unit and no verdict', () => {
    // Checked on the readable text, with word boundaries: a substring search
    // over the markup finds "kg" inside "background", which says nothing about
    // what an athlete reads.
    const { text } = shareMessage(INPUT);

    for (const word of ['kg', 'mmol', 'Grad', 'Sekunden', 'Befund', 'Diagnose', 'Norm']) {
      expect(text, `"${word}" has no place in this message`).not.toMatch(
        new RegExp(String.raw`\b` + word + String.raw`\b`, 'i'),
      );
    }

    // And no digits beyond the two dates, which are the only numbers allowed.
    expect(text.replace(/12\. März 2026|17\. März 2026/g, '')).not.toMatch(/\d+\s*(kg|s|°|%)/);
  });
});

describe('the closing offer', () => {
  it('is there when the coach wants it', () => {
    expect(shareMessage(INPUT).text).toContain('Sollen wir weitermachen?');
  });

  it('disappears entirely when they do not', () => {
    // An athlete already being coached would read a pitch as a circular.
    const message = shareMessage({ ...INPUT, withOffer: false });

    expect(both(message)).not.toContain('weitermachen');
    expect(message.text).toContain('Viele Grüße');
  });
});

describe('the markup', () => {
  it('escapes a name that would otherwise break out of it', () => {
    const message = shareMessage({ ...INPUT, athleteFirstName: 'A<script>x</script>' });

    expect(message.html).not.toContain('<script>');
    expect(message.html).toContain('&lt;script&gt;');
  });

  it('uses no image, because blocked images would empty the message', () => {
    expect(shareMessage(INPUT).html).not.toContain('<img');
  });

  it('carries a preheader, so the inbox preview is not the first sentence twice', () => {
    expect(shareMessage(INPUT).preheader).toContain('17. März 2026');
  });
});
