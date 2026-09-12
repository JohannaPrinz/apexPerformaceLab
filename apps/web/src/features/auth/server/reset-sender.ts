import 'server-only';

import { registerPasswordResetSender } from '@apex/auth';

import { sendEmail } from '@/integrations/email';

import { resetMessage } from './reset-message';

/**
 * Hands Better Auth the way to send a reset link.
 *
 * ## Why registration rather than an import
 *
 * The callback belongs to Better Auth's configuration, which lives in
 * `@apex/auth`. Sending belongs here: it reads this app's SMTP settings and is
 * `server-only`. A package importing an app would be the wrong direction, so
 * the package states what must be delivered and this module says how.
 *
 * ## Where it runs
 *
 * At import time, from the route that mounts Better Auth's HTTP handler — the
 * only path a reset request can arrive by. Importing this module *is* the
 * registration; there is nothing to call.
 *
 * ## Why a refusal throws, and what that does and does not achieve
 *
 * `sendEmail` answers `not_configured` in a workspace with no mailbox, and
 * `refused` when the server declines. Either way nothing was delivered.
 *
 * Throwing does **not** reach the person: Better Auth runs this through
 * `runInBackgroundOrAwait`, which catches and logs rather than rethrowing —
 * verified against 1.6.25, and deliberate on its part, because a reset request
 * has to answer identically whether or not the address exists. A screen that
 * reported the send failure would report it only for addresses that *have* an
 * account, which is exactly the question this flow must not answer.
 *
 * So the throw is for the operator, not the user: it lands in the server log
 * with the address and the reason, which is the only place a bounced reset can
 * honestly be noticed. The person sees the same sentence either way, and if no
 * mail arrives their next step — asking their coach — is the same one they
 * would take on a delivery delay.
 */
registerPasswordResetSender(async ({ to, name, url, expiresAt }) => {
  const message = resetMessage({ name, url, expiresAt });

  const sent = await sendEmail({
    to,
    subject: message.subject,
    text: message.text,
    html: message.html,
  });

  if (!sent.ok) throw new Error(sent.message);
});
