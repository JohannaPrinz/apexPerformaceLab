# Testing

> Status: **Harness configured, suite not written** · Last updated: 2026-08-02
>
> Vitest is wired up and `pnpm test` runs. There is no meaningful test suite
> yet — by design, since there are no features. This document defines what
> gets tested once there are.

## Contents

1. [Stack](#1-stack)
2. [Testing strategy](#2-testing-strategy)
3. [Running tests](#3-running-tests)
4. [Unit tests](#4-unit-tests)
5. [Integration tests](#5-integration-tests)
6. [Component tests](#6-component-tests)
7. [End-to-end tests](#7-end-to-end-tests)
8. [Tenant isolation tests](#8-tenant-isolation-tests)
9. [Conventions](#9-conventions)

---

## 1. Stack

| Layer       | Tool                    | Status        |
| ----------- | ----------------------- | ------------- |
| Runner      | Vitest                  | ✅ configured |
| Component   | Testing Library + jsdom | ✅ configured |
| Integration | Vitest + test Postgres  | ❌ TBD        |
| E2E         | Playwright              | ❌ TBD        |
| Coverage    | Vitest v8 provider      | ❌ TBD        |

Config: [`apps/web/vitest.config.ts`](../apps/web/vitest.config.ts) ·
[`apps/web/vitest.setup.ts`](../apps/web/vitest.setup.ts).

## 2. Testing strategy

Weighted toward the layer where this product's bugs will actually be expensive:

```text
        ╱ E2E ╲            few — critical user journeys only
      ╱─────────╲
    ╱ Integration ╲        many — tRPC procedures against a real database
  ╱─────────────────╲
╱   Unit + Component  ╲    most — pure logic, schemas, components
```

The deliberate emphasis is **integration tests at the procedure level**. A
multi-tenant SaaS fails at the boundary between authorization and data access,
and that boundary is invisible to a unit test that mocks the database. Mocking
Prisma tests the mock, not the isolation.

## 3. Running tests

```bash
pnpm test                              # all workspaces
pnpm --filter @apex/web test           # one workspace
pnpm --filter @apex/web test:watch     # watch mode
```

## 4. Unit tests

For pure logic: Zod schemas, permission checks, formatters, date maths,
tenant-scoping helpers.

```ts
import { describe, expect, it } from 'vitest';
import { hasPermission } from '@apex/auth';

describe('hasPermission', () => {
  it('grants owners every permission', () => {
    expect(hasPermission('owner', 'athlete:write')).toBe(true);
  });

  it('denies athletes write access to other athletes', () => {
    expect(hasPermission('athlete', 'athlete:write')).toBe(false);
  });
});
```

The permission matrix is a table — test it as one, including the denials. Tests
that only assert what is allowed miss the failure mode that matters.

## 5. Integration tests

_TBD._ Intended setup:

- A disposable Postgres (Docker or Testcontainers) with migrations applied.
- Build a tRPC caller with a synthetic session, invoke procedures, assert on
  both the response and the database state.
- Truncate between tests; no shared fixtures across test files.

```ts
const caller = appRouter.createCaller(await testContext({ role: 'coach' }));
await expect(caller.athletes.list({})).resolves.toHaveLength(0);
```

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
one written against roles can.

## 7. End-to-end tests

_TBD (Playwright)._ Reserved for journeys where a break is unrecoverable:

1. Sign up → create organization → land on dashboard
2. Invite a member → accept invitation → correct role applied
3. Sign in → switch organization → data scope changes
4. Core coaching loop (once it exists)

E2E tests are slow and flaky by nature; keep the set small and the assertions
about outcomes rather than intermediate UI states.

## 8. Tenant isolation tests

**The one non-negotiable suite.** Every tenant-scoped feature gets these,
because the failure mode is a data breach rather than a bug report:

- [ ] Tenant A cannot read tenant B's rows
- [ ] Tenant A cannot mutate tenant B's rows
- [ ] A cross-tenant ID returns `NOT_FOUND`, not `FORBIDDEN`
- [ ] A procedure with no active organization is rejected
- [ ] Each role is denied every permission it should not hold

Write them as a shared, reusable suite parameterized per router, not by hand
per feature — hand-written isolation tests get skipped exactly when the feature
is rushed.

## 9. Conventions

| Rule                                             | Reason                                                                  |
| ------------------------------------------------ | ----------------------------------------------------------------------- |
| `*.test.ts(x)` next to the code                  | Colocation keeps tests in the deleted directory when a slice is deleted |
| `describe` names the unit, `it` states behaviour | Failure output should read as a sentence                                |
| Arrange–Act–Assert                               | Uniform structure                                                       |
| No mocking of Prisma in integration tests        | Mocks test the mock                                                     |
| Factories over fixtures                          | Explicit per-test data beats a shared blob nobody dares change          |
| Test behaviour, not implementation               | Refactors should not break tests                                        |
| A bug fix ships with a regression test           | The cheapest test to justify                                            |

_TBD:_ coverage thresholds. They are intentionally deferred — a percentage
target on an empty codebase drives tests written for the metric.

---

**Related:** [CONTRIBUTING.md](./CONTRIBUTING.md) · [API.md](./API.md) ·
[SECURITY.md](./SECURITY.md)
