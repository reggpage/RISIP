import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Invoice } from '@/types/db';

type State =
  | { status: 'loading' }
  | { status: 'ready'; invoices: Invoice[] }
  | { status: 'error'; message: string };

export function useInvoices(projectId?: string) {
  const [state, setState] = useState<State>({ status: 'loading' });

  const refresh = useCallback(async () => {
    let q = supabase.from('invoices').select('*').order('created_at', { ascending: false });
    if (projectId) q = q.eq('project_id', projectId);
    const { data, error } = await q;
    if (error) setState({ status: 'error', message: error.message });
    else setState({ status: 'ready', invoices: (data ?? []) as Invoice[] });
  }, [projectId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return { state, refresh };
}

export async function generateInvoice(input: {
  project_id: string;
  period_start: string;
  period_end: string;
}): Promise<{ invoice_id: string; pdf_path: string; total_amount: number; tax_amount: number; receipt_count: number }> {
  const { data, error } = await supabase.functions.invoke('generate-invoice', { body: input });
  if (error) throw error;
  return data;
}

export async function markInvoiceSent(id: string) {
  const { error } = await supabase.from('invoices').update({ status: 'sent' }).eq('id', id);
  if (error) throw error;
}

export async function invoicePdfUrl(path: string, expiresIn = 60 * 10): Promise<string> {
  const { data, error } = await supabase.storage.from('invoices').createSignedUrl(path, expiresIn);
  if (error) throw error;
  return data.signedUrl;
}
