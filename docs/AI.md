# AI

> Status: **Placeholder** · Last updated: 2026-08-02
>
> No AI functionality is implemented. This document records the intended
> approach and the constraints that apply, so the first implementation does not
> have to rediscover them.

## Contents

1. [Where AI fits](#1-where-ai-fits)
2. [Planned capabilities](#2-planned-capabilities)
3. [Architecture](#3-architecture)
4. [Model selection](#4-model-selection)
5. [Prompt management](#5-prompt-management)
6. [Data handling](#6-data-handling)
7. [Safety](#7-safety)
8. [Cost & performance](#8-cost--performance)
9. [Evaluation](#9-evaluation)
10. [Open questions](#10-open-questions)

---

## 1. Where AI fits

The product principle: **AI assists the coach; it does not replace the coach.**

Output is a draft the coach reviews, edits and approves. A coaching product
that issues unreviewed training or nutrition prescriptions takes on a duty of
care it cannot discharge — the human-in-the-loop constraint is a product and
liability decision, not a technical limitation.

## 2. Planned capabilities

Roadmap Phase 3 — see [ROADMAP.md](./ROADMAP.md).

| Capability                                   | Slice       | Notes                                                 |
| -------------------------------------------- | ----------- | ----------------------------------------------------- |
| Training plan drafting                       | `training`  | Generates a draft from goals, history and constraints |
| Performance insight summaries                | `analysis`  | Narrative over metric trends                          |
| Session feedback summarization               | `chat`      | Condenses athlete check-ins                           |
| Nutrition suggestions                        | `nutrition` | Highest-risk surface — see [§7](#7-safety)            |
| Natural-language search over athlete history | `athletes`  | Likely retrieval-augmented                            |

## 3. Architecture

_TBD._ Intended shape:

```text
features/<slice>/server/ai/
├── prompts/        # versioned prompt templates
├── schemas/        # Zod schemas for structured output
└── use-cases/      # orchestration; called by procedures & jobs
```

Constraints already decided:

- AI calls belong in the **business logic layer**, never in a component.
- Long-running generation runs as a **Trigger.dev job**, not in a request —
  serverless function timeouts make in-request generation unreliable.
- All model output that enters the database is validated against a Zod schema
  first. Unvalidated model output is untrusted input.
- The provider SDK lives in `src/integrations/`, so the vendor is swappable.

## 4. Model selection

_TBD._ Selection criteria to apply: task fit, latency budget, cost per
operation, structured-output support, tool use, and data-processing terms.

The default should be the most capable current Claude model for quality-
sensitive drafting, with a smaller/faster model for classification and
summarization. Record the chosen model IDs here once fixed, and pin them
explicitly — never call a floating alias in production.

## 5. Prompt management

_TBD._ Principles:

- Prompts are versioned code, not database strings — they need review and diffs.
- Every prompt has a test fixture and an expected-shape assertion.
- Changing a prompt is a behaviour change and belongs in the changelog.

## 6. Data handling

Non-negotiable, given the data class involved
(see [SECURITY.md §8](./SECURITY.md#8-data-protection)):

- **Athlete health data is special-category data under GDPR Art. 9.** Any
  provider processing it needs a DPA and a no-training-on-our-data commitment.
- Send the minimum necessary: pseudonymize identifiers, strip names and contact
  details before the call.
- Never send data from one tenant into another tenant's context. Retrieval must
  be tenant-scoped in the same way every query is.
- Coaches and athletes must be told when a feature is AI-assisted, and athlete
  data use must be consented to explicitly.
- Log prompts and completions for debugging **only** with PII redacted and a
  short retention window.

## 7. Safety

- Human review before anything reaches an athlete. No auto-send.
- Nutrition and injury-adjacent output carries the highest risk: no medical
  claims, no calorie or macro prescriptions presented as authoritative, explicit
  disclaimers.
- Treat athlete-authored text (chat, notes) as untrusted when it enters a
  prompt — prompt injection is possible wherever user content is included.
- Model output rendered as markdown must be sanitized; it is user-visible HTML.
- Provide a feedback path so coaches can flag bad output, and monitor it.

## 8. Cost & performance

_TBD._ Plan for: per-tenant usage limits, prompt caching for stable system
context, streaming for anything user-facing, and a cost-per-tenant dashboard
before general availability.

## 9. Evaluation

_TBD._ Before any AI feature ships: a labelled evaluation set, quality
thresholds, regression runs on prompt or model change, and monitoring of
acceptance rate (how often a coach accepts a draft unedited) as the primary
product metric.

## 10. Open questions

| #   | Question                                            | Blocks          |
| --- | --------------------------------------------------- | --------------- |
| 1   | Which provider, under which data-processing terms?  | All AI work     |
| 2   | Is AI a paid add-on or included in tier pricing?    | Billing design  |
| 3   | Do athletes see AI-assisted content is AI-assisted? | Product & legal |
| 4   | Retention window for prompts and completions?       | Security review |

---

**Related:** [ARCHITECTURE.md](./ARCHITECTURE.md) · [SECURITY.md](./SECURITY.md) ·
[ROADMAP.md](./ROADMAP.md)
