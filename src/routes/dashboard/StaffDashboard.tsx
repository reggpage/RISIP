import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, Clock3, Plus, XCircle } from 'lucide-react';
import Button from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import EmptyState from '@/components/ui/EmptyState';
import { MetricCardSkeleton } from '@/components/ui/Skeleton';
import StaffBalanceCard from '@/components/pettyCash/StaffBalanceCard';
import OwedToMeCard from '@/components/reimbursements/OwedToMeCard';
import { useReceipts } from '@/features/receipts/useReceipts';
import { useAuth } from '@/lib/auth';
import { formatDate, formatMoney } from '@/lib/format';
import type { Receipt } from '@/types/db';

// What staff see instead of the company dashboard.
//
// Nothing here is a company figure: every number is drawn from the signed-in
// person's own receipts, and RLS (migration 0060) means the query cannot return
// anybody else's anyway. This is the visible half of that rule — the enforcing
// half is in the database.
export default function StaffDashboard() {
  const auth = useAuth();
  const profile = auth.status === 'signed-in' ? auth.profile : null;
  const { state } = useReceipts(undefined, 500);

  const mine = useMemo(
    () => (state.status === 'ready' ? state.receipts.filter((r) => r.uploaded_by === profile?.id) : []),
    [state, profile?.id],
  );

  const groups = useMemo(() => ({
    awaiting: mine.filter((r) => r.status === 'submitted'),
    needsWork: mine.filter((r) => r.status === 'pending_review' || r.status === 'changes_requested'),
    approved: mine.filter((r) => r.status === 'confirmed'),
    rejected: mine.filter((r) => r.status === 'rejected'),
  }), [mine]);

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink">My receipts</h1>
          <p className="mt-1 text-sm text-ink-muted">
            Everything you have sent in, and what is still waiting on you.
          </p>
        </div>
        <Link to="/receipts">
          <Button tint="admin">
            <Plus className="h-4 w-4" />
            Add receipt
          </Button>
        </Link>
      </header>

      <StaffBalanceCard />
      <OwedToMeCard />

      <div className="mb-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {state.status === 'loading' ? (
          Array.from({ length: 4 }).map((_, i) => <MetricCardSkeleton key={i} />)
        ) : (
          <>
            <Tile label="Needs your action" value={String(groups.needsWork.length)}
                  tone="text-amber-600" icon={<AlertTriangle className="h-5 w-5" />} />
            <Tile label="Waiting for approval" value={String(groups.awaiting.length)}
                  tone="text-indigo-600" icon={<Clock3 className="h-5 w-5" />} />
            <Tile label="Approved" value={String(groups.approved.length)}
                  tone="text-emerald-600" icon={<CheckCircle2 className="h-5 w-5" />} />
            <Tile label="Rejected" value={String(groups.rejected.length)}
                  tone="text-red-600" icon={<XCircle className="h-5 w-5" />} />
          </>
        )}
      </div>

      {groups.needsWork.length > 0 && (
        <Section title="Needs your action" hint="Finish the details, or fix what finance asked about, then submit.">
          {groups.needsWork.map((r) => <Row key={r.id} receipt={r} />)}
        </Section>
      )}

      {groups.awaiting.length > 0 && (
        <Section title="Waiting for approval" hint="Your finance team has these.">
          {groups.awaiting.map((r) => <Row key={r.id} receipt={r} />)}
        </Section>
      )}

      {state.status === 'ready' && mine.length === 0 && (
        <EmptyState
          title="No receipts yet"
          description="Tap Add receipt to send in your first one."
        />
      )}

      {groups.approved.length > 0 && (
        <Section title="Approved" hint="These have been accepted by your finance team.">
          {groups.approved.slice(0, 10).map((r) => <Row key={r.id} receipt={r} />)}
        </Section>
      )}

      {groups.rejected.length > 0 && (
        <Section title="Rejected" hint="These were not accepted. The reason is on each receipt.">
          {groups.rejected.map((r) => <Row key={r.id} receipt={r} />)}
        </Section>
      )}
    </div>
  );
}

function Tile({ label, value, tone, icon }: { label: string; value: string; tone: string; icon: React.ReactNode }) {
  return (
    <Card>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase text-ink-muted">{label}</p>
          <p className="mt-3 text-2xl font-semibold text-ink">{value}</p>
        </div>
        <span className={tone}>{icon}</span>
      </div>
    </Card>
  );
}

function Section({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      <p className="mb-3 text-sm text-ink-muted">{hint}</p>
      <Card className="p-0">
        <ul className="divide-y divide-surface-border">{children}</ul>
      </Card>
    </section>
  );
}

function Row({ receipt }: { receipt: Receipt }) {
  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
      <Link to={`/receipts?receipt=${receipt.id}`} className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium text-ink">
          {receipt.vendor_name ?? 'Receipt'}
        </span>
        <span className="text-xs text-ink-muted">
          {formatDate(receipt.receipt_date ?? receipt.created_at)}
          {receipt.category ? ` · ${receipt.category}` : ''}
        </span>
        {receipt.status === 'changes_requested' && receipt.decision_reason && (
          <span className="mt-1 block text-xs text-amber-700">{receipt.decision_reason}</span>
        )}
        {receipt.status === 'rejected' && receipt.decision_reason && (
          <span className="mt-1 block text-xs text-red-600">{receipt.decision_reason}</span>
        )}
      </Link>
      <span className="shrink-0 font-display text-sm font-semibold text-ink">
        {formatMoney(receipt.total_amount)}
      </span>
    </li>
  );
}
