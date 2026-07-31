import { Navigate, useLocation } from 'react-router-dom';
import { useAuth, signOut } from '@/lib/auth';
import { sw } from '@/i18n/sw';
import Button from '@/components/ui/Button';

export default function RequireAuth({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  const location = useLocation();

  if (auth.status === 'loading') {
    return (
      <div className="flex h-full items-center justify-center text-ink-muted">{sw.common.loading}</div>
    );
  }

  if (auth.status === 'signed-out') {
    return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  }

  // Auth user exists but no profile row — signup-company didn't finish, or the profile
  // was deleted. Give the user a way out rather than an infinite spinner.
  if (!auth.profile) {
    return (
      <div className="mx-auto flex min-h-full max-w-sm items-center px-4 py-16">
        <div className="w-full text-center">
          <p className="mb-4 text-sm text-ink-muted">
            Akaunti yako haijaunganishwa na kampuni yoyote. Tafadhali maliza usajili au toka.
          </p>
          <Button variant="secondary" onClick={() => void signOut()}>
            {sw.common.logout}
          </Button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
