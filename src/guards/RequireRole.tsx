import { Navigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { hasAnyRole, type UserRole } from '@/lib/roles';
import { sw } from '@/i18n/sw';

export default function RequireRole({
  allowed,
  children,
}: {
  allowed: readonly UserRole[];
  children: React.ReactNode;
}) {
  const auth = useAuth();

  if (auth.status === 'loading') {
    return <div className="p-8 text-ink-muted">{sw.common.loading}</div>;
  }
  if (auth.status === 'signed-out') return <Navigate to="/login" replace />;

  if (!hasAnyRole(auth.profile?.role, allowed)) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}
