import { PrismaPg } from '@prisma/adapter-pg';

import { PrismaClient } from '../generated/prisma/client';

/**
 * Development seed.
 *
 * Creates the smallest complete chain a fresh clone needs in order to author
 * anything:
 *
 *   User → Coach → Membership → Organization
 *
 * The Coach is not optional decoration. Every domain object carries a
 * mandatory `createdByCoachId` or `authorCoachId` (§6) — authorship is part of
 * the model, not metadata. Without a Coach row there is nothing for those
 * columns to reference, so the first athlete or case could not be created at
 * all.
 *
 * Coach is deliberately *not* tenant-scoped: a coach may work alone, in one
 * practice, or for several. Affiliation is the Membership, which is why the two
 * are seeded as separate steps rather than one nested write.
 *
 * Idempotent — safe to run repeatedly.
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

  const coach = await db.coach.upsert({
    where: { userId: owner.id },
    update: {},
    create: {
      userId: owner.id,
      displayName: 'Demo Owner',
      professionalTitle: 'Performance Coach',
    },
  });

  console.info(
    `Seeded organization "${organization.slug}" with owner ${owner.email} ` +
      `and coach profile ${coach.id}.`,
  );

  await db.$disconnect();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
