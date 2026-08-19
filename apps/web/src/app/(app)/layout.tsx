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
