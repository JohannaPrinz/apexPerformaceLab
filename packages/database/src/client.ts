import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../generated/prisma/client';

/**
 * Prisma client singleton.
 *
 * Two things matter here:
 *
 * 1. **The global cache.** Next.js dev-mode hot reloading re-evaluates modules
 *    on every change. Without caching the instance on `globalThis`, each reload
 *    opens a fresh connection pool until Postgres refuses new connections.
 *
 * 2. **The driver adapter.** Prisma 7 connects through a driver adapter rather
 *    than a bundled Rust engine. `@prisma/adapter-pg` is used with the *pooled*
 *    `DATABASE_URL`; migrations use `DIRECT_URL` via `prisma.config.ts`.
 */

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClientInstance | undefined;
};

function createPrismaClient() {
  const connectionString = process.env['DATABASE_URL'];

  if (!connectionString) {
    throw new Error(
      'DATABASE_URL is not set. Copy .env.example to .env and configure your database.',
    );
  }

  const adapter = new PrismaPg({ connectionString });

  return new PrismaClient({
    adapter,
    log: process.env['NODE_ENV'] === 'development' ? ['query', 'warn', 'error'] : ['warn', 'error'],
  });
}

export type PrismaClientInstance = ReturnType<typeof createPrismaClient>;

export const db: PrismaClientInstance = globalForPrisma.prisma ?? createPrismaClient();

if (process.env['NODE_ENV'] !== 'production') {
  globalForPrisma.prisma = db;
}

export { PrismaClient };
