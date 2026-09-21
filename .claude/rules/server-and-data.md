---
paths:
  - 'apps/web/src/features/*/server/**/*.ts'
  - 'apps/web/src/features/*/*/server/**/*.ts'
  - 'apps/web/src/features/*/schemas/**/*.ts'
  - 'apps/web/src/features/*/*/schemas/**/*.ts'
  - 'apps/web/src/server/**/*.ts'
  - 'apps/web/src/services/**/*.ts'
  - 'apps/web/src/integrations/**/*.ts'
  - 'apps/web/src/app/**/route.ts'
  - 'packages/database/src/**/*.ts'
---

# Server & data rules

Reference: [docs/API.md](../../docs/API.md) ·
[docs/SECURITY.md §4](../../docs/SECURITY.md) ·
[docs/DATABASE.md §6](../../docs/DATABASE.md)

## Authorization

Pick the lowest rung that still holds what you need, from
`apps/web/src/server/api/trpc.ts`:

| Rung                                     | Grants                                           |
| ---------------------------------------- | ------------------------------------------------ |
| `publicProcedure`                        | nobody — genuinely public data only              |
| `protectedProcedure`                     | a signed-in user, no workspace                   |
| `organizationProcedure`                  | `ctx.tenant` — **the default for feature code**  |
| `coachProcedure`                         | `+ ctx.coach.id`, for recording authorship       |
| `athleteProcedure`                       | `+ ctx.athlete`, resolved from the session (§21) |
| `withPermission` / `withCoachPermission` | the above plus one `Permission`                  |

- **`organizationId` never appears in an input schema.** Scope is derived from
  `session.activeOrganizationId`.
- **A procedure on `athleteProcedure` takes no athlete id in its input at all.**
  Not accepting one means there is nothing to tamper with and nothing to forget
  to compare.
- Authorization lives in `server/`, never in a component. A hidden button is not
  an access control.
- Route handlers that return bytes cannot be procedures; they use
  `routeTenant()` from `src/server/tenant.ts`, which repeats the same two
  checks deliberately.

## Queries

- Build tenant filters with `scoped()` / `withTenant()` / `assertTenant()` from
  `@apex/database/tenant` — a greppable choke point, not per-call-site memory.
- After any lookup by primary key, assert ownership. An id alone never proves it.
- Everything list-shaped is paginated.
- Queries are side-effect free; they may be prefetched, retried and cached.
- Name procedures `list` / `byId` / `create` / `update` / `delete`.

## Slice layout

`router.ts` (registered once in `src/server/api/root.ts`) → `service.ts` (the
only module in the slice that touches `@apex/database`) → `actions.ts` (thin
Server Action wrappers that call the service, so there is one implementation and
one authorization path).

Neither `router.ts` nor `service.ts` is re-exported from the slice's `index.ts`.

## Services vs. integrations

`src/services/**` is business logic no single slice owns: plain TypeScript
taking a `TenantContext`, returning a `Result`, importing no React and reading
no `headers()`. Move something here only once a second slice needs it.

`src/integrations/**` wraps a vendor SDK behind our own function so a swap stays
one file. Credentials come from `src/env.ts`, never `process.env`.
