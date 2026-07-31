import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { generateInviteToken } from '@/lib/tokens';
import type { InviteLink, InviteRole } from '@/types/db';

type State =
  | { status: 'loading' }
  | { status: 'ready'; links: InviteLink[] }
  | { status: 'error'; message: string };

export function useInviteLinks(projectId: string | undefined) {
  const [state, setState] = useState<State>({ status: 'loading' });

  const refresh = useCallback(async () => {
    if (!projectId) return;
    const { data, error } = await supabase
      .from('invite_links')
      .select('*')
      .eq('project_id', projectId)
      .order('created_at', { ascending: false });
    if (error) setState({ status: 'error', message: error.message });
    else setState({ status: 'ready', links: (data ?? []) as InviteLink[] });
  }, [projectId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { state, refresh };
}

export async function createInviteLink(
  projectId: string,
  role: InviteRole,
  createdBy: string,
): Promise<InviteLink> {
  const { data, error } = await supabase
    .from('invite_links')
    .insert({
      project_id: projectId,
      role,
      token: generateInviteToken(),
      created_by: createdBy,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as InviteLink;
}

// Soft-revoke: keep the row for audit, but stamp revoked_at so the join page rejects it.
export async function revokeInviteLink(id: string): Promise<void> {
  const { error } = await supabase
    .from('invite_links')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', id);
  if (error) throw error;
}
