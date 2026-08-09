import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

/**
 * Loads the monorepo's root `.env` into `process.env` for the Prisma CLI and
 * the seed script.
 *
 * This replaces the `dotenv -e ../../.env --` prefix the `db:*` scripts used to
 * carry. That wrapper silently swallowed flags meant for Prisma:
 * `pnpm db:migrate --name init` lost `--name` and dropped the CLI into an
 * interactive prompt, and `prisma migrate diff --from-… --to-…` lost both. The
 * loss is invisible — the command simply behaves as if the flag were never
 * typed.
 *
 * Resolved from `import.meta.url` rather than `process.cwd()`: the Prisma CLI,
 * `tsx` and Turborepo do not agree on the working directory, but the path from
 * this file to the repository root is fixed.
 *
 * `process.loadEnvFile` leaves already-set variables untouched, which is what
 * production needs: on Vercel and in CI the platform injects the real values and
 * no `.env` file exists at all — hence the `existsSync` guard, since the
 * function throws `ENOENT` rather than returning quietly.
 *
 * Mirrors `apps/web/src/load-env.ts`, which does the same for Next.js.
 */
const envPath = fileURLToPath(new URL('../../../.env', import.meta.url));

if (existsSync(envPath)) {
  process.loadEnvFile(envPath);
}
