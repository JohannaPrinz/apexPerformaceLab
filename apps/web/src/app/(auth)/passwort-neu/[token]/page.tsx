import Link from 'next/link';

import { TOUCH_TARGET } from '@/components/common/touch';
import { ResetPasswordForm } from '@/features/auth';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Neues Passwort',
};

/**
 * Where a reset link lands.
 *
 * ## Why the token is not checked here
 *
 * It could be — but checking would mean reading the verification row, and the
 * row is meant to be **consumed** exactly once, atomically, when the password
 * is set. A look-ahead would either race that consumption or need a second,
 * non-consuming read that tells a prober which tokens exist. So the page opens
 * the form for any token, and the one place that decides is the write itself.
 *
 * The cost is that a dead link shows a form before it shows the refusal. That
 * is the right way round: the refusal names all three reasons a link can be
 * dead and says how to get a new one.
 *
 * Never cached — what a link opens changes the moment it is used.
 */
export const dynamic = 'force-dynamic';

export default async function ResetPasswordPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <span className="eyebrow">Apex OS</span>
        <h1 className="text-2xl font-semibold">Neues Passwort festlegen</h1>
        <p className="text-sm text-pretty text-muted-foreground">
          Wählen Sie ein Passwort, das Sie nirgendwo sonst verwenden.
        </p>
      </div>

      <ResetPasswordForm token={token} />

      <p className="text-sm text-muted-foreground">
        <Link
          href="/sign-in"
          className={`${TOUCH_TARGET} inline-flex items-center text-accent underline-offset-4 hover:underline`}
        >
          Zurück zur Anmeldung
        </Link>
      </p>
    </div>
  );
}
