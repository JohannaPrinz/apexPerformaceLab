# auth

Sign-in and sign-up flows, workspace switching, invitation acceptance.

Wraps `@apex/auth` — this slice owns the _screens and flows_; the auth
configuration itself lives in the package. Session reading in Server Components
goes through `auth.api.getSession()`, never through the browser client.

Authentication is independent from domain logic. A user account never replaces
an Athlete, and no domain object may depend on one existing.

## Scope

- Credential and OAuth sign-in / sign-up
- Password reset and email verification
- Workspace creation, switching, member invitations
- Route protection helpers used by `src/proxy.ts`

## Note on terminology

A Workspace is the tenant boundary. It is implemented internally as an
Organization — an implementation detail that stays invisible in the interface.

_Not implemented yet — see docs/domain/DOMAIN_DECISIONS.md §5, §6._
