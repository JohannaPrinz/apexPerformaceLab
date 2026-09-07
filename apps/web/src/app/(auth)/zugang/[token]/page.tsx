import Link from 'next/link';

import { TOUCH_TARGET } from '@/components/common/touch';
import { SetPasswordForm } from '@/features/portal/components/set-password-form';
import { api } from '@/trpc/server';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Zugang einrichten',
};

/**
 * Where a personal access link lands (§21).
 *
 * Public on purpose: whoever opens it has no account yet, which is the entire
 * reason the link exists. It is not in `PROTECTED_PREFIXES` for that reason,
 * and it is safe to be, because the token is the credential — see
 * `resolveActivation`.
 *
 * `dynamic` is implied by the token in the path, but the page also must never
 * be cached: what a link opens changes the moment it is used.
 */
export const dynamic = 'force-dynamic';

export default async function ActivationPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const activation = await api.portal.activation({ token });

  if (!activation.open) {
    return (
      <div className="flex flex-col gap-6">
        <div className="flex flex-col gap-2">
          <span className="eyebrow">Apex OS</span>
          <h1 className="text-2xl font-semibold">Dieser Link öffnet nicht</h1>
          <p className="text-sm text-pretty text-muted-foreground">{activation.message}</p>
        </div>

        <p className="text-sm text-muted-foreground">
          <Link
            href="/sign-in"
            className={`${TOUCH_TARGET} inline-flex items-center text-accent underline-offset-4 hover:underline`}
          >
            Zur Anmeldung
          </Link>
        </p>
      </div>
    );
  }

  return (
    <SetPasswordForm token={token} firstName={activation.firstName} email={activation.email} />
  );
}
