# Brand Guide

> Status: **Partial** · Last updated: 2026-08-02
>
> The colour and typography sections reflect what is implemented in
> `packages/ui`. Voice, logo and imagery are placeholders.

## Contents

1. [Brand essence](#1-brand-essence)
2. [Voice & tone](#2-voice--tone)
3. [Logo](#3-logo)
4. [Colour](#4-colour)
5. [Typography](#5-typography)
6. [Imagery & iconography](#6-imagery--iconography)
7. [Applications](#7-applications)

---

## 1. Brand essence

**Name:** Apex OS
**Positioning:** the operating system for performance coaching.

Character — _TBD, expand each into a sentence:_

- Precise, not clinical
- Calm, not passive
- Expert, not gatekeeping

## 2. Voice & tone

_TBD._ Define how the product speaks in: onboarding, empty states, errors,
confirmations, marketing.

| Do    | Don't |
| ----- | ----- |
| _TBD_ | _TBD_ |

## 3. Logo

_TBD._ Wordmark, symbol, lockups, clear space, minimum sizes, misuse.
Asset location: _TBD_ (`apps/web/public/`).

## 4. Colour

The palette is deliberately narrow: a warm off-white ground, a near-black for
text and primary surfaces, a muted grey for secondary content, and a single
sage accent. One accent means the accent always means something — it marks the
primary action or a positive state, never decoration.

| Role       | Hex       | Token          | Usage                                                                    |
| ---------- | --------- | -------------- | ------------------------------------------------------------------------ |
| Background | `#F8F8F6` | `--background` | Page ground. Warm off-white, softer than pure white under long sessions. |
| Primary    | `#202124` | `--primary`    | Text, primary buttons, high-emphasis surfaces.                           |
| Secondary  | `#4B5563` | `--secondary`  | Secondary text, borders, low-emphasis UI.                                |
| Accent     | `#6B8F71` | `--accent`     | Primary action highlight, positive/success state.                        |

Dark theme values are defined alongside the light theme in
`packages/ui/src/styles/globals.css`.

**Contrast:** Primary on Background is ~15:1 and Accent on Background ~3.4:1.
The accent therefore passes AA for UI components and large text, but **not**
for body copy on the background — use `--primary` for body text and reserve
the accent for surfaces, icons and fills. Accent-as-background with white text
is the compliant pairing for buttons.

Full token reference: [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md).

## 5. Typography

| Family         | Role                            | Rationale                                                                                                     |
| -------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **Geist**      | Display, headings, UI           | Geometric and precise; its numerals are well-suited to the metric-heavy surfaces the product is built around. |
| **Inter**      | Body, dense data, tables        | Large x-height and excellent small-size legibility.                                                           |
| **Geist Mono** | Code, IDs, fixed-width numerals | Tabular alignment for data tables.                                                                            |

Both are loaded via `next/font` (self-hosted, no external request) and exposed
as CSS variables — see [layout.tsx](../apps/web/src/app/layout.tsx).

_TBD:_ full type scale, weights, tracking, and line-height ramp.

## 6. Imagery & iconography

- **Icons:** [Lucide](https://lucide.dev) exclusively. `1.5px` stroke, sized in
  even steps (16/20/24). Mixing icon sets is the fastest way to make a product
  look assembled rather than designed.
- **Photography:** _TBD._
- **Illustration:** _TBD._
- **Charts:** _TBD_ — chart palette derives from the accent; see
  [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md).

## 7. Applications

_TBD._ Favicon, OG images, email templates (Resend), social, app icon.

---

**Related:** [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md) ·
[PRODUCT_VISION.md](./PRODUCT_VISION.md)
