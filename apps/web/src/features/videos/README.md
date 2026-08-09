# videos

Videos are first-class domain objects. **A Video is not a document type.**

They share upload and storage with Documents, but nothing else: a Video carries
timestamped annotations, coach comments and AI analysis, and it is the primary
evidence for movement and technique Insights.

## Context ladder

| Level            | Required |
| ---------------- | -------- |
| Athlete          | always   |
| Performance Case | optional |
| Assessment       | optional |
| Module           | optional |

## Scope

- Upload by Coach or Athlete — the Athlete through the portal, never under
  Shared Access
- Timestamped annotations
- Coach comments
- AI-assisted analysis, always reviewed by the Coach before it counts
- Use as evidence for an Insight

## Not in this slice

- **Documents** → `features/documents`
- **Upload and storage mechanics** → `src/services`
- **Visibility** → `features/reports/sharing`

_Not implemented yet — see docs/domain/DOMAIN_DECISIONS.md §18._
