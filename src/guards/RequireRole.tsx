import { Navigate } from 'react-router-dom';
import { useAuth } from '@/lib/auth';
import { hasAnyRole, type UserRole } from '@/lib/roles';

export default function RequireRole({
  allowed,
  children,
}: {
  allowed: readonly UserRole[];
  children: React.ReactNode;
}) {
  const auth = useAuth();

  if (auth.status === 'loading') {
    // Minimal skeleton so children pages don't briefly flash a "Loading..." string
    // before the role gate resolves.
    return (
      <div className="mx-auto max-w-4xl p-6">
        <div className="mb-4 h-8 w-40 animate-pulse rounded-lg bg-surface-muted" />
        <div className="h-40 animate-pulse rounded-xl bg-surface-muted" />
      </div>
    );
  }
  if (auth.status === 'signed-out') return <Navigate to="/login" replace />;

  if (!hasAnyRole(auth.profile?.role, allowed)) {
    return <Navigate to="/dashboard" replace />;
  }
  return <>{children}</>;
}
