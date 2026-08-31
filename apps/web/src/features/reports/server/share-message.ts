import 'server-only';

/**
 * The message an athlete receives with their link.
 *
 * ## Why the password is not in it
 *
 * Sending the key through the same channel as the door is not a protection.
 * Whoever reads the mailbox would have both, and the password would be
 * decoration. It goes a second way — a message, a call, in person — and the
 * mail says so, so nobody hunts for it.
 *
 * ## Why nothing about the findings is in it
 *
 * Mail is unencrypted and sits on other people's servers. Values, wording and
 * above all the **question the assessment asked** stay behind the link: a
 * coach's own phrasing of why they examined somebody regularly names an injury
 * or an operation, and it was written for the record, not for a subject line.
 *
 * The date of the examination is the exception, because without it the message
 * cannot be placed at all.
 *
 * ## Why this is composed and not sent
 *
 * There is no mail transport in this system, and the sender domain is not
 * decided. Inventing one would put a wrong address on real correspondence.
 * So the message is composed here and handed to the coach — who sends it from
 * their own address, which the athlete already knows, and which no receiving
 * server has any reason to distrust.
 */

const DATE = new Intl.DateTimeFormat('de-DE', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

export interface ShareMessageInput {
  readonly athleteFirstName: string;
  readonly coachName: string;
  /** The examination this analysis is about. */
  readonly performedAt: Date;
  readonly expiresAt: Date;
  readonly url: string;
  /** Whether to include the closing offer. Off for an athlete already coached. */
  readonly withOffer: boolean;
}

export interface ShareMessage {
  readonly subject: string;
  readonly preheader: string;
  readonly text: string;
  readonly html: string;
}

const OFFER_TEXT = `Sollen wir weitermachen?

Eine einzelne Untersuchung zeigt, wo du gerade stehst. Was sich verändert, zeigt erst die zweite — und die dritte. Wenn du magst, planen wir dein Training entlang dieser Werte und messen in Ruhe nach.`;

/** The plain-text version. What actually goes out through a mail client. */
function textOf(input: ShareMessageInput): string {
  const lines = [
    `Hallo ${input.athleteFirstName},`,
    '',
    `ich habe die Auswertung deiner Untersuchung vom ${DATE.format(input.performedAt)} abgeschlossen.`,
    '',
    input.url,
    '',
    `Der Link ist gültig bis zum ${DATE.format(input.expiresAt)}.`,
    'Er ist mit einem Passwort geschützt — das schicke ich dir separat, nicht in dieser E-Mail.',
    'Falls nötig, kann ich den Zugang jederzeit wieder zurückziehen.',
    '',
    'Bei Fragen kannst du gerne jederzeit auf mich zukommen.',
  ];

  if (input.withOffer) lines.push('', OFFER_TEXT);

  lines.push('', 'Viele Grüße', input.coachName);

  return lines.join('\n');
}

/**
 * The HTML version.
 *
 * Tables and inline styles, because that is what mail clients render reliably —
 * flexbox, grid and stylesheets are not dependable across Outlook, Gmail and
 * Apple Mail. No images either: they are blocked by default in many clients,
 * and a message whose meaning depends on one arrives blank.
 *
 * Deliberately light only. Dark mode is handled inconsistently, and a card
 * half-recoloured by a client reads worse than one that is simply light.
 */
function htmlOf(input: ShareMessageInput): string {
  const font = "'Inter',-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
  const display = "'Manrope',-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

  const offer = input.withOffer
    ? `<tr><td style="padding:0 28px 8px">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
          style="background:#e8f1ee;border-radius:6px">
          <tr><td style="padding:20px 22px">
            <p style="margin:0 0 8px;font-family:${display};font-size:16px;font-weight:600;color:#0f3f34">Sollen wir weitermachen?</p>
            <p style="margin:0;font-size:14px;line-height:1.6;color:#275a4c">
              Eine einzelne Untersuchung zeigt, wo du gerade stehst. Was sich verändert, zeigt erst
              die zweite — und die dritte. Wenn du magst, planen wir dein Training entlang dieser
              Werte und messen in Ruhe nach.
            </p>
          </td></tr>
        </table>
      </td></tr>`
    : '';

  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Deine Auswertung ist fertig</title></head>
<body style="margin:0;padding:0;background:#f7f7f5">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(preheaderOf(input))}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f7f7f5">
<tr><td align="center" style="padding:28px 12px 40px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"
  style="width:100%;max-width:600px;background:#ffffff;border:1px solid #e4e4df;border-radius:6px;font-family:${font};font-size:15px;line-height:1.62;color:#3d4247">

  <tr><td style="padding:22px 28px 0">
    <p style="margin:0;font-family:${display};font-weight:700;font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:#1f7a64">Apex OS</p>
  </td></tr>

  <tr><td style="padding:14px 28px 0">
    <h1 style="margin:0 0 18px;font-family:${display};font-weight:700;font-size:24px;line-height:1.2;color:#16181a">Deine Auswertung ist fertig</h1>
    <p style="margin:0 0 16px">Hallo ${escapeHtml(input.athleteFirstName)},</p>
    <p style="margin:0 0 20px">ich habe die Auswertung deiner Untersuchung vom
      <strong style="color:#16181a">${DATE.format(input.performedAt)}</strong> abgeschlossen.</p>
  </td></tr>

  <tr><td style="padding:0 28px 22px">
    <a href="${escapeHtml(input.url)}"
      style="display:inline-block;background:#1f7a64;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:13px 26px;border-radius:6px">Auswertung ansehen</a>
  </td></tr>

  <tr><td style="padding:0 28px 20px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
      style="border:1px solid #e4e4df;border-radius:6px">
      <tr><td style="padding:11px 16px;border-bottom:1px solid #f1f1ee;font-size:14px">
        <strong style="color:#16181a">Gültig bis ${DATE.format(input.expiresAt)}</strong>
        <span style="color:#63696f"> — danach öffnet der Link nicht mehr.</span></td></tr>
      <tr><td style="padding:11px 16px;border-bottom:1px solid #f1f1ee;font-size:14px">
        <strong style="color:#16181a">Mit Passwort geschützt</strong>
        <span style="color:#63696f"> — das schicke ich dir separat, nicht in dieser E-Mail.</span></td></tr>
      <tr><td style="padding:11px 16px;font-size:14px">
        <strong style="color:#16181a">Jederzeit widerrufbar</strong>
        <span style="color:#63696f"> — falls nötig, ziehe ich den Zugang wieder zurück.</span></td></tr>
    </table>
  </td></tr>

  <tr><td style="padding:0 28px 20px">
    <p style="margin:0">Bei Fragen kannst du gerne jederzeit auf mich zukommen.</p>
  </td></tr>

  ${offer}

  <tr><td style="padding:16px 28px 22px">
    <p style="margin:0">Viele Grüße<br /><strong style="color:#16181a">${escapeHtml(input.coachName)}</strong></p>
  </td></tr>

  <tr><td style="padding:18px 28px 24px;border-top:1px solid #e4e4df;background:#fbfbfa;font-size:12px;line-height:1.6;color:#63696f">
    <p style="margin:0 0 8px">Du bekommst diese E-Mail, weil ${escapeHtml(input.coachName)} eine Auswertung für dich freigegeben hat.</p>
    <p style="margin:0">Die Nachricht selbst enthält keine Messwerte und keine Befunde — die stehen ausschließlich hinter dem geschützten Link.</p>
  </td></tr>

</table>
</td></tr></table>
</body></html>`;
}

const preheaderOf = (input: ShareMessageInput) =>
  `Der Link ist bis zum ${DATE.format(input.expiresAt)} gültig. Das Passwort bekommst du separat.`;

/** The five characters that would otherwise break out of the markup. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function shareMessage(input: ShareMessageInput): ShareMessage {
  return {
    // No name and no date in the subject: it shows on a lock screen.
    subject: 'Deine Auswertung ist fertig',
    preheader: preheaderOf(input),
    text: textOf(input),
    html: htmlOf(input),
  };
}

/**
 * The password, on its own.
 *
 * ## Why it is a second message
 *
 * A link and the password that opens it in one mail is one intercepted mailbox
 * away from being no protection at all. Two messages mean two channels: the
 * coach sends the link by mail and the password by whatever they and the athlete
 * already use — a phone call, a text, in person.
 *
 * It therefore says as little as possible: no link, no date, no mention of what
 * it opens. On its own it is a string with no target.
 */
export function passwordMessage({
  athleteFirstName,
  coachName,
  password,
}: {
  readonly athleteFirstName: string;
  readonly coachName: string;
  readonly password: string;
}): { subject: string; text: string } {
  const greeting = athleteFirstName.trim() === '' ? 'Hallo,' : `Hallo ${athleteFirstName.trim()},`;

  return {
    subject: 'Dein Zugangswort',
    text: [
      greeting,
      '',
      'hier das Wort, mit dem du deine Auswertung öffnest:',
      '',
      password,
      '',
      'Den Link dazu hast du separat bekommen.',
      '',
      'Viele Grüße',
      coachName,
    ].join('\n'),
  };
}
