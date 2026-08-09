# notes

Free-form text. **Both Coach and Athlete may write one** — the Athlete through
the portal (§20). Under Shared Access there is no writing.

A Note is deliberately unconstrained: unlike a Recommendation, it does not need
to derive from an Insight. That is the whole point of the distinction: forcing
every observation through the Insight chain would either dilute Recommendations
or suppress notes entirely.

An Athlete writes notes about their own record — feedback on a Recommendation,
how a session felt, an observation between appointments. The coach's picture is
incomplete without what only the athlete can report.

A Note may itself serve as evidence for an Insight.

**Notes are always optional.** No workflow requires one.

## Visibility is asymmetric

| Direction       | Rule                                                             |
| --------------- | ---------------------------------------------------------------- |
| Coach → Athlete | Requires an active Share. Until then the Note is coach-internal. |
| Athlete → Coach | Immediate. The Coach sees everything in their own Workspace.     |

Coach notes are professional documentation and are released deliberately;
athlete notes are contributions to a record the Coach already owns.

## Context ladder

| Level            | Required |
| ---------------- | -------- |
| Athlete          | always   |
| Performance Case | optional |
| Assessment       | optional |
| Module           | optional |

Plus an optional link to an Appointment — what was discussed belongs to the
appointment it was discussed at. Only Notes have this fifth level.

## Scope

- Writing and editing notes, by Coach and by Athlete
- Assignment along the context ladder
- Notes captured during an Appointment
- Use as evidence for an Insight

## Not in this slice

- **Measures and actions** → `features/recommendations` — a Note is not a
  Recommendation
- **Granting visibility** → `features/reports/sharing`
- **Athlete-visible messaging** → nothing yet. Apex OS is not a chat system;
  communication features are supporting, not product core.

_Not implemented yet — see docs/domain/DOMAIN_DECISIONS.md §20._
