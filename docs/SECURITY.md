# Security

> Status: **Foundation + open items** · Last updated: 2026-08-02
>
> Everything under [Open items](#9-open-items) is a known gap, not an
> oversight. Read that section before the first production tenant.

## Contents

1. [Threat model](#1-threat-model)
2. [Authentication](#2-authentication)
3. [Authorization](#3-authorization)
4. [Tenant isolation](#4-tenant-isolation)
5. [Input validation](#5-input-validation)
6. [Secrets & configuration](#6-secrets--configuration)
7. [Transport & headers](#7-transport--headers)
8. [Data protection](#8-data-protection)
9. [Open items](#9-open-items)
10. [Reporting a vulnerability](#10-reporting-a-vulnerability)

---

## 1. Threat model

Ranked by what would actually hurt:

| #   | Threat                               | Impact                                          | Primary control                                   |
| --- | ------------------------------------ | ----------------------------------------------- | ------------------------------------------------- |
| 1   | **Cross-tenant data access**         | Catastrophic — the one bug that ends a B2B SaaS | Session-derived scoping (§4)                      |
| 2   | Privilege escalation within a tenant | High                                            | Permission matrix (§3)                            |
| 3   | Account takeover                     | High                                            | Better Auth, hashing, verification (§2)           |
| 4   | Health/nutrition data exposure       | High — special-category data under GDPR Art. 9  | Access control + encryption (§8)                  |
| 5   | Injection (SQL/XSS)                  | Medium                                          | Prisma parameterization, React escaping, Zod (§5) |
| 6   | Secret leakage                       | Medium                                          | Env validation, `NEXT_PUBLIC_` discipline (§6)    |
| 7   | Credential stuffing / brute force    | Medium                                          | Rate limiting — **open item** (§9)                |

## 2. Authentication

Better Auth, self-hosted, sessions in our own Postgres.

- Passwords hashed with the library default (scrypt); never logged, never returned.
- Sessions are opaque database-backed tokens in `httpOnly`, `secure`,
  `sameSite` cookies — not JWTs. Server-side sessions can be revoked
  immediately; a JWT cannot be un-issued.
- `BETTER_AUTH_SECRET` must be ≥32 random bytes and **different per
  environment**. Rotating it invalidates all sessions — that is the intended
  break-glass control.
- OAuth (GitHub, Google) is optional; a provider with empty credentials is
  simply not registered.

## 3. Authorization

Role-based, defined in [`packages/auth/src/permissions.ts`](../packages/auth/src/permissions.ts).

| Role      | Scope                                                            |
| --------- | ---------------------------------------------------------------- |
| `owner`   | Full control, including billing and deletion of the organization |
| `admin`   | Manage members and settings                                      |
| `coach`   | Manage assigned athletes and their programmes                    |
| `athlete` | Own data only                                                    |

Enforcement is at the **procedure** level via `withPermission(...)`, never in
the UI. Hiding a button is a UX affordance; it is not a security control — the
endpoint is still reachable with `curl`.

Checks live in one module so the matrix is auditable as a unit rather than
scattered across dozens of inline `if (role === 'admin')` conditions.

## 4. Tenant isolation

The controls, in order of importance:

1. **Scope is derived from the session.** `organizationProcedure` reads
   `session.activeOrganizationId` and verifies a `Membership` row exists. A
   client-supplied `organizationId` is never trusted.
2. **No `organizationId` in input schemas.** Accepting one is an IDOR by
   construction. This is a blocking review comment.
3. **Scoped query helpers** (`packages/database/src/tenant.ts`) rather than
   hand-written `where` clauses.
4. **`NOT_FOUND`, not `FORBIDDEN`,** for another tenant's rows —
   `FORBIDDEN` confirms the record exists and leaks the ID space.

**Review checklist for any PR touching data access:**

- [ ] Uses `organizationProcedure` or narrower
- [ ] No `organizationId` in any input schema
- [ ] Every `where` on a tenant model includes the tenant scope
- [ ] Cross-tenant misses return `NOT_FOUND`
- [ ] New tenant models declare `@@index([organizationId])`

## 5. Input validation

- Every boundary — tRPC input, Server Action, route handler, env — is
  Zod-validated.
- Prisma parameterizes all queries. `$queryRaw` requires the tagged-template
  form; `$queryRawUnsafe` is prohibited without an explicit review sign-off.
- React escapes by default. `dangerouslySetInnerHTML` requires sanitization and
  a comment justifying it.
- File uploads: validate MIME type **and** magic bytes, enforce a size cap, and
  never serve user uploads from the application origin — R2 with its own domain
  keeps a malicious upload out of the app's cookie scope.

## 6. Secrets & configuration

- `.env` is gitignored; `.env.example` documents every variable with dummy values.
- `apps/web/src/env.ts` validates at build time — a missing secret fails the
  build rather than surfacing as `undefined` in production.
- **`NEXT_PUBLIC_*` is inlined into the client bundle.** Only genuinely public
  values (PostHog project key, app URL) may carry the prefix. This is the most
  common way a secret leaks in a Next.js codebase.
- Production secrets live in Vercel's encrypted environment store; preview and
  production have separate values.
- Rotate on any suspected exposure and on staff offboarding.

## 7. Transport & headers

- HTTPS everywhere; Vercel handles TLS and HSTS.
- Security headers are set in [`next.config.ts`](../apps/web/next.config.ts):
  `X-Frame-Options`, `X-Content-Type-Options`, `Referrer-Policy`,
  `Permissions-Policy`.
- CSRF: Better Auth issues its own token and cookies are `sameSite`.

_TBD:_ a Content-Security-Policy with nonces. Deliberately deferred — a CSP
introduced before the third-party script set is known gets weakened into
uselessness by the first `unsafe-inline` exception.

## 8. Data protection

The product will process training, health and nutrition data — **special
category data under GDPR Article 9**. That raises the bar above ordinary SaaS.

| Requirement              | Status                                                                   |
| ------------------------ | ------------------------------------------------------------------------ |
| Encryption in transit    | ✅ TLS                                                                   |
| Encryption at rest       | ✅ Provider-managed (Postgres + R2)                                      |
| Data minimization        | ⚠️ Enforce per feature — collect only what the feature needs             |
| Right to access / export | ❌ TBD                                                                   |
| Right to erasure         | ⚠️ Cascading deletes exist; no self-service flow                         |
| Retention policy         | ❌ TBD                                                                   |
| DPA with subprocessors   | ❌ TBD — Vercel, Neon/Supabase, Cloudflare, Resend, PostHog, Trigger.dev |
| Audit log                | ❌ TBD                                                                   |
| Regional hosting         | ⚠️ PostHog defaults to EU; verify DB and R2 regions                      |

PII must never reach logs or analytics. PostHog events carry IDs, never emails,
names or health values.

## 9. Open items

Ordered by risk. **Items 1–3 are prerequisites for production.**

1. **Rate limiting** on auth endpoints and expensive procedures. Without it,
   credential stuffing is unmetered.
2. **Audit logging** of security-relevant actions (role changes, invitations,
   exports, deletions).
3. **Dependency scanning** in CI (`pnpm audit`, Dependabot).
4. Content-Security-Policy with nonces.
5. Postgres row-level security as defense in depth behind application scoping.
6. Session-management UI — list and revoke active sessions.
7. Two-factor authentication.
8. Automated cross-tenant isolation tests (see [TESTING.md](./TESTING.md)).
9. Backup and restore procedure, with a tested restore.
10. Incident response runbook.

## 10. Reporting a vulnerability

_TBD:_ security contact address and disclosure policy. Do not open a public
issue for a vulnerability.

---

**Related:** [ARCHITECTURE.md](./ARCHITECTURE.md) · [API.md](./API.md) ·
[DATABASE.md](./DATABASE.md) · [DEPLOYMENT.md](./DEPLOYMENT.md)
