# auth

Sign-in and sign-up flows, workspace context, invitation acceptance.

Wraps `@apex/auth` — this slice owns the _screens and flows_; the auth
configuration itself lives in the package. Session reading in Server Components
goes through `auth.api.getSession()`, never through the browser client.

Authentication is independent from domain logic. A user account never replaces
an Athlete, and no domain object may depend on one existing.

## Registration → workspace

Registering as a coach produces four rows, always together:

```text
User  →  Coach  →  Membership(owner)  →  Organization
```

**This form does not create them.** Provisioning runs in a Better Auth database
hook (`databaseHooks.user.create.after` → `provisionPersonalWorkspace`), which
fires for every path Better Auth creates a user through — email and password,
GitHub, Google, and anything added later. A flow wired into the sign-up form
would silently skip the others, and the first coach to register with Google
would land in an account with no workspace.

The provisioning transaction is idempotent, so a retried registration cannot
produce a second workspace.

### The personal workspace is not a special case

It is an ordinary `Organization` with an ordinary `owner` `Membership`. No flag,
no subtype, no second table. That is what keeps the multi-organization future
open: joining a practice later is one more Membership, and nothing about the
personal workspace has to be unwound.

`Coach` carries **no `organizationId`** and must never gain one (§6). A coach
profile belongs to the person; affiliation is the Membership. The consequence
for this slice: the active workspace is always derived from
`Session.activeOrganizationId` + `Membership`, never from the coach profile.

The initial value is set at sign-in by `databaseHooks.session.create.before` →
`resolveInitialOrganizationId`. A `null` result is legitimate — a user with no
membership gets a session without a tenant scope, and `organizationProcedure`
refuses it.

## Scope

- Credential and OAuth sign-in / sign-up
- Coach profile and personal workspace provisioning
- Reading the active workspace (`auth.currentWorkspace`, `auth.coachProfile`)
- Route protection helpers used by `src/proxy.ts`

## Not built yet

- Password reset and email verification
- Naming the workspace during onboarding — `provisionPersonalWorkspace` already
  accepts a `workspaceName`; nothing collects one yet, so it starts out named
  after the coach
- Workspace switching, member invitations
- Platform administration — see [SECURITY.md §3](../../../../../docs/SECURITY.md#3-authorization)

## Note on terminology

A Workspace is the tenant boundary. It is implemented internally as an
Organization — an implementation detail that stays invisible in the interface.
