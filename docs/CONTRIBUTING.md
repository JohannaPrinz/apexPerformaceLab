# Contributing

> Status: **Active** · Last updated: 2026-08-02

## Contents

1. [Prerequisites](#1-prerequisites)
2. [Setup](#2-setup)
3. [Daily workflow](#3-daily-workflow)
4. [Git workflow](#4-git-workflow)
5. [Commit convention](#5-commit-convention)
6. [Automated gates](#6-automated-gates)
7. [Code standards](#7-code-standards)
8. [Where code belongs](#8-where-code-belongs)
9. [Adding a feature slice](#9-adding-a-feature-slice)
10. [Pull requests](#10-pull-requests)

---

## 1. Prerequisites

| Tool       | Version                  |
| ---------- | ------------------------ |
| Node.js    | ≥ 22                     |
| pnpm       | ≥ 10 (`corepack enable`) |
| PostgreSQL | 16+ (Docker is fine)     |
| Git        | any recent               |

## 2. Setup

```bash
pnpm install
cp .env.example .env        # Windows: copy .env.example .env
pnpm db:generate
pnpm db:migrate
pnpm dev
```

`pnpm install` runs `husky` to install the git hooks. If the repository was not
yet a git repository at install time, run `pnpm run prepare` once after
`git init` — otherwise the hooks silently do not exist.

## 3. Daily workflow

| Command                             | Purpose                                |
| ----------------------------------- | -------------------------------------- |
| `pnpm dev`                          | Run all dev tasks (web on :3000)       |
| `pnpm --filter @apex/web dev`       | Run only the web app                   |
| `pnpm typecheck`                    | TypeScript across the workspace        |
| `pnpm lint` / `pnpm lint:fix`       | ESLint                                 |
| `pnpm format` / `pnpm format:check` | Prettier                               |
| `pnpm test`                         | Vitest                                 |
| `pnpm build`                        | Production build                       |
| `pnpm db:studio`                    | Browse the database                    |
| `pnpm clean`                        | Remove build output and `node_modules` |

Turborepo caches by content hash — an unchanged package is not rebuilt.

## 4. Git workflow

**Trunk-based, short-lived branches.** `main` is always deployable.

```text
main ──●────────●────────●──►
        ╲      ╱ ╲      ╱
         ●────●   ●────●        feature branches, hours to days
```

| Branch prefix | For                          |
| ------------- | ---------------------------- |
| `feat/`       | New functionality            |
| `fix/`        | Bug fixes                    |
| `chore/`      | Tooling, dependencies        |
| `docs/`       | Documentation                |
| `refactor/`   | Behaviour-preserving changes |

```bash
git switch -c feat/athlete-roster
# work, commit
git push -u origin feat/athlete-roster
# open a PR, get a review, squash-merge
```

Rules: no direct pushes to `main`; rebase onto `main` rather than merging it in;
squash-merge so `main` reads as one commit per change; delete the branch after
merge. Long-lived branches accumulate conflicts faster than they accumulate
value.

## 5. Commit convention

[Conventional Commits](https://www.conventionalcommits.org), enforced by
commitlint ([config](../commitlint.config.mjs)).

```text
<type>(<scope>): <subject>
```

**Types:** `feat` · `fix` · `docs` · `style` · `refactor` · `perf` · `test` ·
`build` · `ci` · `chore` · `revert`

**Scopes** mirror the repository layout — workspaces (`web`, `ui`, `database`,
`auth`, `config`, `types`), feature slices (`athletes`, `training`, …) and
cross-cutting (`api`, `deps`, `release`, `repo`, `docs`, `ci`). **Add a scope to
the config when you add a package or slice**, or commitlint will reject it.

```bash
git commit -m "feat(athletes): add roster list procedure"
git commit -m "fix(auth): reject invitations after expiry"
git commit -m "chore(deps): bump prisma to 7.9"
```

Subject: imperative, lower case, no trailing period, ≤100 chars total.
Breaking changes: `feat(api)!:` plus a `BREAKING CHANGE:` footer.

## 6. Automated gates

| Hook         | Runs                                                                                     | Why there                                                                                                 |
| ------------ | ---------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| `pre-commit` | `lint-staged` → ESLint `--fix` + Prettier on staged files, `prisma format` on the schema | Fast, only touches what you staged                                                                        |
| `commit-msg` | commitlint                                                                               | Rejects a malformed message while it is still trivial to amend                                            |
| `pre-push`   | `pnpm typecheck`                                                                         | `tsc` across the workspace is too slow per commit, but catching a type error here beats catching it in CI |

Do not bypass with `--no-verify`. If a hook is wrong, fix the hook.

## 7. Code standards

**TypeScript**

- `strict` mode plus `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`.
- No `any`. Use `unknown` and narrow. `@ts-expect-error` needs a reason comment.
- Derive types from Zod schemas (`z.infer`) rather than declaring both.
- Absolute imports: `@/*` within the app, `@apex/*` across packages. No
  `../../../`.

**React**

- Server Components by default. `'use client'` only for state, effects, event
  handlers or browser APIs — and push it as far down the tree as possible.
- Name components in PascalCase, files in kebab-case.
- Props interfaces are explicit and exported when reusable.

**Styling**

- Semantic Tailwind utilities only (`bg-background`, `text-muted-foreground`).
  No raw hex, no `--brand-*` in a component.
- Compose class names with `cn()`.

**General**

- Comments explain _why_, not _what_. If the _what_ needs a comment, the code
  needs a better name.
- No dead code, no commented-out blocks — git remembers.

## 8. Where code belongs

| Code                                 | Location                                   |
| ------------------------------------ | ------------------------------------------ |
| Generic, domain-free UI primitive    | `packages/ui`                              |
| App-wide but Apex-specific component | `apps/web/src/components/<category>`       |
| Component used by one feature        | `apps/web/src/features/<slice>/components` |
| Business logic / use-case            | `apps/web/src/features/<slice>/server`     |
| Third-party SDK client               | `apps/web/src/integrations/<vendor>`       |
| Internal capability over an SDK      | `apps/web/src/services/<capability>`       |
| Anything touching SQL                | `packages/database` — nowhere else         |
| Cross-package type or schema         | `packages/types`                           |

Features do not import from each other's internals. If two slices need the same
thing, promote it upward. See
[ARCHITECTURE.md §4](./ARCHITECTURE.md#4-feature-sliced-structure).

## 9. Adding a feature slice

1. `apps/web/src/features/<slice>/` with `components/`, `hooks/`, `server/`,
   `schemas/`.
2. Add models to the Prisma schema — `organizationId` + `@@index` on every
   tenant-scoped model.
3. Write use-cases in `server/`, taking `TenantContext` as their first argument.
4. Write the router using `organizationProcedure` / `withPermission`.
5. Register it in `src/server/api/root.ts` (one line).
6. Add the slice to `scope-enum` in `commitlint.config.mjs`.
7. Add tenant isolation tests — see [TESTING.md §8](./TESTING.md#8-tenant-isolation-tests).
8. Fill in the slice's section in [PRODUCT_REQUIREMENTS.md](./PRODUCT_REQUIREMENTS.md).

## 10. Pull requests

Keep them small — a 200-line PR gets a real review; a 2,000-line PR gets an
approval.

**Checklist**

- [ ] `pnpm typecheck`, `pnpm lint`, `pnpm test` pass
- [ ] Conventional commit messages with a valid scope
- [ ] No `organizationId` accepted from client input
- [ ] Tenant-scoped queries go through the scoping helpers
- [ ] New env vars added to `.env.example` **and** `apps/web/src/env.ts`
- [ ] Docs updated when behaviour or architecture changed
- [ ] `CHANGELOG.md` updated for user-visible changes

---

**Related:** [ARCHITECTURE.md](./ARCHITECTURE.md) · [TESTING.md](./TESTING.md) ·
[SECURITY.md](./SECURITY.md) · [DEPLOYMENT.md](./DEPLOYMENT.md)
