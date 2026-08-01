import { Card } from '@/components/ui/Card';
import { useMyPettyCashAccount } from '@/features/pettyCash/pettyCash';
import { formatMoney } from '@/lib/format';

// Compact balance card for staff — shown on Receipts so they always know how much
// petty cash they can still spend. Label is bold + red per user brand direction.
export default function StaffBalanceCard() {
  const acct = useMyPettyCashAccount();
  if (!acct) return null;

  return (
    <Card className="mb-4 flex items-baseline justify-between border-role-admin/20 bg-role-admin/5 p-4">
      <span className="text-sm font-bold text-role-admin">Petty Cash Balance</span>
      <span className="font-display text-xl font-semibold text-ink">
        {formatMoney(acct.current_balance)}
      </span>
    </Card>
  );
}
