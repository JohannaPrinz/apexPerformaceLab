import 'server-only';

import { cache } from 'react';

import { headers } from 'next/headers';

import { createTRPCOptionsProxy } from '@trpc/tanstack-react-query';

import { appRouter, createCaller } from '@/server/api/root';
import { createTRPCContext } from '@/server/api/trpc';

import { createQueryClient } from './query-client';

/**
 * Server-side tRPC entry point for React Server Components.
 *
 * `cache()` deduplicates context creation within a single request — without it,
 * every RSC that calls a procedure would resolve the session independently.
 */
const createContext = cache(async () => {
  const heads = new Headers(await headers());
  heads.set('x-trpc-source', 'rsc');

  return createTRPCContext({ headers: heads });
});

/** Request-scoped query client, shared by every prefetch in one render pass. */
export const getQueryClient = cache(createQueryClient);

/**
 * Direct caller — invoke a procedure from a Server Component or Server Action
 * with no HTTP round-trip, running the same validation and authorization.
 *
 * ```ts
 * const status = await api.health.check();
 * ```
 */
export const api = createCaller(createContext);

/**
 * Options proxy — builds the same TanStack Query option objects the client
 * uses, so a Server Component can prefetch into the request's query cache and
 * hand the result to the client instead of it refetching.
 *
 * ```ts
 * void getQueryClient().prefetchQuery(trpc.health.check.queryOptions());
 * ```
 *
 * Pair with `<HydrateClient>` from `./hydrate-client`.
 */
export const trpc = createTRPCOptionsProxy({
  ctx: createContext,
  router: appRouter,
  queryClient: getQueryClient,
});
