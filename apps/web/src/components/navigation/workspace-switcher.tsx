'use client';

import { useEffect, useId, useState } from 'react';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';

import { Check, ChevronsUpDown, LayoutGrid } from 'lucide-react';

import { organization } from '@apex/auth/client';

import { FOCUS_RING, TOUCH_TARGET } from '@/components/common/touch';

/**
 * Switches the active workspace, and leads back to the personal level.
 *
 * ## With one workspace it is not a switcher
 *
 * It renders the name and nothing else — no chevron, no menu, no empty list.
 * A control that opens to show a single option the coach is already looking at
 * is noise, and in the MVP that is every coach.
 *
 * ## What switching actually does
 *
 * One write: `Session.activeOrganizationId`, through Better Auth's
 * `/organization/set-active`. That field is what `organizationProcedure` reads
 * to build the tenant scope, so every page follows without a route change —
 * which is why the MVP needs no `/w/[slug]/…`.
 *
 * `router.refresh()` afterwards, because every page in this group is a Server
 * Component: without it the cached render would keep showing the old workspace.
 *
 * **Session state, not URL state.** Two tabs share one session, so switching in
 * one changes what the other shows on its next render. Invisible with a single
 * workspace; the reason a URL-scoped workspace is written down as the next
 * decision rather than forgotten.
 */
export interface SwitchableWorkspace {
  readonly id: string;
  readonly name: string;
  readonly role: string;
}

export function WorkspaceSwitcher({
  workspaces,
  activeId,
  activeName,
  roleLabels,
}: {
  readonly workspaces: readonly SwitchableWorkspace[];
  readonly activeId: string;
  /**
   * The name to display, from `currentWorkspace` rather than from the list.
   *
   * The two agree in practice — `organizationProcedure` proved the membership
   * before either was read. Taking the displayed name from the authoritative
   * source anyway means a mismatch shows the right name rather than none.
   */
  readonly activeName: string;
  readonly roleLabels: Readonly<Record<string, string>>;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const panelId = useId();
  const [openedOn, setOpenedOn] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const open = openedOn === pathname;

  const name = activeName;

  useEffect(() => {
    if (!open) return undefined;

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpenedOn(null);
    };

    document.addEventListener('keydown', onKeyDown);

    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  // Nothing to switch to: the name, exactly as before the switcher existed.
  if (workspaces.length < 2) {
    return (
      <span className="truncate text-sm font-medium" title={name}>
        {name}
      </span>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={`Arbeitsbereich wechseln, aktuell ${name}`}
        disabled={pending}
        onClick={() => {
          setOpenedOn(open ? null : pathname);
        }}
        className={`${TOUCH_TARGET} ${FOCUS_RING} flex w-full items-center gap-2 rounded-md px-1 text-left text-sm font-medium transition-colors hover:bg-muted`}
      >
        <span className="min-w-0 flex-1 truncate">{name}</span>
        <ChevronsUpDown aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
      </button>

      {open ? (
        <div
          id={panelId}
          className="absolute inset-x-0 top-full z-40 mt-1 flex flex-col gap-1 rounded-md border border-border bg-card p-1 shadow-md"
        >
          {workspaces.map((workspace) => (
            <button
              key={workspace.id}
              type="button"
              disabled={pending}
              onClick={() => {
                setOpenedOn(null);
                if (workspace.id === activeId) return;

                setPending(true);
                void organization
                  .setActive({ organizationId: workspace.id })
                  .then(() => {
                    router.refresh();
                  })
                  .finally(() => {
                    setPending(false);
                  });
              }}
              className={`${TOUCH_TARGET} ${FOCUS_RING} flex items-center gap-2 rounded px-2 text-left text-sm transition-colors hover:bg-muted disabled:opacity-50`}
            >
              <Check
                aria-hidden="true"
                className={`size-4 shrink-0 ${workspace.id === activeId ? '' : 'invisible'}`}
              />
              <span className="flex min-w-0 flex-col">
                <span className="truncate">{workspace.name}</span>
                <span className="text-xs text-muted-foreground">
                  {roleLabels[workspace.role] ?? workspace.role}
                </span>
              </span>
            </button>
          ))}

          {/* The way back to the personal level, so the switcher is the single
              place that answers "where else can I go". */}
          <Link
            href="/start"
            className={`${TOUCH_TARGET} ${FOCUS_RING} mt-1 flex items-center gap-2 rounded border-t border-border px-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground`}
          >
            <LayoutGrid aria-hidden="true" className="size-4 shrink-0" />
            Meine Übersicht
          </Link>
        </div>
      ) : null}
    </div>
  );
}
