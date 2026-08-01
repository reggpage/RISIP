import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import MobileBottomNav from './MobileBottomNav';
import Sidebar from './Sidebar';
import Topbar from './Topbar';

export default function AppShell() {
  const auth = useAuth();
  const location = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const profile = auth.status === 'signed-in' ? auth.profile : null;

  // Close the drawer whenever the route changes — otherwise it stays open behind the
  // new page after a NavLink tap on mobile.
  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  return (
    <div className="flex h-full">
      <Sidebar
        role={profile?.role}
        mobileOpen={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
      />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar
          fullName={profile?.full_name ?? '—'}
          role={profile?.role}
          onOpenMenu={() => setMobileNavOpen(true)}
        />
        {/* pb keeps content clear of the fixed mobile tab bar (with safe-area padding). */}
        <main
          className="min-h-0 flex-1 overflow-y-auto md:pb-0"
          style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 4rem)' }}
        >
          <Outlet />
        </main>
        <MobileBottomNav role={profile?.role} />
      </div>
    </div>
  );
}
