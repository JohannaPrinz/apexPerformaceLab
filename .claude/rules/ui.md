---
paths:
  - 'apps/web/src/app/**/*.tsx'
  - 'apps/web/src/components/**/*.tsx'
  - 'apps/web/src/features/*/components/**/*.tsx'
  - 'apps/web/src/features/*/*/components/**/*.tsx'
  - 'packages/ui/src/**/*.{ts,tsx}'
---

# UI rules

Reference: [docs/DESIGN_SYSTEM.md](../../docs/DESIGN_SYSTEM.md) ·
[docs/BRAND_GUIDE.md](../../docs/BRAND_GUIDE.md)

- **Server Components by default.** `'use client'` only for state, effects,
  event handlers or browser APIs — and pushed as far down the tree as possible.
- **Semantic tokens only**: `bg-background`, `text-muted-foreground`. No raw hex
  and no `--brand-*` in a component. Compose classes with `cn()`.
- **User-facing copy is German.** Labels, `aria-label`, empty states, errors.
  Code comments stay English.
- Components are PascalCase, files kebab-case. Props interfaces are explicit,
  and exported when another module renders the component.
- Accessible by role and name — that is also how the tests query
  (see [testing.md](testing.md)).

## Where a component belongs

| Scope                          | Location                          |
| ------------------------------ | --------------------------------- |
| Generic, domain-free primitive | `packages/ui`                     |
| App-wide but Apex-specific     | `src/components/<category>`       |
| Used by one slice              | `src/features/<slice>/components` |

## Enforced by ESLint, not by memory

`apps/web/eslint.config.mjs` already fails the build on the two boundaries most
easily crossed by accident:

- importing another slice's internals (`@/features/*/*`) — go through its
  `index.ts`, or promote the shared thing upward;
- importing `@apex/database` or the server `@apex/auth` from a component — use
  `@apex/auth/client`, and move data access into `server/`.

Do not restate these as comments; the linter is the statement.
