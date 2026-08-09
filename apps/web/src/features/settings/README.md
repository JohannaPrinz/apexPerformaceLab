# settings

Workspace, coach profile, catalogue and personal preferences.

## Scope

- Workspace profile and branding
- Coach profile — professional information only
- Member and role management
- Measurement Type catalogue: workspace-specific entries on top of the
  system defaults
- Billing and subscription (post-MVP)
- Personal preferences, theme, notifications

## Note on the catalogue

Workspace-specific Measurement Types are managed here, but their **definition**
— name, unit, value type, category, reference range — belongs to
`packages/domain`. This slice provides the administration surface, not the
model.

_Not implemented yet — see docs/domain/DOMAIN_DECISIONS.md §5, §6, §12._
