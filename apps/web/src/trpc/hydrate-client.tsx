import { dehydrate, HydrationBoundary } from '@tanstack/react-query';

import { getQueryClient } from './server';

/**
 * Hands queries prefetched on the server to the client's query cache.
 *
 * Lives in its own file rather than in `server.ts` because that module is
 * marked `server-only` and exports no JSX — keeping the boundary component
 * separate keeps both files single-purpose.
 *
 * ```tsx
 * export default async function Page() {
 *   void getQueryClient().prefetchQuery(trpc.health.check.queryOptions());
 *   return (
 *     <HydrateClient>
 *       <HealthBadge />
 *     </HydrateClient>
 *   );
 * }
 * ```
 */
export function HydrateClient({ children }: { children: React.ReactNode }) {
  return <HydrationBoundary state={dehydrate(getQueryClient())}>{children}</HydrationBoundary>;
}
