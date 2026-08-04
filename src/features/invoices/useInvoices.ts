import { useCallback, useEffect, useState } from 'react';
import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import type { Invoice, InvoiceLineItem, Receipt } from '@/types/db';

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

export async function deleteInvoice(id: string): Promise<void> {
  const { error } = await supabase.from('invoices').delete().eq('id', id);
  if (error) throw error;
}

export async function invoicePdfUrl(path: string, expiresIn = 60 * 10): Promise<string> {
  const { data, error } = await supabase.storage.from('invoices').createSignedUrl(path, expiresIn);
  if (error) throw error;
  return data.signedUrl;
}

// ── Digital-first invoice editing ──────────────────────────────────────────

export async function fetchInvoice(id: string): Promise<Invoice | null> {
  const { data, error } = await supabase.from('invoices').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return (data as Invoice | null) ?? null;
}

// The receipts backing an invoice (via the invoice_receipts join). These are the
// candidates the accountant can include/exclude on the canvas.
export async function fetchInvoiceReceipts(invoiceId: string): Promise<Receipt[]> {
  const { data, error } = await supabase
    .from('invoice_receipts')
    .select('receipt_id, receipts(*)')
    .eq('invoice_id', invoiceId);
  if (error) throw error;
  return (data ?? [])
    .map((row) => (row as unknown as { receipts: Receipt }).receipts)
    .filter(Boolean);
}

export type InvoicePatch = {
  invoice_number?: string;
  client_name?: string | null;
  custom_notes?: string | null;
  line_items?: InvoiceLineItem[];
  total_amount?: number;
  tax_amount?: number;
};

export async function updateInvoice(id: string, patch: InvoicePatch): Promise<void> {
  const { error } = await supabase.from('invoices').update(patch).eq('id', id);
  if (error) throw error;
}

export async function setInvoiceStatus(id: string, status: Invoice['status']): Promise<void> {
  const stamp =
    status === 'sent' ? { sent_at: new Date().toISOString() } : {};
  const { error } = await supabase.from('invoices').update({ status, ...stamp }).eq('id', id);
  if (error) throw error;
}

export function safeReceiptTax(receipt: Pick<Receipt, 'tax_amount' | 'total_amount'>): number {
  const tax = Number(receipt.tax_amount || 0);
  const total = Number(receipt.total_amount || 0);
  if (!Number.isFinite(tax) || tax < 0) return 0;
  if (total > 0 && tax > total) return 0;
  return tax;
}

// Public share URL a client opens without logging in.
export function invoicePublicUrl(publicToken: string): string {
  return `${window.location.origin}/public/invoices/${publicToken}`;
}

// ── Comments (disputes) + activity log ─────────────────────────────────────
export type InvoiceComment = {
  id: string;
  invoice_id: string;
  receipt_id: string | null;
  author_type: string;
  author_name: string | null;
  message: string;
  resolved: boolean;
  created_at: string;
};

export type InvoiceActivity = {
  id: string;
  invoice_id: string;
  event: string;
  meta: unknown;
  created_at: string;
};

export async function fetchInvoiceComments(invoiceId: string): Promise<InvoiceComment[]> {
  const { data, error } = await supabase
    .from('invoice_comments')
    .select('*')
    .eq('invoice_id', invoiceId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as InvoiceComment[];
}

export async function resolveComment(id: string): Promise<void> {
  const { error } = await supabase.from('invoice_comments').update({ resolved: true }).eq('id', id);
  if (error) throw error;
}

export async function fetchInvoiceActivity(invoiceId: string): Promise<InvoiceActivity[]> {
  const { data, error } = await supabase
    .from('invoice_activity')
    .select('*')
    .eq('invoice_id', invoiceId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []) as InvoiceActivity[];
}
