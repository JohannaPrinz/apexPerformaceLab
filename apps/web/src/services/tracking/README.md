# services/tracking

Tracking entries and bleeding episodes — the self-reported half of the record
(§13).

## Why these live here and not in a slice

Two surfaces write them. The coach records values on an athlete's profile, and
the athlete records their own through the portal (§21). The **rules** are the
same for both — one value per day, a self-report is deleted rather than
superseded, a rating stays inside the scale its quantity declares — and two
copies of those rules would drift apart the first time one was changed.

What is _not_ shared is the authorization. Each surface has its own procedures:
the coach's grant "every athlete of this workspace", the portal's resolve one
athlete from the session and can reach nowhere else. That difference is the
point, so it stays in the routers and never leaks in here.

`services/README.md` names the condition for moving something here — "once a
second slice needs it" — and the portal is that second slice.

## What a function here may assume

Nothing about its caller. Every one of them takes a `TenantContext` and puts it
in the filter, and the ones addressed by entry id take an **owner** as well:
`null` for a coach, an athlete id for the portal. That parameter is required
rather than optional, so the question has to be answered at every call site.
