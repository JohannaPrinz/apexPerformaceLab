/**
 * What a deactivated athlete is told, on every surface that has writes (§21).
 *
 * ## Why it is a component and not a sentence typed twice
 *
 * A deactivated account keeps the portal and loses the writes. The start page
 * said so; the file shelf did not — its buttons simply were not there, which
 * from the athlete's side is indistinguishable from a page that is broken. The
 * shelf already follows the rule that `PortalTracking` states in its own words:
 * *a control nobody may use is still a control somebody clicks*, so it removes
 * them. Removing them silently is the half of it that was missing.
 *
 * The first half of the sentence is the same everywhere, because the state is
 * the same everywhere. The second half names what *this* surface can no longer
 * do, because "neue Einträge" means nothing on a page of files.
 *
 * ## Why it is not a refusal
 *
 * It explains; it does not enforce. Every write behind it goes through
 * `writable()` in the procedure and is refused there whatever this renders —
 * see `server/writable.ts`.
 */
export function ReadOnlyNotice({ children }: { readonly children: React.ReactNode }) {
  return (
    <p
      role="status"
      className="rounded-md border border-border bg-muted px-4 py-3 text-sm text-pretty text-muted-foreground"
    >
      Ihr Zugang ist auf Lesen gestellt. Sie sehen weiterhin alles, was zu Ihnen gehört, und können
      es herunterladen — {children}
    </p>
  );
}
