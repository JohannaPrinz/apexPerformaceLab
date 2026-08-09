import { defaultShouldDehydrateQuery, QueryClient } from '@tanstack/react-query';
import superjson from 'superjson';

/**
 * Shared React Query configuration for both the server and browser clients.
 *
 * The dehydrate/hydrate `serializeData` pair is what allows a Server Component
 * to prefetch a query and hand the *typed* result to the client without a
 * second network request — superjson keeps `Date` a `Date` across that boundary.
 */
export function createQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // With SSR, a zero stale time would refetch immediately on mount and
        // throw away the server-rendered data.
        staleTime: 30 * 1000,
        refetchOnWindowFocus: false,
        retry: (failureCount, error) => {
          // Never retry an authorization failure — it will not succeed.
          const code = (error as { data?: { code?: string } }).data?.code;
          if (code === 'UNAUTHORIZED' || code === 'FORBIDDEN') return false;
          return failureCount < 2;
        },
      },
      dehydrate: {
        serializeData: superjson.serialize,
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) || query.state.status === 'pending',
      },
      hydrate: {
        deserializeData: superjson.deserialize,
      },
    },
  });
}
