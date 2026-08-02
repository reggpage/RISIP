import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

export type CompanyHit = { id: string; name: string; logo_url: string | null };

// Debounced client-side search. Calls search_companies RPC (anon) — returns id + name only.
export function useCompanySearch(query: string, delayMs = 250) {
  const [results, setResults] = useState<CompanyHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setError(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setLoading(true);
      const { data, error } = await supabase.rpc('search_companies', { q });
      if (cancelled) return;
      setLoading(false);
      if (error) {
        setError(error.message);
        setResults([]);
      } else {
        setError(null);
        setResults((data ?? []) as CompanyHit[]);
      }
    }, delayMs);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query, delayMs]);

  return { results, loading, error };
}
