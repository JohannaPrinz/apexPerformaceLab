# assessments / measurements

Recording and viewing Measurements inside an Assessment Module.

Measurements are facts. They are never edited — a correction is a new
Measurement that supersedes the previous one, and the superseded value stays
visible.

Every Measurement references exactly one Measurement Type and belongs to exactly
one Module. Athlete, Case and Assessment are reached through the Module and are
never stored a second time.

## Scope

- Measurement entry per Module, driven by the Module's Measurement Types
- Side selection (`LEFT`, `RIGHT`, `BILATERAL`)
- Origin display: manual entry, device, import or derived
- Corrections via supersede — never in-place edits
- Comparison of identical Measurement Types across Assessments

## Not in this directory

- **Measurement Type catalogue** → `packages/domain`
- **Interpretation of values** → `features/insights`

_Not implemented yet — see docs/domain/DOMAIN_DECISIONS.md §12, §13._
