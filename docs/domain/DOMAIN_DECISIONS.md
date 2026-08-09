# Apex OS – Domain Decisions

> Status: Accepted
> Version: 2.1
> Purpose: This document contains the authoritative domain decisions for Apex OS.
> All future implementations must comply with this document.
>
> Where this document and any other document disagree, this one applies.

---

## 1. Vision

Apex OS is a scientific performance assessment platform for coaches and athletes.

The platform is built around diagnostics, objective measurements and evidence-based coaching.

The goal is **not** to replace the coach.

The goal is to help coaches make better decisions.

---

## 2. Core Principles

### Coach First

The coach owns the coaching process.

AI and software assist the coach but never replace professional judgement.

### Athlete Centered

Everything belongs to the athlete.

Every assessment, report, document and recommendation contributes to the athlete's long-term performance history.

### Assessment Driven

The platform revolves around Assessments.

Programs, reports and recommendations are outcomes of assessments.

They are never the primary object.

### Case and Assessment

The Performance Case is the structural container of an athlete's journey.
Assessments are the primary working units within a Case where observations,
measurements, insights and recommendations are created. The Case provides
continuity over time, while Assessments capture individual evaluation points.

Case and Assessment are therefore not competing centres:
the Case gives the frame, the Assessment fills it.

### Measurements are Facts

Measurements are objective facts.

Insights are interpretations.

Recommendations are actions.

These concepts must never be mixed.

### Reports are Snapshots

Reports represent the state of an assessment at a specific point in time.

A published report never changes retrospectively.

### Modular by Design

Every assessment consists of independent modules.

New modules can be added without changing existing ones.

### One Concept, One Object

If two terms describe the same thing in a different state, it is one object with a status field.

If two objects behave identically at different levels, it is one object with a scope field.

---

## 3. Core Objects

### Canonical Hierarchy

Every document uses this chain without exception.

```
Workspace
    ↓
Athlete
    ↓
Performance Case
    ↓
Assessment
    ↓
Module
    ↓
Measurement
```

Each level belongs to exactly one level above it.

Insights and Recommendations hang off the Module.
Reports hang off the Module, the Assessment or the Case, depending on their
scope (§16).
Documents, Videos, Programs, Notes and Appointments attach through the context
ladder (§18).

### Primary Business Entities

```
Workspace
Coach
Athlete
Performance Case
Goal
Assessment
Module
Measurement Type
Measurement
Insight
Recommendation
Report
Document
Video
Program
Note
Appointment
```

These objects are the only primary business entities.

Everything else supports them.

### Supporting Objects

```
Coach Credential     proof of qualification held by a Coach
Share                visibility grant for any shareable resource
Video Annotation     timestamped comment on a Video
Timeline Entry       projection of all athlete activity
```

Supporting objects have no meaning on their own.
They exist only to serve or project primary entities.

A Coach Credential (§6) is listed here for the same reason as a Video
Annotation: it is a repeating structure with its own fields that exists only to
serve one primary entity. It is never athlete-facing and never appears on a
timeline.

### Relations

Relations connect primary entities. They are not objects, carry no attributes
of their own and are never modelled as entities.

| Relation | Connects                                                   |
| -------- | ---------------------------------------------------------- |
| Evidence | an Insight to a Measurement, Video, Document or Note (§14) |

### Explicitly Not Objects

| Term                                             | What it actually is                                              |
| ------------------------------------------------ | ---------------------------------------------------------------- |
| Evidence                                         | A **relation** between an Insight and what supports it — see §14 |
| Task                                             | A Recommendation assigned to the Athlete — see §15               |
| Action / Intervention / Measure                  | A Recommendation in progress or completed — see §15              |
| Question                                         | A mandatory field on the Assessment — see §10                    |
| Follow-Up                                        | A **workflow**, not a record — see §23                           |
| Module Report / Assessment Report / Case Summary | One Report with a scope — see §16                                |

---

## 4. Data Lifecycle

Apex OS distinguishes between immutable assessment results and living coaching resources.

### Immutable Objects

These objects represent the state of an Assessment at a specific point in time.

| Object         | Immutable from                             |
| -------------- | ------------------------------------------ |
| Measurement    | creation — measurements are facts          |
| Report         | publication                                |
| Insight        | publication of the Report that contains it |
| Recommendation | publication of the Report that contains it |

Changes require either:

- a new Report version, or
- a new Assessment.

A Measurement is never edited. A correction is a new Measurement that supersedes the previous one.
The original remains visible — an erroneous reading is part of the scientific record.

Insights and Recommendations have no publication state of their own.
They are frozen together with the Report that references them.

Immutability covers content, not progress. The status of a published
Recommendation may still change (§15) — what it says is fixed, whether it has
been carried out is not.

### Living Objects

These objects support the ongoing collaboration between Coach and Athlete.

They may be updated at any time.

Objects:

- Notes
- Documents
- Videos
- Programs
- Goals
- Appointments

Changes to these objects do not affect the historical integrity of published Assessments.

Once a living object is referenced as evidence by a published Report, that reference is frozen.
The object may still change; the Report keeps the state it was published with.

---

## 5. Workspaces

The Workspace is the tenant boundary. All **data** belongs to exactly one
Workspace.

A Coach works _inside_ a Workspace but is not _owned_ by one — the profile is
organisation-independent and affiliation is a Membership (§6).

### MVP

Every newly registered coach automatically receives a Personal Workspace.

The user never needs to create one manually.

Internally a Personal Workspace is implemented as an Organization.

This implementation detail remains invisible to the user.

### Future

A Workspace may contain multiple coaches.

```
Workspace
├── Coach A
├── Coach B
└── Coach C
```

The architecture must support this from the beginning.

Athletes belong to the Workspace, never to an individual Coach.
This is what makes multiple coaches possible without data migration.

Explicit coach-to-athlete assignment is deferred until multi-coach workspaces exist.
Until then, Workspace scoping is the only access boundary required.

The intended shape once it arrives: a Coach creates an Athlete, and that Athlete
may later be assigned to further Coaches in the same Workspace — for example
when several professionals work with the same person.

**Assignment requires the Athlete's active consent.** It is granted by the
Athlete, not by the Coach, and it is recorded. A Coach can neither assign an
Athlete to a colleague nor take that decision on their behalf.

Three consequences follow:

- **Portal access is a prerequisite.** Consent is an act, and only an Athlete
  with a linked user account can perform it. An Athlete under Shared Access
  cannot be assigned until portal access is activated (§21).
- **Consent is complete and retroactive.** It covers the Athlete's entire
  record, including Assessments and Reports created before it was granted.
  There are no partial grants and no time windows — the unit is the Athlete.
- **Consent is revocable at any time.** Revoking it ends the assigned Coach's
  access. Nothing is deleted, and the record of who had access when remains.

This is why an Athlete is never owned by the Coach who created them: the creator
is recorded, ownership stays with the Workspace, and access follows consent.

---

## 6. Coaches

A Coach represents a professional user.

### A Coach profile is organisation-independent

A Coach exists on their own. The profile carries **no** organisation: a coach may
work alone, inside one practice, for several organisations at once, or move
between them. Affiliation is a **Membership** — a separate relation between the
person and a Workspace — never a property of the profile.

This is what the architecture must keep possible without a data migration:

| Case                                              | How it works                                                                                         |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| A coach works alone                               | Profile plus their own Workspace. No further membership.                                             |
| A coach works in a practice                       | One membership in that organisation's Workspace.                                                     |
| A coach works for several organisations           | Several memberships. One profile.                                                                    |
| A coach changes organisation                      | A membership ends, another begins. The profile and everything they authored stay untouched.          |
| A coach is invited                                | An invitation becomes a membership.                                                                  |
| Two coaches work together                         | Two profiles, one Workspace. Sharing an Athlete between them stays a separate consent question (§5). |
| A coach founds an organisation and invites others | A Workspace plus memberships.                                                                        |

Everything a Coach _authors_ — Cases, Assessments, Insights, Reports, Notes —
belongs to a Workspace. The **person** does not. Binding the profile to one
organisation would turn every case above into a migration.

**Not part of the MVP:** a full membership management surface. What matters now
is only that the model does not rule it out.

The Coach is responsible for

- creating athletes
- performing assessments
- analysing results
- creating recommendations
- creating reports
- sharing reports
- uploading documents
- managing programs

Authentication is handled separately.

A Coach profile only contains professional information: display name,
professional title, biography, and credentials.

### Credentials

A Coach may upload proof of qualification — licences, certifications,
accreditations — with an optional issuer and validity period.

Credentials belong to the Coach, not to an Athlete. They are therefore **not**
Documents (§18): the context ladder anchors every Document to an Athlete, which
is exactly what makes the athlete timeline complete. A coach credential has no
place on that timeline.

Credentials are never shared through the athlete-facing surfaces.

### Deleting a Coach profile

A Coach may delete their profile. What that means is constrained by what the
profile does **not** own: the Assessments, Insights, Reports and Notes they
authored belong to the Athlete and the Workspace. Erasing them would destroy
someone else's record and break the performance history (§22).

Deletion therefore **anonymises rather than removes**: personal information and
credentials are cleared, the user account is unlinked, and authored content
keeps its author as a deleted coach.

This is distinct from archiving. A Workspace archives a Coach who no longer
works there — reversible, data intact. Deletion is the Coach's own act and is
final.

Later a Workspace will also be able to delete a Coach profile and hand their
Athletes to another Coach. That is possible without migration because Athletes
belong to the Workspace, not to the Coach (§5).

---

## 7. Athletes

Every person receiving services is always created as an Athlete.

There are no guest athletes.

There are no temporary athletes.

An Athlete may exist without a user account.

Later a user account can be linked to the existing athlete.

No data migration is ever required.

An Athlete belongs to exactly one Workspace. Unlike a Coach profile (§6), an
Athlete **is** tenant-scoped: the record and its history belong to the Workspace
that created them. Identity is not shared across Workspaces.

### "Exactly once within a Workspace"

Every Athlete exists exactly once within a Workspace. **This is a domain rule,
not a database key.**

There is deliberately no natural key. Name, e-mail and date of birth all stay
optional, because the default case is an athlete without an account and often
without contact details (§21 Shared Access). A uniqueness constraint on optional
columns would not apply in exactly that case — Postgres treats missing values as
distinct — and would create false confidence.

The rule is therefore enforced where it can actually work: when a Coach creates
an Athlete, the domain layer looks for likely duplicates and warns. Duplicates
arise from accidental re-entry, not from intent, so a warning at the point of
creation is the effective control.

### Deleting an Athlete account

An Athlete with portal access may delete their account. **The account goes, the
record stays.** Concretely:

- the user account is unlinked, and portal access ends
- the Athlete is marked inactive
- Assessments, Measurements, Insights, Reports and Documents remain with the
  Coach

The last point is the reason for the first two. A coach draws findings from this
work that stay relevant beyond the coaching relationship — deleting the record
would destroy their professional documentation, not just the athlete's account.

Erasing the record itself is a different question. It touches statutory
retention for health-adjacent documentation and is deliberately not answered
here — see docs/SECURITY.md.

Typical lifecycle

```
Coach
  ↓
Create Athlete
  ↓
Assessment
  ↓
Report
  ↓
Share Link
  ↓
(optional) Activate Athlete Portal
  ↓
Long-term Coaching
```

---

## 8. Performance Cases

A Performance Case represents a coaching objective and the process that serves it.

The Case is the **structural container** of an athlete's journey. It provides
continuity over time; the Assessments inside it capture individual evaluation
points (§2, §10).

Every Assessment belongs to exactly one Performance Case.

Every Performance Case belongs to exactly one Athlete.

An Athlete may have multiple Performance Cases.

### A Case has

- Title
- Description
- Type
- Status
- Goals
- Start date
- End date (optional)

### A Case contains

- Assessments
- Reports
- Appointments
- Notes
- Documents, Videos, Programs

### Case Types

| Type                | Meaning                              |
| ------------------- | ------------------------------------ |
| `SINGLE_ASSESSMENT` | One-time examination or consultation |
| `ONGOING`           | Long-term coaching relationship      |

### Case Status

```
OPEN → CLOSED → ARCHIVED
```

A Case may be reopened while not archived.

### Automatic Creation

A Case is mandatory in the domain model but never a manual step for the user.

If a Coach creates an Assessment for an Athlete without an open Case,
the system creates a Case of type `SINGLE_ASSESSMENT` automatically,
taking its title from the Assessment.

This mirrors the Personal Workspace (§5): the structure exists,
the user is not asked to build it.

The Case becomes visible in the interface as soon as an Athlete has more than one.

---

## 9. Goals

A Goal describes what a Performance Case is meant to achieve.

Examples

- Sub 60 HYROX
- Return to sport
- German championship
- Marathon

A Goal has

- Title
- Target date (optional)
- Achieved date (optional)

A Case may have multiple Goals.

Goals orient all Assessments within the Case.

---

## 10. Assessments

Assessments are the **primary working units** within a Case. Observations,
measurements, insights and recommendations are created here (§2, §8).

Every Assessment belongs to exactly one Performance Case.

Through the Case it belongs to exactly one Athlete.
This relation is **derived, never stored twice**.

An Athlete may have unlimited Assessments.

Assessments can be compared over time.

### Every Assessment answers a Question

An Assessment has a mandatory `question` field.

It records the coaching question the assessment was performed to answer.

Data is never collected without a purpose.

There is no separate Question object. The question is a field on the Assessment.

### Assessment Type

| Type            | Meaning                              |
| --------------- | ------------------------------------ |
| `INITIAL`       | First assessment within the Case     |
| `RE_ASSESSMENT` | Repetition for comparison            |
| `FOLLOW_UP`     | Verification of recommended measures |

The type describes the **position in the process**, never the content.
Content is determined solely by the selected Modules.

```
Assessment 1 → Assessment 2 → Assessment 3 → Progress Analysis
```

---

## 11. Modules

An Assessment consists of one or more Modules.

### Canonical Module List

This list is authoritative. All other documents refer to it.

| Key                | Label            |
| ------------------ | ---------------- |
| `running`          | Running          |
| `strength`         | Strength         |
| `movement`         | Movement         |
| `mobility`         | Mobility         |
| `lactate`          | Lactate          |
| `body_composition` | Body Composition |
| `nutrition`        | Nutrition        |
| `recovery`         | Recovery         |
| `sleep`            | Sleep            |
| `cycle`            | Cycle            |
| `custom`           | Custom           |

The key is the identifier used everywhere in the system.
The label is the display name.

Module names are domain terms only. They never carry a device, vendor or
competition name.

### Module Keys are Data, Module Behaviour is Code

A Module is stored as a key and a payload, never as a database enum.

Module behaviour — validation schema, measurement types, report renderer —
lives in a registry in code.

Adding a module is one new file plus one registry entry.
It requires no migration and no change to existing modules.

### Every Module contains

- Measurements
- Insights
- Recommendations
- a Module Report

Modules are completely independent.

Assessments may contain any combination of modules.

Comparisons between Assessments always happen module by module.

Each Module additionally defines

- Version
- Future License Tier

License information is reserved for future subscription models. It is not part of the MVP.

Classification by area is a property of the Measurement Type (§12), not of the
Module.

### Device Manufacturers are not Modules

Device manufacturers and external systems (e.g. VALD, MYOACT, Garmin, Polar) are **not** Modules.

They are data sources.

Measurements originating from external systems are assigned to the appropriate Module.
Their origin is recorded on the Measurement itself (§13), not in the module taxonomy.

Module and data source are orthogonal dimensions:
a VALD jump test belongs to the `strength` module and has VALD as its source.

### Competition Formats are not Modules

Competition formats (e.g. HYROX) are **not** Modules.

They are **Assessment Presets** — named combinations of modules.

| Preset               | Modules                           |
| -------------------- | --------------------------------- |
| `hyrox`              | `running`, `strength`, `movement` |
| `movement_screening` | `movement`, `mobility`            |
| `lactate_test`       | `lactate`                         |

**A preset name never equals a module key.** Preset and module share one
namespace in the interface; identical names would make "select `movement`"
ambiguous.

Presets are configuration, not entities. They may later become user-definable.

### Video is not a Module

Video is a domain object of its own (§18), not a module.
A video is evidence and an artefact, not an area of analysis.

---

## 12. Measurement Types

Measurement Types define reusable templates for objective measurements.

A Measurement Type defines

| Field           | Purpose                                   |
| --------------- | ----------------------------------------- |
| Name            | what is measured                          |
| Unit            | the unit of the value                     |
| Value Type      | numeric, text or boolean                  |
| Category        | classification for filtering and grouping |
| Reference Range | expected range, optional                  |

Category classifies a Measurement Type by area — for example strength,
endurance, mobility or body composition. It drives filtering, grouping and
display, and is independent of the Module a measurement is recorded in.

Measurement Types do not contain athlete-specific data.

New Measurement Types can be added without changing the domain model.

Every Measurement references exactly one Measurement Type.

Example

```
Measurement Type: Grip Strength
  Unit:            kg
  Value Type:      numeric
  Category:        strength
  Reference Range: 40–60 kg
```

Side is **not** part of the Measurement Type. The type _Grip Strength_ is the
same on both sides; only the recorded value differs. Side belongs to the
Measurement (§13).

---

## 13. Measurements

Measurements are objective data.

Examples

- Lactate
- Heart Rate
- Grip Strength
- Sprint Time
- Cadence
- Ground Contact Time

Measurements are instances of Measurement Types.

Measurements are never interpreted directly.

Interpretation always happens through Insights.

### Context

Every Measurement belongs to

- exactly one Measurement Type
- exactly one Module

Through the Module it belongs to one Assessment, one Performance Case and one Athlete.

These relations are **derived, never stored twice**.

Never create orphan measurements.

### Side

A Measurement records which side of the body it was taken from.

```
LEFT | RIGHT | BILATERAL
```

Side belongs to the Measurement, not to the Measurement Type.

Without this field, asymmetry cannot be calculated — and left/right imbalance
is one of the most common Insights (§14).

Example

```
Measurement Type: Grip Strength (kg)

  Measurement 1   LEFT    51 kg
  Measurement 2   RIGHT   58 kg
```

### Origin

Every Measurement records where it came from.

| Field           | Purpose                                        |
| --------------- | ---------------------------------------------- |
| Source          | `MANUAL` · `DEVICE` · `IMPORT` · `DERIVED`     |
| External System | e.g. `vald`, `garmin` — empty for manual entry |
| External ID     | the source system's own identifier             |
| Captured at     | when the measurement was taken                 |
| Ingested at     | when it reached Apex OS                        |

Workspace, External System and External ID together are unique.
Re-importing the same data can therefore never create duplicates **within a
Workspace**.

The Workspace is part of the key because external identifiers are only
guaranteed unique inside the system that issued them. A test number from one
practice's VALD installation may collide with one from another; without the
Workspace, a legitimate import in the second would be rejected because the first
already holds that identifier.

This uniqueness governs the **imported external record**, not the Assessment. A
new external test carries a new identifier and is always imported as a new
Measurement.

An imported Measurement still belongs to exactly one Module, and through it to
exactly one Assessment (DOMAIN_RULES #3) — the import is not scoped per
Assessment, but the resulting fact has one place in the chain. Showing it beyond
that place is a matter of reading, not of storage: measurements of identical
type are compared across Assessments without being stored twice.

Captured and ingested time are separate because devices deliver data late.
A sleep record from last night arrives this morning and must appear on the
correct day of the athlete's timeline.

### Corrections

Measurements are never edited.

A correction is a new Measurement that supersedes the previous one.
The superseded measurement remains visible.

Measurements of identical type can be compared across Assessments.

---

## 14. Insights

Insights are professional interpretations of Measurements.

Examples

- Left/right imbalance
- Aerobic deficit
- Limited hip mobility
- Reduced running efficiency

### Evidence

An Insight records what it is based on.

**Evidence is a relation, not an object.** It is the connection between an
Insight and what supports it — it has no attributes and no identity of its own.
It may point to

- a Measurement
- a Video
- a Document
- a Note

Exactly one target per connection. An Insight may be supported by many.

Heterogeneous evidence is required, not optional:
an insight about running technique rests on a video, not on a number.

Evidence is captured when the Insight is written.
It cannot be reconstructed afterwards — which is why it is never optional to record it.

---

## 15. Recommendations

Recommendations are actions derived from Insights.

Examples

- Strength exercises
- Mobility routine
- Running drills
- Recovery protocol
- Nutrition advice

Recommendations always reference one or more Insights.

Recommendations are never derived directly from Measurements.

### Lifecycle

A Recommendation carries its own status.
Recommendation is the **only** object for measures. There is no separate Task,
Action, Intervention or Measure object.

```
PROPOSED → ACCEPTED → IN_PROGRESS → DONE
                    ↘ SKIPPED
                    ↘ SUPERSEDED
```

| Previously called               | Is actually                              |
| ------------------------------- | ---------------------------------------- |
| Recommendation                  | `PROPOSED`                               |
| Action / Intervention / Measure | `IN_PROGRESS` or `DONE`                  |
| Task (Athlete Portal)           | a Recommendation assigned to the Athlete |

A Recommendation may be assigned to the Coach or to the Athlete.
An assigned Recommendation is what the Athlete Portal displays as a task.

Status changes are permitted on published Recommendations.
The content is frozen; the progress is not.

---

## 16. Reports

A Report is the professional conclusion of an assessment at a specific point in time.

### One Object, Three Scopes

| Scope        | Summarises                                         |
| ------------ | -------------------------------------------------- |
| `MODULE`     | one Module                                         |
| `ASSESSMENT` | all Module Reports of one Assessment               |
| `CASE`       | all Assessments of one Performance Case (optional) |

All three share status, versioning, PDF export and sharing.
They are one object with a scope, not three objects.

### Status

```
DRAFT → PUBLISHED → ARCHIVED
```

**Publication is the point of no return.** A published Report is immutable.

Sharing is not a status. It does not change a Report and does not lock it.
See §17.

Any change to a published Report requires a new Report version
or a new Assessment.

Publishing a Report also freezes the Insights and Recommendations it contains.

### What the Coach sees

The Coach experiences three states. Two are stored, the third is derived:

| The Coach sees                       | Stored as                              |
| ------------------------------------ | -------------------------------------- |
| **Draft** — still working on it      | `status = DRAFT`                       |
| **Finished** — done, not handed over | `status = PUBLISHED`, no active Share  |
| **Shared** — the Athlete has it      | `status = PUBLISHED` + an active Share |

Finishing is a statement about the **content**; sharing is a statement about
**access**. That is why publication locks and sharing does not.

Deriving the third state rather than storing it is what lets the interface say
more than a status column could: shared with two recipients, expired yesterday,
revoked, shared until 31 December. As an enum value all of that would collapse
into one `SHARED`.

### A Report contains

- Results
- Measurements
- Visualisations
- Videos
- Coach comments
- Insights
- Recommendations

Reports can be

- viewed inside Apex OS
- exported as PDF
- shared through a secure link
- viewed inside the Athlete Portal

Reports are interactive.

---

## 17. Sharing and Visibility

Visibility is a separate object, never a status on the shared resource.

**Report is the content. Share is the access to that content.**
The two have separate lifecycles and neither drives the other.

A Share grants access to one resource.

| Field      | Purpose                                                        |
| ---------- | -------------------------------------------------------------- |
| Resource   | which Report, Document, Video, Program, Recommendation or Note |
| Token      | the secure link                                                |
| Password   | optional protection                                            |
| Expires at | optional time limit                                            |
| Revoked at | withdrawal without deleting the resource                       |

### Share Status

```
ACTIVE → EXPIRED
```

A Share reaches `EXPIRED` in one of two ways: the time limit in `expiresAt`
passes, or the Coach withdraws it and `revokedAt` is set. Both lead to the same
terminal state — the link no longer grants access — so there is one end state,
not two.

An expired Share is never deleted. The record of who was granted access, and
until when, is part of the audit trail.

### Two independent lifecycles

```
Report   DRAFT → PUBLISHED → ARCHIVED     the content
Share    ACTIVE → EXPIRED                 the access to it
```

Publishing does not create a Share. Sharing does not change a Report.
Revoking a Share leaves the Report untouched; archiving a Report does not
retroactively invalidate what an athlete was already shown.

### Why sharing is not a status

- One resource may be shared with several recipients under different conditions —
  a report to the athlete and to a treating physiotherapist, with different expiry.
- Sharing logic is written once instead of once per shareable object.
- Publication and visibility stay independent: publishing locks content,
  sharing grants access. Neither implies the other.

Coaches explicitly decide which content becomes visible to Athletes.

Nothing is visible to an Athlete without an active Share.

---

## 18. Documents and Videos

Documents and Videos are separate domain objects with separate capabilities.

Video is **not** a document type.

They share upload, storage and context assignment.
That shared mechanism is an implementation detail and remains invisible in the domain —
in the same way a Personal Workspace is internally an Organization (§5).

### Context Ladder

Documents, Videos, Programs, Notes and Appointments all use the same context ladder.

| Level            | Required |
| ---------------- | -------- |
| Athlete          | always   |
| Performance Case | optional |
| Assessment       | optional |
| Module           | optional |

The more specific the assignment, the more precise the context.
The athlete link is always present, which is what makes the timeline complete.

The athlete link does **not** depend on portal access.
A medical report must be filable for an athlete who has no user account —
that is the default case (§21).

### Documents

Examples

- Images
- PDFs
- MRI reports
- Blood tests
- Diagnoses
- Uploaded training plans
- Invoices

Both Coaches and Athletes may upload documents — the Athlete through the portal
(§21). Under Shared Access there is no upload.

Documents are living objects. They may be replaced or updated at any time.

### Videos

Videos are first-class domain objects.

Videos support

- annotations at a timestamp
- coach comments
- AI analysis

Both Coaches and Athletes may upload videos — the Athlete through the portal
(§21). Under Shared Access there is no upload.

---

## 19. Programs

Programs are structured coaching plans created inside Apex OS.

Program is a domain object of its own.

Programs are living coaching resources. They may evolve over time.

Programs are independent from published Reports.

Uploaded PDF training plans are Documents. Programs are editable domain objects.

---

## 20. Notes and Appointments

### Notes

A Note is free-form text. **Both Coach and Athlete may write one** — the Athlete
through the portal (§21). Under Shared Access there is no writing.

An Athlete writes notes about their own record — feedback on a Recommendation,
how a session felt, an observation between appointments. That is the point of
allowing it: the coach's picture is incomplete without what only the athlete can
report.

**Notes are always optional.** No workflow requires one, and nothing depends on
one existing — an Assessment, an Appointment or a Report is complete without any.

A Note is not a Recommendation. A Recommendation must derive from an Insight (§15);
a Note is unconstrained.

Notes use the context ladder (§18) and may serve as evidence for an Insight (§14).
A Note may additionally be attached to an Appointment — what was discussed
belongs to the appointment it was discussed at.

### Visibility is asymmetric

Notes move differently in each direction, and only one of them needs a Share.

| Direction       | Rule                                                                   |
| --------------- | ---------------------------------------------------------------------- |
| Coach → Athlete | Requires an active Share (§17). Until then the Note is coach-internal. |
| Athlete → Coach | Immediate. The Coach sees everything in their own Workspace.           |

Sharing a coach Note is what makes it useful beyond the coach's own record: a
general remark, a comment on an Assessment, an observation from a video
analysis, or a hint on what to pay attention to alongside a Recommendation.

The asymmetry is not an oversight. Coach notes are professional documentation
and are released deliberately; athlete notes are contributions to a record the
Coach already owns.

### Appointments

An Appointment is a scheduled event.

Examples

- Initial consultation
- Training session
- Assessment
- Follow-up
- Online meeting
- Race support
- Competition

An Appointment belongs to an Athlete. The Performance Case is **optional** —
an initial consultation takes place before any Case exists.

Competitions are Appointments, not a separate object.
They anchor the athlete's timeline against goals such as "Sub 60 HYROX".

---

## 21. Athlete Access Model

Every person receiving coaching services is represented by an Athlete.

Portal access is optional and independent of the Athlete entity.

There are two access models.

### Shared Access (Default)

An Athlete does not require a user account.

The Coach may share selected content through secure, password-protected links (§17).

The Athlete can view:

- Shared Reports
- Shared Documents
- Shared Videos
- Shared Programs
- Shared Recommendations
- Shared Notes

The Athlete cannot:

- upload files
- write Notes
- edit information
- update the status of assigned Recommendations
- access non-shared content

This workflow is intended for one-time assessments and consultations.

### Athlete Portal

The Coach may activate a Portal Account for any Athlete at any time.

No new Athlete is created.

The existing Athlete simply receives a linked user account.

The Athlete can:

- view shared Reports
- view shared Documents
- view shared Videos
- view shared Programs
- view shared Notes
- upload Documents
- upload Videos
- write Notes on their own record
- view Recommendations
- update the status of assigned Recommendations
- view Appointments

The Athlete contributes to an Assessment. The Coach owns it.
The Athlete never edits Measurements, Insights, Recommendations or Reports.

The Coach always decides which content is shared with the Athlete.

### Both models use the same Athlete

The same Athlete entity is used for both access models.

Changing from Shared Access to Athlete Portal never requires data migration.

---

## 22. Athlete Timeline

Every Athlete has one complete performance history.

Assessments, Reports, Measurements, Documents, Videos, Programs,
Recommendations and Appointments all contribute to it.

The timeline is a **projection**, not a second source of truth.
Every entry points back to the object it represents.

This is what allows the history to be read in one query
without denormalising the athlete reference onto every table.

Never create isolated feature silos.

---

## 23. Follow-Up

A Follow-Up verifies whether recommended measures worked.

A Follow-Up is a **workflow**, not an object. In concrete terms it is

- an Appointment of type `FOLLOW_UP`, and/or
- an Assessment of type `FOLLOW_UP` or `RE_ASSESSMENT`

A Follow-Up may close a Case or produce a new Assessment.

---

## 24. AI Principles

AI supports the Coach.

AI may

- draft Insights
- draft Recommendations
- draft Reports

AI never publishes content automatically.

Every AI output requires explicit approval by a Coach.

---

## 25. Future Architecture

The architecture must already support

- Multi-coach Workspaces
- Subscription Plans
- Device Integrations
- Public API
- Mobile App
- Marketplace
- Scientific Reference Values

These features are not part of the MVP but must not require architectural redesign.

Organizations already exist in the MVP as the implementation of the Personal Workspace (§5).
What is deferred is multiple coaches within one Workspace, not the concept itself.

---

## 26. Domain Rules

The following rules are mandatory.

1. Every Athlete exists exactly once within a Workspace — a domain rule enforced
   by duplicate detection, not by a database key (§7).

2. Every Assessment belongs to exactly one Performance Case.

3. Every Performance Case belongs to exactly one Athlete.

4. The Athlete of an Assessment is derived through the Case, never stored twice.

5. An Athlete may have unlimited Cases and Assessments.

6. Every Assessment contains at least one Module and answers one Question.

7. Modules are independent. New modules require no migration.

8. Module names are domain terms. Devices, vendors and competition formats are not Modules.

9. Every Measurement references exactly one Measurement Type and belongs to exactly one Module.

10. Side belongs to the Measurement, not to the Measurement Type.

11. Measurements are facts and are never edited — only superseded.

12. Insights interpret Measurements and record their evidence.

13. Evidence is a relation between an Insight and its support, never an object.

14. Recommendations derive from Insights, never from Measurements.

15. Recommendation is the only object for measures.

16. Reports are one object with a scope of `MODULE`, `ASSESSMENT` or `CASE`.

17. Reports are immutable after publication.

18. Sharing controls visibility only. It never changes content.

19. Coaches decide.

20. AI assists but never replaces the Coach.

21. Every feature should enrich the Athlete's long-term history.

22. Authentication is independent from domain logic.

23. User accounts are optional for Athletes.

24. Athletes belong to the Workspace, not to an individual Coach.

24a. A Coach profile belongs to no Workspace. Affiliation is a Membership (§6).

25. Athlete Portal access is optional and may be activated at any time.

26. Shared Links and Athlete Portal provide different access methods to the same underlying data.

27. Coaches explicitly decide which content becomes visible to Athletes.

28. The architecture must remain modular and extensible.

29. If two terms describe one thing, it is one object with a status.
