import { Link } from 'react-router-dom';
import { FolderKanban, Plus } from 'lucide-react';
import Button from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import EmptyState from '@/components/ui/EmptyState';
import { ProjectCardSkeleton } from '@/components/ui/Skeleton';
import { useProjects } from '@/features/projects/useProjects';
import { useAuth } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import { sw } from '@/i18n/sw';

export default function ProjectsList() {
  const auth = useAuth();
  const { state } = useProjects();
  const canCreate = auth.status === 'signed-in' && auth.profile?.role === 'owner';

  if (state.status === 'loading') {
    return (
      <div className="mx-auto max-w-5xl p-6">
        <div className="mb-6 flex items-center justify-between">
          <div className="h-8 w-28 animate-pulse rounded-lg bg-surface-muted" />
          <div className="h-9 w-28 animate-pulse rounded-lg bg-surface-muted" />
        </div>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => <ProjectCardSkeleton key={i} />)}
        </div>
      </div>
    );
  }
  if (state.status === 'error') {
    return <div className="p-8 text-red-600">{state.message}</div>;
  }

  if (state.projects.length === 0) {
    // Staff/accountant shouldn't be prompted to create — that's an owner action.
    // Show a friendly "ask your admin" state instead.
    return (
      <div className="mx-auto max-w-2xl p-8">
        <EmptyState
          icon={<FolderKanban className="h-10 w-10" />}
          title={canCreate ? sw.projects.createFirst : sw.projects.noneYetForStaff}
          description={canCreate ? sw.projects.createFirstHint : sw.projects.noneYetForStaffHint}
          action={
            canCreate ? (
              <Link to="/projects/new">
                <Button tint="admin">
                  <Plus className="h-4 w-4" />
                  {sw.projects.create}
                </Button>
              </Link>
            ) : undefined
          }
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl p-6">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-ink">{sw.nav.projects}</h1>
        {canCreate && (
          <Link to="/projects/new">
            <Button tint="admin">
              <Plus className="h-4 w-4" />
              {sw.projects.create}
            </Button>
          </Link>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {state.projects.map((p) => (
          <Link key={p.id} to={`/projects/${p.id}`}>
            <Card className="h-full transition hover:border-role-admin/40 hover:shadow-md">
              <div className="flex items-start justify-between gap-3">
                <h3 className="text-base font-semibold text-ink">{p.name}</h3>
                {/* Only archived deserves a badge — active is the default. */}
                {p.status !== 'active' && (
                  <span className="shrink-0 rounded-full bg-surface-muted px-2 py-0.5 text-xs text-ink-muted">
                    {sw.projects.status[p.status]}
                  </span>
                )}
              </div>
              {p.site_location && (
                <p className="mt-1 text-sm text-ink-muted">{p.site_location}</p>
              )}
              {p.client_name && (
                <p className="mt-2 text-xs text-ink-muted">{p.client_name}</p>
              )}
              <p className="mt-4 text-xs text-ink-muted">{formatDate(p.created_at)}</p>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
