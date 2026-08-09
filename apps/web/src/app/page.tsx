import { ArrowUpRight, Database, GitBranch, Layers, Palette, ShieldCheck } from 'lucide-react';

import { Badge, Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from '@apex/ui';

/**
 * Placeholder landing page.
 *
 * Deliberately not a marketing page — it renders the design tokens and the
 * component primitives so that a fresh clone visibly proves the styling
 * pipeline, the theme and the shared UI package are all wired correctly.
 * Replace it when the marketing surface is built.
 */

const foundations = [
  {
    icon: Layers,
    title: 'Feature-sliced',
    description:
      'Each domain owns its components, server logic and schemas under src/features/<slice>.',
  },
  {
    icon: Database,
    title: 'Multi-tenant core',
    description: 'Organizations, memberships and invitations exist in the schema from day one.',
  },
  {
    icon: ShieldCheck,
    title: 'Typed boundaries',
    description: 'Zod-validated env, tRPC procedures and role-gated access control.',
  },
  {
    icon: Palette,
    title: 'Token-driven design',
    description: 'Semantic CSS variables with light and dark themes prepared.',
  },
] as const;

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-5xl flex-col justify-center px-6 py-20">
      <div className="flex flex-col gap-6">
        <Badge variant="accent" className="w-fit">
          <GitBranch />
          Foundation · v0.1.0
        </Badge>

        {/* The display grades and the `.eyebrow` class come straight from the
            brand token set — this is the public surface, so it uses the
            marketing register rather than the denser product one. */}
        <div className="flex flex-col gap-4">
          <span className="eyebrow">Performance Coaching</span>
          <h1 className="font-display text-display-md font-bold text-balance sm:text-display-lg">
            Apex OS
          </h1>
          <p className="max-w-xl text-lead text-pretty text-muted-foreground">
            The operating system for performance coaching. This is the project foundation —
            architecture, tooling and design system. No features yet, by design.
          </p>
        </div>

        <div className="flex flex-wrap gap-3">
          <Button asChild>
            <a href="https://github.com" target="_blank" rel="noreferrer">
              Repository
              <ArrowUpRight />
            </a>
          </Button>
          <Button variant="outline" asChild>
            <a href="/docs/ARCHITECTURE.md">Architecture</a>
          </Button>
        </div>
      </div>

      <div className="mt-16 grid gap-4 sm:grid-cols-2">
        {foundations.map(({ icon: Icon, title, description }) => (
          <Card key={title}>
            <CardHeader>
              <Icon className="size-5 text-accent" aria-hidden />
              <CardTitle>{title}</CardTitle>
              <CardDescription>{description}</CardDescription>
            </CardHeader>
            <CardContent />
          </Card>
        ))}
      </div>
    </main>
  );
}
