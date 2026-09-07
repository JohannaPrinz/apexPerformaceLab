import { describe, expect, it, vi } from 'vitest';

import { isHeic, jpegName, preparePhotoWith, STORED_PHOTO_TYPE } from './photo-plan';

/**
 * What happens to a photograph before it is stored (§18).
 *
 * No decoder here on purpose: Node has none, and a fake one would test the
 * fake. The decoder is injected, and these tests describe the decisions around
 * it — which files are touched at all, what the result is called, and above all
 * that **a HEIC is never what gets uploaded**.
 */

const file = (name: string, type: string, size = 1024) =>
  new File([new Uint8Array(size)], name, { type });

const decoderProducing = (bytes: number) =>
  vi.fn(() => Promise.resolve(new Blob([new Uint8Array(bytes)], { type: STORED_PHOTO_TYPE })));

describe('which files are touched', () => {
  it('leaves a JPEG exactly as it is', async () => {
    const decode = decoderProducing(10);
    const original = file('foto.jpg', 'image/jpeg');

    const result = await preparePhotoWith(original, decode);

    expect(result).toEqual({ ok: true, file: original, converted: false });
    // Not re-encoded for the sake of it: the decoder is never even called.
    expect(decode).not.toHaveBeenCalled();
  });

  it('leaves a PNG exactly as it is', async () => {
    const decode = decoderProducing(10);
    const original = file('grafik.png', 'image/png');

    const result = await preparePhotoWith(original, decode);

    expect(result).toEqual({ ok: true, file: original, converted: false });
    expect(decode).not.toHaveBeenCalled();
  });

  it('recognises HEIC by type and by name', () => {
    expect(isHeic({ name: 'IMG_0001.heic', type: 'image/heic' })).toBe(true);
    expect(isHeic({ name: 'IMG_0001.HEIF', type: 'image/heif' })).toBe(true);
    // iOS does not always fill in a type when a file is chosen.
    expect(isHeic({ name: 'IMG_0001.HEIC', type: '' })).toBe(true);
    expect(isHeic({ name: 'foto.jpg', type: 'image/jpeg' })).toBe(false);
    // A name that lies about a type that is present: the type wins.
    expect(isHeic({ name: 'foto.heic', type: 'image/jpeg' })).toBe(false);
  });
});

describe('converting a phone photograph', () => {
  it('produces a JPEG, named as one', async () => {
    const result = await preparePhotoWith(
      file('IMG_0042.heic', 'image/heic'),
      decoderProducing(64),
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.converted).toBe(true);
    expect(result.file.type).toBe('image/jpeg');
    expect(result.file.name).toBe('IMG_0042.jpg');
    expect(result.file.size).toBe(64);
  });

  it('reports the real size of what came out, not of what went in', async () => {
    const original = file('IMG_0042.heic', 'image/heic', 4_000_000);

    const result = await preparePhotoWith(original, decoderProducing(900_000));

    expect(result.ok && result.file.size).toBe(900_000);
  });

  it('names the file even when the original had no extension', () => {
    expect(jpegName('IMG_0042')).toBe('IMG_0042.jpg');
    expect(jpegName('')).toBe('foto.jpg');
  });
});

describe('when it cannot be converted', () => {
  it('refuses where the decoder answers with nothing', async () => {
    const result = await preparePhotoWith(
      file('IMG_0042.heic', 'image/heic'),
      vi.fn(() => Promise.resolve(null)),
    );

    expect(result).toEqual({ ok: false, reason: 'DECODE_FAILED' });
  });

  it('refuses where the decoder throws', async () => {
    const result = await preparePhotoWith(
      file('IMG_0042.heic', 'image/heic'),
      vi.fn(() => Promise.reject(new Error('kaputt'))),
    );

    expect(result).toEqual({ ok: false, reason: 'DECODE_FAILED' });
  });

  it('refuses an empty result rather than storing nothing', async () => {
    const result = await preparePhotoWith(file('IMG_0042.heic', 'image/heic'), decoderProducing(0));

    expect(result).toEqual({ ok: false, reason: 'DECODE_FAILED' });
  });

  it('never hands the HEIC back, whatever went wrong', async () => {
    const outcomes = [
      await preparePhotoWith(
        file('IMG.heic', 'image/heic'),
        vi.fn(() => Promise.resolve(null)),
      ),
      await preparePhotoWith(
        file('IMG.heic', 'image/heic'),
        vi.fn(() => Promise.reject(new Error('x'))),
      ),
      await preparePhotoWith(file('IMG.heic', 'image/heic'), decoderProducing(0)),
    ];

    for (const outcome of outcomes) {
      expect(outcome.ok).toBe(false);
      // A refusal has no shape a file could travel in — asserted, because a
      // later "helpful" fallback would land exactly here (§18).
      expect(Object.keys(outcome)).toEqual(['ok', 'reason']);
    }
  });
});
