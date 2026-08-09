import { Card } from '@/components/ui/Card';
import { useMyUnpaidTotal } from '@/features/reimbursements/reimbursements';
import { useAuth } from '@/lib/auth';
import { formatMoney } from '@/lib/format';

// Staff counterpart to the reimbursements queue: what the company still owes this
// person for receipts they paid themselves. Drops away once finance settles them,
// which is the visible effect of an accountant marking receipts paid.
export default function OwedToMeCard() {
  const auth = useAuth();
  const profile = auth.status === 'signed-in' ? auth.profile : null;
  const { total, count } = useMyUnpaidTotal(profile?.id);
  if (count === 0) return null;

  return (
    <Card className="mb-4 flex flex-wrap items-baseline justify-between gap-2 border-amber-200 bg-amber-50/60 p-4">
      <span>
        <span className="text-sm font-bold text-amber-700">Waiting to be paid back</span>
        <span className="ml-2 text-xs text-ink-muted">
          {count} receipt{count === 1 ? '' : 's'} you paid for yourself
        </span>
      </span>
      <span className="font-display text-xl font-semibold text-ink">{formatMoney(total)}</span>
    </Card>
  );
}
