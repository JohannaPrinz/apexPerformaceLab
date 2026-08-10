# @apex/domain

Domain logic and invariants — the rules neither the database nor the interface
can hold.

## What belongs here

**1. The module registry (§11).** A module is stored as a _string key_, never as
an enum, so adding one is an entry in this package instead of a migration
(DOMAIN_RULES #8).

**2. Invariants SQL cannot express.** The schema names each of these and says
they live here — see the `INVARIANTS REQUIRING RAW SQL` block at the end of
[`schema.prisma`](../database/prisma/schema.prisma):

- every Assessment has at least one Module (§26.6)
- every Insight records at least one piece of evidence (§14)
- every Recommendation references at least one Insight (§26.14)
- a published Report and its Insights/Recommendations are immutable (§4)
- a Measurement's value column matches its type's `valueType`
- a Video Annotation only attaches to an Asset of kind `VIDEO` (§18) — a CHECK
  cannot read another table's column

**3. Module behaviour** — each module's validation schema, its measurement types
and its report renderer, as those modules are built.

## What does not

Database access (`@apex/database`), transport shapes (`@apex/types`), anything
needing a request context. **This package is pure**, which is what makes the
invariants testable in isolation and reusable by a future job runner or API.

## Current contents

The registry only: the eleven canonical module keys and the three assessment
presets. Two rules are enforced by tests rather than by convention —

- a module key never carries a device, vendor or competition name
- a preset name never equals a module key, because they share one namespace in
  the interface and an overlap makes "choose `movement`" ambiguous

The invariants arrive with the objects they constrain. Writing them now, for
features that do not exist, would produce rules nobody can check against a real
screen.
