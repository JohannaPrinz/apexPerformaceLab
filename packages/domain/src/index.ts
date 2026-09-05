/**
 * Domain logic — the rules neither the database nor the interface can hold.
 *
 * Three kinds of thing belong here, and nothing else:
 *
 * 1. **The module registry** (§11). A module is a string key precisely so that
 *    adding one is a code change rather than a migration.
 * 2. **Invariants SQL cannot express.** Every Assessment has at least one
 *    Module; every Insight records at least one piece of evidence; every
 *    Recommendation references at least one Insight; a published Report and its
 *    Insights are immutable; a Measurement's value column matches its type; a
 *    Video Annotation only attaches to a Video. The schema names each of these
 *    and says they live here — see the `INVARIANTS` block at the end of
 *    `packages/database/prisma/schema.prisma`.
 * 3. **Module behaviour** — each module's validation schema, its measurement
 *    types and its report renderer, as those modules are built.
 * 4. **The catalogues** — measurement types and exercises. Which quantities the
 *    platform knows how to record, and which movements it ships, are
 *    professional statements under review in one diff, not seed data.
 *
 * What does **not** belong here: database access (that is `@apex/database`),
 * transport shapes (`@apex/types`), and anything that needs a request context.
 * This package is pure, which is what makes the invariants testable in
 * isolation.
 *
 * The registry, both catalogues, the module configuration contract and the
 * rules around it exist today. The remaining invariants arrive with the objects
 * they constrain — writing them for unbuilt features would produce rules nobody
 * can check against a real screen.
 */
export * from './athletes/age';
export * from './athletes/bleeding';
export * from './athletes/body-fat';
export * from './athletes/trend-cards';
export * from './athletes/sex';
export * from './exercises';
// Exported from the root rather than the exercises barrel: `import.ts` reads
// `exerciseSchema` from that barrel, so re-exporting it there would close a
// cycle. The root is the one place that can name it without one.
export * from './exercises/import';
export * from './measurement-types';
export * from './assessments/status';
export * from './assessments/report-draft';
export * from './assessments/energy';
export * from './assessments/percentile';
export * from './assessments/report-media';
export * from './assessments/report-snapshot';
export * from './assessments/strength-standards';
export * from './assessments/tendency';
export * from './assessments/summary';
export * from './modules';
export * from './modules/comparison';
export * from './modules/self-comparison';
export * from './sharing';
export * from './movement';
export * from './modules/configuration';
export * from './modules/configuration-change';
export * from './modules/context';
export * from './modules/readiness';
export * from './modules/status';
export * from './modules/templates';
