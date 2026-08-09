# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

Entries are written for the reader, not derived from commit messages — a commit
log says what changed in the code, a changelog says what changed for the user.

---

## [Unreleased]

### Added

_Nothing yet._

### Changed

_Nothing yet._

### Fixed

_Nothing yet._

---

## [0.1.0] — 2026-08-02

Initial project foundation. No product features — this release is the
repository, the architecture and the developer experience.

### Added

**Repository**
- pnpm workspace monorepo orchestrated with Turborepo
- Workspaces: `apps/web` plus `@apex/ui`, `@apex/database`, `@apex/auth`,
  `@apex/config`, `@apex/types`

**Application**
- Next.js App Router application with React 19 and TypeScript
- tRPC API layer with `public` / `protected` / `organization` procedures and a
  permission-gated procedure builder
- Better Auth route handler and session middleware
- Feature-sliced directory structure for ten planned domains
- Categorized component structure (layout, navigation, dashboard, forms,
  charts, cards, tables, common)
- Zod-validated environment configuration
- Security headers, including HSTS

**Data**
- Prisma schema covering identity (Better Auth) and multi-tenancy
  (organizations, memberships, invitations)
- Tenant-scoping helpers and a hot-reload-safe client singleton
- Idempotent development seed

**Design system**
- Two-layer token architecture (primitive → semantic) as CSS variables
- Light and dark themes; class-driven theme switching via `next-themes`
- Geist and Inter loaded through `next/font`
- Base primitives: Button, Card, Input, Badge, Separator, Skeleton
- Five-series chart palette, accessible in both themes

**Tooling**
- ESLint 9 flat config, Prettier, TypeScript strict mode with path aliases
- Husky hooks: lint-staged on commit, commitlint on message, typecheck on push
- EditorConfig and VS Code workspace settings
- Vitest with Testing Library

**Documentation**
- Fourteen-document set under `docs/`
- README with setup, workflow and deployment
- Vercel deployment configuration

### Known gaps

Tracked in [ARCHITECTURE.md §9](./ARCHITECTURE.md#9-known-gaps) and
[SECURITY.md §9](./SECURITY.md#9-open-items): no CI pipeline, no rate limiting,
no audit logging, no test suite, no CSP.

---

[Unreleased]: https://github.com/OWNER/apex-os/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/OWNER/apex-os/releases/tag/v0.1.0
