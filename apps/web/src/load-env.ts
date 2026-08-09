import path from 'node:path';

import { config as loadDotenv } from 'dotenv';

/**
 * Loads the monorepo's root `.env` into `process.env`.
 *
 * Next.js only reads `.env` files from the application directory, but this
 * repository keeps a single root `.env` so that `apps/web` and the Prisma CLI
 * in `packages/database` cannot drift apart. This module bridges that gap.
 *
 * It is a side-effect module imported *before* `./env` in `next.config.ts` —
 * ESM evaluates sibling imports in declaration order, so the variables exist by
 * the time the Zod schema validates them. A plain `loadDotenv()` call inside
 * `next.config.ts` would not work: import hoisting runs `./src/env` first.
 *
 * `override: false` is deliberate — on Vercel the platform injects real
 * environment variables and no `.env` file exists. Should one ever be present,
 * the platform's values must still win.
 */
loadDotenv({
  path: path.resolve(process.cwd(), '../../.env'),
  override: false,
  quiet: true,
});
