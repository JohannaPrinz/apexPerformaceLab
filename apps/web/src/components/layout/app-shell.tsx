import { MobileMenu } from '@/components/navigation/mobile-menu';
import { NavLinks } from '@/components/navigation/nav-links';
import {
  WorkspaceSwitcher,
  type SwitchableWorkspace,
} from '@/components/navigation/workspace-switcher';
import { SignOutButton } from '@/features/auth';

/**
 * The application shell: sidebar on a desktop, top bar below `lg`.
 *
 * **Structure only, no data fetching** — the rule this directory's README sets,
 * and what keeps the shell reusable across every route in the group. The layout
 * above it reads the workspace once and passes the two strings down.
 *
 * ## Why two layouts rather than one that shrinks
 *
 * A sidebar that becomes narrow is still a sidebar: it eats horizontal space on
 * the axis a phone has least of. Below `lg` the navigation folds into a top bar
 * instead, so the content keeps the full width. The breakpoint is `lg`
 * (1024px), which puts a portrait tablet on the top bar and a landscape tablet
 * on the sidebar — a 15rem rail at 768px would leave the content cramped.
 *
 * ## Where the workspace switcher goes
 *
 * `workspaceName` is rendered in one place in each layout, deliberately. When
 * several workspaces arrive, that element becomes the switcher — the shell
 * around it does not change. The name is shown as the user's own words; §5
 * requires that "Personal Workspace" stays an implementation detail and never
 * becomes a product term.
 */
export function AppShell({
  workspaceName,
  coachName,
  workspaces,
  activeWorkspaceId,
  roleLabels,
  children,
}: {
  readonly workspaceName: string;
  readonly coachName: string | null;
  /** Every workspace this coach belongs to; one of them turns the name into a switcher. */
  readonly workspaces: readonly SwitchableWorkspace[];
  readonly activeWorkspaceId: string;
  readonly roleLabels: Readonly<Record<string, string>>;
  readonly children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-dvh flex-col lg:flex-row">
      {/* Phone and portrait tablet.
          `sticky` rather than `fixed`, and *only* `sticky`: adding `relative`
          alongside it sets `position` twice, and which one wins depends on the
          order Tailwind happens to emit them in. A sticky element already
          establishes a containing block, so the menu panel anchors to it
          correctly without the second utility. */}
      <header className="sticky top-0 z-40 flex items-center gap-2 border-b border-border bg-background px-4 py-2 lg:hidden">
        <MobileMenu coachName={coachName} />

        <div className="flex min-w-0 flex-1 flex-col">
          <span className="eyebrow leading-none">Arbeitsbereich</span>
          <WorkspaceSwitcher
            workspaces={workspaces}
            activeId={activeWorkspaceId}
            activeName={workspaceName}
            roleLabels={roleLabels}
          />
        </div>
      </header>

      {/* Desktop. `sticky` with its own scroll so a long navigation never drags
          the page, and the footer stays reachable. */}
      <aside className="hidden w-60 shrink-0 border-r border-border lg:sticky lg:top-0 lg:flex lg:h-dvh lg:flex-col">
        <div className="flex flex-col gap-0.5 px-4 py-5">
          <span className="eyebrow leading-none">Arbeitsbereich</span>
          {/* The element the switcher replaces — one place, as designed. */}
          <WorkspaceSwitcher
            workspaces={workspaces}
            activeId={activeWorkspaceId}
            activeName={workspaceName}
            roleLabels={roleLabels}
          />
        </div>

        <nav aria-label="Hauptnavigation" className="flex-1 overflow-y-auto px-3">
          <NavLinks />
        </nav>

        <div className="flex flex-col gap-3 border-t border-border px-4 py-4">
          <span className="truncate text-sm text-muted-foreground" title={coachName ?? undefined}>
            {coachName ?? 'Coach'}
          </span>
          <SignOutButton />
        </div>
      </aside>

      {/* `min-w-0` is what stops a wide table or a long word from pushing the
          whole page sideways: a flex child defaults to `min-width: auto`, and
          without this the shell scrolls horizontally on a phone. */}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
