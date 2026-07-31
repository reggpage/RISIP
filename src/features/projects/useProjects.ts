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
