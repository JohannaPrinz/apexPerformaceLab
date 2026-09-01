import 'server-only';

import { env } from '@/env';

/**
 * Transactional mail, behind two verbs.
 *
 * ## Why the vendor stays in here
 *
 * The README beside this asks for one directory per provider, so that feature
 * code imports `sendEmail()` and never the SDK. The object store already proved
 * the point — it changed provider entirely and nothing outside its own file
 * moved. This follows the same shape.
 *
 * ## Why the HTTP interface and not the SDK
 *
 * Sending one message is one POST with a JSON body. A package for that would be
 * a dependency, a version to keep, and a supply chain, in exchange for syntax.
 * `fetch` is in the runtime.
 *
 * ## Why "not configured" is a normal answer
 *
 * Without an API key and a verified sender there is no address this may send
 * from, and inventing one would put a wrong `From:` on real correspondence to
 * real people — the kind of mistake that gets a domain marked as spam. So this
 * refuses rather than guesses, says which of the two is missing, and every
 * screen that offers to send asks `emailReady()` first and says so plainly.
 *
 * ## Why the delay is the provider's
 *
 * The second message — the password — must not land beside the first. Asking
 * the provider to hold it costs one field; doing it here would mean a table of
 * pending messages and a job that drains it, which is a lot of machinery for a
 * quarter of an hour. Where a plan does not support scheduling, the message
 * arrives immediately: earlier than intended, never lost.
 */

const ENDPOINT = 'https://api.resend.com/emails';

export interface OutgoingEmail {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  /** Optional; clients that decline it fall back to `text`. */
  readonly html?: string | undefined;
  /** When to release it. Omitted means now. */
  readonly sendAt?: Date | undefined;
}

export type SendResult =
  | { readonly ok: true; readonly id: string | null }
  | { readonly ok: false; readonly reason: 'not_configured' | 'refused'; readonly message: string };

/** Whether both an API key and a verified sender are configured. */
export function emailReady(): boolean {
  return missingSetting() === null;
}

/**
 * Which piece of configuration is missing, or `null` when none is.
 *
 * Named rather than boolean so the interface can say *what* to fill in — "not
 * configured" alone sends somebody hunting through three files.
 */
export function missingSetting(): 'RESEND_API_KEY' | 'EMAIL_FROM' | null {
  if (typeof env.RESEND_API_KEY !== 'string' || env.RESEND_API_KEY === '') return 'RESEND_API_KEY';
  if (typeof env.EMAIL_FROM !== 'string' || env.EMAIL_FROM === '') return 'EMAIL_FROM';

  return null;
}

/**
 * Sends one message, or explains why it did not.
 *
 * Never throws: a report that is published and shared must not report itself as
 * failed because a mailbox bounced. The caller decides what to tell the coach.
 */
export async function sendEmail(message: OutgoingEmail): Promise<SendResult> {
  const missing = missingSetting();
  if (missing !== null) {
    return {
      ok: false,
      reason: 'not_configured',
      message: `Für den E-Mail-Versand fehlt ${missing}.`,
    };
  }

  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${String(env.RESEND_API_KEY)}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM,
        to: [message.to],
        subject: message.subject,
        text: message.text,
        ...(message.html === undefined ? {} : { html: message.html }),
        ...(message.sendAt === undefined ? {} : { scheduled_at: message.sendAt.toISOString() }),
      }),
    });

    if (!response.ok) {
      // The provider's own wording, trimmed: it names the actual cause — an
      // unverified domain, a malformed address — far better than a generic line.
      const detail = await response.text();

      return {
        ok: false,
        reason: 'refused',
        message: `Der Versand wurde abgelehnt (${String(response.status)}): ${detail.slice(0, 300)}`,
      };
    }

    const body: unknown = await response.json();
    const id =
      typeof body === 'object' && body !== null && 'id' in body && typeof body.id === 'string'
        ? body.id
        : null;

    return { ok: true, id };
  } catch (error) {
    return {
      ok: false,
      reason: 'refused',
      message: error instanceof Error ? error.message : 'Der Versand ist fehlgeschlagen.',
    };
  }
}
