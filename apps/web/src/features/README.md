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

## Slices

Every directory under `features/` appears below. **README only** means the
directory holds a `README.md` describing its intended scope and no code yet —
it is a placeholder, not a missing implementation.

### Domain core

The chain from [DOMAIN_DECISIONS §3](../../../../docs/domain/DOMAIN_DECISIONS.md):
`Workspace → Athlete → Performance Case → Assessment → Module → Measurement`

| Slice             | Scope                                                            | Status      |
| ----------------- | ---------------------------------------------------------------- | ----------- |
| `athletes`        | Roster, profiles, portal activation, file shelf, tracking tables | built       |
| `cases`           | Performance Cases and Goals — the structural container           | built       |
| `assessments`     | Assessments, module composition, presets, the mandatory question | built       |
| `reports`         | Reports across `MODULE`, `ASSESSMENT` and `CASE` scope           | built       |
| `insights`        | Interpretation of measurements and their evidence                | README only |
| `recommendations` | Measures derived from insights, with their lifecycle             | README only |

### Supporting objects

Attached through the context ladder (Athlete → Case → Assessment → Module):

| Slice          | Scope                                       | Status      |
| -------------- | ------------------------------------------- | ----------- |
| `documents`    | Medical findings, files, uploaded plans     | README only |
| `videos`       | Video with annotations and AI analysis      | README only |
| `programs`     | Structured coaching plans built in Apex OS  | README only |
| `notes`        | Free-form text, written by Coach or Athlete | README only |
| `appointments` | Scheduled events, including competitions    | README only |

> [!NOTE]
> Files and video are already in the product, but not through these two slices.
> Storage and deletion live in `src/services/assets`, the coach's shelf in
> `athletes`, the athlete's in `portal`, and video analysis in `movement`.
> Whether `documents` and `videos` still become slices, or whether these
> directories should go, is an open question — it has not been decided here.

### Catalogues

Workspace- and system-owned reference data, not attached to an athlete:

| Slice       | Scope                                                         | Status |
| ----------- | ------------------------------------------------------------- | ------ |
| `exercises` | The exercise catalogue, its variants and relationships (§12a) | built  |

Measurement Types have no slice: the model is in `packages/domain`, the admin
surface belongs to `settings`.

### Analysis

| Slice      | Scope                                                                  | Status |
| ---------- | ---------------------------------------------------------------------- | ------ |
| `movement` | Movement analysis from video, evaluated on the device — see its README | built  |

### Independent tracking

| Slice   | Scope                                                           | Status |
| ------- | --------------------------------------------------------------- | ------ |
| `cycle` | Documented bleeding, deliberately independent of any assessment | built  |

`cycle` is schemas and a router only; the rules live in
`src/services/tracking/cycle.ts`, because the coach's screens and the athlete's
portal both write them.

### Cross-cutting surfaces

| Slice      | Scope                                            | Status      |
| ---------- | ------------------------------------------------ | ----------- |
| `portal`   | The athlete-facing surface and its access models | built       |
| `timeline` | The athlete's complete history, as a projection  | README only |

### Frame

No domain object of their own, but each is its own work area:

| Slice       | Scope                                            | Status      |
| ----------- | ------------------------------------------------ | ----------- |
| `auth`      | Sign-in/up, workspace switching, invitations     | built       |
| `dashboard` | Coach overview and KPI surfaces                  | README only |
| `settings`  | Workspace, coach profile, catalogue, preferences | README only |

### Not a slice

| Directory  | What it is                                                                                                                                                                                         |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pose-poc` | A technical spike behind `app/(poc)/poc/pose/`: can browser pose detection run smoothly on a tablet? Stores nothing, knows neither Assessment nor Athlete nor Measurement. Removed with the trial. |

## Sub-areas

Two domain objects are organised inside the slice that owns their lifecycle
rather than as top-level slices:

| Directory                  | Why it lives there                                                                                    |
| -------------------------- | ----------------------------------------------------------------------------------------------------- |
| `assessments/measurements` | A Measurement always belongs to exactly one Module, and through it to exactly one Assessment.         |
| `reports/sharing`          | Sharing is what happens to a Report after publication; the grant is issued from the report lifecycle. |

## Deliberately not slices

| Term                                | Where it belongs instead                                                                                                                                                                                                     |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `training`, `nutrition`, `sleep`, … | **Modules.** Module behaviour lives in the registry in `packages/domain`.                                                                                                                                                    |
| Measurement Type catalogue          | `packages/domain` — the model; `features/settings` — the admin surface                                                                                                                                                       |
| `analysis`, `performance`           | No equivalent in the domain as generic terms. Use `insights`, `assessments/measurements` or `timeline`. `movement` is not a counter-example: it is one named analysis method over video, not a home for analysis in general. |
| Evidence, Task, Follow-Up           | Not objects. Evidence is a relation, Task is a Recommendation status, Follow-Up is a workflow.                                                                                                                               |
