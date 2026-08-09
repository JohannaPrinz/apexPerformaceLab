# portal

The athlete-facing surface.

Portal access is optional and independent of the Athlete entity. Activating it
creates no new Athlete — the existing one simply receives a linked user account,
and no data migration is ever required.

This slice exists because the portal is a genuinely separate surface: its own
layout, its own navigation, and above all its own authorization path. An athlete
sees only what a Coach has explicitly shared.

## Two access models

| Model                       | Account             | Capabilities                                                                                                       |
| --------------------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **Shared Access** (default) | none                | View shared Reports, Documents, Videos, Programs, Recommendations and Notes through a secure link                  |
| **Athlete Portal**          | linked user account | The above, plus uploading Documents and Videos, writing Notes, and updating the status of assigned Recommendations |

Everything the Athlete _contributes_ requires an account. Under Shared Access
there is no upload, no writing and no status change — only reading.

## Scope

- Portal layout and navigation
- Reading shared content
- Upload of Documents and Videos by the athlete
- Writing Notes on their own record
- Status updates on assigned Recommendations
- Appointment overview

## Constraints

- The Athlete **contributes** to an Assessment; the Coach **owns** it. The
  athlete never edits Measurements, Insights, Recommendations or Reports.
- Nothing the Coach produces is visible without an active Share. Notes the
  Athlete writes go the other way and reach the Coach immediately.

_Not implemented yet — see docs/domain/DOMAIN_DECISIONS.md §21._
