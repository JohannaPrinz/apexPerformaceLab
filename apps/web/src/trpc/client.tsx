'use client';

import { useState } from 'react';

import { QueryClientProvider, type QueryClient } from '@tanstack/react-query';
import { createTRPCClient, httpBatchStreamLink, loggerLink } from '@trpc/client';
import { createTRPCContext } from '@trpc/tanstack-react-query';
import superjson from 'superjson';

import type { AppRouter } from '@/server/api/root';

import { createQueryClient } from './query-client';

/**
 * Client-side tRPC entry point.
 *
 * This uses the `@trpc/tanstack-react-query` integration rather than the older
 * `@trpc/react-query` hooks. The difference matters: this one produces plain
 * TanStack Query *options objects* (`trpc.health.check.queryOptions()`) that are
 * passed to `useQuery` / `useSuspenseQuery` / `prefetchQuery` directly, instead
 * of wrapping every hook. One query cache, one set of hooks, and server
 * prefetching uses the exact same option builders as the client.
 */
export const { TRPCProvider, useTRPC, useTRPCClient } = createTRPCContext<AppRouter>();

let browserQueryClient: QueryClient | undefined;

/**
 * On the server a fresh QueryClient is created per request (so state never
 * leaks between users); in the browser it is created once and reused (so state
 * survives re-renders and Suspense retries).
 */
function getQueryClient(): QueryClient {
  if (typeof window === 'undefined') {
    return createQueryClient();
  }

  browserQueryClient ??= createQueryClient();
  return browserQueryClient;
}

function getBaseUrl(): string {
  if (typeof window !== 'undefined') return window.location.origin;
  if (process.env['NEXT_PUBLIC_APP_URL']) return process.env['NEXT_PUBLIC_APP_URL'];
  if (process.env['VERCEL_URL']) return `https://${process.env['VERCEL_URL']}`;
  return 'http://localhost:3000';
}

export function TRPCReactProvider({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient();

  const [trpcClient] = useState(() =>
    createTRPCClient<AppRouter>({
      links: [
        loggerLink({
          enabled: (op) =>
            process.env.NODE_ENV === 'development' ||
            (op.direction === 'down' && op.result instanceof Error),
        }),
        // Batching collapses the many small queries a dashboard fires on mount
        // into one request; streaming lets the fast ones resolve first.
        httpBatchStreamLink({
          url: `${getBaseUrl()}/api/trpc`,
          transformer: superjson,
          headers: () => ({ 'x-trpc-source': 'react' }),
        }),
      ],
    }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        {children}
      </TRPCProvider>
    </QueryClientProvider>
  );
}
