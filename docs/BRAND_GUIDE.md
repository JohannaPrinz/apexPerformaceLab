# Brand Guide

> Status: **Colour & typography aligned with the website** · Last updated: 2026-08-10
>
> Colour and typography are the exported website tokens
> ([`docs/design/tokens.json`](./design/tokens.json)) and are implemented in
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

The palette is deliberately narrow: a warm off-white ground, a near-black ink,
a neutral grey ramp for secondary content, and a single deep green accent. One
accent means the accent always means something — it marks the primary action or
a positive state, never decoration.

These are the website's values, unchanged. Recognition between the public site
and the product is the reason they exist; changing them here would defeat it.

| Role      | Hex       | Token                | Usage                                                |
| --------- | --------- | -------------------- | ---------------------------------------------------- |
| Canvas    | `#F7F7F5` | `--background`       | Page ground. Warm off-white, softer than pure white. |
| Surface   | `#FFFFFF` | `--card`             | Cards and raised planes.                             |
| Deep      | `#16181A` | —                    | Inverted sections; the dark theme's ground.          |
| Ink       | `#16181A` | `--foreground`       | Headings and high-emphasis type.                     |
| Ink soft  | `#3D4247` | `--body`             | Body copy.                                           |
| Ink muted | `#63696F` | `--muted-foreground` | Secondary text. The AA-safe variant — see below.     |
| Line      | `#E4E4DF` | `--border`           | Rules and borders.                                   |
| Accent    | `#1F7A64` | `--accent`           | Primary action, highlight, positive state.           |
| Accent +  | `#175D4C` | `--accent-strong`    | Hover.                                               |
| Accent ○  | `#E8F1EE` | `--accent-soft`      | Icon plates, quiet emphasis.                         |

Dark theme values are derived from `deep` and defined alongside the light theme
in `packages/ui/src/styles/globals.css`.

**Contrast — measured:**

| Pair                 | Ratio   | Meaning                     |
| -------------------- | ------- | --------------------------- |
| Ink on Canvas        | 16.60:1 | AAA                         |
| Ink soft on Canvas   | 9.46:1  | AAA                         |
| Ink muted on Canvas  | 5.18:1  | AA at any size              |
| **Accent on Canvas** | 4.86:1  | **AA — safe for body text** |
| White on Accent      | 5.22:1  | AA — the button pairing     |

The accent clears AA for text, so links and inline emphasis in accent are
permitted. Note the trap the token set already anticipates: `inkMuted`
(`#71777D`) is only 4.22:1 and is safe **only at 16px and above**. Below that,
use `inkMutedAccessible` (`#63696F`) — which is what `--muted-foreground`
resolves to.

**Success has no colour of its own.** Green is the accent; a second green beside
it would read as noise. Confirmation uses the accent.

Full token reference: [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md).

## 5. Typography

| Family            | Weights  | Role                       | Rationale                                                                         |
| ----------------- | -------- | -------------------------- | --------------------------------------------------------------------------------- |
| **Manrope**       | 600, 700 | Display, headings          | Semi-geometric with a distinctive character; carries the tightened tracking well. |
| **Inter**         | 400–600  | Body, controls, dense data | Large x-height and excellent small-size legibility.                               |
| **IBM Plex Mono** | 400, 500 | Figures, IDs, micro-labels | Tabular alignment for data tables; the eyebrow's technical register.              |

All three are loaded via `next/font` (self-hosted, no external request) and
exposed as CSS variables — see [layout.tsx](../apps/web/src/app/layout.tsx).

**Tracking is a brand signature, not a preference.** Large type is tightened
(-0.03em display, -0.022em headings) while the eyebrow is opened wide (0.16em).
That contrast is what carries the premium impression; applying one without the
other loses it.

**Two type registers.** The marketing grades — 4.25rem / 2.75rem / 1.5rem —
apply to the public surface. The product uses a denser scale with the same face,
weight and tracking: a 68px heading above a table of measurements is unusable.
See [DESIGN_SYSTEM.md §4](./DESIGN_SYSTEM.md#4-typography).

## 6. Imagery & iconography

- **Icons:** [Lucide](https://lucide.dev) exclusively. `1.5px` stroke, sized in
  even steps (16/20/24). Mixing icon sets is the fastest way to make a product
  look assembled rather than designed.
- **Photography:** _TBD._
- **Illustration:** _TBD._
- **Motion:** exactly one easing curve project-wide,
  `cubic-bezier(0.22, 1, 0.36, 1)`, at 200ms or 700ms. A mixed motion vocabulary
  is the fastest way to make a product feel assembled from parts.
- **Charts:** five series anchored on the accent and spread across luminance so
  they survive greyscale and colour-vision deficiency; see
  [DESIGN_SYSTEM.md §7](./DESIGN_SYSTEM.md#7-data-visualization).

## 7. Applications

_TBD._ Favicon, OG images, email templates (Resend), social, app icon.

---

**Related:** [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md) ·
[PRODUCT_VISION.md](./PRODUCT_VISION.md)
