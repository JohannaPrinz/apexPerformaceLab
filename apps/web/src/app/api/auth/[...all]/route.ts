import { toNextJsHandler } from 'better-auth/next-js';

import { auth } from '@apex/auth';

/**
 * Better Auth mounts its full endpoint surface here — sign-in, sign-up, OAuth
 * callbacks, session, organization management. The catch-all segment is
 * required; Better Auth routes internally from the path.
 */
export const { GET, POST } = toNextJsHandler(auth.handler);
