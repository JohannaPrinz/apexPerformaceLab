'use client';

import { useState } from 'react';

import { useRouter } from 'next/navigation';

import { signOut } from '@apex/auth/client';
import { Button } from '@apex/ui';

import { TOUCH_BUTTON } from '@/components/common/touch';

/** Ends the session and returns to the sign-in screen. */
export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  return (
    <Button
      variant="outline"
      // Reached on a phone through the menu panel, so it carries the same
      // touch size as everything else in the shell.
      className={TOUCH_BUTTON}
      disabled={pending}
      onClick={() => {
        setPending(true);
        void signOut().then(() => {
          // `refresh()` clears the cached Server Component render that still
          // holds the signed-in session.
          router.refresh();
          router.push('/sign-in');
        });
      }}
    >
      {pending ? 'Wird abgemeldet…' : 'Abmelden'}
    </Button>
  );
}
