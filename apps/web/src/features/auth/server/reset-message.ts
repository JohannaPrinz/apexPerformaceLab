import 'server-only';

/**
 * The message that carries a password-reset link.
 *
 * ## What is deliberately not in it
 *
 * No password, old or new — nobody here has one to send, and a message that
 * carried one would be the leak it exists to prevent. No name of a coach, no
 * workspace, no athlete data: a reset is asked for from a sign-in screen by
 * whoever holds the address, and the message must say nothing that a stranger
 * reading the mailbox should not learn.
 *
 * ## What is in it
 *
 * That somebody asked, what the link does, how long it lasts, and what to do if
 * it was not them. The last one matters most: an unexpected reset mail is the
 * first sign an address is being probed, and the honest instruction is to
 * ignore it — nothing changes until the link is opened.
 *
 * ## Why it is not the activation message
 *
 * That one welcomes somebody into an account a coach set up for them and names
 * the coach. This one answers a request the reader made a minute ago. Sharing a
 * template would mean one of the two lying about who is writing.
 */

const TIME = new Intl.DateTimeFormat('de-DE', {
  hour: '2-digit',
  minute: '2-digit',
});

export interface ResetMessageInput {
  /** The account's name. Empty is normal and the greeting copes. */
  readonly name: string;
  readonly url: string;
  readonly expiresAt: Date;
}

export interface ResetMessage {
  readonly subject: string;
  readonly preheader: string;
  readonly text: string;
  readonly html: string;
}

const greeting = (name: string) => {
  const trimmed = name.trim();

  return trimmed === '' ? 'Hallo,' : `Hallo ${trimmed},`;
};

const deadline = (expiresAt: Date) => `${TIME.format(expiresAt)} Uhr`;

/** The plain-text version — what a mail client actually falls back to. */
function textOf(input: ResetMessageInput): string {
  return [
    greeting(input.name),
    '',
    'für dein Konto bei Apex OS wurde ein neues Passwort angefordert.',
    'Über diesen Link legst du es fest:',
    '',
    input.url,
    '',
    `Der Link gilt bis ${deadline(input.expiresAt)} und funktioniert genau einmal.`,
    '',
    'Warst du das nicht? Dann ignoriere diese E-Mail einfach.',
    'Dein Passwort bleibt unverändert, solange der Link nicht geöffnet wird.',
    '',
    'Viele Grüße',
    'Apex OS',
  ].join('\n');
}

/** The five characters that would otherwise break out of the markup. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function htmlOf(input: ResetMessageInput): string {
  const url = escapeHtml(input.url);

  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /></head>
<body style="margin:0;padding:0;background:#f4f4f1;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;color:#16181a">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preheaderOf(input))}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f1;padding:32px 16px">
<tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e4e4df;border-radius:10px;overflow:hidden">

  <tr><td style="padding:26px 28px 6px">
    <p style="margin:0;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#63696f">Apex OS</p>
    <h1 style="margin:6px 0 0;font-size:20px;line-height:1.3">Neues Passwort festlegen</h1>
  </td></tr>

  <tr><td style="padding:14px 28px 0;font-size:15px;line-height:1.6">
    <p style="margin:0 0 14px">${escapeHtml(greeting(input.name))}</p>
    <p style="margin:0 0 14px">für dein Konto bei Apex OS wurde ein neues Passwort angefordert.</p>
  </td></tr>

  <tr><td style="padding:8px 28px 4px">
    <a href="${url}" style="display:inline-block;background:#16181a;color:#ffffff;text-decoration:none;padding:12px 22px;border-radius:8px;font-weight:600;font-size:15px">Passwort festlegen</a>
  </td></tr>

  <tr><td style="padding:14px 28px 0;font-size:13px;line-height:1.6;color:#63696f">
    <p style="margin:0 0 6px">Der Link gilt bis ${escapeHtml(deadline(input.expiresAt))} und funktioniert genau einmal.</p>
    <p style="margin:0;word-break:break-all">${url}</p>
  </td></tr>

  <tr><td style="padding:18px 28px 24px;margin-top:12px;border-top:1px solid #e4e4df;background:#fbfbfa;font-size:12px;line-height:1.6;color:#63696f">
    <p style="margin:0 0 8px">Warst du das nicht? Dann ignoriere diese E-Mail einfach.</p>
    <p style="margin:0">Dein Passwort bleibt unverändert, solange der Link nicht geöffnet wird.</p>
  </td></tr>

</table>
</td></tr></table>
</body></html>`;
}

const preheaderOf = (input: ResetMessageInput) =>
  `Der Link gilt bis ${deadline(input.expiresAt)} und funktioniert genau einmal.`;

export function resetMessage(input: ResetMessageInput): ResetMessage {
  return {
    subject: 'Neues Passwort für Apex OS',
    preheader: preheaderOf(input),
    text: textOf(input),
    html: htmlOf(input),
  };
}
