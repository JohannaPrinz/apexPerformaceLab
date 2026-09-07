import 'server-only';

/**
 * The message that carries a portal access link.
 *
 * ## What is deliberately not in it
 *
 * No password — there is none yet, and that is the point of the link. No
 * findings, no values, no question an assessment asked: mail is unencrypted and
 * sits on other people's servers, and the same rule that governs `shareMessage`
 * governs this one.
 *
 * ## What is in it
 *
 * Who invited them, what the account is for, that it is theirs alone, and when
 * the link stops working. An athlete who receives a link out of the blue and
 * cannot tell what it opens will not open it — which is the correct instinct.
 */

const DATE = new Intl.DateTimeFormat('de-DE', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

export interface ActivationMessageInput {
  readonly athleteFirstName: string;
  readonly coachName: string;
  readonly expiresAt: Date;
  readonly url: string;
}

export interface ActivationMessage {
  readonly subject: string;
  readonly preheader: string;
  readonly text: string;
  readonly html: string;
}

/** The plain-text version — what a mail client actually falls back to. */
function textOf(input: ActivationMessageInput): string {
  return [
    `Hallo ${input.athleteFirstName},`,
    '',
    'ich habe dir einen persönlichen Zugang zu deinem Athletenbereich eingerichtet.',
    'Über diesen Link legst du dein eigenes Passwort fest:',
    '',
    input.url,
    '',
    `Der Link ist gültig bis zum ${DATE.format(input.expiresAt)} und funktioniert genau einmal.`,
    'Er gehört nur dir — bitte gib ihn nicht weiter.',
    '',
    'Danach meldest du dich ganz normal mit deiner E-Mail-Adresse und deinem Passwort an.',
    'Dein Passwort kenne ich nicht und kann es auch nicht sehen.',
    '',
    'Im Athletenbereich siehst du, was ich für dich freigegeben habe, und kannst selbst',
    'Werte eintragen — etwa zu Ernährung, Biofeedback und Zyklus — sowie Dokumente,',
    'Fotos und Videos hochladen.',
    '',
    'Bei Fragen kannst du gerne jederzeit auf mich zukommen.',
    '',
    'Viele Grüße',
    input.coachName,
  ].join('\n');
}

/**
 * The HTML version.
 *
 * Tables and inline styles, and light only — the same reasoning as in
 * `shareMessage`: that is what mail clients render reliably, and a card
 * half-recoloured by a dark-mode client reads worse than one that is plainly
 * light. No images, because many clients block them by default.
 */
function htmlOf(input: ActivationMessageInput): string {
  const font = "'Inter',-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
  const display = "'Manrope',-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";

  return `<!doctype html>
<html lang="de"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width,initial-scale=1" />
<title>Dein Zugang zum Athletenbereich</title></head>
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
    <h1 style="margin:0 0 18px;font-family:${display};font-weight:700;font-size:24px;line-height:1.2;color:#16181a">Dein Zugang zum Athletenbereich</h1>
    <p style="margin:0 0 16px">Hallo ${escapeHtml(input.athleteFirstName)},</p>
    <p style="margin:0 0 20px">ich habe dir einen persönlichen Zugang eingerichtet. Über den Link
      legst du dein eigenes Passwort fest — danach meldest du dich ganz normal an.</p>
  </td></tr>

  <tr><td style="padding:0 28px 22px">
    <a href="${escapeHtml(input.url)}"
      style="display:inline-block;background:#1f7a64;color:#ffffff;text-decoration:none;font-weight:600;font-size:15px;padding:13px 26px;border-radius:6px">Passwort festlegen</a>
  </td></tr>

  <tr><td style="padding:0 28px 20px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"
      style="border:1px solid #e4e4df;border-radius:6px">
      <tr><td style="padding:11px 16px;border-bottom:1px solid #f1f1ee;font-size:14px">
        <strong style="color:#16181a">Gültig bis ${DATE.format(input.expiresAt)}</strong>
        <span style="color:#63696f"> — und er funktioniert genau einmal.</span></td></tr>
      <tr><td style="padding:11px 16px;border-bottom:1px solid #f1f1ee;font-size:14px">
        <strong style="color:#16181a">Nur für dich</strong>
        <span style="color:#63696f"> — bitte gib den Link nicht weiter.</span></td></tr>
      <tr><td style="padding:11px 16px;font-size:14px">
        <strong style="color:#16181a">Dein Passwort bleibt deins</strong>
        <span style="color:#63696f"> — ich kenne es nicht und kann es nicht sehen.</span></td></tr>
    </table>
  </td></tr>

  <tr><td style="padding:0 28px 20px">
    <p style="margin:0">Im Athletenbereich siehst du, was ich für dich freigegeben habe. Du kannst
      dort selbst Werte eintragen — etwa zu Ernährung, Biofeedback und Zyklus — und Dokumente,
      Fotos und Videos hochladen.</p>
  </td></tr>

  <tr><td style="padding:0 28px 20px">
    <p style="margin:0">Bei Fragen kannst du gerne jederzeit auf mich zukommen.</p>
  </td></tr>

  <tr><td style="padding:16px 28px 22px">
    <p style="margin:0">Viele Grüße<br /><strong style="color:#16181a">${escapeHtml(input.coachName)}</strong></p>
  </td></tr>

  <tr><td style="padding:18px 28px 24px;border-top:1px solid #e4e4df;background:#fbfbfa;font-size:12px;line-height:1.6;color:#63696f">
    <p style="margin:0 0 8px">Du bekommst diese E-Mail, weil ${escapeHtml(input.coachName)} dir einen Zugang eingerichtet hat.</p>
    <p style="margin:0">Wenn du damit nichts anfangen kannst, ignoriere sie einfach — der Link läuft von selbst ab.</p>
  </td></tr>

</table>
</td></tr></table>
</body></html>`;
}

const preheaderOf = (input: ActivationMessageInput) =>
  `Lege dein Passwort fest. Der Link ist bis zum ${DATE.format(input.expiresAt)} gültig.`;

/** The five characters that would otherwise break out of the markup. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function activationMessage(input: ActivationMessageInput): ActivationMessage {
  return {
    subject: 'Dein Zugang zum Athletenbereich',
    preheader: preheaderOf(input),
    text: textOf(input),
    html: htmlOf(input),
  };
}
