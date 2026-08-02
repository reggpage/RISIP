import { useEffect, useMemo, useState } from 'react';
import { Plus, ScanLine, Search } from 'lucide-react';
import Button from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import EmptyState from '@/components/ui/EmptyState';
import Select from '@/components/ui/Select';
import { ListItemSkeleton } from '@/components/ui/Skeleton';
import ReceiptCard from '@/components/receipts/ReceiptCard';
import ReceiptDetailModal from '@/components/receipts/ReceiptDetailModal';
import AddReceiptSheet from '@/components/receipts/AddReceiptSheet';
import BatchScanPanel from '@/components/receipts/BatchScanPanel';
import StaffBalanceCard from '@/components/pettyCash/StaffBalanceCard';
import { useReceipts } from '@/features/receipts/useReceipts';
import { useProjects } from '@/features/projects/useProjects';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { sw } from '@/i18n/sw';
import type { Receipt } from '@/types/db';

// Fixed list of categories the receipts get bucketed into — mirrors extract-receipt
// edge fn + AddReceiptSheet enum. Used for the filter dropdown.
const CATEGORIES = [
  'Fuel', 'Materials', 'Labor', 'Food', 'Transport',
  'Equipment', 'Office', 'Utilities', 'Rent',
  'Communication', 'Consulting', 'Other',
];

export default function ReceiptsPage() {
  const auth = useAuth();
  const { state: projectsState } = useProjects();
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [batchOpen, setBatchOpen] = useState(false);
  const [openReceipt, setOpenReceipt] = useState<Receipt | null>(null);

  // Search + filter state — client-side over the current stream (up to 50 rows).
  const [query, setQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [paymentFilter, setPaymentFilter] = useState('');
  // "all" (default) | "mine" — lets a user filter down to their own receipts
  // when the list mixes uploads from the whole team.
  const [uploaderFilter, setUploaderFilter] = useState<'all' | 'mine'>('all');

  const profile = auth.status === 'signed-in' ? auth.profile : null;

  const activeProjects = useMemo(() => {
    if (projectsState.status !== 'ready') return [];
    return projectsState.projects.filter((p) => p.status === 'active');
  }, [projectsState]);
  const effectiveProjectId = selectedProjectId ?? (activeProjects.length === 1 ? activeProjects[0].id : null);
  const { state: receiptsState } = useReceipts(selectedProjectId ?? undefined);

  // Uploader name cache so search-by-name works against the full name, not just uid.
  // Lazy-populated as receipts come in.
  const [uploaderNames, setUploaderNames] = useState<Record<string, string>>({});
  useEffect(() => {
    if (receiptsState.status !== 'ready') return;
    const missing = Array.from(
      new Set(receiptsState.receipts.map((r) => r.uploaded_by).filter((id) => !(id in uploaderNames))),
    );
    if (missing.length === 0) return;
    void supabase
      .from('profiles')
      .select('id, full_name')
      .in('id', missing)
      .then(({ data }) => {
        if (!data) return;
        setUploaderNames((prev) => {
          const next = { ...prev };
          for (const row of data) next[row.id as string] = (row.full_name as string) ?? '';
          return next;
        });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [receiptsState]);

  const filtered = useMemo(() => {
    if (receiptsState.status !== 'ready') return [];
    const q = query.trim().toLowerCase();
    return receiptsState.receipts.filter((r) => {
      if (uploaderFilter === 'mine' && r.uploaded_by !== profile?.id) return false;
      if (categoryFilter && (r.category ?? 'Other') !== categoryFilter) return false;
      if (paymentFilter && r.payment_method !== paymentFilter) return false;
      if (q) {
        const vendor = (r.vendor_name ?? '').toLowerCase();
        const uploader = (uploaderNames[r.uploaded_by] ?? '').toLowerCase();
        if (!vendor.includes(q) && !uploader.includes(q)) return false;
      }
      return true;
    });
  }, [receiptsState, query, categoryFilter, paymentFilter, uploaderFilter, uploaderNames, profile?.id]);

  if (projectsState.status === 'loading') {
    return (
      <div className="mx-auto max-w-4xl p-4 sm:p-6">
        <div className="mb-4 h-8 w-28 animate-pulse rounded-lg bg-surface-muted" />
        <div className="flex flex-col gap-3">
          {Array.from({ length: 4 }).map((_, i) => <ListItemSkeleton key={i} lines={3} />)}
        </div>
      </div>
    );
  }
  if (activeProjects.length === 0) {
    return (
      <div className="mx-auto max-w-4xl p-4 sm:p-6">
        <EmptyState title={sw.receipts.empty} description={sw.receipts.noProjectsAssigned} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold text-ink">{sw.nav.receipts}</h1>
        <div className="flex gap-2">
          {/* Batch Scan is an office feature for finance roles. */}
          {(profile?.role === 'owner' || profile?.role === 'accountant') && (
            <Button
              variant="secondary"
              tint="admin"
              disabled={!effectiveProjectId || !profile}
              onClick={() => setBatchOpen(true)}
            >
              <ScanLine className="h-4 w-4" />
              Connect Scanner / Batch Scan
            </Button>
          )}
          <Button
            tint="admin"
            disabled={!effectiveProjectId || !profile}
            onClick={() => setSheetOpen(true)}
          >
            <Plus className="h-4 w-4" />
            Add receipt
          </Button>
        </div>
      </div>

      <StaffBalanceCard />

      {/* Simple segmented control — "All receipts" vs "My receipts". Handy when
          admins want to isolate what they personally uploaded vs the team's. */}
      <div className="mb-3 inline-flex rounded-lg border border-surface-border bg-surface p-0.5 text-sm">
        <button
          type="button"
          onClick={() => setUploaderFilter('all')}
          className={
            'rounded-md px-3 py-1.5 font-medium transition ' +
            (uploaderFilter === 'all'
              ? 'bg-role-admin/10 text-role-admin'
              : 'text-ink-muted hover:text-ink')
          }
        >
          All receipts
        </button>
        <button
          type="button"
          onClick={() => setUploaderFilter('mine')}
          className={
            'rounded-md px-3 py-1.5 font-medium transition ' +
            (uploaderFilter === 'mine'
              ? 'bg-role-admin/10 text-role-admin'
              : 'text-ink-muted hover:text-ink')
          }
        >
          My receipts
        </button>
      </div>

      {activeProjects.length > 1 && (
        <Card className="mb-4">
          <Select
            label={sw.receipts.chooseProject}
            value={selectedProjectId ?? ''}
            onChange={(v) => setSelectedProjectId(v || null)}
            placeholder="All projects"
            options={[
              { value: '', label: 'All projects' },
              ...activeProjects.map((p) => ({ value: p.id, label: p.name })),
            ]}
          />
        </Card>
      )}

      {/* Search + filters — tightly grouped so the receipts list stays the focus. */}
      <div className="mb-4 grid gap-2 sm:grid-cols-[1fr_180px_180px]">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-ink-muted" />
          <input
            type="search"
            placeholder="Search vendor or uploader…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full rounded-lg border border-surface-border bg-surface pl-9 pr-3 py-2 text-sm text-ink placeholder:text-ink-muted/70 focus:outline-none focus:ring-2 focus:ring-role-admin/30"
          />
        </div>
        <Select
          value={categoryFilter}
          onChange={setCategoryFilter}
          placeholder="All categories"
          options={[
            { value: '', label: 'All categories' },
            ...CATEGORIES.map((c) => ({ value: c, label: c })),
          ]}
        />
        <Select
          value={paymentFilter}
          onChange={setPaymentFilter}
          placeholder="Any payment"
          options={[
            { value: '', label: 'Any payment' },
            { value: 'cash_personal', label: 'Cash / Personal' },
            { value: 'petty_cash', label: 'Petty cash' },
          ]}
        />
      </div>

      <h2 className="mb-2 text-sm font-semibold text-ink-muted">{sw.receipts.recent}</h2>

      {/* Smooth transitions: the list container fades between states so the modal
          → new-card handoff doesn't jump. */}
      <div className="transition-opacity duration-200">
        {receiptsState.status === 'loading' && (
          <div className="flex flex-col gap-3">
            {Array.from({ length: 4 }).map((_, i) => <ListItemSkeleton key={i} lines={3} />)}
          </div>
        )}
        {receiptsState.status === 'error' && (
          <div className="text-sm text-red-600">{receiptsState.message}</div>
        )}
        {receiptsState.status === 'ready' && filtered.length === 0 && (
          <EmptyState
            title={receiptsState.receipts.length === 0 ? sw.receipts.empty : 'No matches'}
            description={
              receiptsState.receipts.length === 0
                ? 'Tap Add receipt to capture your first one.'
                : 'Try clearing the search or filters.'
            }
          />
        )}
        {receiptsState.status === 'ready' && filtered.length > 0 && (
          <div className="flex flex-col gap-3">
            {filtered.map((r) => (
              <ReceiptCard key={r.id} receipt={r} onOpen={setOpenReceipt} />
            ))}
          </div>
        )}
      </div>

      {sheetOpen && effectiveProjectId && profile && (
        <AddReceiptSheet
          projectId={effectiveProjectId}
          userId={profile.id}
          onClose={() => setSheetOpen(false)}
        />
      )}
      {batchOpen && effectiveProjectId && profile && (
        <BatchScanPanel
          projectId={effectiveProjectId}
          userId={profile.id}
          onClose={() => setBatchOpen(false)}
          onImported={() => { /* realtime refreshes the list automatically */ }}
        />
      )}
      {openReceipt && (
        <ReceiptDetailModal
          receipt={openReceipt}
          onClose={() => setOpenReceipt(null)}
          // Realtime already patches the list on DELETE, but nudge state now so
          // the modal closes onto a clean page even if the socket is slow.
          onDeleted={() => setOpenReceipt(null)}
        />
      )}
    </div>
  );
}
