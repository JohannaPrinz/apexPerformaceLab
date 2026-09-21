---
paths:
  - 'apps/web/src/**/*.test.{ts,tsx}'
  - 'apps/web/e2e/**/*.spec.ts'
  - 'packages/*/src/**/*.test.{ts,tsx}'
---

# Testing rules

Reference: [docs/TESTING.md](../../docs/TESTING.md) — conventions in §9, the
tenant-isolation checklist in §8, and the two test shapes in §5.

```bash
pnpm test                              # every workspace
pnpm --filter @apex/web test:watch     # watch one
pnpm --filter @apex/web test:e2e       # Playwright, against a production build
```

- **Colocate** `*.test.ts(x)` next to the code, so deleting a slice deletes its
  tests.
- **Query by role and accessible name**, not `data-testid`. A test that only
  passes via a test id cannot tell you the component is reachable at all.
- **Test behaviour, not implementation.** A refactor should not break a test.
- **Assert the query, not a stubbed return value.** A service takes `db` as an
  argument, so its test passes a recording fake and inspects the `where` clause
  the service built — that filter _is_ the isolation guarantee, while a stubbed
  `findMany` only tests the stub. Never stub `scoped` / `withTenant`: they are
  the thing under test. Worked examples in
  [docs/TESTING.md §5](../../docs/TESTING.md).
- Tenant isolation is the one non-negotiable suite: cross-tenant reads and
  writes, a cross-tenant id answering `NOT_FOUND` rather than `FORBIDDEN`, a
  missing active organization rejected, and every role's denials.
- A permission matrix is a table; test the denials, not only the grants.
- **A bug fix ships with a regression test.**
- `describe` names the unit, `it` states the behaviour; arrange–act–assert.
- Factories over shared fixtures.

## End-to-end

`apps/web/e2e` is reserved for journeys where a break is unrecoverable and
silent — currently athlete access. It runs serially on one worker against
`pnpm start`, because the journey creates real rows. Everything else about a
surface belongs in unit and component tests, which need no database.

Never weaken an assertion to get a green run.
