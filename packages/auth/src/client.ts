'use client';

import { organizationClient } from 'better-auth/client/plugins';
import { createAuthClient } from 'better-auth/react';

import { accessControl, roles } from './permissions';

/**
 * Browser-side auth client.
 *
 * Plugin list must mirror `server.ts` — Better Auth derives the client's typed
 * method surface from it, so a mismatch shows up as a missing method rather
 * than a runtime error.
 */
export const authClient = createAuthClient({
  baseURL: process.env['NEXT_PUBLIC_APP_URL'],
  plugins: [
    organizationClient({
      ac: accessControl,
      roles,
    }),
  ],
});

export const {
  signIn,
  signUp,
  signOut,
  useSession,
  organization,
  useActiveOrganization,
  useListOrganizations,
} = authClient;

export type AuthClient = typeof authClient;
