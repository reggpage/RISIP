import { NavLink } from 'react-router-dom';
import { LayoutDashboard, FolderKanban, Receipt, FileText, Settings } from 'lucide-react';
import { hasAnyRole, type UserRole } from '@/lib/roles';
import { sw } from '@/i18n/sw';

type Item = { to: string; label: string; icon: React.ComponentType<{ className?: string }>; allowed: readonly UserRole[] };

const items: Item[] = [
  { to: '/dashboard', label: sw.nav.dashboard, icon: LayoutDashboard, allowed: ['owner', 'accountant', 'worker'] },
  { to: '/projects', label: sw.nav.projects, icon: FolderKanban, allowed: ['owner', 'accountant', 'worker'] },
  { to: '/receipts', label: sw.nav.receipts, icon: Receipt, allowed: ['worker', 'accountant', 'owner'] },
  { to: '/invoices', label: sw.nav.invoices, icon: FileText, allowed: ['owner', 'accountant'] },
  { to: '/settings', label: sw.nav.settings, icon: Settings, allowed: ['owner'] },
];

export default function Sidebar({ role }: { role: UserRole | undefined }) {
  return (
    <aside className="hidden w-60 shrink-0 border-r border-surface-border bg-surface p-4 md:block">
      <div className="mb-6 px-2 text-lg font-semibold tracking-tight text-ink">Risip</div>
      <nav className="flex flex-col gap-1">
        {items
          .filter((i) => hasAnyRole(role, i.allowed))
          .map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition ` +
                (isActive
                  ? 'bg-surface-muted text-ink'
                  : 'text-ink-muted hover:bg-surface-muted hover:text-ink')
              }
            >
              <Icon className="h-4 w-4" />
              {label}
            </NavLink>
          ))}
      </nav>
    </aside>
  );
}
