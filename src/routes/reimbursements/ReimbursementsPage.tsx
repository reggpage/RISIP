import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Eye, HandCoins, Loader2 } from 'lucide-react';
import Button from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import EmptyState from '@/components/ui/EmptyState';
import { ListItemSkeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import ReceiptDetailModal from '@/components/receipts/ReceiptDetailModal';
import {
  markReceiptsReimbursed,
  useReimbursements,
  type OwedPerson,
} from '@/features/reimbursements/reimbursements';
import { useProjects } from '@/features/projects/useProjects';
import { useAuth } from '@/lib/auth';
import { formatDate, formatMoney } from '@/lib/format';
import type { Receipt } from '@/types/db';

// Finance view: who the company owes for receipts staff paid out of pocket.
// Grouped by person, expandable to the individual receipts, with per-receipt
// checkboxes so a payer can settle some now and leave the rest pending.
export default function ReimbursementsPage() {
  const auth = useAuth();
  const profile = auth.status === 'signed-in' ? auth.profile : null;
  const canManage = profile?.role === 'owner' || profile?.role === 'accountant';

  const [showPaid, setShowPaid] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const { people, loading, error, totals, refresh } = useReimbursements(showPaid, projectId);
  const { state: projectsState } = useProjects();

  const [expanded, setExpanded] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [openReceipt, setOpenReceipt] = useState<Receipt | null>(null);
  const toast = useToast();

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return people;
    return people.filter((p) => p.full_name.toLowerCase().includes(q));
  }, [people, query]);

  async function pay(ids: string[], paid: boolean) {
    if (ids.length === 0) return;
    setBusy(true);
    try {
      const n = await markReceiptsReimbursed(ids, paid);
      toast.success(
        paid
          ? `${n} receipt${n === 1 ? '' : 's'} marked paid. The uploader has been notified.`
          : `${n} receipt${n === 1 ? '' : 's'} moved back to pending.`,
      );
      setSelected(new Set());
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update the receipts.');
    } finally {
      setBusy(false);
    }
  }

  function toggleOne(id: string) {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  if (!canManage) {
    return (
      <div className="mx-auto max-w-4xl p-4 sm:p-6">
        <EmptyState
          icon={<HandCoins className="h-10 w-10" />}
          title="Reimbursements are admin-only"
          description="Your own pending amount shows on the receipts page."
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6 lg:p-8">
      <header className="mb-6">
        <h1 className="text-2xl font-semibold text-ink">Reimbursements</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Cash staff paid from their own pocket. Uploaded receipts land here automatically.
        </p>
      </header>

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        <Metric label={showPaid ? 'Total paid' : 'Total to pay'} value={formatMoney(totals.amount)} />
        <Metric label="People" value={String(totals.people)} />
        <Metric label="Receipts" value={String(totals.receipts)} />
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <select
          value={projectId ?? ''}
          onChange={(e) => setProjectId(e.target.value || null)}
          className="rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-role-admin/30"
        >
          <option value="">All projects</option>
          {projectsState.status === 'ready' &&
            projectsState.projects.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
        </select>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search staff..."
          className="min-w-[10rem] flex-1 rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-ink placeholder:text-ink-muted/70 focus:outline-none focus:ring-2 focus:ring-role-admin/30"
        />
        <div className="flex overflow-hidden rounded-lg border border-surface-border text-sm">
          {([false, true] as const).map((v) => (
            <button
              key={String(v)}
              type="button"
              onClick={() => {
                setShowPaid(v);
                setSelected(new Set());
                setExpanded(null);
              }}
              className={`px-4 py-2 font-medium transition ${
                showPaid === v ? 'bg-role-admin text-white' : 'text-ink-muted hover:text-ink'
              }`}
            >
              {v ? 'Paid' : 'Unpaid'}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <Card className="flex flex-col gap-2 p-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <ListItemSkeleton key={i} lines={2} />
          ))}
        </Card>
      ) : error ? (
        <Card className="text-sm text-red-600">{error}</Card>
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<HandCoins className="h-10 w-10" />}
          title={showPaid ? 'Nothing paid back yet' : 'Everyone is settled'}
          description={
            showPaid
              ? 'Receipts you mark paid will be listed here.'
              : 'When staff upload receipts they paid for themselves, they appear here.'
          }
        />
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-surface-border">
            {visible.map((person) => (
              <PersonRow
                key={person.user_id}
                person={person}
                showPaid={showPaid}
                busy={busy}
                open={expanded === person.user_id}
                onToggleOpen={() => {
                  setExpanded(expanded === person.user_id ? null : person.user_id);
                  setSelected(new Set());
                }}
                selected={selected}
                onToggleReceipt={toggleOne}
                onSelectAll={(ids, all) => {
                  const next = new Set(selected);
                  ids.forEach((id) => (all ? next.delete(id) : next.add(id)));
                  setSelected(next);
                }}
                onPay={pay}
                onView={setOpenReceipt}
              />
            ))}
          </ul>
        </Card>
      )}

      {openReceipt && (
        <ReceiptDetailModal receipt={openReceipt} onClose={() => setOpenReceipt(null)} />
      )}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-surface-muted p-4">
      <div className="text-xs uppercase tracking-wide text-ink-muted">{label}</div>
      <div className="mt-1 font-display text-xl font-semibold text-ink">{value}</div>
    </div>
  );
}

function PersonRow({
  person,
  showPaid,
  busy,
  open,
  onToggleOpen,
  selected,
  onToggleReceipt,
  onSelectAll,
  onPay,
  onView,
}: {
  person: OwedPerson;
  showPaid: boolean;
  busy: boolean;
  open: boolean;
  onToggleOpen: () => void;
  selected: Set<string>;
  onToggleReceipt: (id: string) => void;
  onSelectAll: (ids: string[], allSelected: boolean) => void;
  onPay: (ids: string[], paid: boolean) => void;
  onView: (receipt: Receipt) => void;
}) {
  const ids = person.receipts.map((r) => r.id);
  const allSelected = ids.every((id) => selected.has(id));
  const mine = person.receipts.filter((r) => selected.has(r.id));
  const selectedTotal = mine.reduce((sum, r) => sum + Number(r.total_amount || 0), 0);
  const first = person.full_name.split(' ')[0];

  return (
    <li>
      <div className="flex flex-wrap items-center gap-3 px-4 py-3">
        <button
          type="button"
          onClick={onToggleOpen}
          className="flex min-w-0 flex-1 items-center gap-3 text-left"
          aria-expanded={open}
        >
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-role-admin/10 text-xs font-semibold text-role-admin">
            {person.full_name.slice(0, 2).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium text-ink">{person.full_name}</span>
              <span className="rounded-full bg-surface-muted px-2 py-0.5 text-[11px] text-ink-muted">
                {person.receipts.length} receipt{person.receipts.length === 1 ? '' : 's'}
              </span>
            </span>
            {person.phone && <span className="block text-xs text-ink-muted">{person.phone}</span>}
          </span>
        </button>

        <div className="text-right">
          <div className="text-xs uppercase tracking-wide text-ink-muted">{showPaid ? 'Paid' : 'Owed'}</div>
          <div className="font-display text-base font-semibold text-ink">{formatMoney(person.total)}</div>
        </div>

        <Button
          variant={showPaid ? 'secondary' : 'primary'}
          tint="admin"
          disabled={busy}
          onClick={() => onPay(ids, !showPaid)}
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {showPaid ? 'Undo all' : 'Mark all paid'}
        </Button>

        <button
          type="button"
          onClick={onToggleOpen}
          className="rounded p-1 text-ink-muted hover:bg-surface-muted hover:text-ink"
          aria-label={open ? `Hide ${first}'s receipts` : `View ${first}'s receipts`}
        >
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </button>
      </div>

      {open && (
        <div className="mx-4 mb-4 rounded-lg border border-surface-border">
          <div className="flex items-center justify-between gap-2 border-b border-surface-border px-3 py-2">
            <span className="text-xs uppercase tracking-wide text-ink-muted">Vendor · date · category</span>
            <button
              type="button"
              onClick={() => onSelectAll(ids, allSelected)}
              className="text-xs font-medium text-role-admin hover:underline"
            >
              {allSelected ? 'Clear all' : `Select all (${ids.length})`}
            </button>
          </div>

          <ul className="max-h-80 divide-y divide-surface-border overflow-auto">
            {person.receipts.map((r) => (
              <li key={r.id} className="flex items-center gap-3 px-3 py-2">
                <input
                  type="checkbox"
                  checked={selected.has(r.id)}
                  onChange={() => onToggleReceipt(r.id)}
                  className="accent-role-admin"
                  aria-label={`Select ${r.vendor_name ?? 'receipt'}`}
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">
                    {r.vendor_name ?? 'Receipt'}
                  </span>
                  <span className="text-xs text-ink-muted">
                    {formatDate(r.receipt_date ?? r.created_at)} · {r.category ?? 'Other'}
                    {showPaid && r.reimbursed_at ? ` · paid ${formatDate(r.reimbursed_at)}` : ''}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-semibold text-ink">{formatMoney(r.total_amount)}</span>
                <button
                  type="button"
                  onClick={() => onView(r)}
                  className="rounded-lg border border-surface-border p-1.5 text-ink-muted hover:border-role-admin/40 hover:text-ink"
                  aria-label={`View ${r.vendor_name ?? 'receipt'}`}
                >
                  <Eye className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-surface-border px-3 py-2">
            <span className="text-xs text-ink-muted">
              {mine.length} selected · <span className="font-semibold text-ink">{formatMoney(selectedTotal)}</span>
            </span>
            <Button
              variant={showPaid ? 'secondary' : 'primary'}
              tint="admin"
              disabled={busy || mine.length === 0}
              onClick={() => onPay(mine.map((r) => r.id), !showPaid)}
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {showPaid ? 'Move back to unpaid' : 'Mark selected paid'}
            </Button>
          </div>
        </div>
      )}
    </li>
  );
}
