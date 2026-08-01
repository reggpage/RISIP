import { useState } from 'react';
import { Loader2, Wallet, X } from 'lucide-react';
import Button from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import EmptyState from '@/components/ui/EmptyState';
import Input from '@/components/ui/Input';
import NumberInput from '@/components/ui/NumberInput';
import { ListItemSkeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { ensureAccount, topUp, useCompanyPettyCash, type StaffWithAccount } from '@/features/pettyCash/pettyCash';
import { useAuth } from '@/lib/auth';
import { useCompany } from '@/features/company/useCompany';
import { formatMoney } from '@/lib/format';

// Full-featured petty cash page. Structure:
//   Header (always visible, no gate) → list of staff → each row shows the current
//   balance + View action. Details modal reveals topped-up / spent / remaining.
//   Top-up modal uses NumberInput so amounts render "500,000" while the user types.
export default function PettyCashPage() {
  const auth = useAuth();
  const company = useCompany();
  const { rows, loading, error } = useCompanyPettyCash();
  const [topUpTarget, setTopUpTarget] = useState<StaffWithAccount | null>(null);
  const [viewTarget, setViewTarget] = useState<StaffWithAccount | null>(null);

  const authReady = auth.status !== 'loading';
  const profile = auth.status === 'signed-in' ? auth.profile : null;
  const canManage = profile?.role === 'owner' || profile?.role === 'accountant';

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6">
      {/* Render header immediately so the page is never blank — the flash the user
          saw was because we returned early with an empty state before auth resolved. */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-ink">Petty cash</h1>
        <p className="mt-1 text-sm text-ink-muted">
          Give staff working cash and watch it get spent live as they upload receipts.
        </p>
      </div>

      {!authReady || loading ? (
        <Card className="p-0">
          <div className="flex flex-col gap-2 p-4">
            {Array.from({ length: 3 }).map((_, i) => <ListItemSkeleton key={i} lines={2} />)}
          </div>
        </Card>
      ) : !canManage ? (
        <EmptyState
          icon={<Wallet className="h-10 w-10" />}
          title="Petty cash is admin-only"
          description="Ask your admin or accountant to open an account for you."
        />
      ) : error ? (
        <div className="text-sm text-red-600">{error}</div>
      ) : rows.length === 0 ? (
        <EmptyState title="No staff yet" description="Invite people first from the projects page." />
      ) : (
        <Card className="p-0">
          <ul className="divide-y divide-surface-border">
            {rows.map((r) => (
              <li key={r.user_id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-ink">{r.full_name}</div>
                  {r.phone && <div className="text-xs text-ink-muted">{r.phone}</div>}
                </div>

                {/* Desktop-only: three stats inline so admins get context without opening. */}
                <div className="hidden text-right md:block">
                  <div className="text-xs uppercase tracking-wide text-ink-muted">Balance</div>
                  <div className="font-display text-base font-semibold text-ink">
                    {formatMoney(r.balance)}
                  </div>
                </div>
                <div className="hidden text-right md:block">
                  <div className="text-xs uppercase tracking-wide text-ink-muted">Topped up</div>
                  <div className="text-sm font-medium text-emerald-700">{formatMoney(r.total_topped_up)}</div>
                </div>
                <div className="hidden text-right md:block">
                  <div className="text-xs uppercase tracking-wide text-ink-muted">Spent</div>
                  <div className="text-sm font-medium text-red-600">{formatMoney(r.total_spent)}</div>
                </div>

                {/* Mobile-only: single compact balance + View. */}
                <div className="text-right md:hidden">
                  <div className="text-xs uppercase tracking-wide text-ink-muted">Balance</div>
                  <div className="font-display text-base font-semibold text-ink">
                    {formatMoney(r.balance)}
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <Button variant="ghost" onClick={() => setViewTarget(r)} className="!px-3 !py-1.5 text-xs">
                    View
                  </Button>
                  <Button variant="secondary" tint="admin" onClick={() => setTopUpTarget(r)}>
                    Top up
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {viewTarget && (
        <ViewModal target={viewTarget} onClose={() => setViewTarget(null)} />
      )}

      {topUpTarget && profile && company && (
        <TopUpModal
          target={topUpTarget}
          companyId={company.id}
          createdBy={profile.id}
          onClose={() => setTopUpTarget(null)}
        />
      )}
    </div>
  );
}

function ViewModal({ target, onClose }: { target: StaffWithAccount; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-[150] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-t-2xl bg-surface shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-surface-border px-5 py-3">
          <h2 className="text-base font-semibold text-ink">{target.full_name}</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded p-1 text-ink-muted hover:bg-surface-muted hover:text-ink"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex flex-col divide-y divide-surface-border p-5">
          <StatRow label="Topped up" value={formatMoney(target.total_topped_up)} tone="text-emerald-700" />
          <StatRow label="Spent" value={formatMoney(target.total_spent)} tone="text-red-600" />
          <StatRow label="Remaining" value={formatMoney(target.balance)} tone="text-ink" bold />
        </div>
      </div>
    </div>
  );
}

function StatRow({ label, value, tone, bold }: { label: string; value: string; tone: string; bold?: boolean }) {
  return (
    <div className="flex items-baseline justify-between py-2 first:pt-0 last:pb-0">
      <span className="text-xs uppercase tracking-wide text-ink-muted">{label}</span>
      <span className={`font-display ${bold ? 'text-lg font-semibold' : 'text-base font-medium'} ${tone}`}>
        {value}
      </span>
    </div>
  );
}

function TopUpModal({
  target,
  companyId,
  createdBy,
  onClose,
}: {
  target: StaffWithAccount;
  companyId: string;
  createdBy: string;
  onClose: () => void;
}) {
  const toast = useToast();
  const [amount, setAmount] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const n = Number(amount);
    if (!Number.isFinite(n) || n <= 0) {
      toast.error('Enter a positive amount.');
      return;
    }
    setBusy(true);
    try {
      const acctId = target.account_id ?? (await ensureAccount(target.user_id, companyId));
      await topUp(acctId, n, note.trim(), createdBy);
      toast.success(`Topped up ${target.full_name}.`);
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Top-up failed');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[150] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-2xl bg-surface shadow-2xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-surface-border px-5 py-3">
          <h2 className="text-base font-semibold text-ink">Top up {target.full_name}</h2>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="rounded p-1 text-ink-muted hover:bg-surface-muted hover:text-ink"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={submit} className="flex flex-col gap-4 p-5">
          <div className="rounded-lg bg-surface-muted p-3 text-sm">
            <span className="text-ink-muted">Current balance</span>
            <span className="ml-2 font-display font-semibold text-ink">
              {formatMoney(target.balance)}
            </span>
          </div>
          <NumberInput
            label="Amount (TSh)"
            value={amount}
            onChange={setAmount}
            placeholder="0"
            autoFocus
          />
          <Input
            label="Note"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Optional — e.g. Week 30 float"
          />
          <div className="mt-2 flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            <Button type="submit" tint="admin" disabled={busy || !amount}>
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              {busy ? 'Adding…' : 'Add funds'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
