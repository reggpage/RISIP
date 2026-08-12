import { useEffect, useState } from 'react';
import { History } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import { formatMoney } from '@/lib/format';

// "What happened to this receipt", from receipt_audit_log.
//
// RLS is the gate, not this component: receipt_audit_log_finance_select allows
// owner and accountant of the company and nobody else, so a worker's query
// returns zero rows however it is called. The role check below only avoids a
// pointless request and an empty box.
//
// Read-only. Nothing here writes, and no audit row is created by viewing.

type AuditRow = {
  id: string;
  created_at: string;
  event: string;
  old_status: string | null;
  new_status: string | null;
  old_amount: number | null;
  new_amount: number | null;
  reason: string | null;
  self_approved: boolean;
  petty_cash_transaction_id: string | null;
  actor: { full_name: string } | null;
};

// Plain language, because the audit trail is read by people, not auditors of
// our enum names.
const LABEL: Record<string, string> = {
  status_changed: 'Status changed',
  submitted: 'Sent for approval',
  confirmed: 'Approved',
  changes_requested: 'Sent back for changes',
  rejected: 'Rejected',
  corrected: 'Amount corrected',
  reversed: 'Petty cash reversed',
  reversal_requested: 'Review requested by staff',
};

const STATUS_WORD: Record<string, string> = {
  processing: 'reading the image',
  pending_review: 'needs review',
  submitted: 'waiting for approval',
  confirmed: 'approved',
  changes_requested: 'changes requested',
  rejected: 'rejected',
  duplicate: 'duplicate',
  error: 'failed',
};

const DOT: Record<string, string> = {
  confirmed: 'bg-emerald-500',
  submitted: 'bg-indigo-500',
  changes_requested: 'bg-amber-500',
  rejected: 'bg-red-500',
  corrected: 'bg-amber-600',
  reversed: 'bg-amber-600',
  reversal_requested: 'bg-sky-500',
};

export default function ReceiptHistoryPanel({ receiptId }: { receiptId: string }) {
  const auth = useAuth();
  const role = auth.status === 'signed-in' ? auth.profile?.role : undefined;
  const isFinance = role === 'owner' || role === 'accountant';
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!isFinance) return;
    let cancelled = false;
    void supabase
      .from('receipt_audit_log')
      .select('id, created_at, event, old_status, new_status, old_amount, new_amount, reason, self_approved, petty_cash_transaction_id, actor:profiles!receipt_audit_log_actor_id_fkey(full_name)')
      .eq('receipt_id', receiptId)
      .order('created_at', { ascending: true })
      .then(({ data, error }) => {
        if (cancelled) return;
        // A failed query must not read as "nothing happened to this receipt" —
        // that is the one wrong answer an audit trail can give.
        if (error) {
          console.error('[risip] receipt history unavailable:', error.message);
          setFailed(true);
          setRows([]);
          return;
        }
        setRows((data as unknown as AuditRow[]) ?? []);
      });
    return () => { cancelled = true; };
  }, [receiptId, isFinance]);

  if (!isFinance || rows === null) return null;

  return (
    <div className="mt-6 border-t border-surface-border pt-4">
      <p className="flex items-center gap-2 text-sm font-semibold text-ink">
        <History className="h-4 w-4 text-ink-muted" />
        History
      </p>

      {failed ? (
        <p className="mt-2 text-sm text-ink-muted">
          History could not be loaded just now. Reopen the receipt to try again.
        </p>
      ) : rows.length === 0 ? (
        <p className="mt-2 text-sm text-ink-muted">No history yet.</p>
      ) : (
        <ol className="mt-3 space-y-3">
          {rows.map((row) => <Row key={row.id} row={row} />)}
        </ol>
      )}
    </div>
  );
}

function Row({ row }: { row: AuditRow }) {
  const movedStatus = row.old_status && row.new_status && row.old_status !== row.new_status;
  const movedAmount = row.old_amount != null && row.new_amount != null
    && Number(row.old_amount) !== Number(row.new_amount);

  return (
    <li className="flex gap-3">
      <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${DOT[row.event] ?? 'bg-ink-muted/40'}`} />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-ink">
          {LABEL[row.event] ?? row.event}
          {row.self_approved && (
            <span className="ml-2 rounded bg-amber-100 px-1.5 py-0.5 text-xs font-normal text-amber-700">
              self-approved
            </span>
          )}
        </p>

        <p className="text-xs text-ink-muted">
          {/* An actor is missing only where the step ran as the system, such as
              AI extraction, which has no signed-in user. */}
          {row.actor?.full_name ?? 'System'}
          {' · '}
          {new Date(row.created_at).toLocaleString('en-GB', {
            day: '2-digit', month: 'short', year: 'numeric',
            hour: '2-digit', minute: '2-digit',
          })}
        </p>

        {movedStatus && (
          <p className="mt-0.5 text-xs text-ink-muted">
            {STATUS_WORD[row.old_status!] ?? row.old_status} → {STATUS_WORD[row.new_status!] ?? row.new_status}
          </p>
        )}

        {movedAmount && (
          <p className="mt-0.5 text-xs text-ink">
            {formatMoney(Number(row.old_amount))} → <span className="font-semibold">{formatMoney(Number(row.new_amount))}</span>
          </p>
        )}

        {row.reason && (
          <p className="mt-1 rounded bg-surface-muted px-2 py-1 text-xs text-ink">{row.reason}</p>
        )}

        {row.petty_cash_transaction_id && (
          <p className="mt-1 font-mono text-[11px] text-ink-muted">
            petty cash entry {row.petty_cash_transaction_id.slice(0, 8)}
          </p>
        )}
      </div>
    </li>
  );
}
