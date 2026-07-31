import { Link } from 'react-router-dom';

// Shared frame for /login, /signup, /join/:token. Gradient background + centered card,
// matches the reader-canvas-board-new layout language (backdrop-blur fixed header, wide
// hero-friendly gradients) but uses Risip role tokens instead of blue.
export default function AuthShell({
  children,
  footer,
}: {
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-gradient-to-br from-role-admin/5 via-surface-muted to-role-worker/5">
      <header className="fixed top-0 left-0 right-0 z-40 border-b border-surface-border/60 bg-surface/80 backdrop-blur-sm">
        <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link to="/" className="text-lg font-bold tracking-tight text-role-admin">
            Risip
          </Link>
          {footer}
        </div>
      </header>

      <main className="mx-auto flex min-h-screen max-w-md items-center px-4 pt-24 pb-10">
        <div className="w-full">{children}</div>
      </main>
    </div>
  );
}
