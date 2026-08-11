import type { NextConfig } from 'next';

// Order matters. `load-env` pulls the monorepo's root `.env` into process.env;
// `env` then validates it. Importing `env` here means an invalid environment
// fails `next build` with a readable Zod error, instead of surfacing as
// `undefined` at runtime.
import './src/load-env';
import './src/env';

const nextConfig: NextConfig = {
  reactStrictMode: true,

  /**
   * Internal packages are consumed as TypeScript source rather than pre-built
   * dist output. No build step per package, no stale artefacts, and
   * "go to definition" lands on the real source.
   *
   * The cost is that Next must transpile them — that is what this list does.
   * Add every new `@apex/*` package here.
   */
  transpilePackages: ['@apex/ui', '@apex/auth', '@apex/database', '@apex/domain', '@apex/types'],

  typedRoutes: true,

  images: {
    remotePatterns: [
      // Cloudflare R2 public bucket / custom domain.
      { protocol: 'https', hostname: '**.r2.dev' },
      { protocol: 'https', hostname: '**.r2.cloudflarestorage.com' },
    ],
  },

  experimental: {
    // Server Actions accept file uploads (athlete media); the default 1 MB cap
    // is too small for a video clip.
    serverActions: {
      bodySizeLimit: '8mb',
    },
  },

  // Next's `headers` hook is typed as returning a promise. There is nothing to
  // await here, so it returns a resolved one rather than being declared `async`
  // — which would trip `require-await`.
  headers() {
    return Promise.resolve([
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), interest-cohort=()',
          },
          // HSTS is set here rather than at the edge so it travels with the app
          // to any host. Vercel terminates TLS, so this is always over HTTPS.
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
        ],
      },
    ]);
  },
};

export default nextConfig;
