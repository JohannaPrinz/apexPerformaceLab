# cases

Performance Cases and their Goals — the structural container of an athlete's
journey.

A Case provides continuity over time; the Assessments inside it capture
individual evaluation points. Every Assessment belongs to exactly one Case, and
every Case to exactly one Athlete.

This slice owns the Case lifecycle, including the automatic creation that keeps
the Case mandatory in the model without ever becoming a manual step for the
user.

## Scope

- Case list, detail and lifecycle (`OPEN` → `CLOSED` → `ARCHIVED`)
- Case types: `SINGLE_ASSESSMENT` and `ONGOING`
- Automatic Case creation when an Assessment starts without an open Case
- Goals: title, target date, achieved date
- Case-level overview of Assessments, Appointments, Notes and files

_Not implemented yet — see docs/domain/DOMAIN_DECISIONS.md §8, §9._
