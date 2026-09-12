import { NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, ScanLine, Package, ClipboardList, Settings } from 'lucide-react';
import { getLang } from '@/lib/lang';
import { nativeTapFeedback } from '@/lib/native';
import { openScan } from '@/lib/scanOverlay';

type Tab = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

function useTabs(): Tab[] {
  const isSw = getLang() === 'sw';
  return [
    { to: '/dashboard', label: isSw ? 'Nyumbani' : 'Home', icon: LayoutDashboard },
    { to: '/products', label: isSw ? 'Bidhaa' : 'Products', icon: Package },
    { to: '/daily-records', label: isSw ? 'Rekodi' : 'Records', icon: ClipboardList },
    { to: '/settings', label: isSw ? 'Mipangilio' : 'Settings', icon: Settings },
  ];
}

// Curved bottom dock, the classic 2 + 2 around a raised centre action:
//   - A background layer (not the whole subtree — a CSS mask on a shared
//     container would punch the scan button out of view too) carries the white
//     bar with a semicircular notch cut in its top edge; the scan button sits
//     inside that notch, half-raised above the bar. A thin brand-red line runs
//     along the top edge (the same red the status bar uses).
//   - Settings is the home of the former navigation drawer: Chat, Billing and
//     Notifications (Shown in the drawer) now live under Settings, so the
//     Settings tab stays lit while any of them is open.
export default function BottomTabBar() {
  const tabs = useTabs();
  const location = useLocation();
  const isActive = (to: string) => {
    if (to === '/settings') {
      return ['/settings', '/chat', '/billing', '/notifications'].includes(location.pathname)
        || location.pathname.startsWith('/settings/');
    }
    return location.pathname === to || location.pathname.startsWith(to + '/');
  };

  const renderTab = ({ to, label, icon: Icon }: Tab, column: number) => (
    <NavLink
      key={to}
      to={to}
      role="tab"
      aria-selected={isActive(to)}
      style={{ gridColumn: column }}
      className={
        'relative flex flex-col items-center justify-center gap-0.5 text-[10px] font-medium transition ' +
        (isActive(to) ? 'text-role-admin' : 'text-ink-muted active:text-ink')
      }
    >
      <Icon className="h-5 w-5" />
      <span>{label}</span>
    </NavLink>
  );

  return (
    <nav className="bottom-tab-bar fixed inset-x-0 bottom-0 z-40 md:hidden" role="tablist">
      <div
        className="relative grid"
        style={{
          gridTemplateColumns: '1fr 1fr 6rem 1fr 1fr',
          height: 'calc(3.5rem + env(safe-area-inset-bottom, 0px))',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        {/* Bar background with the notch cut into its top edge. The mask lives
            only on this layer so the scan button above it stays visible. */}
        <div
          aria-hidden="true"
          className="absolute inset-0"
          style={{
            borderTop: '2px solid rgb(var(--role-admin))',
            background: '#fff',
            WebkitMaskImage: 'radial-gradient(circle at 50% 0%, transparent 31px, black 32px)',
            maskImage: 'radial-gradient(circle at 50% 0%, transparent 31px, black 32px)',
          }}
        />

        {/* Left pair: Home, Products */}
        {tabs.slice(0, 2).map((tab, i) => renderTab(tab, i + 1))}

        {/* Scan — centre action, raised on the notch. Opens as a full-screen
            sheet (see ScanOverlayHost) instead of a route, so the counter is
            exactly where you left it when the sale is done. */}
        <button
          type="button"
          role="tab"
          aria-selected={false}
          aria-label="Scan"
          onClick={() => void nativeTapFeedback().then(() => openScan('sell'))}
          style={{ gridColumn: 3 }}
          className="relative flex items-center justify-center"
        >
          <span className="absolute top-0 flex h-14 w-14 -translate-y-1/2 items-center justify-center rounded-full bg-role-admin/95 text-white shadow-xl transition-transform active:scale-95">
            <ScanLine className="h-6 w-6" />
          </span>
          <span className="mt-9 text-[10px] font-medium text-ink-muted">Scan</span>
        </button>

        {/* Right pair: Records, Settings */}
        {tabs.slice(2).map((tab, i) => renderTab(tab, i + 4))}
      </div>
    </nav>
  );
}