import Link from 'next/link';

import { TOUCH_TARGET } from '@/components/common/touch';
import { SignUpForm } from '@/features/auth';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Create account',
};

/**
 * Coach registration.
 *
 * Nothing on this page creates the workspace. The account is created here; the
 * coach profile, the personal workspace and the owning membership are
 * provisioned by a Better Auth hook, so every registration path produces the
 * same result — see `packages/auth/src/provisioning.ts`.
 */
export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string }>;
}) {
  const { redirectTo } = await searchParams;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <span className="eyebrow">Apex OS</span>
        <h1 className="text-2xl font-semibold">Create your workspace</h1>
        <p className="text-sm text-pretty text-muted-foreground">
          Register as a coach. You get your own workspace straight away — no team setup required.
        </p>
      </div>

      <SignUpForm redirectTo={safeRedirect(redirectTo)} />

      <p className="text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link
          href="/sign-in"
          className={`${TOUCH_TARGET} inline-flex items-center text-accent underline-offset-4 hover:underline`}
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}

/**
 * Only same-site paths are accepted as a redirect target.
 *
 * `redirectTo` arrives in the query string, so without this an emailed link
 * could bounce a freshly authenticated user to an external site — the classic
 * open-redirect used for credential phishing.
 */
function safeRedirect(target: string | undefined): string {
  if (!target?.startsWith('/') || target.startsWith('//')) return '/start';
  return target;
}
