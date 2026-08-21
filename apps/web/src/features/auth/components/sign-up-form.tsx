'use client';

import { useState } from 'react';

import { useRouter } from 'next/navigation';

import { signUp } from '@apex/auth/client';
import { Button } from '@apex/ui';

import { TOUCH_BUTTON } from '@/components/common/touch';

import { MIN_PASSWORD_LENGTH, signUpSchema } from '../schemas';

import { Field } from './field';

/**
 * Coach registration.
 *
 * The form does one thing: create the account. It deliberately does **not**
 * create the coach profile or the workspace — those are provisioned by a Better
 * Auth database hook, so the same thing happens whether someone registers here,
 * through GitHub, or through any provider added later. A form that owned that
 * logic would leave every other path without a workspace.
 *
 * See `packages/auth/src/provisioning.ts`.
 */
export function SignUpForm({ redirectTo = '/start' }: { redirectTo?: string }) {
  const router = useRouter();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const form = new FormData(event.currentTarget);
    const parsed = signUpSchema.safeParse({
      name: form.get('name'),
      email: form.get('email'),
      password: form.get('password'),
    });

    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0];
        if (typeof key === 'string' && !fieldErrors[key]) fieldErrors[key] = issue.message;
      }
      setErrors(fieldErrors);
      return;
    }

    setErrors({});
    setPending(true);

    const { error } = await signUp.email(parsed.data);

    if (error) {
      // Better Auth reports a taken address as a generic failure; keep its
      // message rather than guessing at the cause.
      setFormError(error.message ?? 'Registration failed. Please try again.');
      setPending(false);
      return;
    }

    // `refresh()` before navigating so the Server Components on the target
    // route read the new session instead of the cached signed-out render.
    router.refresh();
    router.push(redirectTo);
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <Field
        id="name"
        name="name"
        label="Name"
        autoComplete="name"
        required
        error={errors['name']}
        hint="Your workspace starts out named after you. You can rename it later."
      />

      <Field
        id="email"
        name="email"
        type="email"
        label="Email"
        autoComplete="email"
        required
        error={errors['email']}
      />

      <Field
        id="password"
        name="password"
        type="password"
        label="Password"
        autoComplete="new-password"
        required
        error={errors['password']}
        hint={`At least ${MIN_PASSWORD_LENGTH} characters.`}
      />

      {formError ? (
        <p role="alert" className="text-sm text-destructive">
          {formError}
        </p>
      ) : null}

      <Button type="submit" variant="accent" className={TOUCH_BUTTON} disabled={pending}>
        {pending ? 'Creating your workspace…' : 'Create account'}
      </Button>
    </form>
  );
}
