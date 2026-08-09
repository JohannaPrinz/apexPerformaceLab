# athletes

The athlete roster: profiles, status, and portal activation.

The athlete is at the centre of the platform — every Performance Case, and
through it every Assessment, belongs to exactly one Athlete.

An Athlete exists **independently of a user account**. A coach creates an
athlete on site; a login can be linked later without any data migration. Nothing
in this slice may depend on an athlete having an account.

Athletes belong to the Workspace, never to an individual Coach. That is what
makes multi-coach workspaces possible later without restructuring.

## Scope

- Roster list, search, filtering
- Athlete profile and master data
- Portal activation — linking a user account to an existing Athlete
- Athlete-level overview across all Cases

## Constraints

- Every person receiving services is an Athlete. There are no guest athletes and
  no temporary athletes.
- An Athlete exists exactly once within a Workspace.

## Not in this slice

- **Performance history** → `features/timeline`
- **The athlete-facing surface** → `features/portal`
- **Authentication** → `features/auth` and `@apex/auth`

_Not implemented yet — see docs/domain/DOMAIN_DECISIONS.md §7._
