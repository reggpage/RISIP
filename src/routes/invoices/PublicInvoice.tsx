import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import InvoiceView from '@/components/invoices/InvoiceView';
import { useToast } from '@/components/ui/Toast';
import type { InvoiceLineItem } from '@/types/db';

type PublicPayload = {
  found: boolean;
  invoice?: {
    id: string;
    invoice_number: string | null;
    status: string;
    client_name: string | null;
    custom_notes: string | null;
    signature_url: string | null;
    period_start: string;
    period_end: string;
    total_amount: number;
    tax_amount: number;
    line_items: InvoiceLineItem[] | null;
  };
  company?: { name: string; logo_url: string | null; hq_location: string };
  project?: { name: string; site_location: string | null };
  receipts?: Array<{
    id: string;
    vendor_name: string | null;
    vendor_tin: string | null;
    vendor_vrn: string | null;
    category: string | null;
    verification_code: string | null;
    receipt_date: string | null;
    total_amount: number | null;
    tax_amount: number | null;
    image_url: string | null;
  }>;
};

// Public, no-login invoice page opened by the client via the secure token link.
export default function PublicInvoice() {
  const { token } = useParams<{ token: string }>();
  const toast = useToast();
  const [payload, setPayload] = useState<PublicPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) return;
    // Log that the client opened the invoice (throttled server-side).
    void supabase.rpc('public_invoice_log_view', { p_token: token });
    void supabase.rpc('get_public_invoice', { p_token: token }).then(({ data, error }) => {
      setLoading(false);
      if (error) return;
      setPayload(data as unknown as PublicPayload);
    });
  }, [token]);

  async function disputeReceipt(receiptId: string, message: string) {
    if (!token) return;
    const { data, error } = await supabase.rpc('public_invoice_dispute', {
      p_token: token,
      p_receipt_id: receiptId,
      p_message: message,
    });
    if (error || !data) {
      toast.error('Could not submit your issue.');
      return;
    }
    toast.success('Issue reported. Thank you.');
  }

  const computed = useMemo(() => {
    if (!payload?.invoice || !payload.receipts) return null;
    const recById = new Map(payload.receipts.map((r) => [r.id, r]));
    const items = (payload.invoice.line_items ?? []).map((li) => {
      const recs = li.receiptIds.map((id) => recById.get(id)).filter(Boolean) as NonNullable<PublicPayload['receipts']>;
      const total = recs.reduce((s, r) => s + Number(r.total_amount || 0), 0);
      const tax = recs.reduce((s, r) => s + Number(r.tax_amount || 0), 0);
      return { ...li, total, tax, net: total - tax };
    });
    const total = items.reduce((s, i) => s + i.total, 0);
    const tax = items.reduce((s, i) => s + i.tax, 0);
    return { items, totals: { total, tax, net: total - tax } };
  }, [payload]);

  async function respond(action: 'accept' | 'dispute') {
    if (!token) return;
    let note: string | undefined;
    if (action === 'dispute') {
      note = window.prompt('What is the issue?') ?? undefined;
      if (note === undefined) return;
    }
    const { data, error } = await supabase.rpc('public_invoice_respond', {
      p_token: token,
      p_action: action,
      p_note: note ?? null,
    });
    if (error || !data) {
      toast.error('Could not submit your response.');
      return;
    }
    toast.success(action === 'accept' ? 'Invoice accepted. Thank you!' : 'Dispute submitted.');
    // Refresh status.
    void supabase.rpc('get_public_invoice', { p_token: token }).then(({ data }) => setPayload(data as unknown as PublicPayload));
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <div className="h-96 animate-pulse rounded-xl bg-surface-muted" />
      </div>
    );
  }
  if (!payload?.found || !payload.invoice || !computed) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-center">
        <div>
          <h1 className="text-xl font-semibold text-ink">Invoice not found</h1>
          <p className="mt-2 text-sm text-ink-muted">This link may be invalid or expired.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-surface-muted py-6">
      <div className="mx-auto max-w-3xl px-4">
        <div className="mb-4 text-center text-lg font-bold text-role-admin">Risip</div>
        <InvoiceView
          invoice={payload.invoice as never}
          lineItems={computed.items}
          totals={computed.totals}
          receipts={payload.receipts ?? []}
          company={payload.company}
          project={payload.project ?? undefined}
          onRespond={(a) => void respond(a)}
          onDisputeReceipt={(id, msg) => void disputeReceipt(id, msg)}
          authed={false}
          publicToken={token}
        />
      </div>
    </div>
  );
}
