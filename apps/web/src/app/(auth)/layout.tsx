/**
 * Shell for the credential screens.
 *
 * A route group, so `/sign-in` and `/sign-up` keep their flat URLs while
 * sharing a layout that has none of the app chrome — a signed-out visitor has
 * no workspace, so there is no navigation to render.
 */
export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm">{children}</div>
    </main>
  );
}
