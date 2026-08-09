# documents

Documents belonging to an Athlete — medical findings, MRI reports, blood tests,
uploaded training plans, invoices.

A Document is a living object: it may be replaced or updated at any time.
Uploaded PDF training plans are Documents; structured plans built inside Apex OS
are Programs.

## Context ladder

| Level            | Required |
| ---------------- | -------- |
| Athlete          | always   |
| Performance Case | optional |
| Assessment       | optional |
| Module           | optional |

The athlete link does **not** depend on portal access. A medical report must be
filable for an athlete who has no user account — that is the default case.

## Scope

- Upload by Coach or Athlete — the Athlete through the portal, never under
  Shared Access
- Assignment along the context ladder
- Replacement and versioning of living documents
- Use as evidence for an Insight

## Not in this slice

- **Videos** → `features/videos` — a Video is not a document type
- **Structured training plans** → `features/programs`
- **Upload and storage mechanics** → `src/services`
- **Visibility** → `features/reports/sharing`

_Not implemented yet — see docs/domain/DOMAIN_DECISIONS.md §18._
