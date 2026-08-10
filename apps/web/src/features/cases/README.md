# cases

Performance Cases — the structural container of an athlete's journey.

Second link in the canonical chain (§3):

```text
Athlete → Performance Case → Assessment → Module → Measurement
```

## Scope

- List an athlete's cases, newest first
- Open a case deliberately, for an ongoing engagement
- Move it through `OPEN → CLOSED → ARCHIVED`, and back
- `ensureOpenCase` — the automatic creation the assessments slice will use

## The case is mandatory, but never a manual step (§8)

A coach who starts an assessment for an athlete with no open case gets one
created automatically, of type `SINGLE_ASSESSMENT`. That is what the type is
for.

Allowing an assessment without a case would mean two query paths and two
authorization paths for every question about an athlete's work. One implicit row
is cheaper than that fork, permanently.

`ensureOpenCase` lives in this slice rather than in assessments because it is a
case concern — and because a second implementation of "which case does this
belong to" is exactly how the two paths would reappear.

## What is new compared to the athletes slice

A case names a **parent**. Scoping the case row is not enough: the athlete it
hangs off is checked against the tenant before the write.

Without that check, a caller could hang a case off another workspace's athlete.
The case row itself would be correctly scoped — the leak would be the
_relationship_, and no column constraint catches it. `server/service.test.ts`
asserts both halves.

A missing parent is reported as a **missing athlete**, never as forbidden:
`FORBIDDEN` would confirm the athlete exists (docs/SECURITY.md §4).

## Status and end date stay in step

`endedAt` follows the status rather than being set by hand — a case that leaves
`OPEN` has ended, and reopening clears it. Two fields that must agree are better
derived than remembered.

## Not built yet

- **Goals** (§9). A case may have several; nothing collects them yet.
- Editing a case title or description
- Assessments inside a case — the next step
- A case detail route. Cases render inside the athlete page, which is where a
  coach looks for them; a dedicated route waits until there is something on it
  worth navigating to.
