# reports / sharing

Granting, limiting and revoking access to a published Report.

Sharing belongs here because it is what happens to a Report after publication:
the Coach decides who may see it, under which conditions, and for how long.

## Share is an object, not a report status

**Report is the content. Share is the access to that content.**

Two independent lifecycles:

```
Report   DRAFT → PUBLISHED → ARCHIVED     the content
Share    ACTIVE → EXPIRED                 the access to it
```

Publishing does not create a Share. Sharing does not change a Report. Revoking
a Share leaves the Report untouched.

A Share reaches `EXPIRED` in one of two ways — the time limit passes, or the
Coach withdraws it. Both lead to the same terminal state, so there is one end
state, not two. An expired Share is never deleted: who had access, and until
when, is part of the audit trail.

A Share is a separate grant with its own fields:

| Field      | Purpose                                                        |
| ---------- | -------------------------------------------------------------- |
| Resource   | which Report, Document, Video, Program, Recommendation or Note |
| Token      | the secure link                                                |
| Password   | optional protection                                            |
| Expires at | optional time limit                                            |
| Revoked at | withdrawal without deleting the resource                       |

Keeping the grant separate from the resource is what allows one Report to be
shared with the athlete and with a treating physiotherapist under different
expiry, and any grant to be revoked without touching the Report.

## Scope

- Creating a secure link for a published Report
- Password protection and expiry
- Revocation
- Overview of active grants per Report

Although the Share object also covers Documents, Videos, Programs,
Recommendations and Notes, the grant logic lives here — it was built for the
Report lifecycle and is reused through this slice's public surface.

## Constraint

Nothing the Coach produces is visible to an Athlete without an active Share.

Sharing governs one direction only. What the Athlete contributes — uploads and
their own Notes — reaches the Coach immediately and needs no grant.

_Not implemented yet — see docs/domain/DOMAIN_DECISIONS.md §17._
