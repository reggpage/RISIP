import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { AppNotification } from '@/types/db';

type State =
  | { status: 'loading'; notifications: AppNotification[] }
  | { status: 'ready'; notifications: AppNotification[] }
  | { status: 'error'; notifications: AppNotification[]; message: string };

export function useNotifications(userId?: string) {
  const [state, setState] = useState<State>({ status: 'loading', notifications: [] });
  const channelSuffix = useRef(Math.random().toString(36).slice(2));

  const refresh = useCallback(async () => {
    if (!userId) {
      setState({ status: 'ready', notifications: [] });
      return;
    }
    const { data, error } = await supabase
      .from('app_notifications')
      .select('*')
      .eq('recipient_id', userId)
      .order('created_at', { ascending: false })
      .limit(20);
    if (error) {
      setState({ status: 'error', notifications: [], message: error.message });
    } else {
      setState({ status: 'ready', notifications: (data ?? []) as AppNotification[] });
    }
  }, [userId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    if (!userId) return;
    const channel = supabase
      .channel(`notifications-${userId}-${channelSuffix.current}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'app_notifications', filter: `recipient_id=eq.${userId}` },
        () => void refresh(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [refresh, userId]);

  const unreadCount = useMemo(
    () => state.notifications.filter((n) => !n.read_at).length,
    [state.notifications],
  );

  return { state, unreadCount, refresh };
}

export async function markNotificationRead(id: string): Promise<void> {
  const { error } = await supabase
    .from('app_notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}

export async function respondToPettyCashRequest(transactionId: string, accept: boolean): Promise<'accepted' | 'declined'> {
  const { data, error } = await supabase.rpc('respond_to_petty_cash_request', {
    p_transaction: transactionId,
    p_accept: accept,
  });
  if (error) throw error;
  return data as 'accepted' | 'declined';
}

export async function createNotifications(
  rows: Array<{
    company_id: string;
    recipient_id: string;
    actor_id: string;
    type: string;
    title: string;
    body?: string | null;
    metadata?: unknown;
  }>,
): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await supabase.from('app_notifications').insert(rows);
  if (error) throw error;
}
