'use client';

import { ThemeProvider } from 'next-themes';

import { TRPCReactProvider } from '@/trpc/client';

/**
 * Single client-side provider boundary.
 *
 * Keeping all providers in one `'use client'` component means the root layout
 * stays a Server Component — only this subtree ships to the browser.
 *
 * Order matters: theme sits outermost so it applies during the first paint,
 * before any data-dependent UI renders.
 */
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange>
      <TRPCReactProvider>{children}</TRPCReactProvider>
    </ThemeProvider>
  );
}
