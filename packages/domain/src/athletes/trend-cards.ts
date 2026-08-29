import { z } from 'zod';

/**
 * Which quantities are followed as a curve on an athlete's profile.
 *
 * ## Why the coach chooses, and the platform does not
 *
 * A workspace catalogue holds two dozen quantities. Showing a card for every one
 * that happens to have a reading would bury the two a coach actually watches
 * under twenty they do not — and showing all of them empty would be worse. So
 * the list is a decision, stored per athlete, and it starts empty.
 *
 * Empty is not a gap to fill in automatically. Which numbers matter about a
 * person is a professional judgement, and a default would be the platform making
 * it on the coach's behalf.
 *
 * ## Why catalogue keys and not ids
 *
 * A measurement type's id belongs to one workspace; its key is the same
 * everywhere and readable in a stored payload. Keying on it also lets a card be
 * chosen **before** anything has been recorded — which is the whole point of a
 * documentation card, and impossible with an id that may not exist yet.
 *
 * ## Versioned, and refused rather than half-read
 *
 * The same discipline as every other stored payload here.
 */

export const TREND_CARDS_VERSION = 1;

/** As many as a profile can show without becoming a wall. */
export const MAX_TREND_CARDS = 12;

export const trendCardsSchema = z.object({
  version: z.literal(TREND_CARDS_VERSION),
  /** Measurement-type catalogue keys, in the order the coach arranged them. */
  keys: z
    .array(
      z
        .string()
        .trim()
        .min(1)
        .max(40)
        .regex(/^[a-z0-9_]+$/),
    )
    .max(MAX_TREND_CARDS),
});

export type TrendCards = z.infer<typeof trendCardsSchema>;

/** Reads a stored selection. An unreadable one is no selection, never a guess. */
export function readTrendCards(payload: unknown): readonly string[] {
  const parsed = trendCardsSchema.safeParse(payload);

  return parsed.success ? parsed.data.keys : [];
}

export function trendCardsPayload(keys: readonly string[]): TrendCards {
  return { version: TREND_CARDS_VERSION, keys: [...keys] };
}

/**
 * Adds a card, or leaves the list alone if it is already there.
 *
 * Appended rather than inserted: the order is the coach's, and a new card
 * arriving in the middle of it would rearrange a screen they had settled.
 */
export function withTrendCard(keys: readonly string[], key: string): readonly string[] {
  if (keys.includes(key) || keys.length >= MAX_TREND_CARDS) return keys;

  return [...keys, key];
}

export function withoutTrendCard(keys: readonly string[], key: string): readonly string[] {
  return keys.filter((entry) => entry !== key);
}
