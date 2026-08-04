import { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/ui/Toast';
import Sidebar from './Sidebar';
import Topbar from './Topbar';

export default function AppShell() {
  const auth = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [notificationToasts, setNotificationToasts] = useState(() =>
    window.localStorage.getItem('risip:notificationToasts') !== 'off',
  );
  const profile = auth.status === 'signed-in' ? auth.profile : null;

  // Close the drawer whenever the route changes so it doesn't linger over the new page.
  useEffect(() => {
    setMobileNavOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    function sync() {
      setNotificationToasts(window.localStorage.getItem('risip:notificationToasts') !== 'off');
    }
    window.addEventListener('storage', sync);
    window.addEventListener('risip:notificationToastsChanged', sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener('risip:notificationToastsChanged', sync);
    };
  }, []);

  useEffect(() => {
    if (auth.status !== 'signed-in') return;
    if (window.localStorage.getItem('risip:emailVerifyNoticeShown') === '1') return;
    let cancelled = false;
    void supabase.auth.getUser().then(({ data }) => {
      if (cancelled || data.user?.email_confirmed_at) return;
      window.localStorage.setItem('risip:emailVerifyNoticeShown', '1');
      toast.info('Verify your email for password recovery and claim notifications.', {
        label: 'Open settings',
        onClick: () => navigate('/settings?verify=email'),
      });
    });
    return () => { cancelled = true; };
  }, [auth.status, navigate, toast]);

  useEffect(() => {
    if (!profile?.id) return;
    if (!notificationToasts) return;
    const channel = supabase
      .channel(`app-shell-notification-toasts-${profile.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'app_notifications', filter: `recipient_id=eq.${profile.id}` },
        (payload) => {
          const row = payload.new as { title?: string; body?: string | null };
          toast.info(row.body ? `${row.title}: ${row.body}` : row.title ?? 'New notification', {
            label: 'Open',
            onClick: () => navigate('/notifications'),
          });
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [navigate, notificationToasts, profile?.id, toast]);

  return (
    <div className="flex h-full">
      <Sidebar
        role={profile?.role}
        userId={profile?.id}
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
        <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
