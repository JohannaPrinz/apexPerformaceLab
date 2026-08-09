# timeline

The athlete's complete performance history in one chronological surface.

Assessments, Reports, Measurements, Documents, Videos, Programs,
Recommendations and Appointments all contribute to it. The timeline spans **all**
Performance Cases of an athlete.

## A projection, not a second source of truth

Every entry points back to the object it represents. The timeline never holds
data of its own and is never written to directly by another slice — it is
derived from the domain objects.

This is what allows the full history to be read in one query without
denormalising the athlete reference onto every table.

## Scope

- Chronological view across all Cases of an athlete
- Filtering by entry type and time range
- Navigation from an entry to the underlying object

## Constraint

Every new feature should enrich the timeline. Never create isolated feature
silos.

_Not implemented yet — see docs/domain/DOMAIN_DECISIONS.md §22._
