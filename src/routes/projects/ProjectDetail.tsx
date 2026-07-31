import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Plus } from 'lucide-react';
import Button from '@/components/ui/Button';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import InviteLinkCard from '@/components/projects/InviteLinkCard';
import {
  createInviteLink,
  revokeInviteLink,
  useInviteLinks,
} from '@/features/projects/useInviteLinks';
import { useProject } from '@/features/projects/useProjects';
import { useAuth } from '@/lib/auth';
import { formatDate } from '@/lib/format';
import { sw } from '@/i18n/sw';
import type { InviteLink, InviteRole } from '@/types/db';

const INVITE_ROLES: InviteRole[] = ['worker', 'accountant'];

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const auth = useAuth();
  const { state: projectState } = useProject(id);
  const { state: linksState, refresh: refreshLinks } = useInviteLinks(id);
  const [busy, setBusy] = useState<InviteRole | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const isOwner = auth.status === 'signed-in' && auth.profile?.role === 'owner';
  const canSeeLinks = auth.status === 'signed-in' && (auth.profile?.role === 'owner' || auth.profile?.role === 'accountant');

  if (projectState.status === 'loading') {
    return <div className="p-8 text-ink-muted">{sw.common.loading}</div>;
  }
  if (projectState.status === 'error') {
    return <div className="p-8 text-red-600">{projectState.message}</div>;
  }
  if (!projectState.project) {
    return <div className="p-8 text-ink-muted">{sw.common.empty}</div>;
  }
  const project = projectState.project;

  const linksByRole = new Map<InviteRole, InviteLink | null>();
  if (linksState.status === 'ready') {
    for (const role of INVITE_ROLES) {
      linksByRole.set(
        role,
        linksState.links.find((l) => l.role === role && !l.revoked_at) ??
          linksState.links.find((l) => l.role === role) ??
          null,
      );
    }
  }

  async function generate(role: InviteRole) {
    if (!id || !isOwner || auth.status !== 'signed-in' || !auth.profile) return;
    setActionError(null);
    setBusy(role);
    try {
      await createInviteLink(id, role, auth.profile.id);
      await refreshLinks();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : sw.common.error);
    } finally {
      setBusy(null);
    }
  }

  async function handleRevoke(linkId: string) {
    setActionError(null);
    try {
      await revokeInviteLink(linkId);
      await refreshLinks();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : sw.common.error);
    }
  }

  return (
    <div className="mx-auto max-w-4xl p-6">
      <Link to="/projects" className="mb-4 inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> {sw.projects.detailBack}
      </Link>

      <div className="mb-6">
        <div className="mb-1 flex items-center gap-3">
          <h1 className="text-2xl font-semibold text-ink">{project.name}</h1>
          <span
            className={`rounded-full px-2 py-0.5 text-xs ${
              project.status === 'active'
                ? 'bg-role-worker/10 text-role-worker'
                : 'bg-surface-muted text-ink-muted'
            }`}
          >
            {sw.projects.status[project.status]}
          </span>
        </div>
        <div className="text-sm text-ink-muted">
          {project.site_location && <span>{project.site_location}</span>}
          {project.client_name && <span> · {project.client_name}</span>}
          {project.start_date && <span> · {formatDate(project.start_date)}</span>}
        </div>
        {project.description && (
          <p className="mt-3 text-sm text-ink">{project.description}</p>
        )}
      </div>

      {canSeeLinks && (
        <section className="mb-8">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>{sw.projects.inviteLinksTitle}</CardTitle>
                <p className="mt-1 text-xs text-ink-muted">{sw.projects.inviteLinksHint}</p>
              </div>
            </CardHeader>

            {actionError && <p className="mb-3 text-sm text-red-600">{actionError}</p>}

            <div className="grid gap-3 sm:grid-cols-2">
              {INVITE_ROLES.map((role) => {
                const link = linksByRole.get(role);
                if (link) {
                  return (
                    <InviteLinkCard
                      key={role}
                      link={link}
                      projectName={project.name}
                      canRevoke={isOwner}
                      onRevoke={handleRevoke}
                    />
                  );
                }
                return (
                  <Card key={role}>
                    <p className="mb-3 text-sm text-ink-muted">
                      {role === 'worker' ? sw.projects.inviteWorker : sw.projects.inviteAccountant}
                    </p>
                    {isOwner ? (
                      <Button
                        variant="secondary"
                        tint={role === 'worker' ? 'worker' : 'accountant'}
                        onClick={() => void generate(role)}
                        disabled={busy === role}
                      >
                        <Plus className="h-4 w-4" />
                        {busy === role ? sw.common.loading : sw.projects.generateInvite}
                      </Button>
                    ) : (
                      <p className="text-xs text-ink-muted">{sw.common.empty}</p>
                    )}
                  </Card>
                );
              })}
            </div>
          </Card>
        </section>
      )}
    </div>
  );
}

