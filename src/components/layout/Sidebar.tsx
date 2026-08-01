import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, FolderKanban, Receipt, FileText, Settings, X, LogOut, Home,
} from 'lucide-react';
import { signOut } from '@/lib/auth';
import { hasAnyRole, type UserRole } from '@/lib/roles';
import { sw } from '@/i18n/sw';

type Item = { to: string; label: string; icon: React.ComponentType<{ className?: string }>; allowed: readonly UserRole[] };

// Full desktop nav — always visible on md+.
const desktopItems: Item[] = [
  { to: '/dashboard', label: sw.nav.dashboard, icon: LayoutDashboard, allowed: ['owner', 'accountant', 'worker'] },
  { to: '/projects', label: sw.nav.projects, icon: FolderKanban, allowed: ['owner', 'accountant', 'worker'] },
  { to: '/receipts', label: sw.nav.receipts, icon: Receipt, allowed: ['worker', 'accountant', 'owner'] },
  { to: '/invoices', label: sw.nav.invoices, icon: FileText, allowed: ['owner', 'accountant'] },
  { to: '/settings', label: sw.nav.settings, icon: Settings, allowed: ['owner'] },
];

// Mobile drawer — condensed because the bottom tab bar already covers the four main
// sections. The drawer just holds the utility routes (Home + Settings + Log out).
const mobileItems: Item[] = [
  { to: '/dashboard', label: 'Home', icon: Home, allowed: ['owner', 'accountant', 'worker'] },
  { to: '/settings', label: sw.nav.settings, icon: Settings, allowed: ['owner'] },
];

export default function Sidebar({
  role,
  mobileOpen,
  onClose,
}: {
  role: UserRole | undefined;
  mobileOpen: boolean;
  onClose: () => void;
}) {
  const desktop = desktopItems.filter((i) => hasAnyRole(role, i.allowed));
  const mobile = mobileItems.filter((i) => hasAnyRole(role, i.allowed));

  return (
    <>
      {/* Desktop sidebar — permanent column */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-surface-border bg-surface p-4 md:flex">
        <div className="mb-6 px-2 text-lg font-semibold tracking-tight text-role-admin">Risip</div>
        <nav className="flex flex-1 flex-col gap-1">
          {desktop.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ` +
                (isActive
                  ? 'bg-role-admin/10 text-role-admin'
                  : 'text-ink-muted hover:bg-surface-muted hover:text-ink')
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>

        <button
          type="button"
          onClick={() => void signOut()}
          className="mt-auto flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-ink-muted transition hover:bg-surface-muted hover:text-ink"
        >
          <LogOut className="h-4 w-4" />
          {sw.common.logout}
        </button>
      </aside>

      {/* Mobile drawer — anchored to the right edge, slides in from the right so it
          appears from under the hamburger (which lives on the right of the header). */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 md:hidden"
          onClick={onClose}
          aria-hidden="true"
        />
      )}
      <aside
        className={
          'fixed inset-y-0 right-0 z-50 flex w-64 flex-col bg-surface p-4 shadow-xl transition-transform duration-300 md:hidden ' +
          (mobileOpen ? 'translate-x-0' : 'translate-x-full')
        }
      >
        <div className="mb-6 flex items-center justify-between px-2">
          <div className="text-lg font-semibold tracking-tight text-role-admin">Risip</div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-ink-muted hover:bg-surface-muted hover:text-ink"
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-1">
          {mobile.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ` +
                (isActive
                  ? 'bg-role-admin/10 text-role-admin'
                  : 'text-ink hover:bg-surface-muted')
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
        </nav>

        <button
          type="button"
          onClick={() => {
            onClose();
            void signOut();
          }}
          className="mt-auto flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-ink-muted transition hover:bg-surface-muted hover:text-ink"
        >
          <LogOut className="h-4 w-4" />
          {sw.common.logout}
        </button>
      </aside>
    </>
  );
}
