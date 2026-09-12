import { useEffect, useRef, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { App } from '@capacitor/app';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { useToast } from '@/components/ui/Toast';
import { isNative } from '@/lib/native';
import Sidebar from './Sidebar';
import Topbar from './Topbar';
import BottomTabBar from './BottomTabBar';

export default function AppShell() {
  const auth = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const toast = useToast();
  const [notificationToasts, setNotificationToasts] = useState(() =>
    window.localStorage.getItem('risip:notificationToasts') !== 'off',
  );
  const profile = auth.status === 'signed-in' ? auth.profile : null;
  const mainRef = useRef<HTMLElement | null>(null);

  // Scroll the content area back to the top whenever the route changes.
  useEffect(() => {
    mainRef.current?.scrollTo(0, 0);
  }, [location.pathname]);

  // Native back button: go back first, then exit the app.
  useEffect(() => {
    if (!isNative()) return;
    const handler = App.addListener('backButton', ({ canGoBack }) => {
      if (canGoBack) {
        void navigate(-1);
      } else {
        void App.minimizeApp();
      }
    });
    return () => {
      void handler.then((h) => h.remove());
    };
  }, [navigate]);

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
      <Sidebar role={profile?.role} userId={profile?.id} />
      <div className="shell-col flex min-w-0 flex-1 flex-col">
        <Topbar fullName={profile?.full_name ?? '—'} role={profile?.role} userId={profile?.id} />
        {/* Chat owns its own scroll (thread + pinned composer), so the main
            area hands over its height and stops scrolling itself there. */}
        <main
          ref={mainRef}
          className={
            location.pathname === '/chat'
              ? 'min-h-0 flex-1 overflow-hidden'
              : 'min-h-0 flex-1 overflow-y-auto overflow-x-hidden pb-24 md:pb-0'
          }
        >
          <Outlet />
        </main>
      </div>
      {/* No "More" button and no navigation drawer: the rest of the app
          (Notifications via the Topbar bell, Chat, Billing, Log out) lives in
          Settings. See SettingsPage. */}
      <BottomTabBar />
    </div>
  );
}
