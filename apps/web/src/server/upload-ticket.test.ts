import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The server's permission to write one object (§18).
 *
 * What is under test is what a client **cannot** do: change where its bytes go,
 * how many there may be, whose record they land on, or how long the permission
 * lasts. Every one of those is inside the signature, so the test for each is
 * the same shape — alter it, and the ticket stops being a ticket.
 */

vi.mock('@/env', () => ({
  env: {
    BETTER_AUTH_SECRET: 'test-secret-for-upload-tickets',
    SUPABASE_URL: 'https://example.supabase.co',
  },
}));

const { issueUploadTicket, readUploadTicket, sealUploadLocation, openUploadLocation } =
  await import('./upload-ticket');

const TICKET = {
  organizationId: 'org_a',
  athleteId: 'ath_1',
  storageKey: 'athletes/ath_1/abc.mp4',
  mimeType: 'video/mp4',
  sizeBytes: 12_000_000,
  fileName: 'formcheck.mp4',
  folderId: null,
  uploadedByCoachId: 'coach_1',
} as const;

beforeEach(() => {
  vi.useRealTimers();
});

describe('what a ticket carries', () => {
  it('comes back exactly as it was issued', () => {
    const read = readUploadTicket(issueUploadTicket(TICKET));

    expect(read).toMatchObject(TICKET);
    expect(read?.expiresAt).toBeGreaterThan(Date.now());
  });

  it('carries the storage key, so the client never chooses one', () => {
    const read = readUploadTicket(issueUploadTicket(TICKET));

    expect(read?.storageKey).toBe('athletes/ath_1/abc.mp4');
  });
});

describe('what cannot be changed', () => {
  it('refuses a ticket whose payload was edited', () => {
    const [payload, signature] = issueUploadTicket(TICKET).split('.');
    const tampered = JSON.parse(Buffer.from(payload ?? '', 'base64url').toString('utf8')) as {
      storageKey: string;
    };
    tampered.storageKey = 'reports/rep_1/stolen.jpg';

    const forged = `${Buffer.from(JSON.stringify(tampered)).toString('base64url')}.${String(signature)}`;

    expect(readUploadTicket(forged)).toBeNull();
  });

  it('refuses a signature from somewhere else', () => {
    const [payload] = issueUploadTicket(TICKET).split('.');

    expect(readUploadTicket(`${String(payload)}.not-the-signature`)).toBeNull();
  });

  it('refuses something that is not a ticket at all', () => {
    expect(readUploadTicket('')).toBeNull();
    expect(readUploadTicket('nonsense')).toBeNull();
    expect(readUploadTicket('a.b.c')).toBeNull();
  });

  it('refuses one that has run out', () => {
    const issued = issueUploadTicket(TICKET);

    // Two hours and a minute later.
    vi.useFakeTimers();
    vi.setSystemTime(Date.now() + 2 * 60 * 60 * 1000 + 60_000);

    expect(readUploadTicket(issued)).toBeNull();
  });
});

describe('the sealed upload location', () => {
  const upstream = 'https://example.supabase.co/storage/v1/upload/resumable/abc123';

  it('survives a round trip', () => {
    expect(openUploadLocation(sealUploadLocation(upstream))).toBe(upstream);
  });

  it('refuses an address this server did not seal', () => {
    const elsewhere = Buffer.from('https://evil.example/steal', 'utf8').toString('base64url');

    expect(openUploadLocation(`${elsewhere}.whatever`)).toBeNull();
  });

  it('refuses a correctly signed address that points somewhere else', () => {
    // The signature is genuine; the address is not the store. This is the check
    // that stops a sealed location from becoming a way to make the server fetch
    // arbitrary hosts.
    const sealed = sealUploadLocation('https://evil.example/steal');

    expect(openUploadLocation(sealed)).toBeNull();
  });
});
