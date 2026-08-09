# Roadmap

> Status: **Placeholder** · Last updated: 2026-08-02
>
> Phases are ordered by dependency, not by date. Dates get added when a phase
> is committed to.

## Contents

1. [Phase 0 — Foundation](#phase-0--foundation-current)
2. [Phase 1 — Core platform](#phase-1--core-platform)
3. [Phase 2 — Coaching workflows](#phase-2--coaching-workflows)
4. [Phase 3 — Intelligence](#phase-3--intelligence)
5. [Phase 4 — Scale](#phase-4--scale)
6. [Backlog](#backlog)

---

## Phase 0 — Foundation _(current)_

**Goal:** a repository a new engineer can clone, run and deploy on day one.

- [x] Monorepo (pnpm workspaces + Turborepo)
- [x] Next.js App Router application skeleton
- [x] Shared packages: `ui`, `database`, `auth`, `config`, `types`
- [x] Design system — tokens, themes, base primitives
- [x] tRPC + Prisma + Better Auth wiring
- [x] Coding standards: ESLint, Prettier, strict TS, Husky, lint-staged, commitlint
- [x] Documentation skeleton
- [x] Vercel-deployable configuration
- [ ] CI pipeline (GitHub Actions)

## Phase 1 — Core platform

**Goal:** a real tenant can sign up and manage a roster.

- [ ] Authentication flows (email/password, OAuth, verification, recovery)
- [ ] Organization creation, invitations, role management
- [ ] Application shell — navigation, layout, responsive behaviour
- [ ] Athlete CRUD and profiles
- [ ] Settings surfaces (profile, organization, members)
- [ ] File uploads to R2
- [ ] Transactional email via Resend

## Phase 2 — Coaching workflows

**Goal:** the product replaces the spreadsheet.

- [ ] Training plan builder and exercise library
- [ ] Session logging
- [ ] Performance metrics and progress tracking
- [ ] Calendar and scheduling
- [ ] Coach and athlete dashboards
- [ ] Coach–athlete chat

## Phase 3 — Intelligence

**Goal:** the product tells the coach something they did not already know.

- [ ] Analysis engine — trends, benchmarks, flags
- [ ] AI-assisted plan generation — see [AI.md](./AI.md)
- [ ] Automated reporting via Trigger.dev
- [ ] Nutrition planning and adherence

## Phase 4 — Scale

**Goal:** the platform survives its own growth.

- [ ] Billing and subscription management
- [ ] Usage limits and plan enforcement
- [ ] Advanced permissions / custom roles
- [ ] Public API and webhooks
- [ ] Mobile surface
- [ ] Observability: tracing, error tracking, SLOs

## Backlog

Unscheduled, kept visible:

- Postgres row-level security as defense in depth
- Per-tenant white-labelling (theming already supports it)
- Data export / GDPR self-service
- Offline-capable session logging

---

**Related:** [PRODUCT_REQUIREMENTS.md](./PRODUCT_REQUIREMENTS.md) ·
[ARCHITECTURE.md](./ARCHITECTURE.md) · [CHANGELOG.md](./CHANGELOG.md)
