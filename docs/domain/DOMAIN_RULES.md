# Apex OS – Development Rules

> These rules are mandatory for every architectural and implementation decision.
> If a planned implementation conflicts with any rule, stop and propose an alternative before writing code.
>
> These rules are the _how_. The binding definitions of the domain objects live in
> [DOMAIN_DECISIONS.md](./DOMAIN_DECISIONS.md), which takes precedence in case of doubt.

---

## 1. Domain First

The domain defines the software.

Never design features around technology.
Always design technology around the coaching workflow.

---

## 2. Assessment First

Every meaningful piece of information belongs to an Assessment.

The domain follows one hierarchy:

```
Workspace → Athlete → Performance Case → Assessment → Module → Measurement
```

Every Assessment belongs to exactly one Performance Case.

Every Performance Case belongs to exactly one Athlete.

An Athlete may have multiple Performance Cases.

A Case is mandatory in the model but never a manual step for the user —
it is created automatically when none is open.

This rule and Rule 7 do not compete. The Performance Case is the structural
container of an athlete's journey; Assessments are the primary working units
within a Case where observations, measurements, insights and recommendations
are created. The Case provides continuity over time, while Assessments capture
individual evaluation points.

---

## 3. Context over Data

Raw data without context has no value.

Every Measurement references exactly one Measurement Type
and belongs to exactly one Module.

Through the Module it belongs to one Assessment,
one Performance Case,
one Athlete
and one Workspace.

Every Measurement additionally carries:

- a capture timestamp
- a side (`LEFT`, `RIGHT` or `BILATERAL`)
- an origin (manual, device, import or derived)

Never create orphan measurements.

**Derive the chain, do not duplicate it.** Athlete, Case and Assessment are
reached through the Module. They are never stored a second time on the
Measurement. Where the full history must be read in one query, use the
Athlete Timeline projection (Rule 10).

---

## 4. Measurements are Facts

Measurements contain objective data only.

Examples:

- Lactate
- Heart Rate
- Range of Motion
- Grip Strength
- Pace

Measurements never contain interpretations.

Measurements are never edited. A correction is a new Measurement that
supersedes the previous one; the original stays visible.

Side belongs to the Measurement. The Measurement Type defines name, unit,
value type and reference information — never the side.

**Only the Coach records Measurements.** What the Athlete records themselves —
body weight, steps, heart rate, training loads — and what their device delivers
is a **Tracking Entry**: same Measurement Type catalogue, no Module, correctable
by the Athlete, and never evidence for an Insight. A self-report does not carry
the weight of a diagnostic finding, and the model says so rather than leaving it
to whoever writes the query.

---

## 5. Insights create Recommendations

Interpretation happens in Insights.

Every Insight records its evidence — a Measurement, a Video, a Document or a Note.
Evidence is a relation between the Insight and what supports it, never an object.

Recommendations are always based on Insights.

Never generate recommendations directly from measurements.

Flow:

```
Measurement → Insight → Recommendation
```

A Recommendation is itself the action. There is no separate Action,
Intervention, Measure or Task object — only a Recommendation with a status.

---

## 6. Every Assessment answers a Question

Assessments are performed to answer a specific coaching question.

The question is a mandatory field on the Assessment.
There is no separate Question object.

Never collect data without a purpose.

---

## 7. Performance Case is the Core

Everything belongs to a Performance Case.
A Performance Case represents a coaching objective.

Examples:

- Initial Analysis
- HYROX Preparation
- Return to Sport
- Offseason
- Performance Coaching

A Case may contain multiple Assessments.

A Case is either a one-time examination or a long-term coaching relationship.
Both use the same structure.

The Case is the structural container; the work happens in its Assessments
(Rule 2). The Case gives the frame, the Assessment fills it.

---

## 8. Modular by Design

Every assessment consists of independent modules.

Canonical module list:

```
running · strength · movement · mobility · lactate
body_composition · nutrition · recovery · sleep · cycle · custom
```

The authoritative list with display names lives in
[DOMAIN_DECISIONS.md §11](./DOMAIN_DECISIONS.md).

New modules must be addable without changing existing ones.
A module key is data; module behaviour lives in a registry in code.
Adding a module requires no migration.

Every Module contains:

- Measurements
- Insights
- Recommendations
- a Module Report

**Module names are domain terms only.**

- **Device manufacturers are not modules.** VALD, MYOACT, Garmin and Polar are
  data sources. Their measurements are assigned to the appropriate module;
  the origin is recorded on the measurement.
- **Competition formats are not modules.** HYROX and similar formats are
  Assessment Presets — named combinations of modules such as
  `hyrox`, `movement_screening` or `lactate_test`.
  A preset name never equals a module key.
- **Video is not a module.** Video is a domain object of its own.

---

## 9. Coach-Centered AI

AI supports the coach.

AI never replaces professional judgement.

The coach always makes the final decision.

---

## 10. Athlete Timeline

Apex OS stores the complete performance history.

Every new feature should enrich the athlete's timeline.

All Assessments, Reports, Measurements, Documents, Videos,
Programs, Recommendations and Appointments contribute to the Athlete Timeline.

The timeline is a projection over the domain objects, not a second source of
truth. Every entry points back to the object it represents.

Never create isolated feature silos.

---

## 11. Mobile First

All workflows must work on mobile devices.

The platform is designed for coaches working on-site.

---

## 12. API First

Every core feature should be designed to be accessible through APIs.

Future integrations are expected.

Every measurement imported from an external system carries that system's own
identifier, so repeating an import can never create duplicates within a
Workspace. The Workspace is part of that key: external identifiers are only
unique inside the system that issued them.

---

## 13. Extensibility over Optimization

Prefer scalable architecture over short-term optimizations.

The platform should support new sports, devices and assessment methods without redesigning the core.

---

## 14. Scientific Thinking

The coaching process follows this model:

```
Question → Assessment → Evidence → Insight → Recommendation → Re-Assessment
```

The platform should always reinforce this workflow.

_Evidence_ here means the measurements, videos and documents an Insight rests on.
Carrying out a Recommendation is a status on that Recommendation,
not a separate step in the model.

---

## 15. One Source of Truth

Every piece of information exists exactly once.

Avoid duplicated data.

Derive instead of duplicate.

If two terms describe the same thing in a different state,
it is one object with a status field.

If two objects behave identically at different levels,
it is one object with a scope field.

Authentication and Domain Models are separated.

A User Account never replaces an Athlete.

---

## 16. User Accounts are Optional

Every person is always represented by an Athlete.

User Accounts are optional.

An Athlete may exist without authentication.

A User Account may later be linked to an existing Athlete.

Never create duplicate athletes. This is enforced by duplicate detection when an
Athlete is created, not by a database key — name, e-mail and date of birth are
all optional, so no natural key exists (§7).

Nothing in the domain may depend on an Athlete having an account.
Documents, videos and reports are filed against the Athlete either way.

**Deactivating an Athlete does not close their account — it makes the portal
read-only.** They keep seeing and downloading their own record; every write
stops. Closing the account is the Athlete's own act, whenever they are ready.

A coaching relationship does not always end amicably, and cutting someone off
from their own health record without warning is neither decent nor defensible
under Art. 9 GDPR. The read-only state costs nothing and removes the need for
the Athlete to have anticipated the end.

A Coach profile is organisation-independent; a person is not owned by a
Workspace. Organisational affiliation is a Membership (§6).

---

## 17. Reports are Immutable

A Report represents the professional conclusion of an Assessment at a specific point in time.

A Report is one object with a scope of `MODULE`, `ASSESSMENT` or `CASE`.

Status:

```
DRAFT → PUBLISHED → ARCHIVED
```

Reports may be edited while in `DRAFT` status.

**Once a Report is published, it becomes immutable.**

Publishing also freezes the Insights and Recommendations it contains.

Any future changes require a new Report version or a new Assessment.

Sharing is not a status and is not the point of no return.
Sharing only controls visibility and never changes report content.

This ensures scientific traceability and preserves the Athlete's performance history.

---

## 18. Visibility is Explicit

Nothing is visible to an Athlete unless a Coach has shared it.

Sharing is a separate grant, not a flag on the shared object.
The same resource may be shared with several recipients under different
conditions, and any grant may be revoked without deleting the resource.

Content and access have separate lifecycles:

```
Report   DRAFT → PUBLISHED → ARCHIVED     the content
Share    ACTIVE → EXPIRED                 the access to it
```

A Share expires either by time limit or by revocation — both reach the same
terminal state. Neither lifecycle drives the other.

---

## Before implementing any feature

Verify:

- Does it support the coaching workflow?
- Does it fit the domain model?
- Does it belong to a Performance Case?
- Does it belong to an Assessment?
- Is it modular?
- Is it mobile-friendly?
- Is it extensible?
- Does it preserve a single source of truth?
- Does it introduce a new object where a status or scope would do?

If any answer is "No", explain why before implementation.
