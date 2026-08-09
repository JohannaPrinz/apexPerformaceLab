import { defineConfig } from 'prisma/config';

import './src/load-env';

/**
 * Prisma CLI configuration (Prisma 7).
 *
 * Environment loading happens in `./src/load-env`, imported for its side effect
 * above. It used to be a `dotenv-cli` prefix on each `db:*` script, but that
 * wrapper swallowed flags meant for Prisma — see the comment in that file. The
 * `.env` location is still declared in exactly one place; it is just a module
 * now instead of a repeated argument. CI needs no change: the loader leaves
 * platform-provided variables alone and skips a missing file.
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
