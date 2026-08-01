import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, FileSpreadsheet, Loader2, Plus, Receipt as ReceiptIcon, Wallet } from 'lucide-react';
import Button from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import EmptyState from '@/components/ui/EmptyState';
import { ListItemSkeleton } from '@/components/ui/Skeleton';
import InviteLinkCard from '@/components/projects/InviteLinkCard';
import ReceiptCard from '@/components/receipts/ReceiptCard';
import MetricCard from '@/components/dashboard/MetricCard';
import {
  createInviteLink,
  revokeInviteLink,
  useInviteLinks,
} from '@/features/projects/useInviteLinks';
import { useProject } from '@/features/projects/useProjects';
import { exportProjectExcel } from '@/features/projects/exportExcel';
import { useReceipts } from '@/features/receipts/useReceipts';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/ui/Toast';
import { formatDate, formatMoney } from '@/lib/format';
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
  const [exporting, setExporting] = useState(false);
  const toast = useToast();

  const isOwner = auth.status === 'signed-in' && auth.profile?.role === 'owner';
  const canSeeLinks = auth.status === 'signed-in' && (auth.profile?.role === 'owner' || auth.profile?.role === 'accountant');
  const { state: receiptsState } = useReceipts(id);

  const summary = useMemo(() => {
    if (receiptsState.status !== 'ready') return { total: 0, count: 0 };
    const confirmed = receiptsState.receipts.filter((r) => r.status === 'confirmed');
    return {
      total: confirmed.reduce((s, r) => s + Number(r.total_amount || 0), 0),
      count: confirmed.length,
    };
  }, [receiptsState]);

  async function handleExport() {
    if (projectState.status !== 'ready' || !projectState.project) return;
    setExporting(true);
    try {
      await exportProjectExcel(projectState.project.id, projectState.project.name);
      toast.success('Excel downloaded.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Export failed');
    } finally {
      setExporting(false);
    }
  }

  if (projectState.status === 'loading') {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <div className="mb-4 h-4 w-32 animate-pulse rounded bg-surface-muted" />
        <div className="mb-2 h-8 w-64 animate-pulse rounded-lg bg-surface-muted" />
        <div className="mb-8 h-4 w-48 animate-pulse rounded bg-surface-muted" />
        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <div className="h-28 animate-pulse rounded-xl bg-surface-muted" />
          <div className="h-28 animate-pulse rounded-xl bg-surface-muted" />
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

        <div className="flex items-center gap-2">
          {canSeeLinks && (
            <Button
              variant="secondary"
              tint="admin"
              disabled={exporting}
              onClick={() => void handleExport()}
            >
              {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileSpreadsheet className="h-4 w-4" />}
              {exporting ? 'Exporting…' : 'Export to Excel'}
            </Button>
          )}
          {isOwner && (
            <Link to={`/projects/${project.id}/edit`}>
              <Button variant="secondary" tint="admin">
                {sw.projects.edit}
              </Button>
            </Link>
          )}
        </div>
      </div>

      {/* Project-scoped summary — visible to every role that can see the project. */}
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

      {canSeeLinks && (
        <section className="mb-8">
          {/* Section header — plain, no wrapping Card. Individual link cards below
              stand on their own for a cleaner look, especially on mobile. */}
          <div className="mb-4">
            <h2 className="text-lg font-semibold text-ink">{sw.projects.inviteLinksTitle}</h2>
            <p className="mt-1 text-sm text-ink-muted">{sw.projects.inviteLinksHint}</p>
          </div>

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
        </section>
      )}
    </div>
  );
}

