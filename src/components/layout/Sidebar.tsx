import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, FolderKanban, Receipt, FileText, Settings, Wallet, X, LogOut, Handshake, Bell, HandCoins,
  Banknote, ClipboardList, Package, ScanLine, CreditCard,
} from 'lucide-react';
import RisipLogo from '@/components/ui/RisipLogo';
import { useNotifications } from '@/features/notifications/notifications';
import { signOut } from '@/lib/auth';
import { hasAnyRole, type UserRole } from '@/lib/roles';
import { navVisible, type NavKey } from '@/lib/nav';
import { sw } from '@/i18n/sw';
import { getLang } from '@/lib/lang';

type Item = {
  key: NavKey;
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  allowed: readonly UserRole[];
};

// Every section the app has. Which of them a shopkeeper SEES is decided in one
// place — see lib/nav.ts — because "for now we are only a shop" is a product
// decision and it should be readable as one line, not inferred from a nav list.
const allItems: Item[] = [
  { key: 'dashboard', to: '/dashboard', label: sw.nav.dashboard, icon: LayoutDashboard, allowed: ['owner', 'accountant', 'worker'] },
  // Selling sits above everything else: it is the thing a shop does all day.
  { key: 'sell', to: '/sell', label: getLang() === 'sw' ? 'Uza kwa scan' : 'Sell by scan', icon: ScanLine, allowed: ['owner', 'accountant', 'worker'] },
  { key: 'products', to: '/products', label: getLang() === 'sw' ? 'Bidhaa' : 'Products', icon: Package, allowed: ['owner', 'accountant', 'worker'] },
  { key: 'daily-records', to: '/daily-records', label: getLang() === 'sw' ? 'Rekodi za Siku' : 'Daily Records', icon: ClipboardList, allowed: ['owner', 'accountant', 'worker'] },
  { key: 'notifications', to: '/notifications', label: getLang() === 'sw' ? 'Taarifa' : 'Notifications', icon: Bell, allowed: ['owner', 'accountant', 'worker'] },
  { key: 'billing', to: '/billing', label: getLang() === 'sw' ? 'Bili' : 'Billing', icon: CreditCard, allowed: ['owner'] },
  { key: 'settings', to: '/settings', label: sw.nav.settings, icon: Settings, allowed: ['owner', 'accountant', 'worker'] },

  { key: 'projects', to: '/projects', label: sw.nav.projects, icon: FolderKanban, allowed: ['owner', 'accountant', 'worker'] },
  { key: 'receipts', to: '/receipts', label: sw.nav.receipts, icon: Receipt, allowed: ['worker', 'accountant', 'owner'] },
  { key: 'retirements', to: '/retirements', label: 'Retirements', icon: HandCoins, allowed: ['owner', 'accountant', 'worker'] },
  { key: 'reimbursements', to: '/reimbursements', label: 'Reimbursements', icon: Banknote, allowed: ['owner', 'accountant'] },
  { key: 'claims', to: '/claims', label: 'Claims', icon: Handshake, allowed: ['owner', 'accountant'] },
  { key: 'invoices', to: '/invoices', label: sw.nav.invoices, icon: FileText, allowed: ['owner', 'accountant'] },
  { key: 'petty-cash', to: '/petty-cash', label: 'Petty cash', icon: Wallet, allowed: ['owner', 'accountant'] },
];

const desktopItems: Item[] = allItems.filter((item) => navVisible(item.key));

// Mobile drawer now carries the FULL nav (the bottom tab bar was removed), so it
// mirrors the desktop item list exactly.
const mobileItems: Item[] = desktopItems;

// Sidebar palette:
//   - Base: deep brand red (--sidebar-bg, #880D1E)
//   - Logo + text/icons: white
//   - Active item: translucent white overlay (bg-white/15) with full-white text — the
//     "fade white" the user asked for, so the selection reads without shouting.
//   - Wider padding/gaps so the nav breathes instead of feeling cramped.
export default function Sidebar({
  role,
  userId,
  mobileOpen,
  onClose,
}: {
  role: UserRole | undefined;
  userId: string | undefined;
  mobileOpen: boolean;
  onClose: () => void;
}) {
  const desktop = desktopItems.filter((i) => hasAnyRole(role, i.allowed));
  const mobile = mobileItems.filter((i) => hasAnyRole(role, i.allowed));
  const { unreadCount } = useNotifications(userId);

  return (
    <>
      {/* Desktop sidebar */}
      <aside className="hidden w-64 shrink-0 flex-col overflow-y-auto bg-sidebar px-4 py-6 text-white md:flex">
        {/* Brand mark — logo only, sized like the wordmarks in Vercel/Linear/Stripe: big
            enough to anchor the sidebar, generous headroom above the nav. */}
        <div className="mb-10 flex justify-center">
          <RisipLogo className="h-20 w-20" />
        </div>
        <nav className="flex flex-1 flex-col gap-2">
          {desktop.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ` +
                (isActive
                  ? 'bg-white/15 text-white'
                  : 'text-white hover:bg-white/10 hover:text-white')
              }
            >
              <Icon className="h-4 w-4" />
              <span className="min-w-0 flex-1 truncate">{label}</span>
              {to === '/notifications' && unreadCount > 0 && (
                <span className="rounded-full bg-white px-1.5 py-0.5 text-[10px] font-semibold leading-none text-sidebar">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <button
          type="button"
          onClick={() => void signOut()}
          className="mt-auto flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white transition hover:bg-white/10 hover:text-white"
        >
          <LogOut className="h-4 w-4" />
          {sw.common.logout}
        </button>
      </aside>

      {/* Mobile drawer — same palette, slides in from the right. */}
      {mobileOpen && (
        <div className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={onClose} aria-hidden="true" />
      )}
      <aside
        className={
          'fixed inset-y-0 right-0 z-50 flex w-64 flex-col overflow-y-auto overscroll-contain bg-sidebar px-4 py-6 text-white shadow-xl transition-transform duration-300 md:hidden ' +
          (mobileOpen ? 'translate-x-0' : 'translate-x-full')
        }
      >
        <div className="mb-8 flex items-center justify-between">
          <RisipLogo className="h-14 w-14" />
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-white hover:bg-white/10 hover:text-white"
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <nav className="flex flex-1 flex-col gap-2">
          {mobile.map(({ to, label, icon: Icon }) => (
            <NavLink
              key={to}
              to={to}
              onClick={onClose}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition ` +
                (isActive ? 'bg-white/15 text-white' : 'text-white hover:bg-white/10 hover:text-white')
              }
            >
              <Icon className="h-4 w-4" />
              <span className="min-w-0 flex-1 truncate">{label}</span>
              {to === '/notifications' && unreadCount > 0 && (
                <span className="rounded-full bg-white px-1.5 py-0.5 text-[10px] font-semibold leading-none text-sidebar">
                  {unreadCount > 9 ? '9+' : unreadCount}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <button
          type="button"
          onClick={() => {
            onClose();
            void signOut();
          }}
          className="mt-auto flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white transition hover:bg-white/10 hover:text-white"
        >
          <LogOut className="h-4 w-4" />
          {sw.common.logout}
        </button>
      </aside>
    </>
  );
}
