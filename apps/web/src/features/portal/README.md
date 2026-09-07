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

## Activation

The Coach creates the Athlete; the portal only ever grants access to that
existing record. There is no registration, no "create your profile", and no way
to reach a second athlete.

A coach issues a personal link from the athlete's page. The athlete opens it,
sets their own password, and signs in normally afterwards. The link is an
activation credential rather than a session: it is spent on first use, it
expires, and issuing a new one supersedes it.

Only the link's hash is stored (`AthleteActivation`), so a leaked database
contains no working links, and the address is frozen at the moment it is sent —
an edit to the record afterwards cannot redirect the account.

Activation writes the `User` and its credential row directly rather than going
through Better Auth's public sign-up, which would provision a coach profile and
a personal workspace. `activeOrganizationForSession` is the other half of that
gate: an account linked to an Athlete is answered from that Athlete's Workspace
and never reaches provisioning.

## Scope

- [x] Issuing, withdrawing and redeeming a personal access link
- [x] Portal layout — `/portal`, with no athlete in any address
- [x] Reading the analyses the Coach has shared
- [x] Recording Tracking Entries — Nutrition, Biofeedback, Cycle
- [ ] Upload of Documents, photos and Videos into the athlete's own area
- [ ] Writing Notes on their own record
- [ ] Status updates on assigned Recommendations
- [ ] Appointment overview

## Shared analyses

An analysis appears in the portal when two things are true: the report is about
this athlete, and the Coach has granted a Share (§17) that is neither withdrawn
nor expired. Both facts are already recorded, so nothing new decides visibility —
the Coach keeps the one control they had, and revoking a link closes the portal
page with it.

What the account replaces is the **password**, not the share. On a link the
password is the only proof of who is reading; in the portal the session is, and
it is the stronger of the two. Athletes without an account keep reading through
`/geteilt/<token>` exactly as before.

## Constraints

- The Athlete **contributes** to an Assessment; the Coach **owns** it. The
  athlete never edits Measurements, Insights, Recommendations or Reports.
- The Athlete never edits their master data either — height, weight, sex and
  date of birth are inputs to the coach's calculations (§21).
- Nothing the Coach produces is visible without an active Share. Notes the
  Athlete writes go the other way and reach the Coach immediately.
- Every portal procedure resolves the Athlete from the **session**. An
  `athleteId` in a request is never on its own a reason to answer it: the
  workspace scope that suffices for a Coach does not suffice here.

_Activation is built. The surface behind it is not — see
docs/domain/DOMAIN_DECISIONS.md §21._
