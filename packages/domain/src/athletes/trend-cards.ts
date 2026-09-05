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
 * ## Cards that are tables carry their rows here too
 *
 * Most cards are one quantity drawn as a curve, and the key says everything
 * about them. Two are tables of several quantities at once — the nutrition week
 * and the biofeedback week — and one of those lets the coach choose which
 * quantities it holds. That choice is the same kind of statement as the card
 * list itself ("which numbers are followed about this person"), it is per
 * athlete for the same reason, and it belongs in the same place rather than in a
 * second column that would have to be kept in step with this one.
 *
 * `rows` is therefore a map from a card key to the quantities that card shows.
 * **Absent means the card's own default**, which is not the same as an empty
 * list: a coach who has never touched the biofeedback rows gets the eight it
 * ships with, and a coach who removed all of them gets none. Collapsing the two
 * would make "remove the last row" impossible to express.
 *
 * ## Versioned, and refused rather than half-read
 *
 * The same discipline as every other stored payload here. Version 1 payloads —
 * every one written before rows existed — stay readable and simply carry no row
 * selection, which is the truth about them.
 */

export const TREND_CARDS_VERSION = 2;

/** As many as a profile can show without becoming a wall. */
export const MAX_TREND_CARDS = 12;

/** As many quantities as one table can hold and still be read across. */
export const MAX_CARD_ROWS = 20;

const catalogueKey = z
  .string()
  .trim()
  .min(1)
  .max(40)
  .regex(/^[a-z0-9_]+$/);

const trendCardsV1 = z.object({
  version: z.literal(1),
  keys: z.array(catalogueKey).max(MAX_TREND_CARDS),
});

export const trendCardsSchema = z.object({
  version: z.literal(TREND_CARDS_VERSION),
  /** Measurement-type catalogue keys, in the order the coach arranged them. */
  keys: z.array(catalogueKey).max(MAX_TREND_CARDS),
  /**
   * Per-card row selections, for the cards that are tables.
   *
   * Keyed by card key. A card missing from here has not been configured and
   * shows its own default — see the header.
   */
  rows: z.record(catalogueKey, z.array(catalogueKey).max(MAX_CARD_ROWS)).optional(),
});

export type TrendCards = z.infer<typeof trendCardsSchema>;

const readPayload = (payload: unknown): TrendCards | null => {
  const current = trendCardsSchema.safeParse(payload);
  if (current.success) return current.data;

  const first = trendCardsV1.safeParse(payload);

  // A version-1 payload is a complete statement about the cards and says
  // nothing about rows. Read forward rather than discarded: a coach who
  // arranged their profile before this existed keeps the arrangement.
  return first.success ? { version: TREND_CARDS_VERSION, keys: first.data.keys } : null;
};

/** Reads a stored selection. An unreadable one is no selection, never a guess. */
export function readTrendCards(payload: unknown): readonly string[] {
  return readPayload(payload)?.keys ?? [];
}

/**
 * The rows one card was configured with, or `null` where it never was.
 *
 * `null` and `[]` are different answers and the caller must keep them apart:
 * the first means "show the default", the second means "the coach removed
 * every row".
 */
export function readCardRows(payload: unknown, cardKey: string): readonly string[] | null {
  return readPayload(payload)?.rows?.[cardKey] ?? null;
}

export function trendCardsPayload(
  keys: readonly string[],
  rows?: Readonly<Record<string, readonly string[]>>,
): TrendCards {
  return {
    version: TREND_CARDS_VERSION,
    keys: [...keys],
    ...(rows === undefined || Object.keys(rows).length === 0
      ? {}
      : { rows: Object.fromEntries(Object.entries(rows).map(([key, list]) => [key, [...list]])) }),
  };
}

/** Every stored row selection, so a writer can change one and keep the rest. */
export function readAllCardRows(payload: unknown): Readonly<Record<string, readonly string[]>> {
  return readPayload(payload)?.rows ?? {};
}

/**
 * One card's rows, replaced.
 *
 * The whole list at once rather than add/remove helpers: the order is the
 * coach's and reordering is the same operation as adding, so a caller that
 * could only append would need a second path for it.
 */
export function withCardRows(
  rows: Readonly<Record<string, readonly string[]>>,
  cardKey: string,
  next: readonly string[],
): Readonly<Record<string, readonly string[]>> {
  return { ...rows, [cardKey]: [...next].slice(0, MAX_CARD_ROWS) };
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
