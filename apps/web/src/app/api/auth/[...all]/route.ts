import { toNextJsHandler } from 'better-auth/next-js';

import { auth } from '@apex/auth';

// Importing this registers how a password-reset link gets sent. It has to
// happen before Better Auth serves a reset request, and this module is the
// only path such a request arrives by — see `features/auth/server/reset-sender.ts`.
import '@/features/auth/server/reset-sender';

/**
 * Better Auth mounts its full endpoint surface here — sign-in, sign-up, OAuth
 * callbacks, session, organization management. The catch-all segment is
 * required; Better Auth routes internally from the path.
 */
export const { GET, POST } = toNextJsHandler(auth.handler);
