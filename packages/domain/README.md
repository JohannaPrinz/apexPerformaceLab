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

**The module registry** — the eleven canonical module keys and the three
assessment presets. Two rules are enforced by tests rather than by convention:

- a module key never carries a device, vendor or competition name
- a preset name never equals a module key, because they share one namespace in
  the interface and an overlap makes "choose `movement`" ambiguous

**The system measurement type catalogue** — the twelve MVP types every Workspace
inherits (`MeasurementType` rows with a null `organizationId`, §12). It lives
here rather than in a seed file because _which quantities the platform knows how
to record_ is a professional statement, not data. The seed reads from here.

Three rules, each with a test:

- **No reference ranges.** A single global range for "grip strength" —
  identical for a 25-year-old runner and a 55-year-old recreational athlete —
  produces "outside normal" markers that do not hold up.
- **No device or vendor coupling.** Muscle Activity is a quantity; Myoact is one
  way of obtaining it. The source is recorded on the Measurement (§13).
- **No module binding.** Category is a filter, not a restriction — §12 states
  the independence outright.

The invariants arrive with the objects they constrain. Writing them now, for
features that do not exist, would produce rules nobody can check against a real
screen.

## The module configuration

A **Module is a single test** inside an Assessment. Before performing it, the
coach decides what to record; that plan is a `ModuleConfiguration` stored in
`AssessmentModule.payload` — the column documented for exactly this, versioned
by `moduleVersion`.

```
measurementTypeIds   which quantities this test records
passes               how many times the whole set is taken (default 1)
recordsSide          whether each value is taken per side
dimensions           further axes — joint, muscle site, body region
notes                protocol notes: load steps, device settings, conditions
```

**A pass is not an entity.** It has no lifecycle, no author and no identity
beyond its position, so it is a structure inside the module rather than a table.
A row for it would add a level the canonical hierarchy (§3) does not have, and
every query about an assessment would grow a join for something that is
ordinarily exactly one.

**Why "pass" and not "run":** `running` is a module key, and a `run` field on a
measurement inside a running module would read as the activity. "Pass" carries
the lactate stage, the strength attempt and the repeated reading equally.

**The configuration holds the plan, the Measurements hold the record.** That
separation is what makes "copy the setup, not the results" a copy of one JSON
object rather than a filtered deep clone — and it closes the gap where the
measurement types an assessment used were recoverable only from its values.

## Measurement templates

Preconfigured tests that propose a module's configuration: lactate step test,
body fat measurement, maximal strength test, muscle activity measurement. They
are **configuration, not a level in the hierarchy** — the coach edits one freely
before performing the test, and what gets stored is the resulting
configuration, never a reference to the template.

Three namespaces now sit near one another and must not collide, because the
interface offers them together: **module keys** (`lactate`), **assessment
presets** (`lactate_test`, selecting modules) and **measurement templates**
(`lactate_step_test`, configuring one module). A test asserts the separation.

No template names a vendor. "Myoact" was given as an example instrument for
muscle activity; the template is called `muscle_activity_measurement`, because a
test is a quantity and the device is a source recorded on the Measurement
(§11, DOMAIN_RULES #8).

No template declares dimension values. Naming joints, muscle sites or body
regions is a professional decision that has not been taken.

## Open model questions

Recorded here so they survive outside a conversation. **None is decided.**

### 1. Two columns on `Measurement` — proposed, not applied

The configuration says a module has four passes; nothing on a Measurement says
_which_ pass it belongs to, or which joint it was taken at. Side is covered by
the existing `side` column; nothing else is.

| Column           | Purpose                                                            |
| ---------------- | ------------------------------------------------------------------ |
| `passIndex Int?` | which pass this value belongs to — null for a single-pass module   |
| `context Json?`  | the declared dimension values, e.g. `{"site": "vastus lateralis"}` |

Both nullable, so nothing existing changes meaning. Without them a lactate curve
cannot be reconstructed: four values at stage 2 are indistinguishable from four
at stage 3 except by `capturedAt`.

The alternative — a slot index into the configuration — was rejected: reordering
the configuration would silently relabel historical measurements.

The naming of `passIndex` is the part worth a second opinion; it goes into the
schema permanently.

### 2. Attempts of the same side

Recording Grip Strength left and right **already works**: the only unique
constraint on `Measurement` is `(organizationId, externalSystem, externalId)`,
and for manual entries both external columns are null, which Postgres treats as
distinct.

With `passIndex`, three attempts of the same side become three passes — so this
question is answered by §1 rather than separately. What remains open is whether
a best-of is stored or computed at read time.

### 3. Copying an assessment

The configuration change above solves the hard part: a copy takes each module's
`moduleKey`, `moduleVersion` and `payload`, and creates no Measurements.

Two smaller gaps remain:

- `Assessment` has no `createdByCoachId`. Every other authored object has one;
  a copy would inherit its author through the Case, which is wrong once a
  Workspace holds several coaches.
- No provenance field. Whether a copy records what it was copied from is
  undecided.
