---
name: feature-slice
description: 'Create the structure of a feature slice under apps/web/src/features — a new slice directory, or filling in one of the ten that currently hold only a README. Covers the wiring a slice needs — router registered in server/api/root.ts, the index.ts public surface, the commitlint scope, and tenant-isolation tests. Use only when slice structure is being created; not for changing components, styling, copy, or a procedure or service inside a slice that already has its structure.'
---

# Building out a feature slice

For creating a slice's structure — a new directory, or a README-only
placeholder being filled in. Working inside a slice that already has its
structure does not need this; the path-scoped rules under `.claude/rules/` load
themselves as you open the files they cover. A new slice has no files to open
yet — step 2 closes that gap, and the few rules that must hold before the first
file exists are repeated here on purpose.

## 1. Settle the domain before writing code

The slice name and its boundaries are decided in
`docs/domain/DOMAIN_DECISIONS.md`, not by you.

- `apps/web/src/features/README.md` lists every directory with a **Status**
  column. "README only" means the directory is a placeholder with no code — so
  `documents`, `videos`, `insights` and seven others already have a name and an
  agreed scope. Extending one of those is not a new slice; it is filling in a
  decided one, and its README states the intended scope.
- The same file lists what is **deliberately not a slice** — `training`,
  `nutrition`, `sleep` are Modules in `packages/domain`; `analysis` and
  `performance` have no domain equivalent. Check that table before creating a
  directory.
- Note where behaviour already lives outside its named slice: files and video
  are served by `services/assets`, `athletes`, `portal` and `movement`, not by
  the `documents` and `videos` placeholders. Extend what exists rather than
  opening a second home for it.
- Read the `§` section that governs the behaviour. If the planned
  implementation conflicts with a rule in `DOMAIN_RULES.md`, stop and propose an
  alternative rather than coding around it.
- Read the slice's own `README.md` if it exists — most slices have one, and it
  records why that slice is shaped the way it is.

## 2. Before creating the first file

A path-scoped rule activates when a file it matches is opened. A new slice has
no such files, so nothing activates on its own and the first file would be
written with the rules still absent. Close that gap first.

**Open these with the Read tool before creating anything.** `reports` is the
reference slice — it is the only one carrying every category:

| Category    | Reference file                                            | Rule it activates    |
| ----------- | --------------------------------------------------------- | -------------------- |
| server      | `apps/web/src/features/reports/server/service.ts`         | `server-and-data.md` |
| server      | `apps/web/src/features/reports/server/router.ts`          | `server-and-data.md` |
| schema      | `apps/web/src/features/reports/schemas/index.ts`          | `server-and-data.md` |
| components  | `apps/web/src/features/reports/components/evaluation.tsx` | `ui.md`              |
| slice index | `apps/web/src/features/reports/index.ts`                  | `feature-surface.md` |

Storing anything? Read `packages/database/prisma/schema.prisma` as well, before
step 3 touches it.

Read enough of each file to bring its rule into context — this is rule
activation, not a code review, so do not work through them in full.

Use the Read tool. `cat`, `sed` or a heredoc reads the same bytes but matches no
path, so no rule loads and the step has done nothing.

## 3. Schema, if the feature stores anything

`organizationId` + index on every tenant-scoped model, then the
[db-migration skill](../db-migration/SKILL.md). Do not continue against a schema
you have only pushed with `db:push`.

## 4. Server

```text
features/<slice>/
  schemas/      Zod contracts — derive types with z.infer, never declare both
  server/
    service.ts  business logic; takes TenantContext first; only DB access
    router.ts   procedures on the right rung; registered in src/server/api/root.ts
    actions.ts  thin Server Action wrappers around the service
```

Create only the parts the slice actually needs.

## 5. UI

`components/` for anything this slice alone renders. The minimum that has to
hold in the first component, before `ui.md` has anything to attach to —
[ui.md](../../rules/ui.md) stays the canonical and complete set:

- **Server Components by default.** `'use client'` only for state, effects,
  event handlers or browser APIs, and pushed as far down the tree as possible.
- **Semantic tokens only** — `bg-background`, `text-muted-foreground`. No raw
  hex, no `--brand-*` in a component.
- **User-facing copy is German** — labels, `aria-label`, empty states, errors.
  Code comments stay English.
- **No authorization in a component.** It belongs in the procedure; a hidden
  button is not an access control.
- **No `@apex/database` in a component.** Data access lives in `server/`.

## 6. Public surface

`index.ts` exports what other modules may use — components and types. Never
`service.ts` (a second caller would skip the procedure's authorization) and
never `router.ts` (it is registered once in `root.ts`, which is what keeps the
API surface fully described by one file). Document non-obvious exports, as
`features/athletes/index.ts` does.

## 7. Register and wire

- Add the router to `src/server/api/root.ts`.
- Add the slice name to `scope-enum` in `commitlint.config.mjs`, or every commit
  touching it is rejected.
- New env var? `.env.example` **and** `apps/web/src/env.ts`.

## 8. Tests

Colocated, and for a new tenant-scoped router the isolation suite from
[testing.md](../../rules/testing.md) is mandatory — cross-tenant read, write,
`NOT_FOUND` on a foreign id, missing organization, role denials.

## Done when

- [ ] The behaviour matches the cited `§`, and new code cites it
- [ ] No `organizationId` in any input schema; filters go through the scoping helpers
- [ ] Nothing imports another slice's internals; no `@apex/database` in a component
- [ ] Router registered, scope added to commitlint, env vars in both places
- [ ] Isolation tests present for a tenant-scoped router
- [ ] `pnpm lint && pnpm typecheck && pnpm test` pass
- [ ] Directory `README.md` still describes what the directory now contains
