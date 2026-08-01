import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import Sidebar from './Sidebar';
import Topbar from './Topbar';

export default function AppShell() {
  const auth = useAuth();
  const location = useLocation();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const profile = auth.status === 'signed-in' ? auth.profile : null;

  // Close the drawer whenever the route changes so it doesn't linger over the new page.
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
        {/* Bottom tab bar removed — the hamburger drawer now holds the full nav, so
            content no longer needs padding to clear a fixed bar. */}
        <main className="min-h-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
