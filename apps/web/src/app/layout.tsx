import { Inter } from 'next/font/google';

import { GeistMono } from 'geist/font/mono';
import { GeistSans } from 'geist/font/sans';

import { Providers } from '@/components/common/providers';

import type { Metadata, Viewport } from 'next';

// The design system's stylesheet. Imported once, at the root — Tailwind v4
// discovers its sources from this file.
import '@apex/ui/styles.css';

/**
 * Fonts are loaded via `next/font`, which self-hosts them and emits a CSS
 * variable. That variable is what `packages/ui/src/styles/globals.css` reads
 * (`--font-geist-sans`, `--font-inter`), so the design system stays decoupled
 * from how the app happens to load its typefaces.
 *
 * Geist → display/UI. Inter → body and dense data.
 */
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

export const metadata: Metadata = {
  title: {
    default: 'Apex OS',
    template: '%s · Apex OS',
  },
  description: 'The operating system for performance coaching.',
  applicationName: 'Apex OS',
  metadataBase: new URL(process.env['NEXT_PUBLIC_APP_URL'] ?? 'http://localhost:3000'),
  openGraph: {
    type: 'website',
    siteName: 'Apex OS',
    title: 'Apex OS',
    description: 'The operating system for performance coaching.',
  },
  robots: {
    // Flip to indexable when the marketing surface goes live.
    index: false,
    follow: false,
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F8F8F6' },
    { media: '(prefers-color-scheme: dark)', color: '#121211' },
  ],
  width: 'device-width',
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    // `suppressHydrationWarning` is required by next-themes: it writes the
    // theme class before hydration to avoid a flash of the wrong theme.
    <html
      lang="en"
      suppressHydrationWarning
      className={`${GeistSans.variable} ${GeistMono.variable} ${inter.variable}`}
    >
      <body className="min-h-dvh antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
