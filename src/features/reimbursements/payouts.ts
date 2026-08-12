import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Receipt, UserRole } from '@/types/db';

// Recording that the company actually paid an employee back.
//
// A payout is settlement, not expense. The expense was counted when the receipt
// was confirmed, and nothing in any total reads reimbursed_at — paying somebody
// moves no company figure. What a payout adds is the part that was missing: how
// much was handed over, by whom, when, by what means, and under what reference.
//
// Every rule below is enforced in create_reimbursement_payout /
// void_reimbursement_payout. Since migration 0069 the settlement columns on
// receipts cannot be written by anyone — worker or finance — outside those two
// functions, so this module is convenience, never authority.

export const PAYOUT_METHODS = [
  { value: 'cash', label: 'Cash' },
  { value: 'mobile_money', label: 'Mobile money (M-Pesa, Tigo Pesa, Airtel)' },
  { value: 'bank', label: 'Bank transfer' },
  { value: 'other', label: 'Other' },
] as const;

export type PayoutMethod = (typeof PAYOUT_METHODS)[number]['value'];

export type Payout = {
  id: string;
  company_id: string;
  paid_to: string;
  paid_by: string;
  paid_at: string;
  total_amount: number;
  method: PayoutMethod | null;
  reference: string | null;
  note: string | null;
  voided_at: string | null;
  voided_by: string | null;
  void_reason: string | null;
  created_at: string;
};

export type PayoutResult = { payout_id: string; total_amount: number; receipts: number };

/** Mirrors the eligibility clause in create_reimbursement_payout. */
export function isReimbursable(receipt: Receipt): boolean {
  return receipt.status === 'confirmed'
    && receipt.payment_method === 'cash_personal'
    && receipt.reimbursed_at === null;
}

/** One payout pays one person, because that is how the money actually moves. */
export function sameEmployee(receipts: Receipt[]): boolean {
  if (receipts.length === 0) return false;
  return receipts.every((r) => r.uploaded_by === receipts[0].uploaded_by);
}

export function canRecordPayout(role: UserRole | undefined): boolean {
  return role === 'owner' || role === 'accountant';
}

export async function createPayout(
  receiptIds: string[],
  method?: PayoutMethod | null,
  reference?: string | null,
  note?: string | null,
): Promise<PayoutResult> {
  const { data, error } = await supabase.rpc('create_reimbursement_payout', {
    p_receipt_ids: receiptIds,
    p_method: method ?? null,
    p_reference: reference?.trim() || null,
    p_note: note?.trim() || null,
  });
  if (error) throw error;
  return data as PayoutResult;
}

export async function voidPayout(payoutId: string, reason: string): Promise<{ status: string }> {
  const { data, error } = await supabase.rpc('void_reimbursement_payout', {
    p_payout: payoutId,
    p_reason: reason.trim(),
  });
  if (error) throw error;
  return data as { status: string };
}

/**
 * Payments this company has made. RLS scopes it: finance sees the company's,
 * an employee sees only payments made to them — enough to answer "have I been
 * paid back?" without handing them the payroll.
 */
export function usePayouts(limit = 50) {
  const [payouts, setPayouts] = useState<Payout[]>([]);
  const [names, setNames] = useState<Map<string, string>>(new Map());
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    setLoading(true);
    const [payoutRes, profileRes] = await Promise.all([
      supabase.from('reimbursement_payouts').select('*').order('paid_at', { ascending: false }).limit(limit),
      supabase.from('profiles').select('id, full_name'),
    ]);
    setPayouts((payoutRes.data as Payout[]) ?? []);
    setNames(new Map(((profileRes.data ?? []) as { id: string; full_name: string }[])
      .map((p) => [p.id, p.full_name])));
    setLoading(false);
  }, [limit]);

  useEffect(() => { void refresh(); }, [refresh]);

  return { payouts, names, loading, refresh };
}
