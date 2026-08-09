# recommendations

Recommendations — the only object for measures.

A Recommendation always derives from one or more Insights, never directly from
Measurements. It carries its own status; there is no separate Task, Action,
Intervention or Measure object.

```
PROPOSED → ACCEPTED → IN_PROGRESS → DONE
                    ↘ SKIPPED
                    ↘ SUPERSEDED
```

A Recommendation assigned to the Athlete is what the Athlete Portal displays as
a task.

## Scope

- Creating Recommendations from Insights
- Assignment to Coach or Athlete
- Status transitions across the lifecycle
- Open-recommendation views outside the Assessment editor

## Constraints

- Never derived directly from a Measurement — the Insight is mandatory.
- Content freezes with the Report that publishes it. **The status does not** —
  what a Recommendation says is fixed, whether it has been carried out is not.

_Not implemented yet — see docs/domain/DOMAIN_DECISIONS.md §15._
