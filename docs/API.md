# API

> Status: **Foundation implemented** · Last updated: 2026-08-02
>
> Source of truth: [`apps/web/src/server/api/`](../apps/web/src/server/api/).

## Contents

1. [Surfaces](#1-surfaces)
2. [tRPC setup](#2-trpc-setup)
3. [Procedure ladder](#3-procedure-ladder)
4. [Calling the API](#4-calling-the-api)
5. [Adding a router](#5-adding-a-router)
6. [Validation](#6-validation)
7. [Error handling](#7-error-handling)
8. [Server Actions](#8-server-actions)
9. [Conventions](#9-conventions)
10. [Public API](#10-public-api)

---

## 1. Surfaces

| Surface        | Route                | Purpose                                       |
| -------------- | -------------------- | --------------------------------------------- |
| tRPC           | `/api/trpc/[trpc]`   | Typed application API — queries and mutations |
| Better Auth    | `/api/auth/[...all]` | Sign-in, sign-up, OAuth callbacks, session    |
| Server Actions | inline               | Form submissions with progressive enhancement |

Why both tRPC and Server Actions, and how they avoid duplicating logic:
[ARCHITECTURE.md ADR-002](./ARCHITECTURE.md#adr-002--trpc-alongside-server-actions).

## 2. tRPC setup

| Piece                           | File                                                    |
| ------------------------------- | ------------------------------------------------------- |
| Context, procedures, middleware | `src/server/api/trpc.ts`                                |
| Root router                     | `src/server/api/root.ts`                                |
| Feature routers                 | `src/server/api/routers/*` and `src/features/*/server/` |
| HTTP handler                    | `src/app/api/trpc/[trpc]/route.ts`                      |
| Server-side caller              | `src/trpc/server.ts`                                    |
| Client provider                 | `src/trpc/client.tsx`                                   |

**Transformer:** `superjson` — `Date`, `Map`, `Set` and `BigInt` survive the
wire. In a training and calendar domain, dates crossing the boundary as strings
would mean parsing at every call site.

**Context** (`createTRPCContext`) resolves the session once per request and
exposes `{ db, headers, session }`.

**Timing middleware** adds a 50–250ms artificial delay in development only. This
is deliberate: it makes a missing loading state fail locally instead of on a
customer's slow connection.

## 3. Procedure ladder

Each level adds one guarantee. Pick the **narrowest** one that works.

| Procedure               | Guarantees                                                             | Use for                                   |
| ----------------------- | ---------------------------------------------------------------------- | ----------------------------------------- |
| `publicProcedure`       | nothing                                                                | Genuinely public data only                |
| `protectedProcedure`    | `ctx.session.user` exists                                              | Account-level, cross-organization actions |
| `organizationProcedure` | `ctx.tenant` = `{ organizationId, userId, role }`, membership verified | **The default for feature code**          |
| `withPermission(p)`     | the above **plus** role holds permission `p`                           | Anything privileged                       |

```ts
export const athletesRouter = createTRPCRouter({
  list: organizationProcedure
    .input(listAthletesSchema)
    .query(({ ctx, input }) => listAthletes(ctx.tenant, input)),

  update: withPermission('athlete:write')
    .input(updateAthleteSchema)
    .mutation(({ ctx, input }) => updateAthlete(ctx.tenant, input)),
});
```

**The critical invariant:** the tenant scope comes from
`session.activeOrganizationId`, never from client input. A procedure that
accepts `organizationId` as an input parameter is a cross-tenant vulnerability —
treat it as a blocking review comment.

## 4. Calling the API

**Server Component** — direct caller, no HTTP round trip:

```ts
import { api } from '@/trpc/server';

export default async function Page() {
  const health = await api.health.check();
  return <pre>{JSON.stringify(health)}</pre>;
}
```

**Client Component** — tRPC + TanStack Query:

```tsx
'use client';
import { useTRPC } from '@/trpc/client';
import { useQuery } from '@tanstack/react-query';

export function HealthBadge() {
  const trpc = useTRPC();
  const { data } = useQuery(trpc.health.check.queryOptions());
  return <span>{data?.status}</span>;
}
```

## 5. Adding a router

1. Write the router in `src/features/<slice>/server/router.ts`, next to its
   use-cases and schemas.
2. Register it in `src/server/api/root.ts`.

```ts
export const appRouter = createTRPCRouter({
  health: healthRouter,
  athletes: athletesRouter, // ← one line
});
```

That one line is the whole registration surface, which is what makes a feature
slice deletable in a single commit.

Keep routers thin — they validate, authorize and delegate. Business logic lives
in use-case functions so Server Actions can call the same code.

## 6. Validation

Zod, everywhere, at the boundary.

- Input schemas live in `features/<slice>/schemas/`.
- Shared primitives (`cuid`, `email`, pagination, sorting) come from
  `@apex/types` — do not redefine them per feature.
- Derive TypeScript types from schemas (`z.infer`), never declare both.
- Environment variables are validated in `apps/web/src/env.ts`.

_Output_ schemas are intentionally not enforced: the router's return type is
already inferred end to end, and a second schema would duplicate it. Add one
only where a response must be stable independently of the database shape (e.g.
the future public API).

## 7. Error handling

Throw `TRPCError` with an `AppError` cause:

```ts
throw new TRPCError({
  code: 'NOT_FOUND',
  message: 'Athlete not found.',
  cause: AppError.notFound('Athlete'),
});
```

The error formatter attaches:

- `zodError` — flattened issues, consumable directly by the form layer
- `appErrorCode` — a stable machine-readable code for client branching

| tRPC code               | HTTP | When                                                |
| ----------------------- | ---- | --------------------------------------------------- |
| `BAD_REQUEST`           | 400  | Invalid input                                       |
| `UNAUTHORIZED`          | 401  | Not signed in                                       |
| `FORBIDDEN`             | 403  | Signed in, not permitted, or no active organization |
| `NOT_FOUND`             | 404  | Missing, **or hidden by tenant scope**              |
| `CONFLICT`              | 409  | Uniqueness/state conflict                           |
| `TOO_MANY_REQUESTS`     | 429  | Rate limited _(TBD)_                                |
| `INTERNAL_SERVER_ERROR` | 500  | Unexpected                                          |

Never put an internal detail — SQL, stack trace, another tenant's data — in
`message`. It reaches the browser. Note that a row belonging to another tenant
must return `NOT_FOUND`, not `FORBIDDEN`: `FORBIDDEN` confirms the record exists.

## 8. Server Actions

```ts
'use server';

export async function updateProfileAction(formData: FormData) {
  const input = updateProfileSchema.parse(Object.fromEntries(formData));
  const tenant = await requireTenant(); // same guard the procedure uses
  return updateProfile(tenant, input); // same use-case
}
```

Rules: `'use server'` files are public HTTP endpoints — always re-validate input
and re-check authorization inside the action. Never trust that the calling
component already did.

## 9. Conventions

| Rule                                                    | Reason                                                                          |
| ------------------------------------------------------- | ------------------------------------------------------------------------------- |
| `list` / `byId` / `create` / `update` / `delete` naming | Predictable across slices                                                       |
| Queries are side-effect free                            | They may be prefetched, retried and cached                                      |
| Everything list-shaped is paginated                     | An unpaginated list is a production incident waiting for its first large tenant |
| One router per feature slice                            | Keeps the delete-ability property                                               |
| No `organizationId` in any input schema                 | Scope comes from the session — see §3                                           |

## 10. Public API

_TBD (Phase 4)._ A versioned REST/OpenAPI surface for integrations, plus
webhooks. tRPC stays the internal contract; the public API will be a separate,
explicitly versioned layer — internal procedures change too freely to be
exposed to third parties.

---

**Related:** [ARCHITECTURE.md](./ARCHITECTURE.md) · [DATABASE.md](./DATABASE.md) ·
[SECURITY.md](./SECURITY.md)
