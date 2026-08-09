# Design System

> Status: **Foundation implemented** · Last updated: 2026-08-02
>
> Source of truth: [`packages/ui/src/styles/globals.css`](../packages/ui/src/styles/globals.css).
> This document explains the model; the CSS file holds the values.

## Contents

1. [Token architecture](#1-token-architecture)
2. [Colour tokens](#2-colour-tokens)
3. [Theming](#3-theming)
4. [Typography](#4-typography)
5. [Shape & spacing](#5-shape--spacing)
6. [Components](#6-components)
7. [Data visualization](#7-data-visualization)
8. [Accessibility](#8-accessibility)
9. [Adding to the system](#9-adding-to-the-system)

---

## 1. Token architecture

Two layers, deliberately separated:

```text
PRIMITIVE            SEMANTIC                COMPONENT
--brand-accent   →   --accent            →   bg-accent
#6B8F71              (light: #6B8F71)        (Button variant="default")
                     (dark:  #86AB8C)
```

**Primitives** (`--brand-*`, `--neutral-*`, `--support-*`) are raw values. The
four brand colours are stored as the exact hex from the brand guide so they diff
cleanly against design files.

**Semantic tokens** (`--background`, `--primary`, `--muted-foreground`, …) are
what components consume. A component must never reference a primitive directly.

**Why the indirection?** It is what makes dark mode a token swap rather than a
component rewrite — and it is the same mechanism that will make per-tenant
white-labelling possible without touching a single component. Every semantic
token is redefined under `.dark`; nothing else changes.

Tailwind sees these through `@theme inline`, so `bg-background`,
`text-muted-foreground` and `border-border` resolve to the tokens above.

## 2. Colour tokens

| Token                                | Light                          | Dark                                  | Use                                |
| ------------------------------------ | ------------------------------ | ------------------------------------- | ---------------------------------- |
| `background` / `foreground`          | `#F8F8F6` / `#202124`          | `#121211` / `#F1F1EE`                 | Page ground and body text          |
| `card` / `card-foreground`           | `#FFFFFF` / `#202124`          | `#1C1C1A` / `#F1F1EE`                 | Raised surfaces                    |
| `popover` / `popover-foreground`     | `#FFFFFF` / `#202124`          | `#1C1C1A` / `#F1F1EE`                 | Overlays                           |
| `primary` / `primary-foreground`     | `#202124` / `#F8F8F6`          | `#F1F1EE` / `#121211`                 | Primary actions — inverted in dark |
| `secondary` / `secondary-foreground` | `#F1F1EE` / `#4B5563`          | `#2A2A27` / `#CFCFC9`                 | Secondary surfaces                 |
| `muted` / `muted-foreground`         | `#F1F1EE` / `#78786F`          | `#2A2A27` / `#A3A39C`                 | De-emphasized content              |
| `accent` / `accent-foreground`       | `#6B8F71` / `#FFFFFF`          | `#86AB8C` / `#121211`                 | Highlight, positive signal         |
| `destructive`                        | `#A4453C`                      | `#C76259`                             | Errors, destructive actions        |
| `success`                            | `#4F7A56`                      | `#6D9A74`                             | Confirmation                       |
| `warning`                            | `#B8863B`                      | `#D3A45C`                             | Caution                            |
| `border` / `input` / `ring`          | `#E4E4E0` / `#E4E4E0` / accent | `#FFFFFF1A` / `#FFFFFF26` / `#86AB8C` | Lines and focus                    |
| `sidebar-*`                          | white-based                    | `#1C1C1A`-based                       | App chrome, a distinct surface     |

Note the two intentional divergences from a naive palette:

- **`primary` inverts in dark mode.** On a near-black canvas the highest-emphasis
  surface is light, not dark. Keeping `#202124` there would make primary buttons
  disappear.
- **`accent` lifts in dark mode** (`#6B8F71` → `#86AB8C`). The light-theme sage
  fails AA against a near-black field.

## 3. Theming

Dark mode is **class-driven**, not media-driven:

```css
@custom-variant dark (&:is(.dark *));
```

`next-themes` writes `class="dark"` onto `<html>` before hydration (hence
`suppressHydrationWarning` in the root layout). Class-driven means a user's
explicit choice can override the OS preference — media-driven cannot.

**Adding a theme** (e.g. high-contrast, or a tenant brand) means adding one
selector block that redefines the semantic tokens. No component changes:

```css
.theme-tenant-acme {
  --accent: #0057b8;
  --ring: #0057b8;
}
```

## 4. Typography

| Utility        | Family     | Use                                                            |
| -------------- | ---------- | -------------------------------------------------------------- |
| `font-sans`    | Inter      | Body, forms, dense data — the default on `<body>`              |
| `font-display` | Geist      | Headings (`h1`–`h4` get it automatically), numerals, UI labels |
| `font-mono`    | Geist Mono | Code, IDs, tabular figures                                     |

Fonts are loaded by `next/font` in [layout.tsx](../apps/web/src/app/layout.tsx),
which self-hosts them and exposes CSS variables. The design system reads those
variables and never loads a font itself — that decoupling is what lets
`@apex/ui` be consumed by a non-Next.js surface later.

Base-layer behaviour worth knowing:

- `h1`–`h4` → `font-display`, tight tracking, `text-wrap: balance`
- `p` → `text-wrap: pretty`
- `[data-numeric]` → tabular figures. **Use it on every numeric table cell** —
  proportional digits make columns of numbers unreadable.

_TBD:_ explicit type scale (sizes, weights, line heights).

## 5. Shape & spacing

All rounding derives from a single `--radius: 0.625rem`:

| Utility       | Value          |
| ------------- | -------------- |
| `rounded-sm`  | `radius - 4px` |
| `rounded-md`  | `radius - 2px` |
| `rounded-lg`  | `radius`       |
| `rounded-xl`  | `radius + 4px` |
| `rounded-2xl` | `radius + 8px` |

Changing the brand's shape language is a one-line edit that stays proportional.

**Spacing** uses Tailwind's default 4px-based scale. No custom scale — inventing
one buys nothing and costs every developer their existing intuition.

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

Five ordered series tokens, `--chart-1` … `--chart-5`, anchored on the accent
and chosen to stay distinguishable in both themes.

**Before adding a sixth:** a categorical scale beyond five colours stops being
readable. If a chart needs more series, the fix is almost always the chart —
group the tail into "other", switch to small multiples, or use direct labelling
instead of a legend.

_TBD:_ sequential and diverging scales for heatmaps and change metrics.

## 8. Accessibility

Target: **WCAG 2.2 AA**.

Enforced in the base layer:

- `:focus-visible` always renders a 2px `--ring` outline at 2px offset. Never
  remove it — the token exists so it can be restyled instead.
- `prefers-reduced-motion: reduce` collapses animations and transitions globally.
- Every semantic foreground/background pair is chosen to meet 4.5:1 for text
  and 3:1 for UI components.

**The one trap:** `--accent` on `--background` is ~3.4:1. That passes for UI
components and large text but **fails for body copy**. Accent is a surface and
icon colour; body text is `--foreground`.

_TBD:_ automated contrast checks in CI; keyboard-navigation test coverage.

## 9. Adding to the system

1. Need a new colour? Add a **primitive** first, then a **semantic** token that
   references it, then define it under `.dark`. Never skip a layer.
2. Component styling uses semantic Tailwind utilities only — no raw hex, no
   `--brand-*` in a component.
3. Keep the token set small. Every token added is a token every future theme
   must define.

---

**Related:** [BRAND_GUIDE.md](./BRAND_GUIDE.md) ·
[ARCHITECTURE.md](./ARCHITECTURE.md) · [`packages/ui/README.md`](../packages/ui/README.md)
