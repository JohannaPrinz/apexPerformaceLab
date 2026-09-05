import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The mail transport.
 *
 * What is pinned here is the restraint: without a mailbox to sign in to it
 * sends nothing and names the setting that is missing, and it never throws at a
 * caller that has already granted access — a report that is published and
 * shared must not report itself as failed because a mailbox bounced.
 */

const settings: Record<string, string> = {
  SMTP_HOST: 'mail.example.test',
  SMTP_PORT: '587',
  SMTP_USER: 'coach@example.test',
  SMTP_PASSWORD: 'secret',
  EMAIL_FROM: 'Coach <coach@example.test>',
};

const sendMail = vi.fn();

vi.mock('@/env', () => ({
  get env() {
    return settings;
  },
}));

vi.mock('nodemailer', () => ({
  default: { createTransport: () => ({ sendMail }) },
}));

const { emailReady, missingSetting, sendEmail } = await import('./index');

const FULL = { ...settings };

beforeEach(() => {
  Object.assign(settings, FULL);
  sendMail.mockReset();
  sendMail.mockResolvedValue({ messageId: '<abc@example.test>' });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('refusing without a mailbox', () => {
  it('names the missing setting rather than saying "not configured"', async () => {
    settings['SMTP_PASSWORD'] = '';

    expect(emailReady()).toBe(false);
    expect(missingSetting()).toBe('SMTP_PASSWORD');
    await expect(
      sendEmail({ to: 'a@example.test', subject: 'x', text: 'y' }),
    ).resolves.toMatchObject({ ok: false, reason: 'not_configured' });
  });

  it('names the sender when that is what is missing', () => {
    settings['EMAIL_FROM'] = '';

    expect(missingSetting()).toBe('EMAIL_FROM');
  });

  it('sends nothing at all while a setting is missing', async () => {
    settings['SMTP_HOST'] = '';

    await sendEmail({ to: 'a@example.test', subject: 'x', text: 'y' });

    expect(sendMail).not.toHaveBeenCalled();
  });

  it('is ready when every setting is there', () => {
    expect(missingSetting()).toBeNull();
    expect(emailReady()).toBe(true);
  });
});

describe('sending', () => {
  it('hands the message over and reports the id the server gave it', async () => {
    const result = await sendEmail({
      to: 'athlet@example.test',
      subject: 'Deine Auswertung ist fertig',
      text: 'Hallo',
      html: '<p>Hallo</p>',
    });

    expect(result).toEqual({ ok: true, id: '<abc@example.test>' });
    expect(sendMail).toHaveBeenCalledWith({
      from: 'Coach <coach@example.test>',
      to: 'athlet@example.test',
      subject: 'Deine Auswertung ist fertig',
      text: 'Hallo',
      html: '<p>Hallo</p>',
    });
  });

  it('leaves the html out where none was given', async () => {
    await sendEmail({ to: 'a@example.test', subject: 'x', text: 'y' });

    expect(sendMail.mock.calls[0]?.[0]).not.toHaveProperty('html');
  });
});

describe('failing without throwing', () => {
  it("passes the server's own wording back", async () => {
    sendMail.mockRejectedValue(new Error('550 mailbox unavailable'));

    await expect(sendEmail({ to: 'a@example.test', subject: 'x', text: 'y' })).resolves.toEqual({
      ok: false,
      reason: 'refused',
      message: '550 mailbox unavailable',
    });
  });

  it('survives a server that is simply not there', async () => {
    sendMail.mockRejectedValue(new Error('getaddrinfo ENOTFOUND'));

    const result = await sendEmail({ to: 'a@example.test', subject: 'x', text: 'y' });

    expect(result).toMatchObject({ ok: false, reason: 'refused' });
  });
});
