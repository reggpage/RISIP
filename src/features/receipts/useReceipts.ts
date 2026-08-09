import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Receipt } from '@/types/db';

type State =
  | { status: 'loading' }
  | { status: 'ready'; receipts: Receipt[] }
  | { status: 'error'; message: string };

// Streams receipts under RLS + optional project filter. Realtime patches state in
// place — no full refetch on every change — so the UI feels snappy even with an
// active upload pipeline flipping rows between processing/confirmed/duplicate.
export function useReceipts(projectId?: string, limit = 50) {
  const [state, setState] = useState<State>({ status: 'loading' });
  const projectIdRef = useRef(projectId);
  projectIdRef.current = projectId;
  // Monotonic request id so a slow in-flight fetch can't overwrite a newer one
  // (e.g. when the user switches projects quickly).
  const reqSeq = useRef(0);

  const refresh = useCallback(async () => {
    const seq = ++reqSeq.current;
    const pid = projectIdRef.current;
    let query = supabase
      .from('receipts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (pid) query = query.eq('project_id', pid);
    const { data, error } = await query;
    if (seq !== reqSeq.current) return; // superseded by a newer request
    if (error) setState({ status: 'error', message: error.message });
    else setState({ status: 'ready', receipts: (data ?? []) as Receipt[] });
  }, [limit]);

  useEffect(() => {
    // Clear the previous project's rows immediately so the dashboard shows a
    // loading state for the new project instead of stale numbers, then refetch.
    setState({ status: 'loading' });
    void refresh();
  }, [projectId, refresh]);

  useEffect(() => {
    const channel = supabase
      .channel(`receipts:${projectId ?? 'all'}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'receipts',
          filter: projectId ? `project_id=eq.${projectId}` : undefined,
        },
        (payload) => {
          setState((prev) => {
            if (prev.status !== 'ready') return prev;
            const receipts = prev.receipts;
            if (payload.eventType === 'INSERT') {
              const row = payload.new as Receipt;
              if (receipts.some((r) => r.id === row.id)) return prev;
              return { status: 'ready', receipts: [row, ...receipts].slice(0, limit) };
            }
            if (payload.eventType === 'UPDATE') {
              const row = payload.new as Receipt;
              return {
                status: 'ready',
                receipts: receipts.map((r) => (r.id === row.id ? row : r)),
              };
            }
            if (payload.eventType === 'DELETE') {
              const oldRow = payload.old as { id?: string };
              return {
                status: 'ready',
                receipts: receipts.filter((r) => r.id !== oldRow.id),
              };
            }
            return prev;
          });
        },
      )
      .subscribe((status) => {
        // Realtime is an optimisation. If a browser, proxy, or Supabase
        // Realtime temporarily drops the socket, the polling fallback below
        // keeps the receipt list correct without requiring a hard refresh.
        if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT' || status === 'CLOSED') {
          void refresh();
        }
      });
    const fallbackRefresh = window.setInterval(() => {
      void refresh();
    }, 15000);
    return () => {
      window.clearInterval(fallbackRefresh);
      void supabase.removeChannel(channel);
    };
  }, [projectId, limit, refresh]);

  // Keep summaries correct immediately when a details modal deletes a receipt
  // in this browser while Realtime is still reconnecting.
  useEffect(() => {
    const removeDeletedReceipt = (event: Event) => {
      const detail = (event as CustomEvent<{ id?: string; projectId?: string }>).detail;
      if (!detail?.id || (projectId && detail.projectId && detail.projectId !== projectId)) return;
      setState((prev) => prev.status === 'ready'
        ? { status: 'ready', receipts: prev.receipts.filter((receipt) => receipt.id !== detail.id) }
        : prev);
    };
    window.addEventListener('risip:receipt-deleted', removeDeletedReceipt);
    return () => window.removeEventListener('risip:receipt-deleted', removeDeletedReceipt);
  }, [projectId]);

  return { state, refresh };
}
