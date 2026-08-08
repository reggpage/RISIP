import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { ProjectMemberRole } from '@/types/db';

export type TeamMember = {
  profile_id: string;
  full_name: string;
  role: ProjectMemberRole;   // per-project: member | leader
  globalRole: string;        // owner | accountant | worker
  balance: number;           // current petty cash balance (company-wide)
};

export type ProjectTeam = {
  members: TeamMember[];
  budget: number;            // project petty cash budget cap
  allocated: number;         // sum of allocations tagged to this project
  myRole: ProjectMemberRole | null; // current user's per-project role
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
};

// Loads a project's team: members with their per-project role, global role, and petty
// cash balance, plus the project's budget and how much has been allocated to it.
// RLS scopes reads: owner sees all; a leader sees their project's members.
export function useProjectTeam(projectId: string | undefined, myUserId: string | undefined): ProjectTeam {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [budget, setBudget] = useState(0);
  const [allocated, setAllocated] = useState(0);
  const [myRole, setMyRole] = useState<ProjectMemberRole | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    const [pmRes, projRes, allocRes] = await Promise.all([
      supabase.from('project_members').select('profile_id, role').eq('project_id', projectId),
      supabase.from('projects').select('petty_cash_budget').eq('id', projectId).maybeSingle(),
      supabase.from('petty_cash_transactions').select('amount').eq('project_id', projectId).eq('type', 'allocation').in('status', ['pending', 'accepted']),
    ]);
    if (pmRes.error) { setError(pmRes.error.message); setLoading(false); return; }

    const rows = (pmRes.data ?? []) as Array<{ profile_id: string; role: ProjectMemberRole }>;
    const ids = rows.map((r) => r.profile_id);
    setMyRole(myUserId ? (rows.find((r) => r.profile_id === myUserId)?.role ?? null) : null);
    setBudget(Number(projRes.data?.petty_cash_budget ?? 0));
    setAllocated((allocRes.data ?? []).reduce((s, t) => s + Number(t.amount || 0), 0));

    if (ids.length === 0) { setMembers([]); setError(null); setLoading(false); return; }

    const [profRes, acctRes] = await Promise.all([
      supabase.from('profiles').select('id, full_name, role').in('id', ids),
      supabase.from('petty_cash_accounts').select('user_id, current_balance').in('user_id', ids),
    ]);
    const profById = new Map((profRes.data ?? []).map((p) => [p.id as string, p]));
    const balByUser = new Map((acctRes.data ?? []).map((a) => [a.user_id as string, Number(a.current_balance)]));

    const merged: TeamMember[] = rows.map((r) => {
      const p = profById.get(r.profile_id);
      return {
        profile_id: r.profile_id,
        full_name: (p?.full_name as string) ?? '—',
        role: r.role,
        globalRole: (p?.role as string) ?? 'worker',
        balance: balByUser.get(r.profile_id) ?? 0,
      };
    }).sort((a, b) => (a.role === b.role ? a.full_name.localeCompare(b.full_name) : a.role === 'leader' ? -1 : 1));

    setMembers(merged);
    setError(null);
    setLoading(false);
  }, [projectId, myUserId]);

  useEffect(() => { void refresh(); }, [refresh]);

  return { members, budget, allocated, myRole, loading, error, refresh };
}
