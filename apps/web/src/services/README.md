# services

Business logic that is **not** owned by a single feature slice.

A service here is plain TypeScript: it takes a `TenantContext`, does work, and
returns a `Result`. It never imports React, never reads `headers()`, and never
knows whether its caller was a tRPC procedure, a Server Action, or a background
job. That constraint is what makes the logic testable and reusable.

Slice-owned logic belongs in `features/<slice>/server/service.ts` instead — put
something here only once a second slice needs it.

## Candidates

| Service        | Responsibility                                     |
| -------------- | -------------------------------------------------- |
| `billing`      | Subscription state, plan limits, quota enforcement |
| `notification` | Fan-out across email, in-app and push              |
| `audit`        | Append-only record of tenant-scoped mutations      |
| `storage`      | Signed upload/download URLs over Cloudflare R2     |

_None implemented yet._
