# Features

Vertical slices. Each directory is one product domain and owns everything that
domain needs — UI, server logic, validation, hooks.

The slice names follow the domain model in
[docs/domain/DOMAIN_DECISIONS.md](../../../../docs/domain/DOMAIN_DECISIONS.md).
When the domain and this directory disagree, the domain wins.

## Why slices instead of technical layers

A layered layout (`components/`, `hooks/`, `services/` at the top level) makes
every change touch four distant directories, and it gives no signal about which
code belongs together. Slicing by domain means a feature can be understood,
reviewed, and eventually deleted as a unit.

## Slice layout

Create only the parts a slice actually needs:

```text
features/<slice>/
  components/     UI specific to this slice ('use client' where interactive)
  server/
    router.ts     tRPC router — registered in src/server/api/root.ts
    service.ts    business logic; the only place that touches @apex/database
    actions.ts    Server Actions; thin wrappers that call the service
  schemas/        Zod schemas — the slice's input/output contract
  hooks/          client-side hooks
  index.ts        public surface of the slice
```

## Rules

1. **No cross-slice imports.** If `training` needs something from `athletes`,
   that thing belongs in `@apex/types`, `src/lib/`, or a shared service. A
   direct import between slices is how a modular codebase quietly becomes a
   monolith.
2. **Import through `index.ts`.** Never reach into another slice's internals.
3. **`server/` is server-only.** It may import `@apex/database` and `@apex/auth`;
   nothing under `components/` may.
4. **Authorization lives in `server/`.** Never in a component — a hidden button
   is not an access control.

## Planned slices

### Domain core

The chain from [DOMAIN_DECISIONS §3](../../../../docs/domain/DOMAIN_DECISIONS.md):
`Workspace → Athlete → Performance Case → Assessment → Module → Measurement`

| Slice             | Scope                                                            |
| ----------------- | ---------------------------------------------------------------- |
| `athletes`        | Roster, profiles, portal activation                              |
| `cases`           | Performance Cases and Goals — the structural container           |
| `assessments`     | Assessments, module composition, presets, the mandatory question |
| `insights`        | Interpretation of measurements and their evidence                |
| `recommendations` | Measures derived from insights, with their lifecycle             |
| `reports`         | Reports across `MODULE`, `ASSESSMENT` and `CASE` scope           |

### Supporting objects

Attached through the context ladder (Athlete → Case → Assessment → Module):

| Slice          | Scope                                       |
| -------------- | ------------------------------------------- |
| `documents`    | Medical findings, files, uploaded plans     |
| `videos`       | Video with annotations and AI analysis      |
| `programs`     | Structured coaching plans built in Apex OS  |
| `notes`        | Free-form text, written by Coach or Athlete |
| `appointments` | Scheduled events, including competitions    |

### Cross-cutting surfaces

| Slice      | Scope                                            |
| ---------- | ------------------------------------------------ |
| `timeline` | The athlete's complete history, as a projection  |
| `portal`   | The athlete-facing surface and its access models |

### Frame

No domain object of their own, but each is its own work area:

| Slice       | Scope                                            |
| ----------- | ------------------------------------------------ |
| `auth`      | Sign-in/up, workspace switching, invitations     |
| `dashboard` | Coach overview and KPI surfaces                  |
| `settings`  | Workspace, coach profile, catalogue, preferences |

## Sub-areas

Two domain objects are organised inside the slice that owns their lifecycle
rather than as top-level slices:

| Directory                  | Why it lives there                                                                                    |
| -------------------------- | ----------------------------------------------------------------------------------------------------- |
| `assessments/measurements` | A Measurement always belongs to exactly one Module, and through it to exactly one Assessment.         |
| `reports/sharing`          | Sharing is what happens to a Report after publication; the grant is issued from the report lifecycle. |

## Deliberately not slices

| Term                                | Where it belongs instead                                                                       |
| ----------------------------------- | ---------------------------------------------------------------------------------------------- |
| `training`, `nutrition`, `sleep`, … | **Modules.** Module behaviour lives in the registry in `packages/domain`.                      |
| Measurement Type catalogue          | `packages/domain` — the model; `features/settings` — the admin surface                         |
| `analysis`, `performance`           | No equivalent in the domain. Use `insights`, `assessments/measurements` or `timeline`.         |
| Evidence, Task, Follow-Up           | Not objects. Evidence is a relation, Task is a Recommendation status, Follow-Up is a workflow. |
