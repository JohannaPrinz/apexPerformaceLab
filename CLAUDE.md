# Apex OS — Agent Map

Multi-tenant SaaS for performance coaching. pnpm + Turborepo monorepo;
`apps/web` (Next.js 16 App Router, React 19) is the only deployable.
Packages: `@apex/{ui,database,auth,types,domain,catalogue,config}`.

`apps/web/src/features/` holds 20 directories but only **nine built slices**,
one spike (`pose-poc`) and ten README-only placeholders. Its `README.md` marks
which is which — check there before assuming a directory contains code.

## Verify before you claim done

```bash
pnpm lint && pnpm typecheck && pnpm test     # what .husky/pre-push runs
pnpm format:check                            # CI runs this too; pre-push does not
```

Scope to one workspace with `--filter @apex/web`. Turborepo caches by content
hash, so a green run in milliseconds may be a replayed log, not a fresh check.

## Invariants — true for every task

1. **The domain decides.** Source code cites domain paragraphs as `§N`
   (246 files do). They point at [docs/domain/DOMAIN_DECISIONS.md](docs/domain/DOMAIN_DECISIONS.md)
   — the binding definitions. [DOMAIN_RULES.md](docs/domain/DOMAIN_RULES.md) is
   the _how_; DECISIONS wins in case of doubt. Read the cited § before changing
   code that carries one, and cite the § in new code that implements a rule.
2. **Never guess a value.** A missing measurement stays missing and the result
   names what is absent; Apex OS ships no reference values (§12). An invented
   norm or default is a number with the shape of evidence — refuse, and say why.
3. **Tenant scope comes from the session, never from input.** No procedure,
   action or route handler accepts `organizationId` from the caller.
4. **`@apex/database` is the only module that opens a database connection.**
5. **Commit subjects are German**, type and scope English, scope from the
   `scope-enum` allowlist in [commitlint.config.mjs](commitlint.config.mjs) —
   `feat(portal): Portalzugang eines aktivierten Athleten entziehen`. Adding a
   slice means adding its scope there. UI copy is German; code comments and
   `docs/` are English. Workflow detail:
   [CONTRIBUTING §4–§6](docs/CONTRIBUTING.md).
6. **Comments explain why, not what** — this repo's house style is a short
   rationale, including the alternative that was rejected. Match it; do not
   strip existing ones.
7. Never `--no-verify`. If a hook is wrong, fix the hook.

## Where the rest lives

`.claude/rules/` holds four path-scoped rules — server/data, UI, testing,
Prisma schema. They load by themselves when you open a file they match; you do
not need to fetch them.

Für dieses Repository `default`/`acceptEdits` verwenden, nicht Auto Mode, weil
path-scoped Rules nur über den vorgesehenen Dateizugriff zuverlässig aktiviert
werden.

Workflows are skills: **`/feature-slice`** for a new or extended vertical slice,
and **`/db-migration`**, which is explicit-only because it changes database
state.

Reference lives in `docs/` — [ARCHITECTURE](docs/ARCHITECTURE.md) ·
[API](docs/API.md) · [DATABASE](docs/DATABASE.md) · [SECURITY](docs/SECURITY.md) ·
[TESTING](docs/TESTING.md) · [DESIGN_SYSTEM](docs/DESIGN_SYSTEM.md) ·
[CONTRIBUTING](docs/CONTRIBUTING.md). Directory-local `README.md` files
(`src/features/`, `src/services/`, `src/integrations/`, most slices) hold the
conventions for that directory — read the one next to the code you are editing.

## Boundaries

`.claude/settings.local.json` is gitignored and personal; everything else under
`.claude/` is committed and shared. Do not weaken a test to make it pass, and do
not edit an already-applied migration.
