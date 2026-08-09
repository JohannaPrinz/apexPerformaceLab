/**
 * Server-side entry point.
 *
 * The browser client lives at `@apex/auth/client` and is intentionally NOT
 * re-exported here — importing it from a Server Component would pull the
 * `'use client'` boundary into the server graph.
 */
export { auth, type Auth, type Session } from './server';
export * from './permissions';
