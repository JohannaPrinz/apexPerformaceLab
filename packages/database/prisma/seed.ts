import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../generated/prisma/client';

/**
 * Development seed.
 *
 * Creates one organization and one owner so a fresh clone has something to log
 * into. Idempotent — safe to run repeatedly.
 *
 * No password is set here: sign in through the normal auth flow, or extend this
 * script once the credential provider is finalised.
 */
async function main() {
  const connectionString = process.env['DIRECT_URL'] ?? process.env['DATABASE_URL'];

  if (!connectionString) {
    throw new Error('DATABASE_URL is not set — cannot seed.');
  }

  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString }) });

  const organization = await db.organization.upsert({
    where: { slug: 'apex-demo' },
    update: {},
    create: {
      name: 'Apex Demo Coaching',
      slug: 'apex-demo',
    },
  });

  const owner = await db.user.upsert({
    where: { email: 'owner@apex.local' },
    update: {},
    create: {
      name: 'Demo Owner',
      email: 'owner@apex.local',
      emailVerified: true,
    },
  });

  await db.membership.upsert({
    where: {
      userId_organizationId: { userId: owner.id, organizationId: organization.id },
    },
    update: { role: 'owner' },
    create: {
      userId: owner.id,
      organizationId: organization.id,
      role: 'owner',
    },
  });

  console.info(`Seeded organization "${organization.slug}" with owner ${owner.email}.`);

  await db.$disconnect();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
