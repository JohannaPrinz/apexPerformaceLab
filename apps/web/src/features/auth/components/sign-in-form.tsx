'use client';

import { useState } from 'react';

import { useRouter } from 'next/navigation';

import { signIn } from '@apex/auth/client';
import { Button } from '@apex/ui';

import { signInSchema } from '../schemas';

import { Field } from './field';

/**
 * Credential sign-in.
 *
 * The workspace is not chosen here. A Better Auth session hook resolves the
 * active organization from the user's memberships as the session is created,
 * so by the time this navigates, the session already carries a tenant scope.
 */
export function SignInForm({ redirectTo = '/dashboard' }: { redirectTo?: string }) {
  const router = useRouter();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);

    const form = new FormData(event.currentTarget);
    const parsed = signInSchema.safeParse({
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

    const { error } = await signIn.email(parsed.data);

    if (error) {
      // Deliberately not distinguishing "unknown address" from "wrong
      // password": that difference tells an attacker which addresses exist.
      setFormError('Those credentials did not match an account.');
      setPending(false);
      return;
    }

    router.refresh();
    router.push(redirectTo);
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
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
        autoComplete="current-password"
        required
        error={errors['password']}
      />

      {formError ? (
        <p role="alert" className="text-sm text-destructive">
          {formError}
        </p>
      ) : null}

      <Button type="submit" variant="accent" disabled={pending}>
        {pending ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  );
}
