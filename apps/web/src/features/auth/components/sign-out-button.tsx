'use client';

import { useState } from 'react';

import { useRouter } from 'next/navigation';

import { signOut } from '@apex/auth/client';
import { Button } from '@apex/ui';

/** Ends the session and returns to the sign-in screen. */
export function SignOutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  return (
    <Button
      variant="outline"
      size="sm"
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
      {pending ? 'Signing out…' : 'Sign out'}
    </Button>
  );
}
