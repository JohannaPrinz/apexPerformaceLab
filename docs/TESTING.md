# Testing

> Status: **Suite established; the real-database layer is still open** · Last
> updated: 2026-09-21
>
> 148 colocated test files run under Vitest — 93 in `apps/web`, 55 across the
> packages — and Playwright covers the one journey that cannot be allowed to
> break silently. What does **not** exist is a layer running against a real
> Postgres; §5 states that question rather than answering it.

## Contents

1. [Stack](#1-stack)
2. [Testing strategy](#2-testing-strategy)
3. [Running tests](#3-running-tests)
4. [Unit tests](#4-unit-tests)
5. [Service and procedure tests](#5-service-and-procedure-tests)
6. [Component tests](#6-component-tests)
7. [End-to-end tests](#7-end-to-end-tests)
8. [Tenant isolation tests](#8-tenant-isolation-tests)
9. [Conventions](#9-conventions)

---

## 1. Stack

| Layer               | Tool                           | Status                                                      |
| ------------------- | ------------------------------ | ----------------------------------------------------------- |
| Runner              | Vitest                         | ✅ in use                                                   |
| Component           | Testing Library + jsdom        | ✅ in use                                                   |
| Service / procedure | Vitest + a recording fake `db` | ✅ in use — see [§5](#5-service-and-procedure-tests)        |
| Integration         | Vitest + a real Postgres       | ❌ open decision — see [§5](#5-service-and-procedure-tests) |
| E2E                 | Playwright                     | ✅ in use — one journey                                     |
| Coverage            | Vitest v8 provider             | ⚙️ configured, no threshold enforced                        |

Config: [`apps/web/vitest.config.ts`](../apps/web/vitest.config.ts) ·
[`apps/web/vitest.setup.ts`](../apps/web/vitest.setup.ts).

## 2. Testing strategy

Weighted toward the layer where this product's bugs will actually be expensive:

```text
        ╱ E2E ╲                few — journeys whose breakage is unrecoverable
      ╱─────────────╲
    ╱ Service/procedure ╲      many — the authorization ↔ data boundary
  ╱─────────────────────────╲
╱     Unit + Component        ╲  most — pure logic, schemas, components
```

The deliberate emphasis is the **middle layer**: a multi-tenant SaaS fails at
the boundary between authorization and data access, so that is where the tests
are concentrated.

What that layer looks like in practice is described in [§5](#5-service-and-procedure-tests).
The short version: it asserts **the query that was built**, not the data that
came back. A service takes its `db` as an argument, the test passes a fake that
records every call, and the assertions are about the `where` clause — because
with a shared schema, `organizationId` being in that filter _is_ the isolation
guarantee.

This is not the same as mocking Prisma to make a test pass. A test that stubs
`findMany` and asserts on its return value tests the stub. A test that inspects
the argument the service constructed tests the service. The tenant helpers
(`scoped`, `withTenant`) are deliberately never stubbed — they are the thing
under test.

## 3. Running tests

```bash
pnpm test                              # all workspaces
pnpm --filter @apex/web test           # one workspace
pnpm --filter @apex/web test:watch     # watch mode
pnpm --filter @apex/web test:e2e       # Playwright — see §7
```

`pnpm test` is also part of `.husky/pre-push` and of CI. Every workspace with
tests declares its own `test` script, so Turborepo runs and caches them per
package.

`apps/web` tests run in jsdom with `globals: true`. Two pieces of configuration
matter when a server module is under test: `server-only` is aliased to
[`src/test/server-only-stub.ts`](../apps/web/src/test/server-only-stub.ts),
because the real package throws outside React's `react-server` condition and
would fire on modules that are perfectly correct; and `vite-tsconfig-paths`
supplies the `@/*` aliases, so no transform config has to be kept in sync with
`tsconfig.json`.

## 4. Unit tests

For pure logic: Zod schemas, permission checks, formatters, date maths,
tenant-scoping helpers.

The largest body of these lives in `packages/domain` (39 files) — module
configuration, readiness, comparison, movement profiles — plus the exercise
catalogue in `packages/catalogue`.

```ts
import { describe, expect, it } from 'vitest';

import { hasPermission, permissionSchema } from '@apex/types';

describe('PERMISSIONS matrix', () => {
  it('grants the owner every permission', () => {
    for (const permission of permissionSchema.options) {
      expect(hasPermission('owner', permission)).toBe(true);
    }
  });

  it('denies a coach any member management', () => {
    expect(hasPermission('coach', 'member:invite')).toBe(false);
  });
});
```

`hasPermission` is exported from `@apex/types`, not `@apex/auth`. The worked
original is
[`packages/types/src/tenancy/permissions.test.ts`](../packages/types/src/tenancy/permissions.test.ts).

The permission matrix is a table — test it as one, including the denials. Tests
that only assert what is allowed miss the failure mode that matters.

## 5. Service and procedure tests

The established middle layer. Two shapes, used for different questions.

### Service tests — assert the query

A service takes `db` as its first-class argument precisely so the arguments it
builds can be inspected. The test passes a fake that records each call and then
asserts on the `where` clause.

```ts
const TENANT = { organizationId: 'org_a' };

// Records every call so the `where` clause can be inspected.
const calls: { where: Record<string, unknown> }[] = [];
const db = { athlete: { findMany: vi.fn((args) => (calls.push(args), [])) } };

await listAthletes(db as never, TENANT, {});
expect(calls[0]?.where).toMatchObject({ organizationId: 'org_a' });
```

Worked examples: `features/athletes/server/service.test.ts`,
`features/assessments/server/service.test.ts`,
`services/case-provisioning.test.ts`.

### Procedure tests — assert the door

What only a procedure can show is who gets through it. These build a real
router with `createCallerFactory`, mock `@apex/database` and `@apex/auth` at the
module boundary, and leave the tenant helpers alone.

```ts
vi.mock('@apex/database', () => ({ db: {} }));
vi.mock('@apex/auth', () => ({ auth: { api: { getSession: vi.fn() } } }));

const createCaller = createCallerFactory(createTRPCRouter(portalFilesProcedures));
```

Worked examples: `features/portal/server/files-router.test.ts`,
`features/portal/server/access.test.ts`, `features/auth/server/router.test.ts`.

### The open decision

No test in this repository talks to a Postgres. The approach above proves that
a service **builds** a correctly scoped query; it cannot prove that the query
**behaves** as intended once Prisma has translated it, and it cannot catch an
invariant enforced by a CHECK constraint or a partial unique index — of which
there are nine (see [DATABASE.md §5](./DATABASE.md#5-invariants-requiring-raw-sql)).

Whether that gap is closed by a disposable Postgres (Docker or Testcontainers,
migrations applied, truncated between tests) or is accepted as covered by E2E
plus review is **not decided**. Do not treat the absence of such tests as a
settled position, and do not add a real-database layer without settling it
first — a half-populated one is worse than none.

## 6. Component tests

For components with real behaviour — conditionals, forms, empty and error
states. Not for presentational markup; snapshot-testing a `<Card>` produces
churn, not confidence.

```tsx
render(<AthleteCard athlete={fixture} />);
expect(screen.getByRole('heading', { name: 'Jane Doe' })).toBeInTheDocument();
```

Query by **role and accessible name**, not by test ID. A test that passes only
via `data-testid` cannot tell you the component is reachable by a screen reader;
one written against roles can. Because the product's UI copy is German, that
accessible name is German too.

[`apps/web/src/test/harness.test.tsx`](../apps/web/src/test/harness.test.tsx)
is a worked example of what a good test in this harness looks like, kept
deliberately free of any feature.

## 7. End-to-end tests

Playwright, configured in
[`apps/web/playwright.config.ts`](../apps/web/playwright.config.ts). One spec
exists — `e2e/athlete-access.spec.ts`, the activation-and-sign-in journey, which
was chosen first because an athlete locked out of the portal has no way in and
no way to tell anybody.

```bash
pnpm --filter @apex/web test:e2e
```

Three properties of that config are deliberate:

- **It runs against a production build**, starting `pnpm start` (and reusing a
  server already listening). `next dev` recompiles per route and reports
  timings the deployed app never shows, so a smoke test green against dev and
  red in production would be worse than none. `E2E_BASE_URL` points the suite at
  a deployed environment instead.
- **Serial, one worker.** The journey signs a coach up, creates athletes and
  hands out one-time links; two workers would share a database and fight over
  the same rows.
- **No retries**, traces and screenshots retained on failure.

Keep the set small and the assertions about outcomes rather than intermediate UI
states. Everything else about a surface belongs in component and service tests,
which need no server. Candidate journeys not yet written: sign-up → workspace →
dashboard, and organization switching changing the data scope.

## 8. Tenant isolation tests

**The one non-negotiable suite.** Every tenant-scoped feature gets these,
because the failure mode is a data breach rather than a bug report:

- [ ] Tenant A cannot read tenant B's rows
- [ ] Tenant A cannot mutate tenant B's rows
- [ ] A cross-tenant ID returns `NOT_FOUND`, not `FORBIDDEN`
- [ ] A procedure with no active organization is rejected
- [ ] Each role is denied every permission it should not hold

These exist today for the slices that have servers — `athletes`, `assessments`,
`cases`, `exercises`, `portal`, `reports` — written in the two shapes of
[§5](#5-service-and-procedure-tests).

> [!NOTE]
> They are written **by hand per slice**, while this section has always asked
> for "a shared, reusable suite parameterized per router". Practice and
> prescription diverge here, and the divergence is not a decision anybody
> recorded. Until it is settled, follow the existing slices — a new tenant-scoped
> router still ships with these assertions, in whatever form its neighbours use.

## 9. Conventions

| Rule                                             | Reason                                                                  |
| ------------------------------------------------ | ----------------------------------------------------------------------- |
| `*.test.ts(x)` next to the code                  | Colocation keeps tests in the deleted directory when a slice is deleted |
| `describe` names the unit, `it` states behaviour | Failure output should read as a sentence                                |
| Arrange–Act–Assert                               | Uniform structure                                                       |
| Assert the query, never a stubbed return value   | A stub's return value tests the stub — see [§2](#2-testing-strategy)    |
| Never stub `scoped` / `withTenant`               | They are the isolation guarantee, so they are the thing under test      |
| Factories over fixtures                          | Explicit per-test data beats a shared blob nobody dares change          |
| Test behaviour, not implementation               | Refactors should not break tests                                        |
| A bug fix ships with a regression test           | The cheapest test to justify                                            |
| Never weaken an assertion to get a green run     | The test was the only thing holding the guarantee                       |

Coverage thresholds remain deliberately unset. The v8 provider is configured in
[`vitest.config.ts`](../apps/web/vitest.config.ts) with `text` and `html`
reporters, and the suites run without `--coverage`, so
[`turbo.json`](../turbo.json) declares no coverage output. A percentage target
is still judged to drive tests written for the metric; that judgement, not an
absence of tooling, is why there is no gate.

---

**Related:** [CONTRIBUTING.md](./CONTRIBUTING.md) · [API.md](./API.md) ·
[SECURITY.md](./SECURITY.md)
