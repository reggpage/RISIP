import { supabase } from '@/lib/supabase';
import type { PettyCashTransaction, Receipt, UserRole } from '@/types/db';

// Reversal & correction of a booked petty-cash receipt.
//
// Everything here decides what to SHOW. The database decides what happens:
// reverse_petty_cash_receipt re-checks the role, the flag, the maker-checker
// rule and every blocking precondition, and petty_cash_transactions has no
// INSERT, UPDATE or DELETE policy for any role, so there is no second route in.
//
// Deliberately NOT mirrored here: whether the receipt sits on a non-draft
// invoice or an open retirement. The client does not hold those rows, and
// guessing would be worse than asking — the RPC returns a sentence written for
// the person reading it, which the panel shows verbatim.

export const MIN_REVERSAL_REASON = 10;

export type ReversalMode = 'void' | 'correct';

export type ReversalResult = {
  status: ReversalMode | 'already_reversed';
  adjustment_id: string | null;
  expense_id?: string | null;
  balance: number;
};

/** The posting a reversal would undo, or null when nothing is booked. */
export type LiveExpense = Pick<PettyCashTransaction, 'id' | 'amount' | 'account_id'>;

/**
 * Whether finance may open the reverse/correct controls at all.
 *
 * `reimbursed` is checked here because receipts.reimbursed_at is on the row we
 * already have: telling someone up front that the money has left the building
 * beats letting them write a reason and then refusing it.
 */
export function canReverse(
  receipt: Receipt,
  profileId: string | undefined,
  role: UserRole | undefined,
  reversalEnabled: boolean,
  allowSelfApproval: boolean,
  liveExpense: LiveExpense | null,
): { allowed: boolean; blockedReason: string | null } {
  const isFinance = role === 'owner' || role === 'accountant';
  if (!reversalEnabled || !isFinance) return { allowed: false, blockedReason: null };
  if (receipt.status !== 'confirmed') return { allowed: false, blockedReason: null };
  if (!liveExpense) return { allowed: false, blockedReason: null };

  if (receipt.reimbursed_at) {
    return {
      allowed: false,
      blockedReason:
        'This receipt has already been reimbursed to the employee. Recover the money first — a reversal does not get it back.',
    };
  }
  // Maker-checker, same rule as approving: you may not undo your own decision
  // unless the company is explicitly configured for it.
  if (!allowSelfApproval && receipt.decided_by && receipt.decided_by === profileId) {
    return {
      allowed: false,
      blockedReason: 'You confirmed this receipt, so another member of your finance team must reverse it.',
    };
  }
  return { allowed: true, blockedReason: null };
}

/** Staff never reverse. They may ask, which moves no money. */
export function canRequestReversal(
  receipt: Receipt,
  profileId: string | undefined,
  role: UserRole | undefined,
): boolean {
  if (receipt.status !== 'confirmed') return false;
  const isFinance = role === 'owner' || role === 'accountant';
  return receipt.uploaded_by === profileId || isFinance;
}

export function reasonIsLongEnough(reason: string): boolean {
  return reason.trim().length >= MIN_REVERSAL_REASON;
}

/**
 * The one posting a reversal may target. Mirrors the partial unique index: at
 * most one expense per receipt is ever unreversed, so `maybeSingle` is exact
 * rather than a "first row" pick.
 */
export async function fetchLiveExpense(receiptId: string): Promise<LiveExpense | null> {
  const { data, error } = await supabase
    .from('petty_cash_transactions')
    .select('id, amount, account_id')
    .eq('receipt_id', receiptId)
    .eq('type', 'expense')
    .is('reversed_at', null)
    .maybeSingle();
  if (error) throw error;
  return data ?? null;
}

export async function reverseReceipt(
  receiptId: string,
  transactionId: string,
  mode: ReversalMode,
  reason: string,
  newAmount?: number,
): Promise<ReversalResult> {
  const { data, error } = await supabase.rpc('reverse_petty_cash_receipt', {
    p_receipt: receiptId,
    p_transaction: transactionId,
    p_mode: mode,
    p_reason: reason.trim(),
    p_new_amount: newAmount ?? null,
  });
  if (error) throw error;
  return data as ReversalResult;
}

export async function requestReversal(receiptId: string, reason: string): Promise<string> {
  const { data, error } = await supabase.rpc('request_receipt_reversal', {
    p_receipt: receiptId,
    p_reason: reason.trim(),
  });
  if (error) throw error;
  return data as string;
}
