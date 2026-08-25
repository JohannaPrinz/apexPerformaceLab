/**
 * The trend cards a coach has on screen, as they travel in the address bar.
 *
 * **Deliberately not in the client component that uses it.** Every export of a
 * `'use client'` module becomes a client *reference* when a Server Component
 * imports it — a proxy, not the value. A browser run found the consequence: the
 * athlete page failed to render with `TREND_SLOT_PARAMS.map is not a function`,
 * while typecheck, lint and the whole suite stayed green, because the type was
 * right and only the runtime value was not.
 *
 * A plain module both sides may import is the fix, and the reason this file
 * holds the encoding and nothing else.
 *
 * ## The shape
 *
 * One repeated `card` parameter per card, in the order they appear:
 *
 *     ?card=weight&card=cycle&card=external_load:ex_1,ex_2
 *
 * A card is a measurement type's **catalogue key** — stable across workspaces
 * and readable in an address — optionally narrowed to movements by id, which
 * are not.
 */

/** The parameter each card is written under. Repeated, once per card. */
export const TREND_CARD_PARAM = 'card';

/** How many a hand-written address may ask for. Matches the input contract. */
export const MAX_TREND_CARDS = 12;

export interface TrendCardSelection {
  readonly key: string;
  readonly exerciseIds: readonly string[];
}

const SEPARATOR = ':';

/** One card as a parameter value. */
export function encodeTrendCard(card: TrendCardSelection): string {
  return card.exerciseIds.length === 0
    ? card.key
    : `${card.key}${SEPARATOR}${card.exerciseIds.join(',')}`;
}

export function encodeTrendCards(cards: readonly TrendCardSelection[]): readonly string[] {
  return cards.map(encodeTrendCard);
}

/**
 * The cards a request asked for.
 *
 * Takes what `searchParams` gives — one value, several, or nothing — because a
 * repeated parameter is `string[]` and a single one is `string`, and a caller
 * that had to remember which would eventually forget.
 *
 * Anything unreadable is dropped rather than guessed at: an empty key is not a
 * card, and more than `MAX_TREND_CARDS` is an address nobody typed by hand.
 */
export function parseTrendCards(raw: string | readonly string[] | undefined): TrendCardSelection[] {
  const values = raw === undefined ? [] : typeof raw === 'string' ? [raw] : [...raw];

  return values
    .flatMap((value) => {
      const [key, exercises] = value.split(SEPARATOR);
      if (key === undefined || key.trim() === '') return [];

      return [
        {
          key: key.trim(),
          exerciseIds: (exercises ?? '')
            .split(',')
            .map((id) => id.trim())
            .filter((id) => id !== ''),
        },
      ];
    })
    .slice(0, MAX_TREND_CARDS);
}
