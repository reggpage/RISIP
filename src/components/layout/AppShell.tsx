import { Outlet } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import Sidebar from './Sidebar';
import Topbar from './Topbar';

export default function AppShell() {
  const auth = useAuth();
  const profile = auth.status === 'signed-in' ? auth.profile : null;

  return (
    <div className="flex h-full">
      <Sidebar role={profile?.role} />
      <div className="flex min-w-0 flex-1 flex-col">
        <Topbar fullName={profile?.full_name ?? '—'} role={profile?.role} />
        <main className="min-h-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
