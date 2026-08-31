import { createEnv } from '@t3-oss/env-nextjs';
import { z } from 'zod';

/**
 * Typed, validated environment.
 *
 * The point is fail-fast: a missing `DATABASE_URL` should break the build with
 * a named error, not produce a runtime `undefined` three layers deep in the
 * data layer. Importing this module from `next.config.ts` moves that check to
 * build time, which means a misconfigured Vercel project fails in CI rather
 * than in production.
 *
 * `server` values are stripped from the client bundle; anything in `client`
 * must be prefixed `NEXT_PUBLIC_` and is public by definition.
 */
export const env = createEnv({
  server: {
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),

    DATABASE_URL: z.url(),
    DIRECT_URL: z.url().optional(),

    BETTER_AUTH_SECRET: z.string().min(32, 'Generate one with: openssl rand -base64 32'),
    BETTER_AUTH_URL: z.url().optional(),

    GITHUB_CLIENT_ID: z.string().optional(),
    GITHUB_CLIENT_SECRET: z.string().optional(),
    GOOGLE_CLIENT_ID: z.string().optional(),
    GOOGLE_CLIENT_SECRET: z.string().optional(),

    /**
     * Supabase Storage — the one object store.
     *
     * Optional so a workspace without it still runs: an assessment is recorded,
     * an analysis published and a link shared exactly as before, simply without
     * pictures. The adapter answers "not configured" rather than throwing, and
     * every screen that could show a file leaves it out.
     *
     * The **service role** key, not the anon key: these reads and writes happen
     * on the server after the app has decided who may see what, and the bucket
     * itself is private. An anon key would put that decision in the browser.
     */
    SUPABASE_URL: z.url().optional(),
    SUPABASE_SERVICE_ROLE_KEY: z.string().optional(),
    /** One private bucket holds all three areas, separated by path. */
    SUPABASE_STORAGE_BUCKET: z.string().default('apex-os'),

    /**
     * The shared secret the scheduled sweep authenticates with.
     *
     * Optional, and the sweep refuses everything without it: an endpoint that
     * deleted on request would let anyone who found the URL clear a coach's
     * working material.
     */
    CRON_SECRET: z.string().optional(),

    RESEND_API_KEY: z.string().optional(),
    EMAIL_FROM: z.string().optional(),

    TRIGGER_SECRET_KEY: z.string().optional(),
    TRIGGER_PROJECT_ID: z.string().optional(),
  },

  client: {
    NEXT_PUBLIC_APP_URL: z.url(),
    NEXT_PUBLIC_POSTHOG_KEY: z.string().optional(),
    NEXT_PUBLIC_POSTHOG_HOST: z.url().optional(),
    NEXT_PUBLIC_ENABLE_ANALYTICS: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
  },

  /**
   * Next.js inlines `process.env.NEXT_PUBLIC_*` at build time, so client
   * variables have to be destructured literally — a dynamic lookup would be
   * replaced with `undefined`.
   */
  runtimeEnv: {
    NODE_ENV: process.env.NODE_ENV,
    DATABASE_URL: process.env.DATABASE_URL,
    DIRECT_URL: process.env.DIRECT_URL,
    BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
    BETTER_AUTH_URL: process.env.BETTER_AUTH_URL,
    GITHUB_CLIENT_ID: process.env.GITHUB_CLIENT_ID,
    GITHUB_CLIENT_SECRET: process.env.GITHUB_CLIENT_SECRET,
    GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
    SUPABASE_URL: process.env.SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_STORAGE_BUCKET: process.env.SUPABASE_STORAGE_BUCKET,
    CRON_SECRET: process.env.CRON_SECRET,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    EMAIL_FROM: process.env.EMAIL_FROM,
    TRIGGER_SECRET_KEY: process.env.TRIGGER_SECRET_KEY,
    TRIGGER_PROJECT_ID: process.env.TRIGGER_PROJECT_ID,
    NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
    NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
    NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    NEXT_PUBLIC_ENABLE_ANALYTICS: process.env.NEXT_PUBLIC_ENABLE_ANALYTICS,
  },

  /**
   * Docker/CI image builds have no secrets. `SKIP_ENV_VALIDATION=1` lets those
   * builds through; it is never set in a real deployment.
   */
  skipValidation: Boolean(process.env['SKIP_ENV_VALIDATION']),
  emptyStringAsUndefined: true,
});
