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
 *
 * It also fixes the palette — see `paper` below.
 */
export default function PrintLayout({ children }: { children: React.ReactNode }) {
  /**
   * `paper` fixes the document's palette, whatever theme the coach works in.
   *
   * It is the app's dark palette: the document reads the way the practice
   * reads. What matters as much as which one it is, is that it is **one** —
   * the page followed the theme on screen and was forced light in print, so a
   * coach previewed one document and saved another. The preview is the page,
   * which is the only reason a preview is worth having.
   */
  return <div className="paper min-h-dvh bg-background text-body">{children}</div>;
}
