# assessments

Assessments — the primary working units where observations, measurements,
insights and recommendations are created.

An Assessment is a snapshot of an athlete at one point in time. Its type
describes only the position in the process (`INITIAL`, `RE_ASSESSMENT`,
`FOLLOW_UP`); its content comes solely from the selected Modules.

Every Assessment answers a `question` — a mandatory field, because data is never
collected without a purpose.

## Scope

- Assessment creation, detail and comparison over time
- The mandatory coaching question
- Module composition, individually or via an Assessment Preset
- Module-by-module comparison across Assessments
- `measurements/` — see below

## Sub-areas

| Directory       | Responsibility                                     |
| --------------- | -------------------------------------------------- |
| `measurements/` | Recording and viewing Measurements within a Module |

Measurements live here rather than in a slice of their own: a Measurement always
belongs to exactly one Module, and through it to exactly one Assessment. The
Measurement Type catalogue is not part of this slice — it belongs to
`packages/domain`.

Module behaviour (validation schema, measurement types, report renderer) lives
in the module registry in `packages/domain`, never in this slice. Adding a
module must not require a change here.

_Not implemented yet — see docs/domain/DOMAIN_DECISIONS.md §10, §11, §13._
