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

  // Auth user exists but no profile row — WhatsApp onboarding did not finish,
  // or the profile was deleted. Never open the app without company context.
  if (!auth.profile) {
    return (
      <div className="mx-auto flex min-h-full max-w-sm items-center px-4 py-16">
        <div className="w-full text-center">
          <p className="mb-4 text-sm text-ink-muted">
            Your account isn’t linked to a company yet. Finish signup or log out to start over.
          </p>
          <Button variant="secondary" onClick={() => void signOut()}>
            {sw.common.logout}
          </Button>
        </div>
      </div>
    );
  }

  // A business deletion can leave a member with a valid personal profile but
  // no active business. Keep every finance route fail-closed while still
  // allowing Settings to finish account cleanup or sign out.
  if (!auth.profile.company_id && location.pathname !== '/settings') {
    return <Navigate to="/settings" replace />;
  }

  return <>{children}</>;
}
