'use client';

import { useState } from 'react';

import { z } from 'zod';

import { authClient } from '@apex/auth/client';
import { Button } from '@apex/ui';

import { TOUCH_BUTTON } from '@/components/common/touch';

import { RESET_NOT_SENT, RESET_REQUESTED } from '../reset-messages';

import { Field } from './field';

const requestSchema = z.object({
  email: z.email('Bitte eine gültige E-Mail-Adresse eingeben.'),
});

/**
 * Asking for a reset link.
 *
 * ## Why the answer never changes
 *
 * Known address or not, the screen says the same sentence. Anything else — a
 * different message, a different delay, a visible error — turns this form into
 * a way of asking "does this person have an account here", and for a roster of
 * athletes that is a question worth nobody being able to ask. Better Auth
 * answers identically on its side too, down to simulating the token work for an
 * address it does not know.
 *
 * A failed **send** is not reported either, and cannot be: Better Auth runs the
 * mail in a background task that catches its own errors, precisely so that a
 * delivery failure cannot become a signal about which addresses exist. It is
 * logged on the server instead — see `server/reset-sender.ts`.
 *
 * What is still reported is a failed **request**: the call itself not getting
 * through, which says nothing about any address.
 */
export function ForgotPasswordForm() {
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const form = new FormData(event.currentTarget);
    const parsed = requestSchema.safeParse({ email: form.get('email') });

    if (!parsed.success) {
      setErrors({ email: parsed.error.issues[0]?.message ?? 'Bitte prüfen.' });

      return;
    }

    setErrors({});
    setPending(true);

    const { error } = await authClient.requestPasswordReset({ email: parsed.data.email });

    setPending(false);

    // A refusal here is the request not getting through at all. An unknown
    // address and an undeliverable mailbox both answer as success on purpose.
    if (error) {
      setFormError(RESET_NOT_SENT);

      return;
    }

    setSent(true);
  }

  if (sent) {
    return (
      <p className="rounded-md border border-border bg-muted px-4 py-3 text-sm text-pretty text-muted-foreground">
        {RESET_REQUESTED}
      </p>
    );
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <Field
        id="email"
        name="email"
        type="email"
        label="E-Mail-Adresse"
        autoComplete="email"
        required
        error={errors['email']}
      />

      {formError === null ? null : (
        <p role="alert" className="text-sm text-destructive">
          {formError}
        </p>
      )}

      <Button type="submit" disabled={pending} className={TOUCH_BUTTON}>
        {pending ? 'Wird gesendet…' : 'Link anfordern'}
      </Button>
    </form>
  );
}
