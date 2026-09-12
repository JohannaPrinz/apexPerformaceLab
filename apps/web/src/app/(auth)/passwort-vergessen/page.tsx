import Link from 'next/link';

import { TOUCH_TARGET } from '@/components/common/touch';
import { ForgotPasswordForm } from '@/features/auth';

import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Passwort vergessen',
};

/**
 * Where somebody asks for a new password.
 *
 * Public, and it has to be — whoever needs it cannot sign in. It reveals
 * nothing: the form answers the same way for every address, so opening this
 * page tells an outsider only that the product has accounts.
 */
export default function ForgotPasswordPage() {
  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <span className="eyebrow">Apex OS</span>
        <h1 className="text-2xl font-semibold">Passwort vergessen</h1>
        <p className="text-sm text-pretty text-muted-foreground">
          Geben Sie Ihre E-Mail-Adresse ein. Wir schicken Ihnen einen Link, über den Sie ein neues
          Passwort festlegen können.
        </p>
      </div>

      <ForgotPasswordForm />

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
