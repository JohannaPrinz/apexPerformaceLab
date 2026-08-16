import { PrismaPg } from '@prisma/adapter-pg';

import { SYSTEM_EXERCISES, SYSTEM_MEASUREMENT_TYPES } from '@apex/domain';

import { PrismaClient } from '../generated/prisma/client';
import '../src/load-env';

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

  /**
   * The system measurement type catalogue (§12).
   *
   * `organizationId` is null: these belong to no workspace and every workspace
   * inherits them. The definitions live in `@apex/domain` — which quantities
   * the platform knows how to record is a professional statement, reviewable in
   * a diff, not data that accumulates in a seed file.
   *
   * Matched on `(key, organizationId: null)` rather than upserted on a unique
   * key: system-wide uniqueness is a *partial* index
   * (`WHERE "organizationId" IS NULL`), which Prisma's `upsert` cannot target.
   */
  let created = 0;
  for (const type of SYSTEM_MEASUREMENT_TYPES) {
    const existing = await db.measurementType.findFirst({
      where: { key: type.key, organizationId: null },
      select: { id: true },
    });

    if (existing) continue;

    await db.measurementType.create({
      data: {
        key: type.key,
        name: type.name,
        unit: type.unit,
        valueType: type.valueType,
        category: type.category,
        // No reference range: a single global range identical for a 25-year-old
        // runner and a 55-year-old recreational athlete produces "outside
        // normal" markers that do not hold up.
      },
    });
    created++;
  }

  /**
   * The system exercise catalogue.
   *
   * Same arrangement as the measurement types above, for the same reason: a
   * null `organizationId` marks a system row that every workspace inherits and
   * none may edit, and system-wide uniqueness is a partial index that `upsert`
   * cannot target.
   *
   * `createdByCoachId` stays null — a system exercise has no author, and the
   * database CHECK added with this migration enforces that pairing.
   *
   * Descriptions and muscle groups are deliberately not seeded. Writing
   * execution instructions would be authoring coaching content, which is a
   * professional decision, not a catalogue one.
   */
  let exercisesCreated = 0;
  let exercisesUpdated = 0;
  for (const exercise of SYSTEM_EXERCISES) {
    const existing = await db.exercise.findFirst({
      where: { key: exercise.key, organizationId: null },
      select: { id: true, name: true, canonicalName: true },
    });

    // Matched on the key, then brought in line with the catalogue. The names
    // are corrected rather than skipped: the migration backfilled
    // `canonicalName` from the old English `name`, and this is where `name`
    // becomes the German one it should have been.
    if (existing) {
      if (existing.name !== exercise.name || existing.canonicalName !== exercise.canonicalName) {
        await db.exercise.update({
          where: { id: existing.id },
          data: { name: exercise.name, canonicalName: exercise.canonicalName },
        });
        exercisesUpdated++;
      }
      continue;
    }

    await db.exercise.create({
      data: {
        key: exercise.key,
        name: exercise.name,
        canonicalName: exercise.canonicalName,
        // Nothing is classified yet: three vocabularies are still empty, and
        // claiming a muscle or a category would invent what the import supplies.
        unilateral: false,
      },
    });
    exercisesCreated++;
  }

  console.info(
    `Seeded organization "${organization.slug}" with owner ${owner.email} ` +
      `and coach profile ${coach.id}. ` +
      `Measurement catalogue: ${created} added, ${SYSTEM_MEASUREMENT_TYPES.length} total. ` +
      `Exercise catalogue: ${exercisesCreated} added, ${exercisesUpdated} updated, ${SYSTEM_EXERCISES.length} total.`,
  );

  await db.$disconnect();
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
