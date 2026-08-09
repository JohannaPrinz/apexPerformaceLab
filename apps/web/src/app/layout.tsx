import { IBM_Plex_Mono, Inter, Manrope } from 'next/font/google';

import { Providers } from '@/components/common/providers';

import type { Metadata, Viewport } from 'next';

// The design system's stylesheet. Imported once, at the root — Tailwind v4
// discovers its sources from this file.
import '@apex/ui/styles.css';

/**
 * The three faces of the brand, matching `docs/design/tokens.json`:
 * Manrope → headings · Inter → body and controls · IBM Plex Mono → figures and
 * micro-labels.
 *
 * Loaded via `next/font`, which self-hosts them and emits a CSS variable. Those
 * variables are what `packages/ui/src/styles/globals.css` reads
 * (`--font-manrope`, `--font-inter`, `--font-plex-mono`), so the design system
 * stays decoupled from how the app happens to load its typefaces — and no
 * request ever leaves for a font CDN.
 */
const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const manrope = Manrope({
  subsets: ['latin'],
  variable: '--font-manrope',
  display: 'swap',
});

// IBM Plex Mono ships as static instances rather than a variable font, so the
// weights have to be named. Only the two the brand uses are loaded.
const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '500'],
  variable: '--font-plex-mono',
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
  // The brand canvas and its inverted counterpart — `color.canvas` and
  // `color.deep` in docs/design/tokens.json.
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#F7F7F5' },
    { media: '(prefers-color-scheme: dark)', color: '#16181A' },
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
      className={`${manrope.variable} ${inter.variable} ${plexMono.variable}`}
    >
      <body className="min-h-dvh antialiased">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
