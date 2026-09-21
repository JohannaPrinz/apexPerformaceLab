---
name: db-migration
description: Run the Apex OS schema-migration workflow — generate and apply a Prisma migration, append the raw-SQL invariants, and verify there is no drift. Explicit-only, because it writes to the developer's database and adds a file to the migration history that must never be edited afterwards.
disable-model-invocation: true
---

> Invoke with `/db-migration`. This workflow changes database state, so it is
> never selected automatically. If you are editing `schema.prisma` without it,
> the conventions in [prisma-schema.md](../../rules/prisma-schema.md) still
> apply — but do not run `db:migrate` outside this workflow.

# Creating a migration

Schema conventions are in [prisma-schema.md](../../rules/prisma-schema.md) and
are not repeated here. Prisma is the only migration system; do not add a second.

## Workflow

**1. Edit `packages/database/prisma/schema.prisma`.**

**2. Check what is already applied** before generating anything:

```bash
pnpm --filter @apex/database exec prisma migrate status
```

**3. Generate and apply:**

```bash
pnpm db:migrate --name <snake_case_name>
```

The `db:*` scripts call `prisma` directly and pass flags through. They were once
wrapped in `dotenv -e ../../.env --`, which silently swallowed `--name` and
dropped the CLI into an interactive prompt. Do not reintroduce that wrapper —
env loading belongs in `packages/database/src/load-env.ts`.

**4. Append the raw-SQL invariants** to the generated `migration.sql` whenever
the migration touches a constrained table. Copy the canonical text from the
`INVARIANTS REQUIRING RAW SQL` block at the end of `schema.prisma`.

They must live _inside_ the migration file, after the generated DDL. Prisma
replays every migration into a shadow database to compute the next diff; a
constraint applied out-of-band is invisible to that replay and Prisma then
reports drift on every future migration.

**5. Regenerate the client** if anything downstream reads the new shape:

```bash
pnpm db:generate
```

**6. Confirm there is no drift:**

```bash
pnpm --filter @apex/database exec prisma migrate diff \
  --from-config-datasource --to-schema prisma/schema.prisma --exit-code
```

Exit `0` = clean, `2` = drift. Do not move on from a `2`.

## Hard constraints

- **Never edit an applied migration.** Write a new one.
- `db:push` is local prototyping only — it produces no history, so nothing you
  verified that way is reproducible on another machine or in production.
- **Destructive changes ship in two steps**: add the new column and backfill
  first, drop the old one in a later release. A single-step rename breaks every
  instance still running the previous deploy.
- Production migrations run deliberately and alone
  (`pnpm --filter @apex/database db:migrate:deploy`), never as part of a build —
  Vercel builds run concurrently, and DDL in a build step means N concurrent
  migrations against one database.

## Done when

- [ ] `prisma migrate status` reports the new migration applied
- [ ] Raw-SQL invariants appended inside `migration.sql`, not run separately
- [ ] `prisma migrate diff … --exit-code` exits `0`
- [ ] `pnpm typecheck && pnpm test` pass against the regenerated client
- [ ] `docs/DATABASE.md` updated if the schema, an invariant or a convention changed
- [ ] Committed as `chore(database):` or `feat(<slice>):` with a German subject
