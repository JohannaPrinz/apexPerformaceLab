/**
 * Test stub for the `server-only` package.
 *
 * `import 'server-only'` is a build-time guard: the real package throws unless
 * it is resolved under React's `react-server` condition, which is exactly what
 * makes it useful — a service module that leaks into a client bundle fails
 * loudly instead of shipping database code to the browser.
 *
 * Vitest resolves neither condition, so the guard fires during tests on modules
 * that are perfectly correct. `vitest.config.ts` aliases the package to this
 * file so server modules stay testable while keeping the real guard in the
 * application build.
 */
export {};
