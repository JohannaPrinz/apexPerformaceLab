<div align="center">

# Apex OS

**The operating system for performance coaching.**

A multi-tenant SaaS platform for coaches, athletes and teams.

[![CI](https://github.com/JohannaPrinz/apexPerformaceLab/actions/workflows/ci.yml/badge.svg)](https://github.com/JohannaPrinz/apexPerformaceLab/actions/workflows/ci.yml)
[![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=nextdotjs&logoColor=white)](https://nextjs.org)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=black)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Prisma](https://img.shields.io/badge/Prisma-PostgreSQL-2D3748?logo=prisma&logoColor=white)](https://www.prisma.io)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind-v4-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com)
[![License](https://img.shields.io/badge/license-UNLICENSED-lightgrey)](#license)

</div>

---

> [!IMPORTANT]
> **This is a foundation release (v0.1.0).** It contains the architecture,
> tooling and design system — **no product features yet**, deliberately. The
> goal is a repository that a new engineer can clone, run and deploy on day
> one, and that a growing product can be built into without restructuring.

## Contents

- [What this is](#what-this-is)
- [Tech stack](#tech-stack)
- [Architecture](#architecture)
- [Getting started](#getting-started)
- [Development workflow](#development-workflow)
- [Git workflow](#git-workflow)
- [Environment variables](#environment-variables)
- [Deployment](#deployment)
- [Documentation](#documentation)
- [Roadmap](#roadmap)

---

## What this is

Apex OS is being built as a multi-tenant B2B SaaS platform: coaching
organizations sign up, invite coaches and athletes, and run their training,
nutrition, scheduling and performance analysis in one place.

Three decisions shape everything in this repository:

1. **Multi-tenancy is structural, not additive.** Organizations, memberships
   and session-derived tenant scoping exist from the first commit. Retrofitting
   tenancy is the single most expensive migration a B2B SaaS can face.
2. **Types flow end to end.** Prisma → tRPC → React Query → component props.
   No hand-written API clients, no `any` at a boundary.
3. **Features are vertical slices.** Each domain owns its UI, server logic and
   schemas in one directory, and can be deleted in one commit.

## Tech stack

| Layer          | Technology                                                                                                   |
| -------------- | ------------------------------------------------------------------------------------------------------------ |
| **Framework**  | [Next.js 16](https://nextjs.org) (App Router), [React 19](https://react.dev)                                 |
| **Language**   | [TypeScript](https://www.typescriptlang.org) — strict, `noUncheckedIndexedAccess`                            |
| **Styling**    | [Tailwind CSS v4](https://tailwindcss.com), [shadcn/ui](https://ui.shadcn.com), [Lucide](https://lucide.dev) |
| **API**        | [tRPC 11](https://trpc.io) + Next.js Server Actions                                                          |
| **Database**   | [PostgreSQL](https://www.postgresql.org) + [Prisma](https://www.prisma.io)                                   |
| **Auth**       | [Better Auth](https://better-auth.com) — self-hosted, organization-aware                                     |
| **Validation** | [Zod](https://zod.dev)                                                                                       |
| **Storage**    | [Cloudflare R2](https://developers.cloudflare.com/r2/)                                                       |
| **Email**      | [Resend](https://resend.com)                                                                                 |
| **Jobs**       | [Trigger.dev](https://trigger.dev)                                                                           |
| **Analytics**  | [PostHog](https://posthog.com)                                                                               |
| **Monorepo**   | [pnpm workspaces](https://pnpm.io/workspaces) + [Turborepo](https://turbo.build)                             |
| **Testing**    | [Vitest](https://vitest.dev) + Testing Library                                                               |
| **Hosting**    | [Vercel](https://vercel.com)                                                                                 |

## Architecture

### Repository layout

```text
apex-os/
├── apps/
│   └── web/                    # Next.js application — the only deployable
│       └── src/
│           ├── app/            # App Router: routes, layouts, route handlers
│           ├── components/     # App-wide components, by category
│           ├── features/       # Vertical feature slices
│           ├── server/         # tRPC context, procedures, root router
│           ├── services/       # Internal capabilities (storage, mail, …)
│           ├── integrations/   # Third-party SDK clients
│           ├── trpc/           # Server caller & client provider
│           ├── lib/            # Shared utilities
│           └── env.ts          # Zod-validated environment
├── packages/
│   ├── ui/                     # Design system: tokens, themes, primitives
│   ├── database/               # Prisma schema, client, tenant helpers
│   ├── auth/                   # Better Auth server/client, permissions
│   ├── types/                  # Shared domain types & Zod primitives
│   └── config/                 # ESLint & TypeScript presets
└── docs/                       # Architecture, product & process documentation
```

### Layering

Dependencies point downward only:

```text
UI              app/ · components/ · features/*/components
   ↓
Business logic  features/*/server · server/api/routers
   ↓
Services        services/ · integrations/
   ↓
Data            @apex/database — the only SQL boundary
```

The UI layer never imports Prisma. Nothing outside `@apex/database` opens a
database connection.

### Feature slices

```text
features/<slice>/
├── components/    # UI local to this feature
├── hooks/         # client-side state & data hooks
├── server/        # tRPC router, use-cases, authorization
└── schemas/       # Zod contracts
```

Slice names follow the domain model in
[docs/domain/DOMAIN_DECISIONS.md](docs/domain/DOMAIN_DECISIONS.md):

| Group                  | Slices                                                                            |
| ---------------------- | --------------------------------------------------------------------------------- |
| Domain core            | `athletes` · `cases` · `assessments` · `insights` · `recommendations` · `reports` |
| Supporting objects     | `documents` · `videos` · `programs` · `notes` · `appointments`                    |
| Cross-cutting surfaces | `timeline` · `portal`                                                             |
| Frame                  | `auth` · `dashboard` · `settings`                                                 |

Two sub-areas sit inside the slice that owns their lifecycle:
`assessments/measurements` and `reports/sharing`.

Assessment modules (`running`, `lactate`, `nutrition`, …) are **not** slices —
they are data plus a registry in `packages/domain`, so adding a module never
touches `features/`.

Features do not import from each other's internals — permitted dependencies go
exclusively through a slice's public `index.ts`, and shared code is promoted
upward. That is what keeps the dependency graph a tree.

### Multi-tenancy

Shared database, shared schema, `organizationId` discriminator. The tenant
scope is derived from `session.activeOrganizationId` and **never** from client
input; `organizationProcedure` verifies membership and injects a
`TenantContext` that the data helpers consume.

Full detail and the rejected alternatives:
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md).

## Getting started

### Prerequisites

- **Node.js ≥ 22**
- **pnpm ≥ 10** — `corepack enable`
- **PostgreSQL 16+** — Docker is fine

### Installation

```bash
git clone <repository-url> apex-os
cd apex-os
pnpm install
```

### Database

```bash
docker run --name apex-postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=apex_os \
  -p 5432:5432 -d postgres:16
```

### Environment

```bash
cp .env.example .env          # Windows: copy .env.example .env
```

The defaults already point at the container above. Generate an auth secret:

```bash
openssl rand -base64 32       # → BETTER_AUTH_SECRET
```

### Run

```bash
pnpm db:generate              # generate the Prisma client
pnpm db:migrate               # apply the schema
pnpm db:seed                  # optional: development organization
pnpm dev                      # http://localhost:3000
```

> [!NOTE]
> Git hooks are installed by `pnpm install` via Husky. If the directory was not
> yet a git repository at install time, run `pnpm run prepare` once after
> `git init` — otherwise the hooks silently do not exist.

## Development workflow

| Command                             | Description                                   |
| ----------------------------------- | --------------------------------------------- |
| `pnpm dev`                          | Start all dev tasks (web on `:3000`)          |
| `pnpm build`                        | Production build of every workspace           |
| `pnpm typecheck`                    | TypeScript across the monorepo                |
| `pnpm lint` · `pnpm lint:fix`       | ESLint                                        |
| `pnpm format` · `pnpm format:check` | Prettier                                      |
| `pnpm test`                         | Vitest                                        |
| `pnpm clean`                        | Remove build output and `node_modules`        |
| `pnpm db:generate`                  | Regenerate the Prisma client                  |
| `pnpm db:migrate`                   | Create & apply a migration                    |
| `pnpm db:push`                      | Push schema without a migration (prototyping) |
| `pnpm db:studio`                    | Browse the database                           |
| `pnpm db:seed`                      | Seed development data                         |

Scope any command to one workspace with `--filter`:

```bash
pnpm --filter @apex/web dev
pnpm --filter @apex/database db:studio
```

Turborepo caches by content hash — unchanged packages are not rebuilt.

### Code standards

Enforced automatically, not by convention:

| Gate           | When       | What                                        |
| -------------- | ---------- | ------------------------------------------- |
| lint-staged    | pre-commit | ESLint `--fix` + Prettier on staged files   |
| commitlint     | commit-msg | Conventional Commits with a scope allowlist |
| `tsc --noEmit` | pre-push   | Typecheck across the workspace              |

TypeScript runs in strict mode with `noUncheckedIndexedAccess` and
`exactOptionalPropertyTypes`. Imports are absolute — `@/*` inside the app,
`@apex/*` across packages.

## Git workflow

Trunk-based development with short-lived branches. `main` is always deployable.

```bash
git switch -c feat/athlete-roster
git commit -m "feat(athletes): add roster list procedure"
git push -u origin feat/athlete-roster
# open a PR → review → squash-merge → delete branch
```

**Branch prefixes:** `feat/` · `fix/` · `chore/` · `docs/` · `refactor/`

**Commit format:** `<type>(<scope>): <subject>` — Conventional Commits, with
scopes mirroring the repository layout (`web`, `ui`, `database`, `auth`,
`types`, `config`, feature slices, plus `api`, `deps`, `repo`, `docs`, `ci`).
Adding a package or slice means adding its scope to
[`commitlint.config.mjs`](commitlint.config.mjs).

```text
feat(athletes): add roster list procedure
fix(auth): reject invitations after expiry
chore(deps): bump prisma to 7.9
```

No direct pushes to `main`. Rebase rather than merge `main` in. Squash on merge.

Full detail: [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md).

## Environment variables

Every variable is documented in [`.env.example`](.env.example) and validated by
[`apps/web/src/env.ts`](apps/web/src/env.ts) — a missing or malformed required
variable fails the **build**, rather than surfacing as `undefined` at runtime.

| Variable                                    | Required | Description                              |
| ------------------------------------------- | -------- | ---------------------------------------- |
| `DATABASE_URL`                              | ✅       | Pooled Postgres connection (runtime)     |
| `DIRECT_URL`                                | ✅       | Unpooled connection (migrations)         |
| `BETTER_AUTH_SECRET`                        | ✅       | ≥32 random bytes, unique per environment |
| `BETTER_AUTH_URL`                           | ✅       | Full deployment URL                      |
| `NEXT_PUBLIC_APP_URL`                       | ✅       | Full deployment URL                      |
| `GITHUB_CLIENT_ID` / `_SECRET`              | ➖       | OAuth — omit to disable                  |
| `GOOGLE_CLIENT_ID` / `_SECRET`              | ➖       | OAuth — omit to disable                  |
| `R2_*`                                      | ➖       | Cloudflare R2 storage                    |
| `RESEND_API_KEY` · `EMAIL_FROM`             | ➖       | Transactional email                      |
| `TRIGGER_SECRET_KEY` · `TRIGGER_PROJECT_ID` | ➖       | Background jobs                          |
| `NEXT_PUBLIC_POSTHOG_KEY` / `_HOST`         | ➖       | Analytics                                |

> [!WARNING]
> `NEXT_PUBLIC_*` variables are **inlined into the client bundle**. Only
> genuinely public values may carry that prefix.

## Deployment

The repository is Vercel-deployable without further configuration.

1. Push to GitHub.
2. Vercel → **Add New Project** → import the repository.
3. **Root Directory: `apps/web`** — accept the value Vercel detects. Vercel
   identifies the framework from the `package.json` in that directory, and
   `next` is declared there, not at the repository root. Install still runs from
   the root, because `pnpm-workspace.yaml` is detected.
4. Leave Build Command, Install Command and Output Directory at their defaults;
   [`apps/web/vercel.json`](apps/web/vercel.json) supplies the rest.
5. Add the environment variables above.
6. Deploy.

The Prisma client is generated by `packages/database`'s `postinstall`, so it
exists before `next build` runs — regardless of who invokes the build.

After the first deploy, set `NEXT_PUBLIC_APP_URL` and `BETTER_AUTH_URL` to the
real production URL and redeploy — both are baked in at build time.

Migrations are intentionally **not** part of the build command: Vercel builds
run concurrently, and DDL from a build step means N concurrent migrations
against one database. Run `prisma migrate deploy` as an explicit deploy step.

Full guide, including rollback: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Documentation

| Document                                                | Contents                                          |
| ------------------------------------------------------- | ------------------------------------------------- |
| [ARCHITECTURE.md](docs/ARCHITECTURE.md)                 | Layering, feature slices, tenancy, ADRs           |
| [DATABASE.md](docs/DATABASE.md)                         | Schema, conventions, migrations                   |
| [API.md](docs/API.md)                                   | tRPC procedures, validation, errors               |
| [SECURITY.md](docs/SECURITY.md)                         | Threat model, tenant isolation, open items        |
| [DESIGN_SYSTEM.md](docs/DESIGN_SYSTEM.md)               | Tokens, theming, accessibility                    |
| [BRAND_GUIDE.md](docs/BRAND_GUIDE.md)                   | Colour, typography, voice                         |
| [DEPLOYMENT.md](docs/DEPLOYMENT.md)                     | Vercel, environments, rollback                    |
| [TESTING.md](docs/TESTING.md)                           | Strategy, isolation tests, conventions            |
| [CONTRIBUTING.md](docs/CONTRIBUTING.md)                 | Setup, git workflow, standards                    |
| [PRODUCT_VISION.md](docs/PRODUCT_VISION.md)             | Positioning, personas _(placeholder)_             |
| [PRODUCT_REQUIREMENTS.md](docs/PRODUCT_REQUIREMENTS.md) | Requirements per slice _(placeholder)_            |
| [ROADMAP.md](docs/ROADMAP.md)                           | Phased plan                                       |
| [AI.md](docs/AI.md)                                     | Planned AI approach & constraints _(placeholder)_ |
| [CHANGELOG.md](docs/CHANGELOG.md)                       | Release history                                   |

## Roadmap

| Phase                      | Focus                                                  | Status          |
| -------------------------- | ------------------------------------------------------ | --------------- |
| **0 — Foundation**         | Monorepo, architecture, design system, tooling         | ✅ this release |
| **1 — Core platform**      | Auth flows, organizations, athletes, settings, uploads | Next            |
| **2 — Coaching workflows** | Training plans, sessions, metrics, calendar, chat      | Planned         |
| **3 — Intelligence**       | Analysis, AI-assisted planning, automated reporting    | Planned         |
| **4 — Scale**              | Billing, limits, public API, mobile, observability     | Planned         |

Detail: [docs/ROADMAP.md](docs/ROADMAP.md).

### Known gaps

Deliberate omissions at foundation stage, tracked so they are not mistaken for
oversights: no CI pipeline, no rate limiting, no audit logging, no CSP, and no
meaningful test suite. See
[ARCHITECTURE.md §9](docs/ARCHITECTURE.md#9-known-gaps) and
[SECURITY.md §9](docs/SECURITY.md#9-open-items).

## License

UNLICENSED — proprietary. All rights reserved.
