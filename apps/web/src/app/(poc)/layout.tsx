import type { Metadata } from 'next';

/**
 * A route group for throwaway technical trials.
 *
 * Deliberately outside `(app)`: no workspace shell, no navigation, no session
 * — a proof of concept that needed the product's frame around it would not be
 * isolated. Nothing under here reads or writes product data, and deleting the
 * folder removes it without trace.
 */
export const metadata: Metadata = {
  title: 'Technische Erprobung',
  // Not a product surface, and not something a search engine should offer.
  robots: { index: false, follow: false },
};

export default function PocLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-full max-w-content flex-col gap-6 px-4 py-8">{children}</div>
  );
}
