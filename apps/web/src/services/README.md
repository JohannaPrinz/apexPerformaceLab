# services

Business logic that is **not** owned by a single feature slice.

A service here is plain TypeScript: it takes a `TenantContext`, does work, and
returns a `Result`. It never imports React, never reads `headers()`, and never
knows whether its caller was a tRPC procedure, a Server Action, or a background
job. That constraint is what makes the logic testable and reusable.

Slice-owned logic belongs in `features/<slice>/server/service.ts` instead — put
something here only once a second slice needs it.

## Here now

| Service             | Responsibility                                                               |
| ------------------- | ---------------------------------------------------------------------------- |
| `assets/`           | An athlete's files and their shelves, deletion, and the video analysis lease |
| `tracking/`         | Tracking entries and bleeding episodes — see its own README                  |
| `case-provisioning` | Creating the Performance Case an object needs (§8)                           |

Each earned its place the same way: a second surface needed it. `assets` and
`tracking` are reached by both the coach's screens and the athlete's portal;
`case-provisioning` by `cases` for the deliberate path and `assessments` for the
automatic one. What is **not** shared is the authorization — each surface keeps
its own procedures, and that difference stays in the routers.

## Candidates

| Service        | Responsibility                                     |
| -------------- | -------------------------------------------------- |
| `billing`      | Subscription state, plan limits, quota enforcement |
| `notification` | Fan-out across email, in-app and push              |
| `audit`        | Append-only record of tenant-scoped mutations      |

_Not implemented._
