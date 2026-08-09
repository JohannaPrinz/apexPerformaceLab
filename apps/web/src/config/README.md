# config

Static application configuration: navigation trees, feature flag defaults, route
constants, plan limits, and site metadata.

Values here are **compile-time constants**, not environment variables — those
live in `src/env.ts`. The distinction matters: anything in this directory is
identical in every deployment and safe to ship to the client.

_Nothing here yet — the first entries will be the navigation definition and the
route constants used by `src/middleware.ts`._
