# reports

Reports — the professional conclusion of an assessment at a point in time.

One object with three scopes, not three objects:

| Scope        | Summarises                                         |
| ------------ | -------------------------------------------------- |
| `MODULE`     | one Module                                         |
| `ASSESSMENT` | all Module Reports of one Assessment               |
| `CASE`       | all Assessments of one Performance Case (optional) |

All three share status, versioning, PDF export and sharing — which is why they
are one slice with one state machine rather than three parallel implementations.

## Status

```
DRAFT → PUBLISHED → ARCHIVED
```

Publication is the point of no return. A published Report is immutable, and
publishing also freezes the Insights and Recommendations it contains. Any later
change requires a new Report version or a new Assessment.

## What the Coach sees

Three states in the interface. Two are stored, the third is derived:

| The Coach sees                       | Stored as                              |
| ------------------------------------ | -------------------------------------- |
| **Draft** — still working on it      | `status = DRAFT`                       |
| **Finished** — done, not handed over | `status = PUBLISHED`, no active Share  |
| **Shared** — the Athlete has it      | `status = PUBLISHED` + an active Share |

Finishing is a statement about the content; sharing is a statement about access.
Deriving the third state rather than storing it is what lets the interface say
_shared with two recipients_, _expired yesterday_ or _shared until 31 December_ —
all of which a single `SHARED` enum value would flatten.

## Scope

- Report composition per scope
- Draft editing, publication, versioning, archiving
- Interactive rendering and PDF export
- `sharing/` — see below

## Sub-areas

| Directory  | Responsibility                                         |
| ---------- | ------------------------------------------------------ |
| `sharing/` | Granting, limiting and revoking visibility of a Report |

_Not implemented yet — see docs/domain/DOMAIN_DECISIONS.md §16, §17._
