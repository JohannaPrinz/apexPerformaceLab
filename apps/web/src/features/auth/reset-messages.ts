/**
 * What a reset screen says when something goes wrong.
 *
 * ## Why one sentence covers three cases
 *
 * A link can fail for three reasons: it was never valid, it has expired, or it
 * has already been used. Better Auth answers all three with `INVALID_TOKEN`,
 * and deliberately so — the token is consumed in a single atomic read, and
 * telling the three apart would mean looking it up first, which both races and
 * hands a prober a way to learn which tokens once existed.
 *
 * So one sentence states all three truthfully and says what to do next. It
 * never claims to know which of them happened, because this code does not.
 *
 * ## Why the request screen has no failure at all
 *
 * Asking for a link answers the same way whether or not the address has an
 * account. That is the whole point — a different answer would turn the form
 * into a way of testing which addresses are registered.
 */

/** What `requestPasswordReset` says, for every address, always. */
export const RESET_REQUESTED =
  'Wenn es zu dieser Adresse ein Konto gibt, ist eine E-Mail mit dem Link unterwegs. Schauen Sie auch im Spam-Ordner nach.';

/** The link did not open — invalid, expired, or already used. */
export const RESET_LINK_CLOSED =
  'Dieser Link gilt nicht mehr. Er ist entweder abgelaufen, schon benutzt worden oder war nie gültig. Fordern Sie einen neuen an.';

/**
 * The request itself did not get through.
 *
 * Not a delivery failure — Better Auth swallows those on purpose so that a
 * bounced mailbox cannot reveal which addresses have accounts.
 */
export const RESET_NOT_SENT =
  'Die E-Mail konnte nicht versendet werden. Bitte versuchen Sie es später erneut oder wenden Sie sich an Ihren Coach.';

/** The new password was refused before it was stored. */
export const RESET_PASSWORD_TOO_SHORT = (minimum: number) =>
  `Bitte mindestens ${String(minimum)} Zeichen verwenden.`;

/** Anything this code did not anticipate. */
export const RESET_FAILED = 'Das Passwort konnte nicht gesetzt werden. Bitte erneut versuchen.';

/**
 * Turns Better Auth's answer into one of the sentences above.
 *
 * Keyed on the error **code** rather than its message: the message is English
 * and may be reworded by a library upgrade, the code is the contract. Anything
 * unrecognised falls through to the general sentence rather than being shown
 * raw — an English stack phrase on a German screen helps nobody.
 */
export function resetRefusal(
  error: { readonly code?: string | undefined; readonly message?: string | undefined } | null,
  minimumLength: number,
): string {
  const code = error?.code ?? '';

  if (code === 'INVALID_TOKEN' || code === 'TOKEN_EXPIRED') return RESET_LINK_CLOSED;
  if (code === 'PASSWORD_TOO_SHORT') return RESET_PASSWORD_TOO_SHORT(minimumLength);

  return RESET_FAILED;
}
