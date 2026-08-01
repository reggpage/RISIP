import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Project } from '@/types/db';

type State =
  | { status: 'loading' }
  | { status: 'ready'; projects: Project[] }
  | { status: 'error'; message: string };

export function useProjects() {
  const [state, setState] = useState<State>({ status: 'loading' });

  const refresh = useCallback(async () => {
    const { data, error } = await supabase
      .from('projects')
      .select('*')
      .order('created_at', { ascending: false });
    if (error) setState({ status: 'error', message: error.message });
    else setState({ status: 'ready', projects: (data ?? []) as Project[] });
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { state, refresh };
}

export function useProject(id: string | undefined) {
  const [state, setState] = useState<
    { status: 'loading' } | { status: 'ready'; project: Project | null } | { status: 'error'; message: string }
  >({ status: 'loading' });

  const refresh = useCallback(async () => {
    if (!id) return;
    const { data, error } = await supabase.from('projects').select('*').eq('id', id).maybeSingle();
    if (error) setState({ status: 'error', message: error.message });
    else setState({ status: 'ready', project: (data ?? null) as Project | null });
  }, [id]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { state, refresh };
}

export type NewProjectInput = {
  name: string;
  site_location?: string;
  client_name?: string;
  start_date?: string;
  description?: string;
};

export async function createProject(
  input: NewProjectInput,
  ctx: { company_id: string; created_by: string },
): Promise<Project> {
  const { data, error } = await supabase
    .from('projects')
    .insert({
      company_id: ctx.company_id,
      created_by: ctx.created_by,
      name: input.name.trim(),
      site_location: input.site_location?.trim() || null,
      client_name: input.client_name?.trim() || null,
      start_date: input.start_date || null,
      description: input.description?.trim() || null,
    })
    .select('*')
    .single();
  if (error) throw error;
  return data as Project;
}

// Partial update — only send the fields the caller changed. RLS still enforces
// owner-only writes at the DB layer, so no server-side role check needed here.
export async function updateProject(id: string, patch: Partial<NewProjectInput>): Promise<Project> {
  const payload: Record<string, unknown> = {};
  if (patch.name !== undefined) payload.name = patch.name.trim();
  if (patch.site_location !== undefined) payload.site_location = patch.site_location.trim() || null;
  if (patch.client_name !== undefined) payload.client_name = patch.client_name.trim() || null;
  if (patch.start_date !== undefined) payload.start_date = patch.start_date || null;
  if (patch.description !== undefined) payload.description = patch.description.trim() || null;

  const { data, error } = await supabase
    .from('projects')
    .update(payload as Partial<Project>)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data as Project;
}

// Toggle between active/archived. Archived projects still show in lists (with badge)
// but new receipts can't target them from the worker upload chooser.
export async function setProjectStatus(id: string, status: 'active' | 'archived'): Promise<Project> {
  const { data, error } = await supabase
    .from('projects')
    .update({ status })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return data as Project;
}
