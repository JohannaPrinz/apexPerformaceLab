# Design System

> Status: **Brand aligned with the marketing site** · Last updated: 2026-08-10
>
> Brand source of truth: [`docs/design/tokens.json`](./design/tokens.json), exported
> from the website. Implementation: [`packages/ui/src/styles/globals.css`](../packages/ui/src/styles/globals.css).
> This document explains the model; those two files hold the values.

## Contents

1. [Token architecture](#1-token-architecture)
2. [Colour tokens](#2-colour-tokens)
3. [Theming](#3-theming)
4. [Typography](#4-typography)
5. [Shape, motion & spacing](#5-shape-motion--spacing)
6. [Components](#6-components)
7. [Data visualization](#7-data-visualization)
8. [Accessibility](#8-accessibility)
9. [Adding to the system](#9-adding-to-the-system)

---

## 1. Token architecture

Three layers, deliberately separated:

```text
BRAND                SEMANTIC                COMPONENT
--brand-accent   →   --accent            →   bg-accent
#1F7A64              (light: #1F7A64)        (Button variant="default")
                     (dark:  #3FA88C)
```

**Brand tokens** (`--brand-*`, `--deep-*`, `--support-*`, `--series-*`) are raw
values. Everything under `--brand-*` is [`tokens.json`](./design/tokens.json)
verbatim, so the two can be diffed without conversion. **Do not "improve" those
values here** — recognition across site and product is the entire point.

Everything the product needs that the marketing set does not cover — dark mode,
status colours, the chart series — is **derived** in `globals.css` and
contrast-checked. The ratios in its comments are measured, not estimated.

**Semantic tokens** (`--background`, `--primary`, `--muted-foreground`, …) are
what components consume. A component must never reference a brand token
directly.

**Why the indirection?** It makes dark mode a token swap rather than a component
rewrite — the same mechanism that will make per-tenant white-labelling possible
without touching a component. Every semantic token is redefined under `.dark`;
nothing else changes.

Tailwind sees these through `@theme inline`, so `bg-background`,
`text-muted-foreground` and `border-border` resolve to the tokens above.

## 2. Colour tokens

| Token                                | Light                 | Dark                      | Use                                |
| ------------------------------------ | --------------------- | ------------------------- | ---------------------------------- |
| `background` / `foreground`          | `#F7F7F5` / `#16181A` | `#16181A` / `#F1F1EE`     | Page ground · heading ink          |
| `body`                               | `#3D4247`             | `#C9CCCE`                 | Body copy — set on `<body>`        |
| `card` / `card-foreground`           | `#FFFFFF` / `#16181A` | `#1D2023` / `#F1F1EE`     | Raised surfaces                    |
| `primary` / `primary-foreground`     | `#16181A` / `#F7F7F5` | `#F1F1EE` / `#16181A`     | Primary actions — inverted in dark |
| `secondary` / `secondary-foreground` | `#F1F1EE` / `#3D4247` | `#24282B` / `#C9CCCE`     | Secondary surfaces                 |
| `muted` / `muted-foreground`         | `#F1F1EE` / `#63696F` | `#24282B` / `#9BA1A6`     | De-emphasized content              |
| `accent` / `accent-foreground`       | `#1F7A64` / `#FFFFFF` | `#3FA88C` / `#16181A`     | Highlight, primary brand signal    |
| `accent-soft` / its foreground       | `#E8F1EE` / `#0F3F34` | `#16302A` / `#A8DCCB`     | Icon plates, quiet emphasis        |
| `success`                            | = `accent`            | = `accent`                | Confirmation                       |
| `warning`                            | `#96631B`             | `#D9A441`                 | Caution                            |
| `destructive`                        | `#9E3B33`             | `#E08A80`                 | Errors, destructive actions        |
| `info`                               | `#3D6785`             | `#7FB0CE`                 | Neutral information                |
| `border` / `border-strong` / `ring`  | `#E4E4DF` / `#D3D3CC` | `#FFFFFF1F` / `#FFFFFF33` | Lines and focus                    |
| `sidebar-*`                          | white-based           | `#1D2023`-based           | App chrome, a distinct surface     |

Four decisions worth knowing:

- **Body copy is `--body`, not `--foreground`.** Full-strength ink is reserved
  for headings; that reservation is what gives the type its hierarchy.
- **`primary` inverts in dark mode.** On a near-black ground the
  highest-emphasis surface is light. Keeping `#16181A` would make primary
  buttons vanish.
- **`accent` lifts in dark mode** (`#1F7A64` → `#3FA88C`). The brand accent
  scores only 3.41:1 on `deep` — below AA for text. The lift keeps hue and
  saturation and raises luminance to 6.10:1.
- **`success` resolves to `accent`.** Green is already the brand accent; a
  second, near-identical green beside it reads as noise rather than signal.
  Status differentiation happens through warning, destructive and info.

**`muted-foreground` uses `inkMutedAccessible` (`#63696F`), not `inkMuted`.**
Muted text is routinely set below 16px, where `inkMuted`'s 4.22:1 would fail.
The token set anticipates this — use the accessible variant unless the text is
guaranteed ≥16px.

## 3. Theming

Dark mode is **class-driven**, not media-driven:

```css
@custom-variant dark (&:is(.dark *));
```

`next-themes` writes `class="dark"` onto `<html>` before hydration (hence
`suppressHydrationWarning` in the root layout). Class-driven means a user's
explicit choice can override the OS preference — media-driven cannot.

**Adding a theme** (high-contrast, or a tenant brand) means one selector block
redefining semantic tokens. No component changes:

```css
.theme-tenant-acme {
  --accent: #0057b8;
  --ring: #0057b8;
}
```

## 4. Typography

| Utility        | Family        | Use                                              |
| -------------- | ------------- | ------------------------------------------------ |
| `font-sans`    | Inter         | Body, forms, dense data — the default            |
| `font-display` | Manrope       | Headings (`h1`–`h4` get it automatically)        |
| `font-mono`    | IBM Plex Mono | Figures, IDs, micro-labels, the `.eyebrow` class |

Loaded by `next/font` in [layout.tsx](../apps/web/src/app/layout.tsx), which
self-hosts them and exposes CSS variables. The design system reads those
variables and never loads a font itself — that decoupling is what lets
`@apex/ui` be consumed by a non-Next.js surface later, and it means no request
ever leaves for a font CDN.

### Two registers, one voice

| Register      | Grades                                | Where                       |
| ------------- | ------------------------------------- | --------------------------- |
| **Marketing** | `text-display-sm` · `-md` · `-lg`     | Landing and public surfaces |
| **Product**   | Tailwind's own scale, `text-3xl` down | Everything inside the app   |

The display grades are the brand file's `h3`/`h2`/`h1` — 1.5rem, 2.75rem,
4.25rem. A 68px heading above a table of measurements is unusable, so the
product never uses them; it inherits the same face, weight and tracking instead.
`text-eyebrow` and `text-lead` are shared by both.

### Tracking

`tracking-display` (-0.03em) · `tracking-heading` (-0.022em) · `tracking-body`
(0) · `tracking-eyebrow` (0.16em).

The contrast between negative tracking on large type and positive tracking on
the eyebrow is what carries the premium impression. It is a brand decision, not
a preference — see the note in [`tokens.json`](./design/tokens.json).

### Base-layer behaviour

- `h1`–`h4` → `font-display`, `tracking-heading`, `text-foreground`,
  `text-wrap: balance`
- `body` → `font-sans`, `text-body`
- `p` → `text-wrap: pretty`
- `.eyebrow` → mono, uppercase, `text-eyebrow`, muted
- `[data-numeric]` → tabular figures. **Use it on every numeric table cell** —
  proportional digits make columns of numbers unreadable.

## 5. Shape, motion & spacing

**Radius** is the brand's named scale, not a single value with derived steps —
the steps were chosen individually and are not proportional:

| Utility      | Value |
| ------------ | ----- |
| `rounded-xs` | 4px   |
| `rounded-sm` | 8px   |
| `rounded-md` | 12px  |
| `rounded-lg` | 20px  |
| `rounded-xl` | 28px  |

**Motion** is exactly one curve for the whole project: `ease-brand`
(`cubic-bezier(0.22, 1, 0.36, 1)`), with `--duration-fast` (200ms) and
`--duration-slow` (700ms). Do not introduce a second easing — a mixed motion
vocabulary is the fastest way to make a product feel assembled from parts.

**Elevation** is for floating elements only, always soft, always with negative
spread: `shadow-card`, `shadow-float`, `shadow-modal`. A resting surface uses a
border, not a shadow.

**Spacing** uses Tailwind's default 4px scale, plus the brand's section rhythm:
`p-section` / `p-section-lg` (5rem / 8rem), the tight variants, and
`p-card` / `p-card-lg`.

**Measure**: `max-w-narrow` (48rem) · `max-w-content` (72rem) · `max-w-wide`
(80rem).

**Breakpoints** are Tailwind's defaults and already match the brand file exactly
— nothing is overridden.

## 6. Components

Primitives live in `packages/ui/src/components/` and are exported from the
package root. Built on shadcn/ui + Radix, styled with `class-variance-authority`.

Present today: `Button`, `Card`, `Input`, `Badge`, `Separator`, `Skeleton`.

**Where a component belongs:**

| Location                                   | Criterion                                                        |
| ------------------------------------------ | ---------------------------------------------------------------- |
| `packages/ui`                              | Generic, no domain knowledge, reusable by any future app         |
| `apps/web/src/components/<category>`       | App-wide but Apex-specific (layout, navigation, charts, tables…) |
| `apps/web/src/features/<slice>/components` | Only meaningful inside one feature                               |

Adding a shadcn primitive:

```bash
pnpm --filter @apex/ui dlx shadcn@latest add dialog
```

Then export it from `packages/ui/src/index.ts`.

## 7. Data visualization

Five ordered series, `--chart-1` … `--chart-5`, also available to JavaScript as
`chartColors` / `chartColorsDark` in [`packages/ui/src/tokens`](../packages/ui/src/tokens/index.ts).

**They were chosen by solving for staggered luminance, not by picking hues.**
Series that share a luminance merge in greyscale and under colour-vision
deficiency however different their hue — the previous palette had two series
0.001 apart. The current set holds a minimum gap of 0.045 (light) and 0.070
(dark), against a 0.030 floor, and every series clears 3:1 against its ground.

That is necessary, not sufficient. **Colour never carries meaning alone** — pair
it with shape, direct labelling or pattern. A chart that becomes unreadable in
greyscale is unreadable to some of its audience in colour.

**Before adding a sixth:** a categorical scale beyond five colours stops being
readable. The fix is almost always the chart — group the tail into "other",
switch to small multiples, or label directly instead of using a legend.

_TBD:_ sequential and diverging scales for heatmaps and change metrics.

## 8. Accessibility

Target: **WCAG 2.2 AA**.

Enforced in the base layer:

- `:focus-visible` always renders a 2px `--ring` outline at 2px offset. Never
  remove it — the token exists so it can be restyled instead.
- `prefers-reduced-motion: reduce` collapses animations and transitions globally.

Measured ratios for the pairs that matter:

| Pair                          | Ratio   | Verdict        |
| ----------------------------- | ------- | -------------- |
| `foreground` on `background`  | 16.60:1 | AA / AAA       |
| `body` on `background`        | 9.46:1  | AA / AAA       |
| `muted-foreground` on ground  | 5.18:1  | AA at any size |
| `accent` on `background`      | 4.86:1  | AA — text safe |
| white on `accent`             | 5.22:1  | AA             |
| `accent` (dark) on `deep`     | 6.10:1  | AA             |
| `accent-ink` on `accent-soft` | 10.25:1 | AAA            |

**The accent is now safe for body-sized text** (4.86:1), which the previous sage
`#6B8F71` was not (3.41:1). Links and inline emphasis in accent are permitted.

_TBD:_ automated contrast checks in CI; keyboard-navigation test coverage.

## 9. Adding to the system

1. **Brand values come from [`tokens.json`](./design/tokens.json), never from
   here.** If the site changes, update that file and re-derive.
2. Need a new colour? Add a **brand or support primitive** first, then a
   **semantic** token that references it, then define it under `.dark`. Never
   skip a layer.
3. Any derived colour ships with its measured contrast ratio in a comment. If
   you cannot state the ratio, you have not finished choosing the colour.
4. Component styling uses semantic Tailwind utilities only — no raw hex, no
   `--brand-*` in a component.
5. Keep the token set small. Every token added is a token every future theme
   must define.

---

**Related:** [BRAND_GUIDE.md](./BRAND_GUIDE.md) ·
[`tokens.json`](./design/tokens.json) · [ARCHITECTURE.md](./ARCHITECTURE.md) ·
[`packages/ui/README.md`](../packages/ui/README.md)
