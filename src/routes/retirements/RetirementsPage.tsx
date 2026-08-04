import { useEffect, useMemo, useState } from 'react';
import {
  CheckCircle2,
  Clock3,
  Eye,
  FileUp,
  HandCoins,
  Loader2,
  Paperclip,
  ReceiptText,
  X,
} from 'lucide-react';
import Button from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import EmptyState from '@/components/ui/EmptyState';
import Input from '@/components/ui/Input';
import { ListItemSkeleton, MetricCardSkeleton } from '@/components/ui/Skeleton';
import { useProjects } from '@/features/projects/useProjects';
import {
  createStaffRetirement,
  fetchRetirableReceipts,
  fetchRetirementBundles,
  retirementDocumentUrl,
  updateRetirementStatus,
  type RetirementBundle,
  type RetirementDocument,
  type StaffRetirementStatus,
} from '@/features/retirements/retirements';
import { receiptImageUrl } from '@/features/receipts/uploadReceipt';
import { useToast } from '@/components/ui/Toast';
import { useAuth, type Profile as AuthProfile } from '@/lib/auth';
import { formatDate, formatDateTime, formatMoney } from '@/lib/format';
import type { Receipt } from '@/types/db';

const statusClass: Record<StaffRetirementStatus, string> = {
  submitted: 'bg-amber-50 text-amber-700',
  viewed: 'bg-sky-50 text-sky-700',
  approved: 'bg-emerald-50 text-emerald-700',
  changes_requested: 'bg-orange-50 text-orange-700',
  paid: 'bg-role-admin/10 text-role-admin',
  received_confirmed: 'bg-emerald-100 text-emerald-800',
  cancelled: 'bg-surface-muted text-ink-muted',
};

export default function RetirementsPage() {
  const auth = useAuth();
  const profile = auth.status === 'signed-in' ? auth.profile : null;
  const isFinance = profile?.role === 'owner' || profile?.role === 'accountant';
  const toast = useToast();
  const [bundles, setBundles] = useState<RetirementBundle[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<RetirementBundle | null>(null);

  async function refresh() {
    if (!profile) return;
    setLoading(true);
    setError(null);
    try {
      setBundles(await fetchRetirementBundles(profile));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load retirements.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.id]);

  const totals = useMemo(() => {
    const pending = bundles.filter((b) => !['paid', 'received_confirmed', 'cancelled'].includes(b.status));
    return {
      count: pending.length,
      amount: pending.reduce((sum, b) => sum + Number(b.total_amount || 0), 0),
      receipts: pending.reduce((sum, b) => sum + b.receipts.length, 0),
    };
  }, [bundles]);

  async function setStatus(bundle: RetirementBundle, status: StaffRetirementStatus) {
    if (!profile) return;
    try {
      await updateRetirementStatus(bundle, profile, status);
      toast.success('Retirement updated.');
      await refresh();
      setOpen((prev) => (prev?.id === bundle.id ? { ...prev, status } : prev));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update retirement.');
    }
  }

  if (!profile) return null;

  return (
    <div className="p-4 sm:p-6 lg:p-8">
      <header className="mb-6 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Retirements</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Staff submit receipts and signed voucher forms for accountant review.
          </p>
        </div>
      </header>

      {loading ? (
        <div className="space-y-4">
          <div className="grid gap-4 md:grid-cols-3">
            <MetricCardSkeleton />
            <MetricCardSkeleton />
            <MetricCardSkeleton />
          </div>
          <ListItemSkeleton lines={3} />
          <ListItemSkeleton lines={3} />
        </div>
      ) : error ? (
        <Card className="text-sm text-red-600">{error}</Card>
      ) : (
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
          <section className="space-y-5">
            {isFinance && (
              <div className="grid gap-4 md:grid-cols-3">
                <Metric label="Pending retirements" value={String(totals.count)} icon={<Clock3 />} />
                <Metric label="Pending amount" value={formatMoney(totals.amount)} icon={<HandCoins />} />
                <Metric label="Receipts in review" value={String(totals.receipts)} icon={<ReceiptText />} />
              </div>
            )}

            {bundles.length === 0 ? (
              <EmptyState
                icon={<HandCoins className="h-10 w-10" />}
                title="No retirements yet"
                description={
                  isFinance
                    ? 'Staff retirement submissions will appear here.'
                    : 'Submit your receipts and voucher form when you need reimbursement.'
                }
              />
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {bundles.map((bundle) => (
                  <button
                    key={bundle.id}
                    type="button"
                    onClick={() => {
                      setOpen(bundle);
                      if (isFinance && bundle.status === 'submitted') void setStatus(bundle, 'viewed');
                    }}
                    className="text-left"
                  >
                    <Card className="h-full transition hover:border-role-admin/40 hover:shadow-md">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <h2 className="truncate text-base font-semibold text-ink">
                            {isFinance ? bundle.staff?.full_name ?? 'Staff member' : bundle.title}
                          </h2>
                          <p className="mt-1 text-sm text-ink-muted">
                            {bundle.receipts.length} receipt(s) · {formatDate(bundle.created_at)}
                          </p>
                        </div>
                        <StatusPill status={bundle.status} />
                      </div>
                      <div className="mt-5 flex items-end justify-between gap-3">
                        <div className="text-sm text-ink-muted">
                          <Paperclip className="mr-1 inline h-4 w-4" />
                          {bundle.documents.length} voucher/form file(s)
                        </div>
                        <div className="text-xl font-semibold text-ink">{formatMoney(bundle.total_amount)}</div>
                      </div>
                    </Card>
                  </button>
                ))}
              </div>
            )}
          </section>

          <aside>
            <SubmitRetirementCard profile={profile} onCreated={() => void refresh()} />
          </aside>
        </div>
      )}

      {open && (
        <RetirementDetailModal
          bundle={open}
          isFinance={!!isFinance}
          onClose={() => setOpen(null)}
          onStatus={(status) => void setStatus(open, status)}
        />
      )}
    </div>
  );
}

function Metric({ label, value, icon }: { label: string; value: string; icon: React.ReactElement }) {
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase text-ink-muted">{label}</p>
          <p className="mt-4 text-2xl font-semibold text-ink">{value}</p>
        </div>
        <span className="text-ink-muted [&>svg]:h-6 [&>svg]:w-6">{icon}</span>
      </div>
    </Card>
  );
}

function SubmitRetirementCard({ profile, onCreated }: { profile: AuthProfile; onCreated: () => void }) {
  const { state: projectsState } = useProjects();
  const toast = useToast();
  const [projectId, setProjectId] = useState('');
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [title, setTitle] = useState('Receipt retirement');
  const [notes, setNotes] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [busy, setBusy] = useState(false);
  const [loadingReceipts, setLoadingReceipts] = useState(false);
  const [receiptError, setReceiptError] = useState<string | null>(null);

  useEffect(() => {
    if (projectsState.status === 'ready' && !projectId && projectsState.projects[0]) {
      setProjectId(projectsState.projects[0].id);
    }
  }, [projectId, projectsState]);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    setLoadingReceipts(true);
    setReceiptError(null);
    void fetchRetirableReceipts(profile, projectId)
      .then((rows) => {
        if (cancelled) return;
        setReceipts(rows);
        setSelected(new Set());
      })
      .catch((err) => {
        if (cancelled) return;
        setReceipts([]);
        setSelected(new Set());
        setReceiptError(err instanceof Error ? err.message : 'Could not load receipts.');
      })
      .finally(() => {
        if (!cancelled) setLoadingReceipts(false);
      });
    return () => {
      cancelled = true;
    };
  }, [profile.id, projectId]);

  const selectedReceipts = receipts.filter((r) => selected.has(r.id));
  const total = selectedReceipts.reduce((sum, r) => sum + Number(r.total_amount || 0), 0);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!projectId || selectedReceipts.length === 0) {
      toast.error('Choose at least one receipt.');
      return;
    }
    setBusy(true);
    try {
      await createStaffRetirement({
        profile,
        project_id: projectId,
        title,
        notes,
        receipt_ids: selectedReceipts.map((r) => r.id),
        total_amount: total,
        documents: files,
      });
      toast.success('Retirement submitted.');
      setNotes('');
      setFiles([]);
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not submit retirement.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="sticky top-6">
      <h2 className="text-base font-semibold text-ink">Submit retirement</h2>
      <p className="mt-1 text-sm text-ink-muted">Attach receipts and a signed voucher/form.</p>

      <form onSubmit={submit} className="mt-4 space-y-4">
        <Input label="Title" value={title} onChange={(e) => setTitle(e.target.value)} />
        <label className="flex flex-col gap-1 text-sm font-medium text-ink">
          Project
          <select
            value={projectId}
            onChange={(e) => setProjectId(e.target.value)}
            className="w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-role-admin/30"
          >
            {projectsState.status === 'ready' && projectsState.projects.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm font-medium text-ink">
          Notes
          <textarea
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-role-admin/30"
          />
        </label>

        <label className="flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-surface-border bg-surface-muted px-3 py-4 text-sm font-medium text-ink hover:border-role-admin/40">
          <FileUp className="h-4 w-4" />
          Voucher/form PDF or image
          <input
            type="file"
            multiple
            accept="image/*,application/pdf"
            className="sr-only"
            onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          />
        </label>
        {files.length > 0 && (
          <ul className="space-y-1 text-xs text-ink-muted">
            {files.map((file) => <li key={`${file.name}-${file.size}`}>{file.name}</li>)}
          </ul>
        )}

        <div className="rounded-lg border border-surface-border">
          <div className="border-b border-surface-border px-3 py-2 text-sm font-semibold text-ink">
            Receipts · {formatMoney(total)}
          </div>
          <div className="max-h-64 overflow-auto p-2">
            {loadingReceipts ? (
              <div className="flex items-center gap-2 p-3 text-sm text-ink-muted">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading receipts
              </div>
            ) : receiptError ? (
              <div className="p-3 text-sm text-red-600">{receiptError}</div>
            ) : receipts.length === 0 ? (
              <p className="p-3 text-sm text-ink-muted">No confirmed receipts for this project yet.</p>
            ) : (
              receipts.map((r) => (
                <label key={r.id} className="flex items-start gap-2 rounded-lg p-2 text-sm hover:bg-surface-muted">
                  <input
                    type="checkbox"
                    checked={selected.has(r.id)}
                    onChange={(e) => {
                      const next = new Set(selected);
                      if (e.target.checked) next.add(r.id);
                      else next.delete(r.id);
                      setSelected(next);
                    }}
                    className="mt-1 accent-role-admin"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-medium text-ink">{r.vendor_name ?? 'Receipt'}</span>
                    <span className="text-xs text-ink-muted">{formatDate(r.receipt_date ?? r.created_at)}</span>
                  </span>
                  <span className="shrink-0 font-medium text-ink">{formatMoney(r.total_amount)}</span>
                </label>
              ))
            )}
          </div>
        </div>

        <Button type="submit" tint="admin" fullWidth disabled={busy || selectedReceipts.length === 0}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <HandCoins className="h-4 w-4" />}
          Submit
        </Button>
      </form>
    </Card>
  );
}

function StatusPill({ status }: { status: StaffRetirementStatus }) {
  return (
    <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${statusClass[status]}`}>
      {status.replace(/_/g, ' ')}
    </span>
  );
}

function RetirementDetailModal({
  bundle,
  isFinance,
  onClose,
  onStatus,
}: {
  bundle: RetirementBundle;
  isFinance: boolean;
  onClose: () => void;
  onStatus: (status: StaffRetirementStatus) => void;
}) {
  const canConfirmReceived = !isFinance && bundle.status === 'paid';
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[90vh] w-full max-w-3xl overflow-hidden rounded-xl bg-surface shadow-xl">
        <header className="flex items-start justify-between gap-3 border-b border-surface-border p-4">
          <div>
            <h2 className="text-lg font-semibold text-ink">{bundle.title}</h2>
            <p className="text-sm text-ink-muted">
              {bundle.staff?.full_name ?? 'Staff member'} · {formatDateTime(bundle.created_at)}
            </p>
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 text-ink-muted hover:bg-surface-muted">
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="max-h-[calc(90vh-8rem)] overflow-auto p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <StatusPill status={bundle.status} />
            <div className="text-xl font-semibold text-ink">{formatMoney(bundle.total_amount)}</div>
          </div>
          {bundle.notes && <p className="mb-4 rounded-lg bg-surface-muted p-3 text-sm text-ink-muted">{bundle.notes}</p>}

          <section className="mb-5">
            <h3 className="mb-2 text-sm font-semibold text-ink">Voucher/forms</h3>
            {bundle.documents.length === 0 ? (
              <p className="text-sm text-ink-muted">No voucher/form attached.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {bundle.documents.map((doc) => <DocumentCard key={doc.id} doc={doc} />)}
              </div>
            )}
          </section>

          <section>
            <h3 className="mb-2 text-sm font-semibold text-ink">Receipts</h3>
            <div className="space-y-2">
              {bundle.receipts.map((r) => (
                <div key={r.id} className="flex items-center justify-between gap-3 rounded-lg border border-surface-border p-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-ink">{r.vendor_name ?? 'Receipt'}</p>
                    <p className="text-xs text-ink-muted">{formatDate(r.receipt_date ?? r.created_at)} · {r.category ?? 'Other'}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <p className="text-sm font-semibold text-ink">{formatMoney(r.total_amount)}</p>
                    {r.image_url && (
                      <Button
                        type="button"
                        variant="ghost"
                        className="!px-2 !py-1"
                        onClick={() => void openReceiptImage(r.image_url!)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        <footer className="flex flex-wrap justify-end gap-2 border-t border-surface-border p-4">
          {isFinance && bundle.status !== 'paid' && bundle.status !== 'received_confirmed' && (
            <>
              <Button variant="secondary" tint="neutral" onClick={() => onStatus('changes_requested')}>
                Request changes
              </Button>
              <Button variant="secondary" tint="accountant" onClick={() => onStatus('approved')}>
                <CheckCircle2 className="h-4 w-4" /> Approve
              </Button>
              <Button tint="admin" onClick={() => onStatus('paid')}>
                <HandCoins className="h-4 w-4" /> Mark paid
              </Button>
            </>
          )}
          {canConfirmReceived && (
            <Button tint="admin" onClick={() => onStatus('received_confirmed')}>
              <CheckCircle2 className="h-4 w-4" /> I have received
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>Close</Button>
        </footer>
      </div>
    </div>
  );
}

function DocumentCard({ doc }: { doc: RetirementDocument }) {
  const [url, setUrl] = useState<string | null>(null);
  const isImage = doc.file_type?.startsWith('image/');

  useEffect(() => {
    if (!isImage) return;
    let mounted = true;
    void retirementDocumentUrl(doc.storage_path)
      .then((signed) => {
        if (mounted) setUrl(signed);
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
    };
  }, [doc.storage_path, isImage]);

  async function openDoc() {
    const signed = url ?? await retirementDocumentUrl(doc.storage_path);
    setUrl(signed);
    window.open(signed, '_blank', 'noopener,noreferrer');
  }

  return (
    <button
      type="button"
      onClick={() => void openDoc()}
      className="rounded-lg border border-surface-border p-3 text-left hover:border-role-admin/40"
    >
      {isImage && url ? (
        <img src={url} alt="" className="mb-2 h-32 w-full rounded-lg object-cover" />
      ) : (
        <div className="mb-2 flex h-24 items-center justify-center rounded-lg bg-surface-muted text-ink-muted">
          <Paperclip className="h-6 w-6" />
        </div>
      )}
      <p className="truncate text-sm font-semibold text-ink">{doc.file_name}</p>
      <p className="mt-1 text-xs text-ink-muted">
        AI: {doc.ai_status === 'not_scanned' ? 'not scanned yet' : doc.ai_status}
      </p>
      <p className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-role-admin">
        <Eye className="h-3.5 w-3.5" /> View
      </p>
    </button>
  );
}

async function openReceiptImage(path: string) {
  const signed = await receiptImageUrl(path);
  window.open(signed, '_blank', 'noopener,noreferrer');
}
