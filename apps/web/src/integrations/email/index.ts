import 'server-only';

import nodemailer, { type Transporter } from 'nodemailer';

import { env } from '@/env';

/**
 * Transactional mail, behind two verbs.
 *
 * ## Why the vendor stays in here
 *
 * The README beside this asks for one directory per provider, so that feature
 * code imports `sendEmail()` and never the client. The object store already
 * proved the point — it changed provider entirely and nothing outside its own
 * file moved. This file has now done the same, from an HTTP API to SMTP, and
 * again nothing outside it changed.
 *
 * ## Why SMTP and not a sending service
 *
 * A service sends *on behalf of* a domain, which means proving that it may —
 * three DNS records on a domain somebody owns. Signing in to one's own mailbox
 * proves it by being it: the sender is real, no verification is involved, and
 * the athlete sees the address their coach already writes to them from.
 *
 * The cost is a dependency. SMTP is a stateful protocol over TLS, not one POST,
 * and hand-rolling it would be a great deal of code with a poor failure mode.
 *
 * ## Why "not configured" is a normal answer
 *
 * Without a host, a mailbox and a password there is nothing to sign in to. This
 * refuses rather than guesses, says which setting is missing, and every screen
 * that offers to send asks `emailReady()` first and says so plainly.
 *
 * ## What this cannot do
 *
 * **Schedule.** SMTP hands a message to a server for immediate delivery; there
 * is no "release this in fifteen minutes". A delay would need the message kept
 * somewhere and a job to release it — see `sendEmail`, which therefore takes no
 * send time at all rather than accepting one and ignoring it.
 */

export interface OutgoingEmail {
  readonly to: string;
  readonly subject: string;
  readonly text: string;
  /** Optional; clients that decline it fall back to `text`. */
  readonly html?: string | undefined;
}

export type SendResult =
  | { readonly ok: true; readonly id: string | null }
  | { readonly ok: false; readonly reason: 'not_configured' | 'refused'; readonly message: string };

const SETTINGS = ['SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASSWORD', 'EMAIL_FROM'] as const;
export type EmailSetting = (typeof SETTINGS)[number];

/** Whether a mailbox to send from is configured. */
export function emailReady(): boolean {
  return missingSetting() === null;
}

/**
 * Which setting is missing, or `null` when none is.
 *
 * Named rather than boolean so the interface can say *what* to fill in — "not
 * configured" alone sends somebody hunting through three files.
 */
export function missingSetting(): EmailSetting | null {
  return (
    SETTINGS.find((key) => {
      const value: unknown = env[key];

      return typeof value !== 'string' || value === '';
    }) ?? null
  );
}

/**
 * One connection, built on first use and kept.
 *
 * Lazily, because building it reads configuration that may not be there, and
 * module-level work that can fail is work that fails during a route import.
 */
let transport: Transporter | null = null;

function connection(): Transporter | null {
  if (missingSetting() !== null) return null;

  transport ??= nodemailer.createTransport({
    host: String(env.SMTP_HOST),
    port: Number(env.SMTP_PORT),
    // 587 is the submission port: the session starts in the clear and is
    // upgraded by STARTTLS. `secure: true` would mean implicit TLS on 465 and
    // would simply hang here.
    secure: Number(env.SMTP_PORT) === 465,
    auth: { user: String(env.SMTP_USER), pass: String(env.SMTP_PASSWORD) },
  });

  return transport;
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

  const mailer = connection();
  if (mailer === null) {
    return { ok: false, reason: 'not_configured', message: 'Kein Postfach eingerichtet.' };
  }

  try {
    // Typed as `unknown` on the way back: the client's own result type is
    // loose, and only one field of it is read.
    const sent: unknown = await mailer.sendMail({
      from: String(env.EMAIL_FROM),
      to: message.to,
      subject: message.subject,
      text: message.text,
      ...(message.html === undefined ? {} : { html: message.html }),
    });

    const id =
      typeof sent === 'object' &&
      sent !== null &&
      'messageId' in sent &&
      typeof sent.messageId === 'string'
        ? sent.messageId
        : null;

    return { ok: true, id };
  } catch (error) {
    // The server's own wording: it names the actual cause — a rejected
    // recipient, a refused login, a send limit reached — far better than a
    // generic line would.
    return {
      ok: false,
      reason: 'refused',
      message: error instanceof Error ? error.message : 'Der Versand ist fehlgeschlagen.',
    };
  }
}
