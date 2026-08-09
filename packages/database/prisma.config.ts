import { defineConfig } from 'prisma/config';

/**
 * Prisma CLI configuration (Prisma 7).
 *
 * Environment loading is handled by `dotenv-cli` in the package scripts rather
 * than by importing `dotenv/config` here — one mechanism, and it keeps the
 * `.env` file location (`../../.env`, the repo root) declared in exactly one
 * place. `db:migrate:deploy` intentionally omits it: CI supplies real env vars.
 *
 * `datasource.url` here is used by CLI commands only — migrate, db push, studio,
 * introspection. It deliberately prefers `DIRECT_URL`: schema migrations must
 * bypass a connection pooler (PgBouncer/Supabase/Neon), which cannot handle the
 * session-level statements Prisma Migrate issues.
 *
 * The *runtime* connection is separate and pooled — see `src/client.ts`.
 */
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  datasource: {
    url: process.env['DIRECT_URL'] ?? process.env['DATABASE_URL'],
  },
});
