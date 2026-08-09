# Product Requirements

> Status: **Placeholder** · Last updated: 2026-08-02
>
> One section per feature slice, mirroring `apps/web/src/features/`. Keeping
> the two in sync is intentional: a slice with no requirements section is a
> signal that the code got ahead of the product.

## Contents

1. [Scope](#1-scope)
2. [Feature slices](#2-feature-slices)
3. [Cross-cutting requirements](#3-cross-cutting-requirements)
4. [Non-functional requirements](#4-non-functional-requirements)
5. [Open questions](#5-open-questions)

---

## 1. Scope

- **In scope for v1:** _TBD_
- **Deferred:** _TBD_
- **Out of scope:** _TBD_

## 2. Feature slices

Template for each slice:

> **Goal** — what the user achieves.
> **User stories** — `As a <role>, I want <capability>, so that <outcome>.`
> **Acceptance criteria** — testable statements.
> **Data touched** — models read/written.
> **Out of scope** — explicitly excluded.

### 2.1 `auth` — Authentication & organizations

_TBD._ Sign-up, sign-in, OAuth, organization creation, invitations, roles.

### 2.2 `athletes` — Athlete management

_TBD._ Roster, profiles, onboarding, coach assignment, archiving.

### 2.3 `analysis` — Performance analysis

_TBD._ Assessments, benchmarks, trend detection, reporting.

### 2.4 `training` — Training plans

_TBD._ Programme builder, exercise library, periodization, session logging.

### 2.5 `nutrition` — Nutrition

_TBD._ Targets, plans, logging, adherence tracking.

### 2.6 `calendar` — Scheduling

_TBD._ Sessions, availability, bookings, reminders.

### 2.7 `chat` — Communication

_TBD._ Coach–athlete messaging, attachments, notifications.

### 2.8 `dashboard` — Overview surfaces

_TBD._ Coach dashboard, athlete dashboard, key widgets.

### 2.9 `performance` — Metrics & progress

_TBD._ Metric definitions, time series, goals, PRs.

### 2.10 `settings` — Account & organization settings

_TBD._ Profile, organization, members, billing, integrations.

## 3. Cross-cutting requirements

| Area                | Requirement                                                      |
| ------------------- | ---------------------------------------------------------------- |
| Roles & permissions | _TBD_ — see `packages/auth/src/permissions.ts`                   |
| Notifications       | _TBD_ — email (Resend), in-app                                   |
| File uploads        | _TBD_ — Cloudflare R2, size/type limits                          |
| Localization        | _TBD_ — locales, date/number formatting, units (metric/imperial) |
| Audit trail         | _TBD_ — which actions are recorded                               |

## 4. Non-functional requirements

| Category        | Target                                                   |
| --------------- | -------------------------------------------------------- |
| Performance     | _TBD_ (e.g. LCP < 2.0s on 4G, p95 API < 300ms)           |
| Availability    | _TBD_                                                    |
| Accessibility   | WCAG 2.2 AA — see [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md) |
| Browser support | _TBD_                                                    |
| Data retention  | _TBD_ — see [SECURITY.md](./SECURITY.md)                 |

## 5. Open questions

| #   | Question | Owner | Blocks | Status |
| --- | -------- | ----- | ------ | ------ |
| 1   | _TBD_    |       |        | Open   |

---

**Related:** [PRODUCT_VISION.md](./PRODUCT_VISION.md) · [ROADMAP.md](./ROADMAP.md) ·
[API.md](./API.md)
