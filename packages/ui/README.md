# @apex/ui

The Apex OS design system: tokens, the Tailwind theme, and shared React primitives.

## Adding a shadcn/ui component

`components.json` is configured, so the CLI installs into this package:

```bash
cd packages/ui
pnpm dlx shadcn@latest add dialog dropdown-menu table
```

Components land in `src/components/` and must then be re-exported from
`src/index.ts`. Generated components are treated as **our** source from that
point on — edit them freely; there is no upstream to merge against.

## Why components are vendored rather than installed

shadcn/ui is a source-code distribution, not a runtime dependency. Every
component is a file we own and can adapt to the design system, which is the
entire reason to choose it over a closed component library. The trade-off is
that upstream fixes are not automatic — acceptable for a surface this small.

## Token layers

Consume **semantic** tokens (`bg-background`, `text-muted-foreground`,
`border-border`), never primitives (`--brand-accent`). The indirection is what
makes dark mode and future per-tenant theming a token swap.

Full rationale and the accessibility contract: [`docs/DESIGN_SYSTEM.md`](../../docs/DESIGN_SYSTEM.md).

## Styling entry point

`src/styles/globals.css` is imported once, by `apps/web/src/app/layout.tsx`.
Tailwind v4 needs no JS config file — the theme is declared in CSS via `@theme`.
