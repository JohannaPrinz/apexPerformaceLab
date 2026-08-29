import type { ReactNode } from 'react';

/**
 * The surface a link opens onto.
 *
 * Deliberately bare: no navigation, no workspace switcher, no sign-in prompt.
 * Somebody arriving here has a document to read and no account, and every
 * control the application offers would be an invitation to somewhere they
 * cannot go.
 */
export default function SharedLayout({ children }: { readonly children: ReactNode }) {
  return <div className="min-h-dvh bg-background">{children}</div>;
}
