# dashboard

The authenticated landing surface for the Coach: aggregate views and KPI tiles.

Composes data from other slices but must not reach into their internals — it
reads through their public `index.ts` or through a dedicated aggregation
service.

## Scope

- Coach overview: open Cases, upcoming Appointments, Reports in `DRAFT`
- Open Recommendations across athletes
- KPI tiles and trend sparklines

## Not in this slice

- **The athlete-facing overview** → `features/portal`
- **Per-athlete history** → `features/timeline`

_Not implemented yet — see docs/ROADMAP.md._
