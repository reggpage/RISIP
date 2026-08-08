import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import type { PettyCashAccount, PettyCashTransaction } from '@/types/db';

// ── The current staff's own petty cash account (staff view) ────────────────
export function useMyPettyCashAccount(): PettyCashAccount | null {
  const auth = useAuth();
  const [acct, setAcct] = useState<PettyCashAccount | null>(null);
  const uid = auth.status === 'signed-in' ? auth.profile?.id : null;
  // Unique per hook instance. Supabase caches channels by name, so if two
  // components mount this hook at once (e.g. StaffBalanceCard + AddReceiptSheet)
  // they'd share a channel and the second .on() after .subscribe() throws.
  const instanceId = useRef(Math.random().toString(36).slice(2));

  useEffect(() => {
    if (!uid) return;
    let cancelled = false;
    void supabase
      .from('petty_cash_accounts')
      .select('*')
      .eq('user_id', uid)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setAcct((data as PettyCashAccount | null) ?? null);
      });

    const channel = supabase
      .channel(`petty-cash-me:${uid}:${instanceId.current}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'petty_cash_accounts', filter: `user_id=eq.${uid}` },
        (payload) => setAcct(payload.new as PettyCashAccount),
      )
      .subscribe();

    return () => {
      cancelled = true;
      void supabase.removeChannel(channel);
    };
  }, [uid]);

  return acct;
}

// ── Company-wide staff + accounts join for the accountant table ────────────
export type StaffWithAccount = {
  user_id: string;
  full_name: string;
  phone: string | null;
  account_id: string | null;
  balance: number;
  // Roll-ups from the transactions ledger so admins can eyeball "how much have
  // I ever put in?" vs "how much has been spent?" alongside the current balance.
  total_topped_up: number;
  total_spent: number;
  // Top-ups the admin has sent but the staff member has not yet accepted. Shown
  // faded on the page so admins know the request is out but not yet spendable.
  pending: number;
  // Purpose of the most recent pending top-up (the "what's this for?" note), so
  // the page can headline what the cash is for.
  pending_note: string | null;
};

export function useCompanyPettyCash() {
  const [rows, setRows] = useState<StaffWithAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    // Fire in parallel: profiles + accounts + all transactions in the caller's
    // company. RLS filters transactions down for us — accountants see everything
    // in their company, so the sums are already scoped correctly.
    const [profRes, acctRes, txnRes] = await Promise.all([
      supabase
        .from('profiles')
        .select('id, full_name, phone, role, deactivated_at')
        .in('role', ['worker', 'accountant'])
        .is('deactivated_at', null),
      supabase.from('petty_cash_accounts').select('id, user_id, current_balance'),
      supabase.from('petty_cash_transactions').select('account_id, amount, status, description, created_at'),
    ]);
    setLoading(false);
    if (profRes.error) { setError(profRes.error.message); return; }
    if (acctRes.error) { setError(acctRes.error.message); return; }
    if (txnRes.error) { setError(txnRes.error.message); return; }
    setError(null);

    const acctByUser = new Map<string, { id: string; balance: number }>();
    for (const a of acctRes.data ?? []) {
      acctByUser.set(a.user_id as string, {
        id: a.id as string,
        balance: Number(a.current_balance),
      });
    }

    // Roll up transactions per account. Declined entries are ignored entirely;
    // pending top-ups are tracked separately (not yet spendable) so the page can
    // show them faded, and only 'accepted' entries move topped-up / spent totals.
    type Totals = { toppedUp: number; spent: number; pending: number; pendingNote: string | null; pendingAt: string };
    const emptyTotals = (): Totals => ({ toppedUp: 0, spent: 0, pending: 0, pendingNote: null, pendingAt: '' });
    const totalsByAcct = new Map<string, Totals>();
    for (const t of txnRes.data ?? []) {
      const st = t.status as string | null;
      if (st === 'declined') continue;
      const amt = Number(t.amount);
      const cur = totalsByAcct.get(t.account_id as string) ?? emptyTotals();
      if (st === 'pending') {
        if (amt > 0) {
          cur.pending += amt;
          // Keep the purpose of the most recent pending request to headline it.
          const at = String(t.created_at ?? '');
          if (at >= cur.pendingAt) {
            cur.pendingAt = at;
            const note = ((t.description as string | null) ?? '').trim();
            cur.pendingNote = note && note.toLowerCase() !== 'top-up' ? note : null;
          }
        }
      } else if (amt >= 0) {
        cur.toppedUp += amt;
      } else {
        cur.spent += -amt;
      }
      totalsByAcct.set(t.account_id as string, cur);
    }

    const merged = (profRes.data ?? []).map((p) => {
      const a = acctByUser.get(p.id as string);
      const totals = a ? totalsByAcct.get(a.id) ?? emptyTotals() : emptyTotals();
      return {
        user_id: p.id as string,
        full_name: p.full_name as string,
        phone: (p.phone as string | null) ?? null,
        account_id: a?.id ?? null,
        balance: a?.balance ?? 0,
        total_topped_up: totals.toppedUp,
        total_spent: totals.spent,
        pending: totals.pending,
        pending_note: totals.pendingNote,
      } satisfies StaffWithAccount;
    });
    setRows(merged);
  }, []);

  useEffect(() => {
    void refresh();
    // Refresh table on any petty cash change — balance and totals both need to
    // repaint, so we listen to both accounts and transactions.
    const channel = supabase
      .channel('petty-cash-company')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'petty_cash_accounts' }, () => void refresh())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'petty_cash_transactions' }, () => void refresh())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [refresh]);

  return { rows, loading, error, refresh };
}

// ── Mutations (accountant / owner only via RLS) ────────────────────────────
export async function ensureAccount(userId: string, companyId: string): Promise<string> {
  // Upsert-style: reuse existing row if one already exists for this user.
  const { data: existing } = await supabase
    .from('petty_cash_accounts')
    .select('id')
    .eq('user_id', userId)
    .maybeSingle();
  if (existing?.id) return existing.id as string;

  const { data, error } = await supabase
    .from('petty_cash_accounts')
    .insert({ user_id: userId, company_id: companyId })
    .select('id')
    .single();
  if (error) throw error;
  return data.id as string;
}

export async function requestTopUp(
  userId: string,
  amount: number,
  description: string,
): Promise<PettyCashTransaction> {
  if (!(amount > 0)) throw new Error('Top-up amount must be positive');
  const { data, error } = await supabase
    .rpc('request_petty_cash_top_up', {
      p_user: userId,
      p_amount: amount,
      p_description: description || 'Top-up',
    });
  if (error) throw error;
  return { id: data as string } as PettyCashTransaction;
}
