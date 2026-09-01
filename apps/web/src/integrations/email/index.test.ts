import { afterEach, describe, expect, it, vi } from 'vitest';

/**
 * The mail transport.
 *
 * What is pinned here is the restraint: without a key and a verified sender it
 * sends nothing and says which one is missing, it never throws at a caller that
 * has already granted access, and a message meant to wait carries the moment it
 * is due rather than being held in this process.
 */

const settings = { RESEND_API_KEY: 'rk_test', EMAIL_FROM: 'Coach <coach@example.test>' };

vi.mock('@/env', () => ({
  get env() {
    return settings;
  },
}));

const { emailReady, missingSetting, sendEmail } = await import('./index');

const ok = (body: unknown = { id: 'msg_1' }) =>
  vi.fn<typeof fetch>().mockResolvedValue(
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  );

/** The JSON body of the one request that was recorded. */
const bodyOf = (fetchMock: ReturnType<typeof ok>): Record<string, unknown> => {
  const raw = fetchMock.mock.calls[0]?.[1]?.body;

  return typeof raw === 'string' ? (JSON.parse(raw) as Record<string, unknown>) : {};
};

afterEach(() => {
  settings.RESEND_API_KEY = 'rk_test';
  settings.EMAIL_FROM = 'Coach <coach@example.test>';
  vi.unstubAllGlobals();
});

describe('refusing without configuration', () => {
  it('names the missing key rather than saying "not configured"', async () => {
    settings.RESEND_API_KEY = '';

    expect(emailReady()).toBe(false);
    expect(missingSetting()).toBe('RESEND_API_KEY');
    await expect(
      sendEmail({ to: 'a@example.test', subject: 'x', text: 'y' }),
    ).resolves.toMatchObject({ ok: false, reason: 'not_configured' });
  });

  it('names the missing sender', () => {
    settings.EMAIL_FROM = '';

    expect(missingSetting()).toBe('EMAIL_FROM');
  });

  it('sends nothing at all while either is missing', async () => {
    settings.EMAIL_FROM = '';
    const fetchMock = ok();
    vi.stubGlobal('fetch', fetchMock);

    await sendEmail({ to: 'a@example.test', subject: 'x', text: 'y' });

    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('sending', () => {
  it('posts the message and reports the id', async () => {
    const fetchMock = ok();
    vi.stubGlobal('fetch', fetchMock);

    const result = await sendEmail({
      to: 'athlet@example.test',
      subject: 'Deine Auswertung ist fertig',
      text: 'Hallo',
      html: '<p>Hallo</p>',
    });

    expect(result).toEqual({ ok: true, id: 'msg_1' });

    expect(bodyOf(fetchMock)).toMatchObject({
      from: 'Coach <coach@example.test>',
      to: ['athlet@example.test'],
      subject: 'Deine Auswertung ist fertig',
      html: '<p>Hallo</p>',
    });
  });

  it('carries the moment a delayed message is due', async () => {
    const fetchMock = ok();
    vi.stubGlobal('fetch', fetchMock);
    const due = new Date('2026-09-01T10:15:00.000Z');

    await sendEmail({ to: 'a@example.test', subject: 'x', text: 'y', sendAt: due });

    expect(bodyOf(fetchMock)['scheduled_at']).toBe(due.toISOString());
  });

  it('omits the schedule where none was asked for', async () => {
    const fetchMock = ok();
    vi.stubGlobal('fetch', fetchMock);

    await sendEmail({ to: 'a@example.test', subject: 'x', text: 'y' });

    expect(bodyOf(fetchMock)).not.toHaveProperty('scheduled_at');
  });
});

describe('failing without throwing', () => {
  it("passes the provider's own wording back", async () => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response('domain is not verified', { status: 403 })),
    );

    await expect(
      sendEmail({ to: 'a@example.test', subject: 'x', text: 'y' }),
    ).resolves.toMatchObject({ ok: false, reason: 'refused' });
  });

  it('survives a network that is simply not there', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>().mockRejectedValue(new Error('getaddrinfo ENOTFOUND')),
    );

    const result = await sendEmail({ to: 'a@example.test', subject: 'x', text: 'y' });

    expect(result).toEqual({
      ok: false,
      reason: 'refused',
      message: 'getaddrinfo ENOTFOUND',
    });
  });
});
