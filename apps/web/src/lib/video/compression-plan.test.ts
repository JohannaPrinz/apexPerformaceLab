import { describe, expect, it, vi } from 'vitest';

import {
  bitrateFor,
  compressedName,
  fitWithin,
  HARD_LIMIT_BYTES,
  runCompressionPlan,
  TARGET_BYTES,
  TIERS,
  type EncodeAttempt,
} from './compression-plan';

/**
 * When a video is small enough, and when the attempt is abandoned (§18).
 *
 * ## Why there is no fake codec here
 *
 * There is no encoder in Node, and building one that pretends to compress would
 * test the pretence. So the encoder is an **injected function** and these tests
 * describe only what the plan does with what it gets back: how many attempts it
 * makes, which result it keeps, and when it refuses.
 *
 * The real codec detection is exercised in a browser instead — see
 * `scripts/video-codecs.mjs`, run against Chrome and Firefox.
 *
 * ## The assertion this file exists for
 *
 * **The original is never returned.** Every refusal below is checked for that,
 * because §18 forbids falling back to the untouched file and a fallback is
 * exactly the kind of convenience somebody adds later "to be helpful".
 */

const MB = 1024 * 1024;

const original = { name: 'formcheck.mov', size: 180 * MB, durationSeconds: 40 };

/** An encoder that produces files of the given sizes, one per attempt. */
const encoderProducing = (...sizes: readonly number[]) => {
  const calls: { width: number; height: number; frameRate: number; bitsPerSecond: number }[] = [];

  const encode = vi.fn(
    (
      tier: (typeof TIERS)[number],
      bitsPerSecond: number,
      index: number,
    ): Promise<EncodeAttempt> => {
      calls.push({
        width: tier.maxWidth,
        height: tier.maxHeight,
        frameRate: tier.frameRate,
        bitsPerSecond,
      });

      const size = sizes[index] ?? sizes.at(-1) ?? 0;

      return Promise.resolve({
        ok: true,
        video: {
          blob: new Blob([new Uint8Array(1)], { type: 'video/webm' }),
          mimeType: 'video/webm;codecs=vp9',
          sizeBytes: size,
          width: tier.maxWidth,
          height: tier.maxHeight,
          frameRate: tier.frameRate,
          durationMs: 40_000,
        },
      });
    },
  );

  return { encode, calls };
};

/** An encoder that cannot run at all. */
const encoderFailing = (reason: 'NO_ENCODER' | 'DECODE_FAILED' | 'ENCODE_FAILED') =>
  vi.fn((): Promise<EncodeAttempt> => Promise.resolve({ ok: false, reason }));

describe('the size steps', () => {
  it('accepts the first attempt once it is at or under the target', async () => {
    const { encode } = encoderProducing(20 * MB);

    const result = await runCompressionPlan(original, encode);

    expect(result.ok).toBe(true);
    expect(encode).toHaveBeenCalledTimes(1);
  });

  it('takes a second attempt with less bitrate when the first is too big', async () => {
    const { encode, calls } = encoderProducing(40 * MB, 25 * MB);

    const result = await runCompressionPlan(original, encode);

    expect(result.ok && result.video.sizeBytes).toBe(25 * MB);
    expect(encode).toHaveBeenCalledTimes(2);
    // Same picture, less data — the second step is bitrate alone.
    expect(calls[1]?.width).toBe(calls[0]?.width);
    expect(calls[1]?.bitsPerSecond).toBeLessThan(calls[0]?.bitsPerSecond ?? 0);
  });

  it('takes a third attempt with a smaller picture as well', async () => {
    const { encode, calls } = encoderProducing(60 * MB, 45 * MB, 28 * MB);

    const result = await runCompressionPlan(original, encode);

    expect(result.ok && result.video.sizeBytes).toBe(28 * MB);
    expect(encode).toHaveBeenCalledTimes(3);
    expect(calls[2]?.width).toBeLessThan(calls[1]?.width ?? 0);
    expect(calls[2]?.frameRate).toBeLessThan(calls[1]?.frameRate ?? 0);
  });

  it('accepts a result that is over the target but under the hard limit', async () => {
    // Three attempts, none small enough to stop early, all inside 50 MB.
    const { encode } = encoderProducing(48 * MB, 45 * MB, 40 * MB);

    const result = await runCompressionPlan(original, encode);

    expect(encode).toHaveBeenCalledTimes(TIERS.length);
    expect(result).toMatchObject({ ok: true });
    expect(result.ok && result.video.sizeBytes).toBe(40 * MB);
  });

  it('refuses when even the smallest attempt is over the hard limit', async () => {
    const { encode } = encoderProducing(90 * MB, 80 * MB, 60 * MB);

    expect(await runCompressionPlan(original, encode)).toEqual({
      ok: false,
      reason: 'STILL_TOO_LARGE',
    });
  });

  it('keeps the smallest attempt, not the last one', async () => {
    // A lower bitrate does not always mean a smaller file; the plan should not
    // assume it does.
    const { encode } = encoderProducing(45 * MB, 32 * MB, 44 * MB);

    const result = await runCompressionPlan(original, encode);

    expect(result.ok && result.video.sizeBytes).toBe(32 * MB);
    expect(result.ok && result.video.attempt).toBe(2);
  });

  it('honours limits the caller passes instead of the defaults', async () => {
    // What the file shelf does today: aim at what the upload can carry.
    const { encode } = encoderProducing(8 * MB, 7 * MB, 5 * MB);

    const result = await runCompressionPlan(original, encode, {
      targetBytes: 6 * MB,
      hardLimitBytes: 6 * MB,
    });

    expect(result.ok && result.video.sizeBytes).toBe(5 * MB);
    expect(TARGET_BYTES).toBe(30 * MB);
    expect(HARD_LIMIT_BYTES).toBe(50 * MB);
  });
});

describe('when there is nothing to work with', () => {
  it.each(['NO_ENCODER', 'DECODE_FAILED', 'ENCODE_FAILED'] as const)(
    'refuses on %s without trying again',
    async (reason) => {
      const encode = encoderFailing(reason);

      expect(await runCompressionPlan(original, encode)).toEqual({ ok: false, reason });
      // A missing encoder does not appear on the second pass.
      expect(encode).toHaveBeenCalledTimes(1);
    },
  );

  it('never hands back the original, whatever went wrong', async () => {
    const outcomes = [
      await runCompressionPlan(original, encoderFailing('NO_ENCODER')),
      await runCompressionPlan(original, encoderFailing('DECODE_FAILED')),
      await runCompressionPlan(original, encoderFailing('ENCODE_FAILED')),
      await runCompressionPlan(original, encoderProducing(90 * MB, 80 * MB, 70 * MB).encode),
    ];

    for (const outcome of outcomes) {
      expect(outcome.ok).toBe(false);
      // There is no shape a refusal could carry a file in — asserted rather
      // than assumed, because a later "helpful" fallback would land here.
      expect(Object.keys(outcome)).toEqual(['ok', 'reason']);
    }
  });
});

describe('what comes back', () => {
  it('carries the type that was produced, not the one that was wanted', async () => {
    const { encode } = encoderProducing(10 * MB);

    const result = await runCompressionPlan(original, encode);
    if (!result.ok) throw new Error('expected a file');

    expect(result.video.mimeType).toBe('video/webm;codecs=vp9');
    expect(result.video.file.type).toBe('video/webm;codecs=vp9');
    // And the name follows the type: never `.mp4` over WebM bytes.
    expect(result.video.file.name).toBe('formcheck.webm');
  });

  it('reports the original size beside the new one', async () => {
    const { encode } = encoderProducing(10 * MB);

    const result = await runCompressionPlan(original, encode);

    expect(result.ok && result.video.originalSizeBytes).toBe(180 * MB);
  });

  it('needs no audio track to consider an attempt finished', async () => {
    // The encoder reports width, height, frame rate and duration — sound is not
    // part of the shape at all, so a silent result is a complete one (§18).
    const { encode } = encoderProducing(10 * MB);

    const result = await runCompressionPlan(original, encode);
    if (!result.ok) throw new Error('expected a file');

    expect(result.video).toMatchObject({ width: 1280, height: 720, frameRate: 30 });
    expect(Object.keys(result.video)).not.toContain('audio');
  });
});

describe('naming the produced file', () => {
  it('uses mp4 only for mp4', () => {
    expect(compressedName('clip.mov', 'video/mp4;codecs=avc1.42E01E')).toBe('clip.mp4');
    expect(compressedName('clip.mov', 'video/webm;codecs=vp9')).toBe('clip.webm');
  });

  it('survives a name with no extension at all', () => {
    expect(compressedName('clip', 'video/webm')).toBe('clip.webm');
    expect(compressedName('', 'video/webm')).toBe('video.webm');
  });
});

describe('fitting the picture', () => {
  it('keeps the shape and never enlarges', () => {
    expect(fitWithin(1920, 1080, 1280, 720)).toEqual({ width: 1280, height: 720 });
    expect(fitWithin(1080, 1920, 1280, 720)).toEqual({ width: 406, height: 720 });
    expect(fitWithin(640, 360, 1280, 720)).toEqual({ width: 640, height: 360 });
  });

  it('produces even numbers, which is what encoders want', () => {
    const { width, height } = fitWithin(1023, 767, 1280, 720);

    expect(width % 2).toBe(0);
    expect(height % 2).toBe(0);
  });

  it('answers with the box when the source measures nothing', () => {
    expect(fitWithin(0, 0, 1280, 720)).toEqual({ width: 1280, height: 720 });
  });
});

describe('choosing a bitrate', () => {
  it('scales with the length of the video', () => {
    expect(bitrateFor(30 * 1024 * 1024, 60)).toBeLessThan(bitrateFor(30 * 1024 * 1024, 20));
  });

  it('stays inside sensible bounds', () => {
    // A very long video would otherwise be encoded into mush, a very short one
    // at a rate no phone benefits from.
    expect(bitrateFor(30 * MB, 100_000)).toBeGreaterThanOrEqual(300_000);
    expect(bitrateFor(30 * MB, 0.1)).toBeLessThanOrEqual(4_000_000);
  });

  it('falls back rather than refusing when the duration is unknown', () => {
    expect(bitrateFor(30 * MB, null)).toBeGreaterThan(0);
  });
});
