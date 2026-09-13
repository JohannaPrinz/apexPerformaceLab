'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';

import { env } from '@/env';
import { sendEmail } from '@/integrations/email';
import { api } from '@/trpc/server';

import { activationMessage } from './activation-message';

/**
 * Form entry points for portal access (§21).
 *
 * Thin, like every other action file here: the rules live in the service and
 * the procedure. What these own is turning a refusal into a sentence and
 * telling Next.js which page to re-read.
 */
export interface PortalActionState {
  readonly status: 'idle' | 'error';
  readonly message?: string;
}

const failed = (error: unknown, fallback: string): PortalActionState => ({
  status: 'error',
  message: error instanceof Error ? error.message : fallback,
});

export interface ActivationIssued extends PortalActionState {
  readonly issued?: {
    /**
     * The link, in full.
     *
     * Handed back to the coach as well as sent, for the same reason a share
     * link is: a message can fail to arrive, and the coach may be asked for it.
     * This is the only moment it exists outside the athlete's mailbox — nothing
     * stores it.
     */
    readonly url: string;
    readonly email: string;
    readonly expiresAt: string;
    /** Named when the message did not go out, so the coach can pass it on. */
    readonly undelivered?: string;
  };
}

/**
 * Issues a personal access link for an existing athlete and sends it.
 *
 * ## Why a failed message does not undo the link
 *
 * The same reasoning as `createShareAction`: access is a decision the coach
 * made, and delivery is a separate matter that fails for unrelated reasons — a
 * bounced mailbox, an unconfigured sender. The link stands, and what did not
 * arrive is named so the coach can pass it on themselves.
 */
export async function issueActivationAction(athleteId: string): Promise<ActivationIssued> {
  try {
    const issued = await api.portal.issueActivation({ athleteId });

    const origin = (await headers()).get('origin') ?? env.NEXT_PUBLIC_APP_URL;
    const url = `${origin}/zugang/${issued.token}`;

    const message = activationMessage({
      athleteFirstName: issued.firstName,
      coachName: issued.coachName,
      expiresAt: issued.expiresAt,
      url,
    });

    const sent = await sendEmail({
      to: issued.email,
      subject: message.subject,
      text: message.text,
      html: message.html,
    });

    revalidatePath(`/athletes/${athleteId}`);

    return {
      status: 'idle',
      issued: {
        url,
        email: issued.email,
        expiresAt: issued.expiresAt.toISOString(),
        ...(sent.ok ? {} : { undelivered: sent.message }),
      },
    };
  } catch (error) {
    return failed(error, 'Der Zugangslink konnte nicht erstellt werden.');
  }
}

/** Withdraws every link still standing for this athlete. */
export async function revokeActivationAction(athleteId: string): Promise<PortalActionState> {
  try {
    await api.portal.revokeActivation({ athleteId });
  } catch (error) {
    return failed(error, 'Der Zugangslink konnte nicht zurückgezogen werden.');
  }

  revalidatePath(`/athletes/${athleteId}`);

  return { status: 'idle' };
}

export interface PortalAccessRevoked extends PortalActionState {
  /**
   * The address the closed account signed in with.
   *
   * Carried back so the confirmation can name it. `null` where the account had
   * already lost its user row — the revocation stands either way, and a
   * sentence with a gap in it would be worse than one without the address.
   */
  readonly revokedFrom?: string | null;
}

/**
 * Ends the portal access of an athlete who already has an account.
 *
 * Not `revokeActivationAction` above: that withdraws a link nobody has used.
 * Both revalidate the roster as well as the record, because the badge that says
 * an athlete has access is on both screens.
 */
export async function revokePortalAccessAction(athleteId: string): Promise<PortalAccessRevoked> {
  let revokedFrom: string | null = null;

  try {
    const result = await api.portal.revokeAccess({ athleteId });
    revokedFrom = result.email;
  } catch (error) {
    return failed(error, 'Der Portalzugang konnte nicht entzogen werden.');
  }

  revalidatePath('/athletes');
  revalidatePath(`/athletes/${athleteId}`);

  return { status: 'idle', revokedFrom };
}

/**
 * Sets the first password and links the account.
 *
 * Called from a page nobody is signed in on. It deliberately does **not** open
 * a session: the athlete signs in afterwards with what they just chose — see
 * `redeemActivation` for why that ordering removes a race rather than adding a
 * step for its own sake.
 */
export async function redeemActivationAction(
  token: string,
  password: string,
): Promise<PortalActionState> {
  try {
    await api.portal.redeemActivation({ token, password });
  } catch (error) {
    return failed(error, 'Das Passwort konnte nicht gesetzt werden.');
  }

  return { status: 'idle' };
}
