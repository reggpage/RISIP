import { useEffect, useMemo, useRef, useState } from 'react';
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
  type RetirementPaymentInput,
  type RetirementPaymentMethod,
  type StaffRetirementStatus,
} from '@/features/retirements/retirements';
import { receiptImageUrl } from '@/features/receipts/uploadReceipt';
import { useToast } from '@/components/ui/Toast';
import { useAuth, type Profile as AuthProfile } from '@/lib/auth';
import { friendlyError } from '@/lib/errors';
import { formatDate, formatDateTime, formatMoney } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import type { Receipt } from '@/types/db';

const statusClass: Record<StaffRetirementStatus, string> = {
  submitted: 'bg-amber-50 text-amber-700',
  viewed: 'bg-sky-50 text-sky-700',
  approved: 'bg-emerald-50 text-emerald-700',
  changes_requested: 'bg-surface-muted text-ink-muted',
  paid: 'bg-role-admin/10 text-role-admin',
  received_confirmed: 'bg-emerald-100 text-emerald-800',
  cancelled: 'bg-surface-muted text-ink-muted',
  rejected: 'bg-red-50 text-red-700',
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
  const [query, setQuery] = useState('');

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

  useEffect(() => {
    if (!profile?.company_id) return;
    const channel = supabase
      .channel(`staff-retirements-${profile.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'staff_retirements', filter: `company_id=eq.${profile.company_id}` },
        () => void refresh(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.company_id, profile?.id]);

  const totals = useMemo(() => {
    const pending = bundles.filter((b) => !['paid', 'received_confirmed', 'cancelled', 'rejected'].includes(b.status));
    return {
      count: pending.length,
      amount: pending.reduce((sum, b) => sum + Number(b.total_amount || 0), 0),
      receipts: pending.reduce((sum, b) => sum + b.receipts.length, 0),
    };
  }, [bundles]);

  const filteredBundles = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return bundles;
    return bundles.filter((b) => {
      const haystack = [
        b.title,
        b.staff?.full_name,
        b.status,
        b.notes,
        ...b.receipts.map((r) => r.vendor_name ?? ''),
      ].join(' ').toLowerCase();
      return haystack.includes(q);
    });
  }, [bundles, query]);

  async function setStatus(
    bundle: RetirementBundle,
    status: StaffRetirementStatus,
    options?: { note?: string; receiptIds?: string[]; payment?: RetirementPaymentInput },
  ) {
    if (!profile) return false;
    try {
      await updateRetirementStatus(bundle, profile, status, options);
      toast.success('Retirement updated.');
      await refresh();
      setOpen((prev) => (prev?.id === bundle.id ? { ...prev, status } : prev));
      return true;
    } catch (err) {
      toast.error(friendlyError(err, 'Could not update retirement.'));
      return false;
    }
  }

  if (!profile) return null;

  return (
    <div className="mx-auto w-full max-w-7xl p-4 sm:p-6 lg:p-8">
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

            <div className="relative">
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={isFinance ? 'Search staff, status, vendor...' : 'Search your retirements...'}
                className="w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted/70 focus:outline-none focus:ring-2 focus:ring-role-admin/30"
              />
            </div>

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
              <div className="grid min-w-0 gap-4 lg:grid-cols-2">
                {filteredBundles.map((bundle) => (
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

          <aside className="min-w-0">
            <SubmitRetirementCard profile={profile} onCreated={() => void refresh()} />
          </aside>
        </div>
      )}

      {open && (
        <RetirementDetailModal
          bundle={open}
          isFinance={!!isFinance}
          onClose={() => setOpen(null)}
          onStatus={(status, options) => setStatus(open, status, options)}
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
  const [receiptQuery, setReceiptQuery] = useState('');

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
  const visibleReceipts = useMemo(() => {
    const q = receiptQuery.trim().toLowerCase();
    if (!q) return receipts;
    return receipts.filter((r) =>
      [r.vendor_name, r.category, r.receipt_number, r.verification_code]
        .join(' ')
        .toLowerCase()
        .includes(q),
    );
  }, [receiptQuery, receipts]);

  // "Mark all" toggles every currently-visible receipt (respects the search filter).
  const allVisibleSelected =
    visibleReceipts.length > 0 && visibleReceipts.every((r) => selected.has(r.id));
  function toggleAllVisible() {
    const next = new Set(selected);
    if (allVisibleSelected) visibleReceipts.forEach((r) => next.delete(r.id));
    else visibleReceipts.forEach((r) => next.add(r.id));
    setSelected(next);
  }

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
    <Card className="w-full min-w-0 xl:sticky xl:top-6">
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
          <div className="flex items-center justify-between gap-2 border-b border-surface-border px-3 py-2 text-sm font-semibold text-ink">
            <span>Receipts · {formatMoney(total)}</span>
            {visibleReceipts.length > 0 && (
              <button
                type="button"
                onClick={toggleAllVisible}
                className="text-xs font-medium text-role-admin hover:underline"
              >
                {allVisibleSelected ? 'Clear all' : `Mark all (${visibleReceipts.length})`}
              </button>
            )}
          </div>
          <div className="border-b border-surface-border p-2">
            <input
              type="search"
              value={receiptQuery}
              onChange={(e) => setReceiptQuery(e.target.value)}
              placeholder="Search receipts..."
              className="w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted/70 focus:outline-none focus:ring-2 focus:ring-role-admin/30"
            />
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
              visibleReceipts.map((r) => (
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
  onStatus: (
    status: StaffRetirementStatus,
    options?: { note?: string; receiptIds?: string[]; payment?: RetirementPaymentInput },
  ) => Promise<boolean>;
}) {
  const canConfirmReceived = !isFinance && bundle.status === 'paid';
  const canResubmit = !isFinance && bundle.status === 'changes_requested';
  const canFinanceDecide = isFinance && (bundle.status === 'submitted' || bundle.status === 'viewed');
  const canFinancePay = isFinance && bundle.status === 'approved';
  const [zoom, setZoom] = useState<{ src: string; alt: string } | null>(null);
  const [changeOpen, setChangeOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-surface shadow-xl">
        <header className="shrink-0 flex items-start justify-between gap-3 border-b border-surface-border p-4">
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

        <div className="min-h-0 flex-1 overflow-auto p-4">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <StatusPill status={bundle.status} />
            <div className="text-xl font-semibold text-ink">{formatMoney(bundle.total_amount)}</div>
          </div>
          {bundle.notes && <p className="mb-4 rounded-lg bg-surface-muted p-3 text-sm text-ink-muted">{bundle.notes}</p>}
          {bundle.status === 'changes_requested' && bundle.change_request_note && (
            <div className="mb-4 rounded-lg border border-surface-border bg-surface-muted p-3 text-sm text-ink-muted">
              <p className="font-semibold">Changes requested</p>
              <p className="mt-1">{bundle.change_request_note}</p>
            </div>
          )}

          <section className="mb-5">
            <h3 className="mb-2 text-sm font-semibold text-ink">Voucher/forms</h3>
            {bundle.documents.length === 0 ? (
              <p className="text-sm text-ink-muted">No voucher/form attached.</p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {bundle.documents.map((doc) => (
                  <DocumentCard
                    key={doc.id}
                    doc={doc}
                    onView={(src) => setZoom({ src, alt: doc.file_name })}
                  />
                ))}
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
                        onClick={() => void openReceiptImage(r.image_url!, (src) => setZoom({ src, alt: r.vendor_name ?? 'Receipt' }))}
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

        <footer className="shrink-0 border-t border-surface-border bg-surface p-3 sm:p-4">
          <div className="flex flex-wrap justify-end gap-2">
          {canFinanceDecide && (
            <>
              <Button variant="secondary" tint="neutral" onClick={() => setChangeOpen(true)}>
                Request changes
              </Button>
              <Button variant="secondary" tint="accountant" onClick={() => void onStatus('approved')}>
                <CheckCircle2 className="h-4 w-4" /> Approve
              </Button>
            </>
          )}
          {canFinancePay && (
            <Button tint="admin" onClick={() => setPayOpen(true)}>
              <HandCoins className="h-4 w-4" /> Mark paid
            </Button>
          )}
          {canConfirmReceived && (
            <Button tint="admin" onClick={() => void onStatus('received_confirmed')}>
              <CheckCircle2 className="h-4 w-4" /> I have received
            </Button>
          )}
          {canResubmit && (
            <Button tint="admin" onClick={() => void onStatus('submitted')}>
              Submit again
            </Button>
          )}
          <Button variant="ghost" onClick={onClose}>Close</Button>
          </div>
        </footer>
      </div>
      {zoom && <ZoomModal src={zoom.src} alt={zoom.alt} onClose={() => setZoom(null)} />}
      {changeOpen && (
        <RequestChangesModal
          bundle={bundle}
          onClose={() => setChangeOpen(false)}
          onSubmit={(note, receiptIds) => {
            setChangeOpen(false);
            void onStatus('changes_requested', { note, receiptIds });
          }}
        />
      )}
      {payOpen && canFinancePay && (
        <MarkPaidModal
          bundle={bundle}
          onClose={() => setPayOpen(false)}
          onSubmit={async (payment) => {
            const ok = await onStatus('paid', { payment });
            if (ok) setPayOpen(false);
          }}
        />
      )}
    </div>
  );
}

const RETIREMENT_PAYMENT_METHODS: Array<{ value: RetirementPaymentMethod; label: string }> = [
  { value: 'cash', label: 'Cash' },
  { value: 'mobile_money', label: 'Mobile money' },
  { value: 'bank', label: 'Bank' },
  { value: 'other', label: 'Other' },
];

function MarkPaidModal({
  bundle,
  onClose,
  onSubmit,
}: {
  bundle: RetirementBundle;
  onClose: () => void;
  onSubmit: (payment: RetirementPaymentInput) => Promise<void>;
}) {
  const [method, setMethod] = useState<RetirementPaymentMethod>('mobile_money');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      await onSubmit({ method, reference, note });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[75] flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <Card className="w-full max-w-md rounded-t-2xl sm:rounded-2xl">
        <h3 className="text-base font-semibold text-ink">Mark retirement paid</h3>
        <p className="mt-1 text-sm text-ink-muted">
          Record payment of <span className="font-medium text-ink">{formatMoney(bundle.total_amount)}</span> to{' '}
          {bundle.staff?.full_name ?? 'this employee'}.
        </p>
        <p className="mt-3 rounded-lg bg-surface-muted px-3 py-2 text-xs text-ink-muted">
          This records that the employee has been paid for receipts already counted as expenses. It does not add a new expense.
        </p>

        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="text-sm font-medium text-ink">Payment method</span>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as RetirementPaymentMethod)}
              className="mt-1 w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-role-admin/30"
            >
              {RETIREMENT_PAYMENT_METHODS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="text-sm font-medium text-ink">Payment reference</span>
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="M-Pesa code, bank reference, voucher number"
              className="mt-1 w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-role-admin/30"
            />
          </label>

          <label className="block">
            <span className="text-sm font-medium text-ink">Note / reason</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="Optional, but useful for audit history"
              className="mt-1 w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-role-admin/30"
            />
          </label>
        </div>

        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button variant="ghost" disabled={busy} onClick={onClose}>Cancel</Button>
          <Button tint="admin" disabled={busy} onClick={() => void submit()}>
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Record payment
          </Button>
        </div>
      </Card>
    </div>
  );
}

function DocumentCard({ doc, onView }: { doc: RetirementDocument; onView: (src: string) => void }) {
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
    if (isImage) onView(signed);
    else window.open(signed, '_blank', 'noopener,noreferrer');
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

async function openReceiptImage(path: string, onView: (src: string) => void) {
  const signed = await receiptImageUrl(path);
  onView(signed);
}

function ZoomModal({ src, alt, onClose }: { src: string; alt: string; onClose: () => void }) {
  const [scale, setScale] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; startX: number; startY: number } | null>(null);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-3" onClick={onClose}>
      <div className="absolute right-3 top-3 flex gap-2">
        <Button type="button" variant="secondary" tint="neutral" onClick={(e) => { e.stopPropagation(); setScale((s) => Math.max(0.5, s - 0.25)); }}>
          -
        </Button>
        <Button type="button" variant="secondary" tint="neutral" onClick={(e) => { e.stopPropagation(); setScale((s) => Math.min(4, s + 0.25)); }}>
          +
        </Button>
        <Button type="button" variant="secondary" tint="neutral" onClick={(e) => { e.stopPropagation(); setScale(1); setPos({ x: 0, y: 0 }); }}>
          Reset
        </Button>
        <Button type="button" variant="secondary" tint="neutral" onClick={(e) => { e.stopPropagation(); onClose(); }}>
          Close
        </Button>
      </div>
      <img
        src={src}
        alt={alt}
        draggable={false}
        className="max-h-[86vh] max-w-[92vw] cursor-grab select-none object-contain active:cursor-grabbing"
        style={{ transform: `translate(${pos.x}px, ${pos.y}px) scale(${scale})` }}
        onClick={(e) => e.stopPropagation()}
        onPointerDown={(e) => {
          drag.current = { x: e.clientX, y: e.clientY, startX: pos.x, startY: pos.y };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!drag.current) return;
          setPos({
            x: drag.current.startX + e.clientX - drag.current.x,
            y: drag.current.startY + e.clientY - drag.current.y,
          });
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
      />
    </div>
  );
}

function RequestChangesModal({
  bundle,
  onClose,
  onSubmit,
}: {
  bundle: RetirementBundle;
  onClose: () => void;
  onSubmit: (note: string, receiptIds: string[]) => void;
}) {
  const [note, setNote] = useState('');
  const [receiptIds, setReceiptIds] = useState<Set<string>>(new Set());

  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center bg-black/40 p-4">
      <Card className="w-full max-w-lg">
        <h3 className="text-base font-semibold text-ink">Request changes</h3>
        <p className="mt-1 text-sm text-ink-muted">Add a note and mark receipts that need correction.</p>
        <label className="mt-4 flex flex-col gap-1 text-sm font-medium text-ink">
          Note
          <textarea
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={4}
            className="w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-role-admin/30"
            placeholder="Example: Please attach clearer image for the fuel receipt and correct VAT."
          />
        </label>
        <div className="mt-4 max-h-48 overflow-auto rounded-lg border border-surface-border p-2">
          {bundle.receipts.map((r) => (
            <label key={r.id} className="flex items-center gap-2 rounded-lg p-2 text-sm hover:bg-surface-muted">
              <input
                type="checkbox"
                checked={receiptIds.has(r.id)}
                onChange={(e) => {
                  const next = new Set(receiptIds);
                  if (e.target.checked) next.add(r.id);
                  else next.delete(r.id);
                  setReceiptIds(next);
                }}
                className="accent-role-admin"
              />
              <span className="min-w-0 flex-1 truncate text-ink">{r.vendor_name ?? 'Receipt'}</span>
              <span className="shrink-0 text-ink-muted">{formatMoney(r.total_amount)}</span>
            </label>
          ))}
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button tint="admin" disabled={!note.trim()} onClick={() => onSubmit(note, Array.from(receiptIds))}>
            Send request
          </Button>
        </div>
      </Card>
    </div>
  );
}
