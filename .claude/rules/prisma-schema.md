---
paths:
  - 'packages/database/prisma/**/*.{prisma,sql,ts}'
---

# Prisma schema rules

Reference: [docs/DATABASE.md §4–§5](../../docs/DATABASE.md).

**Prisma is the only migration system in this repository.** Do not introduce a
second one (Supabase CLI included) — check the current state with
`prisma migrate status`, which only reads.

## Editing the schema is not migrating it

Changing `schema.prisma` is ordinary work. **Applying that change is not**:
`pnpm db:migrate` writes to the developer's database and adds a file to the
migration history that must never be edited afterwards, so a run nobody asked
for can only be undone by a further migration.

Do not run `db:migrate`, `db:push` or `db:migrate:deploy` as a step of ordinary
schema work. They belong to the explicit `/db-migration` workflow, which also
carries the raw-SQL invariants and the drift check below. Edit the schema, then
tell the user the migration is the next step and let them start it.

## Model conventions

- `@id @default(cuid(2))` — sortable and safe in a URL.
- `@@map("snake_case_plural")` on the table; **no `@map` on fields** — columns
  stay camelCase, so raw SQL must quote them.
- `createdAt` / `updatedAt` on every model.
- `organizationId` plus an index on every tenant-scoped model. A composite index
  satisfies this when `organizationId` is its **first** column; a separate
  single-column index beside it is dead weight.
- `onDelete: Cascade` on tenant relations.
- JSON only for genuinely unstructured data — anything queried or validated gets
  promoted to a real column.
- `///` doc comments on non-obvious fields; they reach the generated client.

## The two deliberate exceptions — do not "fix" them

1. Pure join tables (`InsightMeasurement`, `InsightAsset`, `InsightNote`,
   `RecommendationInsight`) carry no `organizationId`: every path reaches them
   through an already-scoped parent.
2. `Coach` and `CoachCredential` are not tenant-scoped at all (§6). A coach is
   organisation-independent; affiliation is a `Membership`.

## Invariants Prisma cannot express

CHECK constraints and partial unique indexes (9 objects) live **inside
`migration.sql`, appended after the generated DDL** — never run separately
against the database, or Prisma's shadow-database replay will not see them and
will report drift forever. The canonical text is the
`INVARIANTS REQUIRING RAW SQL` block at the end of `schema.prisma`; copy from
there.

Invariants SQL cannot express either (an Assessment has ≥1 Module, an Insight
records evidence, a published Report is immutable, …) are enforced in
`packages/domain`.
