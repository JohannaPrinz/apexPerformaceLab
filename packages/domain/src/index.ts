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
 *
 * What does **not** belong here: database access (that is `@apex/database`),
 * transport shapes (`@apex/types`), and anything that needs a request context.
 * This package is pure, which is what makes the invariants testable in
 * isolation.
 *
 * The registry and the system measurement type catalogue exist today. The
 * invariants arrive with the objects they constrain — writing them for unbuilt
 * features would produce rules nobody can check against a real screen.
 */
export * from './measurement-types';
export * from './modules';
export * from './modules/configuration';
export * from './modules/context';
export * from './modules/templates';
