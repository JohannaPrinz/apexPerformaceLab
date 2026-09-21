---
paths:
  - 'apps/web/src/features/*/index.ts'
---

# Feature surface rules

Reference: [docs/ARCHITECTURE.md §4](../../docs/ARCHITECTURE.md) ·
[features/README.md](../../apps/web/src/features/README.md)

[server-and-data.md](server-and-data.md) states this in one line from the
server side; the two deliberate exceptions live here.

A slice's `index.ts` is the whole boundary. `apps/web/eslint.config.mjs` blocks
`@/features/*/*`, so anything not exported here is genuinely unreachable from
outside the slice — the barrel is an access decision, not a convenience.

Exported: components, Zod schemas, `z.infer` types, and pure logic the slice
owns. An export whose reason is not obvious carries a doc comment saying why it
crosses the boundary, as `features/athletes/index.ts` does.

## `router.ts` never leaves the slice

No barrel re-exports one, and none should start. The router is registered once
in `src/server/api/root.ts`, which is what makes that single file a complete
answer to "what does this API expose". A second import path ends that property
quietly — nothing fails, the file just stops being the whole truth.

## `server/` is private — and two exports deliberately are not

`service.ts` is the only module in a slice that reaches `@apex/database`, so a
direct caller is a second authorization path. `actions.ts` wraps the service,
so exporting one hands out a second entry point. Both stay private by default.

Two barrels already cross that line on purpose. **Do not "fix" them:**

1. `assessments/index.ts` re-exports `chartsForTests`, `measurementChart` and
   `measurementCharts` from `measurements/server/service`. They take `db` and
   `tenant` as parameters and only read, so they carry no ambient authority —
   the caller must already hold a scoped context. The rejected alternative was
   a second query drawing the same lactate curve, which would drift from this
   one the moment either changed.
2. `reports/index.ts` re-exports `createAnalysisAction` from `server/actions`
   for the single caller outside the slice: completing an assessment.

A further export out of `server/` needs the same three things in its doc
comment: which caller needs it, why a tRPC procedure will not do, and what
stops it becoming a second authorization path.
