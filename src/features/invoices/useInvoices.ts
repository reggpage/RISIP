import { useCallback, useEffect, useState } from 'react';
import { FunctionsHttpError } from '@supabase/supabase-js';
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

export class GenerateInvoiceError extends Error {
  reason: 'no_receipts' | 'forbidden' | 'not_found' | 'unknown';
  constructor(message: string, reason: GenerateInvoiceError['reason']) {
    super(message);
    this.reason = reason;
  }
}

export async function generateInvoice(input: {
  project_id: string;
  period_start: string;
  period_end: string;
}): Promise<{ invoice_id: string; pdf_path: string; total_amount: number; tax_amount: number; receipt_count: number }> {
  const { data, error } = await supabase.functions.invoke('generate-invoice', { body: input });
  if (error) {
    // Pull the actual reason out of the edge function's JSON body so we can show
    // a friendly Swahili message instead of "Edge Function returned a non-2xx status code".
    if (error instanceof FunctionsHttpError) {
      try {
        const body = await error.context.json();
        const message: string = body?.error ?? error.message;
        const reason: GenerateInvoiceError['reason'] =
          /no confirmed receipts/i.test(message) ? 'no_receipts'
          : /forbidden/i.test(message) ? 'forbidden'
          : /not found/i.test(message) ? 'not_found'
          : 'unknown';
        throw new GenerateInvoiceError(message, reason);
      } catch (parseErr) {
        if (parseErr instanceof GenerateInvoiceError) throw parseErr;
      }
    }
    throw error;
  }
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
