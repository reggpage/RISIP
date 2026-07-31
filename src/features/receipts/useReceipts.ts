import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Receipt } from '@/types/db';

type State =
  | { status: 'loading' }
  | { status: 'ready'; receipts: Receipt[] }
  | { status: 'error'; message: string };

// Streams receipts scoped by RLS + an optional project filter. Subscribes to realtime
// changes so uploads flip from processing → confirmed live.
export function useReceipts(projectId?: string, limit = 50) {
  const [state, setState] = useState<State>({ status: 'loading' });

  const refresh = useCallback(async () => {
    let query = supabase
      .from('receipts')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);
    if (projectId) query = query.eq('project_id', projectId);
    const { data, error } = await query;
    if (error) setState({ status: 'error', message: error.message });
    else setState({ status: 'ready', receipts: (data ?? []) as Receipt[] });
  }, [projectId, limit]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

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
        () => {
          void refresh();
        },
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [projectId, refresh]);

  return { state, refresh };
}
