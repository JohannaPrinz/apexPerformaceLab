import Link from 'next/link';

import { SignInForm } from '@/features/auth';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Sign in',
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ redirectTo?: string }>;
}) {
  const { redirectTo } = await searchParams;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <span className="eyebrow">Apex OS</span>
        <h1 className="text-2xl font-semibold">Sign in</h1>
        <p className="text-sm text-pretty text-muted-foreground">Continue in your workspace.</p>
      </div>

      <SignInForm redirectTo={safeRedirect(redirectTo)} />

      <p className="text-sm text-muted-foreground">
        No account yet?{' '}
        <Link href="/sign-up" className="text-accent underline-offset-4 hover:underline">
          Create one
        </Link>
      </p>
    </div>
  );
}

/**
 * Only same-site paths are accepted as a redirect target.
 *
 * `src/proxy.ts` writes `redirectTo` when it bounces a signed-out user, but the
 * value still arrives from the client. Without this check a crafted link could
 * send a freshly authenticated user to an external site.
 */
function safeRedirect(target: string | undefined): string {
  if (!target?.startsWith('/') || target.startsWith('//')) return '/start';
  return target;
}
