import { redirect } from 'next/navigation';

import { AppShell } from '@/components/layout/app-shell';
import { WORKSPACE_ROLE_LABELS } from '@/features/auth/labels';
import { api } from '@/trpc/server';

/**
 * Shell for every signed-in route.
 *
 * The workspace and the coach are read **once here** rather than in each page,
 * which is what lets a navigation item cost nothing: the items themselves are
 * static, and the only query the chrome makes is this one.
 *
 * Both procedures are the ones that already existed. `currentWorkspace` runs on
 * `organizationProcedure`, so it has proven the membership before returning —
 * and every page in this group already required an active workspace, so moving
 * the call up here widens nothing.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const [workspace, coach, workspaces] = await Promise.all([
    api.auth.currentWorkspace(),
    api.auth.coachProfile(),
    api.auth.myWorkspaces(),
  ]);

  /**
   * An athlete who lands on a workspace route goes home instead.
   *
   * `/start` has always done this; doing it here covers the whole group, so a
   * stale link or a typed URL produces the portal rather than the generic
   * "something went wrong" page an athlete used to get — the procedures below
   * refused them correctly, and the screen made it look like a crash.
   *
   * **It is a convenience, not the boundary.** Every procedure on every page in
   * this group still refuses an account with no coach profile, exactly as
   * before; this only decides what the person sees instead (§21).
   *
   * The coach is already in hand from the read above, so it costs no query.
   */
  if (!coach) redirect('/portal');

  return (
    <AppShell
      workspaceName={workspace.name}
      coachName={coach?.displayName ?? null}
      workspaces={workspaces}
      activeWorkspaceId={workspace.id}
      roleLabels={WORKSPACE_ROLE_LABELS}
    >
      {children}
    </AppShell>
  );
}
