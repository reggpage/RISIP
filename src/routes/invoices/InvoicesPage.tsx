import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, Plus, Pencil, Link as LinkIcon, Loader2, Trash2 } from 'lucide-react';
import Button from '@/components/ui/Button';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import EmptyState from '@/components/ui/EmptyState';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import { ListItemSkeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { useConfirm } from '@/components/ui/ConfirmDialog';
import {
  deleteInvoice,
  generateInvoice,
  GenerateInvoiceError,
  invoicePublicUrl,
  setInvoiceStatus,
  useInvoices,
} from '@/features/invoices/useInvoices';
import { useProjects } from '@/features/projects/useProjects';
import { useAuth } from '@/lib/auth';
import { formatDate, formatMoney } from '@/lib/format';
import { sw } from '@/i18n/sw';
import type { Invoice, InvoiceStatus } from '@/types/db';

const STATUS_LABEL: Record<InvoiceStatus, string> = {
  draft: 'Draft',
  pending_approval: 'Pending approval',
  approved: 'Approved',
  sent: 'Sent',
  accepted: 'Accepted',
  disputed: 'Disputed',
};
const STATUS_STYLE: Record<InvoiceStatus, string> = {
  draft: 'bg-surface-muted text-ink-muted',
  pending_approval: 'bg-amber-100 text-amber-800',
  approved: 'bg-sky-100 text-sky-800',
  sent: 'bg-emerald-100 text-emerald-800',
  accepted: 'bg-emerald-100 text-emerald-800',
  disputed: 'bg-red-100 text-red-800',
};

export default function InvoicesPage() {
  const auth = useAuth();
  const { state: projectsState } = useProjects();
  const [projectId, setProjectId] = useState<string>('');
  const [periodStart, setPeriodStart] = useState<string>(() => firstOfMonth());
  const [periodEnd, setPeriodEnd] = useState<string>(() => today());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const { state: invoicesState, refresh } = useInvoices(projectId || undefined);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const authReady = auth.status !== 'loading';
  const canGenerate =
    auth.status === 'signed-in' && (auth.profile?.role === 'owner' || auth.profile?.role === 'accountant');
  const projects = projectsState.status === 'ready' ? projectsState.projects : [];

  async function submit() {
    if (!projectId || !periodStart || !periodEnd) {
      setError('Chagua mradi na tarehe zote.');
      return;
    }
    setError(null);
    setSuccess(null);
    setBusy(true);
    try {
      const result = await generateInvoice({ project_id: projectId, period_start: periodStart, period_end: periodEnd });
      setSuccess(sw.invoices.receiptsInWindow(result.receipt_count));
      await refresh();
    } catch (err) {
      if (err instanceof GenerateInvoiceError && err.reason === 'no_receipts') {
        setError(sw.invoices.noReceipts);
      } else {
        setError(err instanceof Error ? err.message : sw.common.error);
      }
    } finally {
      setBusy(false);
    }
  }

  const toast = useToast();
  const confirm = useConfirm();

  // "Send to Client" from the list: mark sent (if not already) and copy the public link.
  async function shareLink(inv: Invoice) {
    try {
      if (inv.status !== 'sent') {
        await setInvoiceStatus(inv.id, 'sent');
        await refresh();
      }
      const url = invoicePublicUrl(inv.public_token);
      try {
        await navigator.clipboard.writeText(url);
        toast.success('Live link copied to clipboard.');
      } catch {
        toast.info(url);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : sw.common.error);
    }
  }

  async function removeInvoice(inv: Invoice) {
    const ok = await confirm({
      title: 'Delete this invoice?',
      message: 'This removes the invoice card and its receipt links. The original receipts stay in the project.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    setDeletingId(inv.id);
    try {
      await deleteInvoice(inv.id);
      toast.success('Invoice deleted.');
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : sw.common.error);
    } finally {
      setDeletingId(null);
    }
  }

  // Gate on auth being resolved so the generation form doesn't pop in after mount
  // (was causing the visible layout jump on page load).
  if (!authReady) {
    // Skeleton mirrors the real layout so nothing jumps when auth resolves.
    return (
      <div className="mx-auto max-w-4xl p-4 sm:p-6">
        <div className="mb-6 h-8 w-32 animate-pulse rounded-lg bg-surface-muted" />
        <div className="mb-6 h-40 animate-pulse rounded-xl bg-surface-muted" />
        <div className="mb-2 h-4 w-40 animate-pulse rounded bg-surface-muted" />
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <ListItemSkeleton key={i} lines={3} />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6">
      <h1 className="mb-6 text-2xl font-semibold text-ink">{sw.nav.invoices}</h1>

      {canGenerate && (
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>{sw.invoices.generateFor}</CardTitle>
          </CardHeader>
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="sm:col-span-2">
              <Select
                label={sw.invoices.project}
                value={projectId}
                onChange={setProjectId}
                placeholder="Choose a project"
                options={projects.map((p) => ({ value: p.id, label: p.name }))}
              />
            </div>
            <Input
              type="date"
              label={sw.invoices.periodStart}
              value={periodStart}
              onChange={(e) => setPeriodStart(e.target.value)}
            />
            <Input
              type="date"
              label={sw.invoices.periodEnd}
              value={periodEnd}
              onChange={(e) => setPeriodEnd(e.target.value)}
            />
          </div>
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
          {success && <p className="mt-3 text-sm text-emerald-700">{success}</p>}
          <div className="mt-4">
            <Button tint="admin" onClick={() => void submit()} disabled={busy || !projectId}>
              <Plus className="h-4 w-4" />
              {busy ? sw.common.loading : sw.invoices.generate}
            </Button>
          </div>
        </Card>
      )}

      <h2 className="mb-2 text-sm font-semibold text-ink-muted">{sw.invoices.list}</h2>

      {invoicesState.status === 'loading' && (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 3 }).map((_, i) => <ListItemSkeleton key={i} lines={3} />)}
        </div>
      )}
      {invoicesState.status === 'error' && <div className="text-sm text-red-600">{invoicesState.message}</div>}
      {invoicesState.status === 'ready' && invoicesState.invoices.length === 0 && (
        <EmptyState icon={<FileText className="h-10 w-10" />} title={sw.invoices.empty} />
      )}
      {invoicesState.status === 'ready' && invoicesState.invoices.length > 0 && (
        <div className="flex flex-col gap-3">
          {invoicesState.invoices.map((inv) => (
            <Card key={inv.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs text-ink-muted">
                      {inv.invoice_number ?? `#${inv.id.slice(0, 8).toUpperCase()}`}
                    </span>
                    <span className={`rounded-full px-2 py-0.5 text-xs ${STATUS_STYLE[inv.status] ?? 'bg-surface-muted text-ink-muted'}`}>
                      {STATUS_LABEL[inv.status] ?? inv.status}
                    </span>
                  </div>
                  <div className="mt-1 text-sm text-ink-muted">
                    {formatDate(inv.period_start)} — {formatDate(inv.period_end)}
                    {inv.client_name && <> · {inv.client_name}</>}
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-lg font-semibold text-ink">{formatMoney(inv.total_amount)}</div>
                  <div className="text-xs text-ink-muted">
                    {sw.invoices.tax}: {formatMoney(inv.tax_amount)}
                  </div>
                </div>
              </div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Link to={`/invoices/${inv.id}/edit`}>
                  <Button variant="secondary" tint="admin">
                    <Pencil className="h-4 w-4" />
                    Edit Invoice
                  </Button>
                </Link>
                {(inv.status === 'approved' || inv.status === 'sent') && (
                  <Button variant="secondary" tint="admin" onClick={() => void shareLink(inv)}>
                    <LinkIcon className="h-4 w-4" />
                    {inv.status === 'sent' ? 'Copy live link' : 'Send to Client'}
                  </Button>
                )}
                <Button
                  variant="secondary"
                  disabled={deletingId === inv.id}
                  onClick={() => void removeInvoice(inv)}
                  className="!border-red-300 !text-red-600 hover:!bg-red-50"
                >
                  {deletingId === inv.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  Delete
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
function firstOfMonth(): string {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1).toISOString().slice(0, 10);
}
