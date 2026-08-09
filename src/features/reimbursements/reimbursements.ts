import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Receipt } from '@/types/db';

// Money a company owes its staff: confirmed receipts they paid for out of their
// own pocket (payment_method = 'cash_personal'). Nothing is filed by hand — a
// receipt lands in this queue the moment it is uploaded and confirmed, and leaves
// it when finance marks it reimbursed.

export type OwedPerson = {
  user_id: string;
  full_name: string;
  phone: string | null;
  receipts: Receipt[];
  total: number;
};

type State = {
  people: OwedPerson[];
  loading: boolean;
  error: string | null;
};

export function useReimbursements(paid: boolean, projectId: string | null) {
  const [state, setState] = useState<State>({ people: [], loading: true, error: null });
  const channelSuffix = useRef(Math.random().toString(36).slice(2));

  const refresh = useCallback(async () => {
    setState((prev) => ({ ...prev, loading: true }));
    let query = supabase
      .from('receipts')
      .select('*')
      .eq('payment_method', 'cash_personal')
      .eq('status', 'confirmed')
      .order('receipt_date', { ascending: false });
    query = paid ? query.not('reimbursed_at', 'is', null) : query.is('reimbursed_at', null);
    if (projectId) query = query.eq('project_id', projectId);

    const [receiptRes, profileRes] = await Promise.all([
      query,
      supabase.from('profiles').select('id, full_name, phone'),
    ]);
    if (receiptRes.error) {
      setState({ people: [], loading: false, error: receiptRes.error.message });
      return;
    }

    const names = new Map(
      (profileRes.data ?? []).map((p) => [
        p.id as string,
        { full_name: (p.full_name as string) ?? 'Staff member', phone: (p.phone as string | null) ?? null },
      ]),
    );

    const byPerson = new Map<string, OwedPerson>();
    for (const row of (receiptRes.data ?? []) as Receipt[]) {
      const who = names.get(row.uploaded_by) ?? { full_name: 'Staff member', phone: null };
      const cur = byPerson.get(row.uploaded_by) ?? {
        user_id: row.uploaded_by,
        full_name: who.full_name,
        phone: who.phone,
        receipts: [],
        total: 0,
      };
      cur.receipts.push(row);
      cur.total += Number(row.total_amount || 0);
      byPerson.set(row.uploaded_by, cur);
    }

    setState({
      people: Array.from(byPerson.values()).sort((a, b) => b.total - a.total),
      loading: false,
      error: null,
    });
  }, [paid, projectId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Live: a new upload, a confirmation, or someone else marking rows paid should
  // all repaint the queue without a manual refresh.
  useEffect(() => {
    const channel = supabase
      .channel(`reimbursements-${channelSuffix.current}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'receipts' }, () => void refresh())
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [refresh]);

  const totals = useMemo(
    () => ({
      amount: state.people.reduce((sum, p) => sum + p.total, 0),
      people: state.people.length,
      receipts: state.people.reduce((sum, p) => sum + p.receipts.length, 0),
    }),
    [state.people],
  );

  return { ...state, totals, refresh };
}

export async function markReceiptsReimbursed(receiptIds: string[], paid = true): Promise<number> {
  if (receiptIds.length === 0) return 0;
  const { data, error } = await supabase.rpc('mark_receipts_reimbursed', {
    p_receipt_ids: receiptIds,
    p_paid: paid,
  });
  if (error) throw error;
  return (data as number) ?? 0;
}

// Staff-side counterpart: what the company still owes the signed-in user.
export function useMyUnpaidTotal(userId?: string) {
  const [total, setTotal] = useState(0);
  const [count, setCount] = useState(0);
  const channelSuffix = useRef(Math.random().toString(36).slice(2));

  const refresh = useCallback(async () => {
    if (!userId) return;
    const { data } = await supabase
      .from('receipts')
      .select('total_amount')
      .eq('uploaded_by', userId)
      .eq('payment_method', 'cash_personal')
      .eq('status', 'confirmed')
      .is('reimbursed_at', null);
    const rows = data ?? [];
    setCount(rows.length);
    setTotal(rows.reduce((sum, r) => sum + Number(r.total_amount || 0), 0));
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`my-owed-${userId}-${channelSuffix.current}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'receipts', filter: `uploaded_by=eq.${userId}` },
        () => void refresh(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [refresh, userId]);

  return { total, count };
}
