import { NavLink } from 'react-router-dom';
import { LayoutDashboard, FolderKanban, Receipt, FileText } from 'lucide-react';
import { hasAnyRole, type UserRole } from '@/lib/roles';
import { sw } from '@/i18n/sw';

// Fixed bottom tab bar on mobile only. Complements the hamburger drawer for the top-4
// most-used sections; Settings + project-detail live in the drawer.
type Tab = { to: string; label: string; icon: React.ComponentType<{ className?: string }>; allowed: readonly UserRole[] };

const tabs: Tab[] = [
  { to: '/dashboard', label: sw.nav.dashboard, icon: LayoutDashboard, allowed: ['owner', 'accountant', 'worker'] },
  { to: '/projects', label: sw.nav.projects, icon: FolderKanban, allowed: ['owner', 'accountant', 'worker'] },
  { to: '/receipts', label: sw.nav.receipts, icon: Receipt, allowed: ['worker', 'accountant', 'owner'] },
  { to: '/invoices', label: sw.nav.invoices, icon: FileText, allowed: ['owner', 'accountant'] },
];

export default function MobileBottomNav({ role }: { role: UserRole | undefined }) {
  const visible = tabs.filter((t) => hasAnyRole(role, t.allowed));
  if (visible.length === 0) return null;
  return (
    <nav
      className="fixed inset-x-0 bottom-0 z-30 border-t border-surface-border bg-surface pb-safe md:hidden"
      // env(safe-area-inset-bottom) keeps the bar above the iPhone home indicator.
      style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      <div className="flex">
        {visible.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            className={({ isActive }) =>
              `flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] font-medium transition ` +
              (isActive ? 'text-role-admin' : 'text-ink-muted hover:text-ink')
            }
          >
            <Icon className="h-5 w-5" />
            <span>{label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
