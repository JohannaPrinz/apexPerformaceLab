# athletes

The roster: creating, finding, viewing and deactivating athletes.

First link in the canonical chain (§3):

```text
Athlete → Performance Case → Assessment → Module → Measurement
```

## Scope

- Create an athlete — only the name is required
- Roster with name search, deactivated hidden by default
- Detail view
- Deactivate and reactivate

## Two rules this slice exists to honour

**An athlete is never deleted (§22).** Deactivating sets `archivedAt` and is
reversible. The performance history outlives the coaching relationship, and the
findings drawn from it are the coach's professional documentation — deleting the
record would destroy someone else's work, not just an entry.

**An athlete needs no account (§21).** `userId` stays null until a coach
activates portal access. Nothing here may depend on it being set, which is why
email and phone are optional: the ordinary case is someone entered during a
first consultation, about whom little is known yet.

## Where the tenancy guarantee lives

`server/service.ts` is the **only** module in this slice that touches the
database, and every query in it goes through `scoped()` / `withTenant()` from
`@apex/database/tenant`.

This is the first slice holding real data, so it is the first place a forgotten
`where` would leak one coaching business's athletes to another — the highest
threat in the model (docs/SECURITY.md §1). Two consequences worth knowing:

- **Lookups use `findFirst` with the tenant filter, never `findUnique` by id.**
  A primary key proves nothing about ownership.
- **Writes use `updateMany`, never `update`.** `update` takes a unique `where`
  and cannot carry the tenant filter, so it would happily write another
  workspace's row. A zero count means "not in this workspace" and surfaces as
  `NOT_FOUND` — never `FORBIDDEN`, which would confirm the row exists.

`server/service.test.ts` asserts this rather than trusting it. The service takes
`db` as an argument precisely so the queries it builds can be inspected without
a database.

## Authorship

`createdByCoachId` is required. It records who created the record — ownership
stays with the Workspace (§26.24). It is the anchor for the coach-to-athlete
assignment that arrives with multi-coach workspaces: existing athletes will need
a relationship row, and only the creator makes that backfill deterministic.

The coach identity comes from `coachProcedure`, never from the request.

## Not built yet

- Editing an athlete from the UI — the `update` procedure exists, no screen uses it
- Portal activation, and the read-only state that follows deactivation (§21)
- Cases, assessments, measurements — the rest of the chain
- Duplicate detection on creation (§7)
