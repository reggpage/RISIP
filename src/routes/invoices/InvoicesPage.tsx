import { useState } from 'react';
import { FileText, Plus, Send, ExternalLink } from 'lucide-react';
import Button from '@/components/ui/Button';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import EmptyState from '@/components/ui/EmptyState';
import Input from '@/components/ui/Input';
import { ListItemSkeleton } from '@/components/ui/Skeleton';
import {
  generateInvoice,
  GenerateInvoiceError,
  invoicePdfUrl,
  markInvoiceSent,
  useInvoices,
} from '@/features/invoices/useInvoices';
import { useProjects } from '@/features/projects/useProjects';
import { useAuth } from '@/lib/auth';
import { formatDate, formatMoney } from '@/lib/format';
import { sw } from '@/i18n/sw';

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

  async function preview(path: string) {
    try {
      const url = await invoicePdfUrl(path);
      window.open(url, '_blank', 'noopener,noreferrer');
    } catch (err) {
      setError(err instanceof Error ? err.message : sw.common.error);
    }
  }

  async function markSent(id: string) {
    try {
      await markInvoiceSent(id);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : sw.common.error);
    }
  }

  // Gate on auth being resolved so the generation form doesn't pop in after mount
  // (was causing the visible layout jump on page load).
  if (!authReady) {
    return <div className="p-8 text-ink-muted">{sw.common.loading}</div>;
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
              <label className="mb-1 block text-xs font-medium text-ink-muted">{sw.invoices.project}</label>
              <select
                className="w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-role-accountant/30"
                value={projectId}
                onChange={(e) => setProjectId(e.target.value)}
              >
                <option value="">—</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
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
                    <span className="font-mono text-xs text-ink-muted">#{inv.id.slice(0, 8).toUpperCase()}</span>
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs ${
                        inv.status === 'sent'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-amber-100 text-amber-800'
                      }`}
                    >
                      {sw.invoices.status[inv.status]}
                    </span>
                  </div>
                  <div className="mt-1 text-sm text-ink-muted">
                    {formatDate(inv.period_start)} — {formatDate(inv.period_end)}
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
                {inv.pdf_url && (
                  <Button variant="secondary" tint="accountant" onClick={() => void preview(inv.pdf_url!)}>
                    <ExternalLink className="h-4 w-4" />
                    {sw.invoices.preview}
                  </Button>
                )}
                {inv.status === 'draft' && canGenerate && (
                  <Button variant="secondary" tint="admin" onClick={() => void markSent(inv.id)}>
                    <Send className="h-4 w-4" />
                    {sw.invoices.markSent}
                  </Button>
                )}
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
