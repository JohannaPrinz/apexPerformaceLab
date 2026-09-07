import { describe, expect, it } from 'vitest';

import {
  chooseUploadRoute,
  MAX_ASSET_BYTES,
  MAX_UPLOAD_BYTES,
  RESUMABLE_CHUNK_BYTES,
} from './uploads';

/**
 * Which road a finished file takes (§18).
 *
 * The boundaries are the whole content of this file, and they are inclusive on
 * both sides. "Six megabytes" has to mean the same thing in the browser, in the
 * server action and in the ticket, and an off-by-one here would show up as a
 * file that compresses successfully and then cannot be sent by either road.
 */

const MB = 1024 * 1024;

describe('the boundaries', () => {
  it('sends anything up to and including six megabytes the ordinary way', () => {
    expect(chooseUploadRoute(1)).toBe('STANDARD');
    expect(chooseUploadRoute(5 * MB)).toBe('STANDARD');
    // Exactly the limit is ordinary: the transport accepts it.
    expect(chooseUploadRoute(MAX_UPLOAD_BYTES)).toBe('STANDARD');
  });

  it('sends one byte more in chunks', () => {
    expect(chooseUploadRoute(MAX_UPLOAD_BYTES + 1)).toBe('RESUMABLE');
    expect(chooseUploadRoute(7 * MB)).toBe('RESUMABLE');
    expect(chooseUploadRoute(30 * MB)).toBe('RESUMABLE');
  });

  it('still sends exactly fifty megabytes, and refuses one byte more', () => {
    expect(chooseUploadRoute(MAX_ASSET_BYTES)).toBe('RESUMABLE');
    expect(chooseUploadRoute(MAX_ASSET_BYTES + 1)).toBe('TOO_LARGE');
    expect(chooseUploadRoute(200 * MB)).toBe('TOO_LARGE');
  });

  it('treats nothing as ordinary rather than crashing', () => {
    // An empty file is refused further down, where the message belongs.
    expect(chooseUploadRoute(0)).toBe('STANDARD');
  });
});

describe('the figures themselves', () => {
  it('names six and fifty megabytes', () => {
    expect(MAX_UPLOAD_BYTES).toBe(6 * MB);
    expect(MAX_ASSET_BYTES).toBe(50 * MB);
  });

  it('sends chunks the store will accept', () => {
    // Six megabytes is what Supabase requires of every chunk but the last.
    expect(RESUMABLE_CHUNK_BYTES).toBe(6 * MB);
  });
});
