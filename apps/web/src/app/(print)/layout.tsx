/**
 * The frame a printed page has: none.
 *
 * Its own route group rather than a page inside the signed-in shell, because a
 * preview of what somebody else receives must not carry this workspace's
 * navigation — on screen or on paper. Hiding the chrome with print styles alone
 * would leave it in the preview, which is the thing being previewed.
 *
 * Access is unchanged: `/druck` is a protected prefix in `proxy.ts`, and every
 * read underneath still goes through a tenant-scoped procedure.
 */
export default function PrintLayout({ children }: { children: React.ReactNode }) {
  return children;
}
