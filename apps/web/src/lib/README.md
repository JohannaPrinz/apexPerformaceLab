# lib

Shared, framework-agnostic utilities.

The bar for adding something: pure, no React/Next/database dependency, and
needed by more than one feature slice. Anything narrower belongs to its slice.

- `utils.ts` — formatting, URL building, type guards

Client-side hooks that are genuinely generic (`useDebounce`, `useMediaQuery`) go
in a `hooks/` directory here; slice-specific hooks stay in the slice.
