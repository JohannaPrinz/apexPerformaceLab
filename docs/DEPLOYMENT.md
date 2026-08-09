# Deployment

> Status: **Vercel-ready** · Last updated: 2026-08-02

## Contents

1. [Targets](#1-targets)
2. [Vercel configuration](#2-vercel-configuration)
3. [First deployment](#3-first-deployment)
4. [Environment variables](#4-environment-variables)
5. [Database provisioning](#5-database-provisioning)
6. [Migrations in the pipeline](#6-migrations-in-the-pipeline)
7. [Environments](#7-environments)
8. [Third-party services](#8-third-party-services)
9. [Rollback](#9-rollback)
10. [CI](#10-ci)

---

## 1. Targets

| Component       | Platform                                               |
| --------------- | ------------------------------------------------------ |
| Web application | Vercel (Next.js, region `fra1`)                        |
| Database        | Managed PostgreSQL — Neon, Supabase or Vercel Postgres |
| Object storage  | Cloudflare R2                                          |
| Background jobs | Trigger.dev                                            |
| Email           | Resend                                                 |
| Analytics       | PostHog (EU cloud)                                     |

`fra1` is the default region because the initial market is European and it
keeps the function–database round trip short. If the database is provisioned
elsewhere, move the region to match — a cross-continent hop costs more than
anything else in the request path.

## 2. Vercel configuration

[`vercel.json`](../vercel.json):

| Setting           | Value                                        | Why                                                                                                                      |
| ----------------- | -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `buildCommand`    | `pnpm turbo run build --filter=@apex/web...` | The `...` suffix builds `@apex/web` **and its workspace dependencies** — without it the shared packages are never built. |
| `installCommand`  | `pnpm install --frozen-lockfile`             | A lockfile mismatch fails the build instead of silently resolving different versions.                                    |
| `outputDirectory` | `apps/web/.next`                             | Monorepo — the app is not at the repo root.                                                                              |
| `regions`         | `["fra1"]`                                   | See above.                                                                                                               |
| `github.silent`   | `true`                                       | Suppresses per-commit bot comments.                                                                                      |

Prisma client generation runs as part of `@apex/database`'s build, so the
generated client exists before `next build` typechecks against it.

## 3. First deployment

1. Push the repository to GitHub.
2. Vercel → **Add New Project** → import the repository.
3. **Root Directory: leave at the repository root** (`./`), not `apps/web`.
   `vercel.json` handles the monorepo layout. Pointing Vercel at `apps/web`
   breaks the workspace resolution — this is the most common setup mistake.
4. Framework preset: Next.js (auto-detected).
5. Add the environment variables from [§4](#4-environment-variables).
6. Deploy.

Post-deploy: set `NEXT_PUBLIC_APP_URL` and `BETTER_AUTH_URL` to the real
production URL and redeploy. Both are baked in at build time, so the first
build necessarily has placeholder values.

## 4. Environment variables

Full list with comments: [`.env.example`](../.env.example).
Validation schema: [`apps/web/src/env.ts`](../apps/web/src/env.ts).

| Variable                                   | Required | Scope  | Notes                                        |
| ------------------------------------------ | -------- | ------ | -------------------------------------------- |
| `DATABASE_URL`                             | ✅       | Server | Pooled connection                            |
| `DIRECT_URL`                               | ✅       | Server | Unpooled — migrations only                   |
| `BETTER_AUTH_SECRET`                       | ✅       | Server | ≥32 random bytes, **unique per environment** |
| `BETTER_AUTH_URL`                          | ✅       | Server | Full deployment URL                          |
| `NEXT_PUBLIC_APP_URL`                      | ✅       | Client | Full deployment URL                          |
| `GITHUB_CLIENT_ID` / `_SECRET`             | ➖       | Server | Omit to disable the provider                 |
| `GOOGLE_CLIENT_ID` / `_SECRET`             | ➖       | Server | Omit to disable the provider                 |
| `R2_*`                                     | ➖       | Server | Required once uploads ship                   |
| `RESEND_API_KEY`, `EMAIL_FROM`             | ➖       | Server | Required once email ships                    |
| `TRIGGER_SECRET_KEY`, `TRIGGER_PROJECT_ID` | ➖       | Server | Required once jobs ship                      |
| `NEXT_PUBLIC_POSTHOG_KEY` / `_HOST`        | ➖       | Client | Project key is public by design              |

**`NEXT_PUBLIC_*` values are inlined into the client bundle.** Never give a
secret that prefix — see [SECURITY.md §6](./SECURITY.md#6-secrets--configuration).

Set variables per environment (Production / Preview / Development) in Vercel.
Preview must not point at the production database.

## 5. Database provisioning

1. Create a Postgres instance in the same region as the deployment.
2. Set `DATABASE_URL` to the pooled connection string, `DIRECT_URL` to the
   direct one.
3. Apply the schema: `pnpm db:migrate deploy` against the target database.

Why the two URLs are not interchangeable:
[DATABASE.md §1](./DATABASE.md#1-stack).

## 6. Migrations in the pipeline

Migrations are deliberately **not** wired into `buildCommand`. Vercel builds run
concurrently and on every preview; running DDL from a build step means N
concurrent migrations against one database.

Instead, run `prisma migrate deploy` as an explicit step:

- from CI on merge to `main`, before promoting the deployment, or
- as a Vercel deploy hook, or
- manually for the first release.

Never run `migrate dev` or `db push` against production — the first prompts and
can reset, the second leaves no history.

Backward-compatible migrations only: during a deploy, old and new code run
simultaneously, so expand-then-contract (add column → backfill → ship code →
drop old column in a later release) is the only safe sequence.

## 7. Environments

| Environment | Branch | Database              | Purpose         |
| ----------- | ------ | --------------------- | --------------- |
| Production  | `main` | Production            | Live            |
| Preview     | any PR | Preview/branch DB     | Review per PR   |
| Development | local  | Local Docker Postgres | Day-to-day work |

## 8. Third-party services

| Service       | Setup                                                                                                |
| ------------- | ---------------------------------------------------------------------------------------------------- |
| Cloudflare R2 | Create bucket + API token; set `R2_*`. Serve public assets from a custom domain, not the app origin. |
| Resend        | Verify the sending domain (SPF/DKIM) before sending; set `EMAIL_FROM` to that domain.                |
| Trigger.dev   | Create the project, set the secret key, deploy jobs separately from the web app.                     |
| PostHog       | EU cloud by default (`https://eu.i.posthog.com`) — relevant for GDPR.                                |

## 9. Rollback

Vercel keeps every previous deployment: **Deployments → ⋯ → Promote to
Production**. Code rollback is near-instant.

The database is the real constraint: a migration is not rolled back by
promoting an old deployment. This is why migrations must be
backward-compatible — a code rollback must remain valid against the newer
schema. Reverting a migration means writing a new forward migration.

## 10. CI

_TBD._ Not yet configured. Intended pipeline on pull request:

```text
install → typecheck → lint → format:check → test → build
```

Plus `prisma migrate deploy` on merge to `main`, and dependency scanning
(see [SECURITY.md §9](./SECURITY.md#9-open-items)).

Until CI exists, the Husky `pre-push` hook is the only automated gate — see
[CONTRIBUTING.md](./CONTRIBUTING.md).

---

**Related:** [ARCHITECTURE.md](./ARCHITECTURE.md) · [DATABASE.md](./DATABASE.md) ·
[SECURITY.md](./SECURITY.md) · [CONTRIBUTING.md](./CONTRIBUTING.md)
