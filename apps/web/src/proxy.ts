import { NextResponse, type NextRequest } from 'next/server';

import { getSessionCookie } from 'better-auth/cookies';

/**
 * Edge proxy — a *routing* guard, not an authorization boundary.
 *
 * (This is the `proxy` file convention introduced in Next.js 16; it replaces
 * the deprecated `middleware` convention and behaves identically.)
 *
 * It only checks whether a session cookie is present, which is cheap and runs on
 * every request. It deliberately does NOT validate the session or look up
 * membership: doing that here would mean a database call on the edge for every
 * asset request, and would spread authorization across two places.
 *
 * Real authorization happens in `organizationProcedure` and in each feature's
 * `server/` layer. Treat this purely as a redirect that saves users from
 * loading a page they cannot use.
 */

/**
 * Route prefixes that require a session.
 *
 * Mirrors the feature slices that will own routes. Coach-facing surfaces first,
 * then the athlete portal — it also needs a session, since Shared Access runs
 * through tokenised links outside this prefix set.
 *
 * Add a prefix here when a slice gains routes. A missing entry does not create
 * a data leak — authorization lives in the tRPC procedures — but it does let a
 * signed-out user load a page that cannot render.
 */
const PROTECTED_PREFIXES = [
  '/start',
  '/dashboard',
  '/athletes',
  '/exercises',
  '/cases',
  '/assessments',
  '/insights',
  '/recommendations',
  '/reports',
  '/timeline',
  '/portal',
  '/settings',
] as const;

const AUTH_ROUTES = ['/sign-in', '/sign-up'] as const;

/**
 * Where a signed-in user is sent from an auth route. Kept here rather than
 * inline so the redirect target has one definition.
 */
// The personal level, not a workspace: a coach lands where their own
// information is and chooses a workspace from there.
const SIGNED_IN_HOME = '/start';

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const hasSession = Boolean(getSessionCookie(request));

  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );

  if (isProtected && !hasSession) {
    const signInUrl = new URL('/sign-in', request.url);
    // Preserve the destination so the user lands where they intended.
    signInUrl.searchParams.set('redirectTo', pathname);
    return NextResponse.redirect(signInUrl);
  }

  const isAuthRoute = AUTH_ROUTES.some((route) => pathname.startsWith(route));

  if (isAuthRoute && hasSession) {
    return NextResponse.redirect(new URL(SIGNED_IN_HOME, request.url));
  }

  return NextResponse.next();
}

export const config = {
  /**
   * Skip Next internals, the API surface (which does its own auth), and static
   * assets. Running this on those is pure latency.
   */
  matcher: [
    '/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
