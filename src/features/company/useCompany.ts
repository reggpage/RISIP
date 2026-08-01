import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/lib/auth';
import type { Company } from '@/types/db';

// Lightweight hook for header/nav needs — fetches the caller's company once per
// auth change. Not intended for pages that need to write (use SettingsPage's local
// state for that). Falls back to null while loading.
export function useCompany(): Company | null {
  const auth = useAuth();
  const [company, setCompany] = useState<Company | null>(null);

  const companyId = auth.status === 'signed-in' ? auth.profile?.company_id : null;

  useEffect(() => {
    if (!companyId) {
      setCompany(null);
      return;
    }
    let cancelled = false;
    void supabase
      .from('companies')
      .select('*')
      .eq('id', companyId)
      .maybeSingle()
      .then(({ data }) => {
        if (!cancelled) setCompany((data as Company) ?? null);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  return company;
}
