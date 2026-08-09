# @apex/config

Shared, versioned tooling presets. Every workspace consumes these instead of
defining its own — one place to change a rule, one place to review it.

## ESLint

Flat config, composed in layers so each workspace opts into exactly what it needs:

| Preset         | Extends | Use in                       |
| -------------- | ------- | ---------------------------- |
| `eslint/base`  | —       | Node / non-React packages    |
| `eslint/react` | `base`  | React libraries (`@apex/ui`) |
| `eslint/next`  | `react` | The Next.js app (`apps/web`) |

```js
// eslint.config.mjs
import { nextConfig } from '@apex/config/eslint/next';
export default [...nextConfig];
```

Type-aware rules are enabled through `projectService`, so each file resolves its
own `tsconfig.json` — no per-package `project` arrays to keep in sync.

## TypeScript

| Preset                          | Use in                   |
| ------------------------------- | ------------------------ |
| `typescript/base.json`          | Everything (strict core) |
| `typescript/library.json`       | Node packages            |
| `typescript/react-library.json` | React packages           |
| `typescript/nextjs.json`        | The Next.js app          |

All of them ultimately extend the root `tsconfig.base.json`, which is where the
strictness flags live (`strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, …).

## Prettier

Prettier is configured once at the repo root (`.prettierrc.json`) rather than per
package — formatting has no reason to differ between workspaces, and a single
config keeps editor integration trivial.
