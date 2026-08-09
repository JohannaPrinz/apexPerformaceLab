# navigation

Sidebar, top bar, breadcrumbs, tabs, command palette, organization switcher.

Navigation components read the active route and the active organization, so they
are almost always client components. Keep the data they need minimal — a
navigation item should not trigger a query.
