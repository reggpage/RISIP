import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Plus, Receipt as ReceiptIcon, UserPlus, Users, Wallet, X } from 'lucide-react';
import Button from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import EmptyState from '@/components/ui/EmptyState';
import { ListItemSkeleton } from '@/components/ui/Skeleton';
import InviteLinkCard from '@/components/projects/InviteLinkCard';
import ProjectTeamPanel from '@/components/projects/ProjectTeamPanel';
import EditProjectModal from '@/components/projects/EditProjectModal';
import { supabase } from '@/lib/supabase';
import ReceiptCard from '@/components/receipts/ReceiptCard';
import MetricCard from '@/components/dashboard/MetricCard';
import {
  createInviteLink,
  revokeInviteLink,
  useInviteLinks,
} from '@/features/projects/useInviteLinks';
import { useProject } from '@/features/projects/useProjects';
import { useReceipts } from '@/features/receipts/useReceipts';
import { useAuth } from '@/lib/auth';
import { formatDate, formatMoney } from '@/lib/format';
import { sw } from '@/i18n/sw';
import type { InviteLink, InviteRole, Project } from '@/types/db';

const INVITE_ROLES: InviteRole[] = ['worker', 'accountant'];

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const auth = useAuth();
  const { state: projectState } = useProject(id);
  const { state: linksState, refresh: refreshLinks } = useInviteLinks(id);
  const [busy, setBusy] = useState<InviteRole | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [teamOpen, setTeamOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [projectOverride, setProjectOverride] = useState<Project | null>(null);
  const [myIsLeader, setMyIsLeader] = useState(false);

  const profile = auth.status === 'signed-in' ? auth.profile : null;
  const isOwner = profile?.role === 'owner';
  // Project spend is a company figure. Staff may open a project to see what it is
  // and file against it, but not what it has cost.
  const canSeeFinancials = profile?.role === 'owner' || profile?.role === 'accountant';
  const canSeeLinks = profile?.role === 'owner' || profile?.role === 'accountant';
  const canManageTeam = isOwner || myIsLeader;
  const { state: receiptsState } = useReceipts(id);

  // Am I a leader of this project? (per-project role lives in project_members)
  useEffect(() => {
    if (!id || !profile) { setMyIsLeader(false); return; }
    let cancelled = false;
    void supabase.from('project_members').select('role')
      .eq('project_id', id).eq('profile_id', profile.id).maybeSingle()
      .then(({ data }) => { if (!cancelled) setMyIsLeader((data?.role as string | undefined) === 'leader'); });
    return () => { cancelled = true; };
  }, [id, profile]);

  const summary = useMemo(() => {
    if (receiptsState.status !== 'ready') return { total: 0, count: 0 };
    const confirmed = receiptsState.receipts.filter((r) => r.status === 'confirmed');
    return {
      total: confirmed.reduce((s, r) => s + Number(r.total_amount || 0), 0),
      count: confirmed.length,
    };
  }, [receiptsState]);

  if (projectState.status === 'loading') {
    return (
      <div className="mx-auto w-full max-w-4xl px-4 pb-8 pt-4 sm:px-6 sm:pt-6">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex-1 space-y-3">
            <div className="h-3 w-24 animate-pulse rounded bg-surface-border" />
            <div className="h-8 w-2/3 max-w-sm animate-pulse rounded-lg bg-surface-border" />
            <div className="h-3 w-1/2 max-w-xs animate-pulse rounded bg-surface-border" />
          </div>
          <div className="h-10 w-28 animate-pulse rounded-lg bg-surface-border" />
        </div>
        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <div className="h-28 animate-pulse rounded-xl bg-surface-border" />
          <div className="h-28 animate-pulse rounded-xl bg-surface-border" />
        </div>
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => <ListItemSkeleton key={i} lines={3} />)}
        </div>
      </div>
    );
  }
  if (projectState.status === 'error') {
    return <div className="p-8 text-red-600">{projectState.message}</div>;
  }
  if (!projectState.project) {
    return <div className="p-8 text-ink-muted">{sw.common.empty}</div>;
  }
  const project = projectOverride ?? projectState.project;

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
      <div className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="mb-1 flex items-center gap-3">
            <h1 className="text-2xl font-semibold text-ink">{project.name}</h1>
            {/* Archived state still worth calling out; active is implicit — no pill. */}
            {project.status !== 'active' && (
              <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs text-ink-muted">
                {sw.projects.status[project.status]}
              </span>
            )}
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

        <div className="flex flex-wrap items-center gap-2">
          {canManageTeam && (
            <Button variant="secondary" tint="admin" onClick={() => setTeamOpen(true)}>
              <Users className="h-4 w-4" /> Team &amp; funds
            </Button>
          )}
          {canSeeLinks && (
            <Button variant="secondary" tint="admin" onClick={() => setInviteOpen(true)}>
              <UserPlus className="h-4 w-4" /> Invite
            </Button>
          )}
          {isOwner && (
            <Button variant="secondary" tint="admin" onClick={() => setEditOpen(true)}>
              {sw.projects.edit}
            </Button>
          )}
        </div>
      </div>

      {/* Project spend is a company figure, so it is finance-only. Staff can still
          open the project and file against it — they just do not see what it cost.
          RLS backs this up: their receipt query returns only their own rows. */}
      {canSeeFinancials && (
      <div className="mb-6 grid gap-3 sm:grid-cols-2">
        <MetricCard
          label={sw.dashboard.metrics.totalExpenses}
          value={formatMoney(summary.total)}
          icon={<Wallet className="h-5 w-5" />}
        />
        <MetricCard
          label={sw.dashboard.metrics.receipts}
          value={summary.count}
          icon={<ReceiptIcon className="h-5 w-5" />}
        />
      </div>
      )}

      {/* Recent receipts on this project (realtime). */}
      <section className="mb-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-ink">{sw.receipts.recent}</h2>
          <Link to="/receipts" className="text-sm font-medium text-role-admin hover:underline">
            {sw.nav.receipts} →
          </Link>
        </div>

        {receiptsState.status === 'loading' && (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 3 }).map((_, i) => <ListItemSkeleton key={i} lines={3} />)}
          </div>
        )}
        {receiptsState.status === 'error' && (
          <div className="text-sm text-red-600">{receiptsState.message}</div>
        )}
        {receiptsState.status === 'ready' && receiptsState.receipts.length === 0 && (
          <EmptyState title={sw.receipts.empty} />
        )}
        {receiptsState.status === 'ready' && receiptsState.receipts.length > 0 && (
          <div className="flex flex-col gap-3">
            {receiptsState.receipts.slice(0, 5).map((r) => (
              <ReceiptCard key={r.id} receipt={r} />
            ))}
          </div>
        )}
      </section>

      {/* Invite links live in a modal reachable from the top "Invite" button, so they
          stay accessible even when the receipts list is long. */}
      {canSeeLinks && inviteOpen && (
        <div className="fixed inset-0 z-[150] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4" role="dialog" aria-modal="true" onClick={() => setInviteOpen(false)}>
          <div className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-surface shadow-2xl sm:rounded-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="sticky top-0 flex items-center justify-between border-b border-surface-border bg-surface px-5 py-3">
              <h2 className="text-base font-semibold text-ink">{sw.projects.inviteLinksTitle}</h2>
              <button type="button" onClick={() => setInviteOpen(false)} className="rounded p-1 text-ink-muted hover:bg-surface-muted hover:text-ink" aria-label="Close">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-5">
              <p className="mb-4 text-sm text-ink-muted">{sw.projects.inviteLinksHint}</p>
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
                    // Revoked cards get a Regenerate button that spins up a fresh
                    // token for the same role. The old row stays revoked for audit.
                    onRegenerate={(r) => void generate(r)}
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
            </div>
          </div>
        </div>
      )}

      {teamOpen && profile && (
        <ProjectTeamPanel
          projectId={project.id}
          projectName={project.name}
          isOwner={!!isOwner}
          myUserId={profile.id}
          onClose={() => setTeamOpen(false)}
        />
      )}
      {editOpen && isOwner && (
        <EditProjectModal
          project={project}
          onClose={() => setEditOpen(false)}
          onSaved={(updated) => { setProjectOverride(updated); setEditOpen(false); }}
        />
      )}
    </div>
  );
}
