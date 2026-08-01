import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Eye, Loader2, Send, Signature } from 'lucide-react';
import Button from '@/components/ui/Button';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import Input from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import SignaturePad from '@/components/invoices/SignaturePad';
import InvoiceView from '@/components/invoices/InvoiceView';
import {
  fetchInvoice,
  fetchInvoiceReceipts,
  invoicePublicUrl,
  setInvoiceStatus,
  updateInvoice,
} from '@/features/invoices/useInvoices';
import { useAuth } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import { formatDate, formatMoney } from '@/lib/format';
import type { Invoice, InvoiceLineItem, Receipt } from '@/types/db';

type Tab = 'edit' | 'view';

// The simplified invoice canvas. Two tabs: Edit (accountant tweaks fields + which
// receipts are included) and View (how the client sees it, with the audit trail).
export default function InvoiceEditor() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const auth = useAuth();
  const profile = auth.status === 'signed-in' ? auth.profile : null;
  const isOwner = profile?.role === 'owner';

  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [receipts, setReceipts] = useState<Receipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>('edit');
  const [busy, setBusy] = useState<string | null>(null);
  const [signing, setSigning] = useState(false);

  // Editable fields
  const [invoiceNumber, setInvoiceNumber] = useState('');
  const [clientName, setClientName] = useState('');
  const [notes, setNotes] = useState('');
  const [included, setIncluded] = useState<Set<string>>(new Set());
  const [descriptions, setDescriptions] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    (async () => {
      try {
        const [inv, recs] = await Promise.all([fetchInvoice(id), fetchInvoiceReceipts(id)]);
        if (cancelled) return;
        setInvoice(inv);
        setReceipts(recs);
        if (inv) {
          setInvoiceNumber(inv.invoice_number ?? '');
          setClientName(inv.client_name ?? '');
          setNotes(inv.custom_notes ?? '');
          // Seed included set: from saved line_items, else all receipts.
          const savedIds = inv.line_items?.flatMap((li) => li.receiptIds) ?? recs.map((r) => r.id);
          setIncluded(new Set(savedIds));
          const descs: Record<string, string> = {};
          for (const li of inv.line_items ?? []) descs[li.category] = li.description;
          setDescriptions(descs);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  // Dynamic re-calculation from included receipts, grouped by category.
  const { lineItems, totals } = useMemo(() => {
    const byCat = new Map<string, Receipt[]>();
    for (const r of receipts) {
      if (!included.has(r.id)) continue;
      const key = r.category ?? 'Other';
      byCat.set(key, [...(byCat.get(key) ?? []), r]);
    }
    const items: (InvoiceLineItem & { total: number; tax: number; net: number })[] = [];
    let gTotal = 0;
    let gTax = 0;
    for (const [category, recs] of byCat) {
      const total = recs.reduce((s, r) => s + Number(r.total_amount || 0), 0);
      const tax = recs.reduce((s, r) => s + Number(r.tax_amount || 0), 0);
      gTotal += total;
      gTax += tax;
      items.push({
        category,
        description: descriptions[category] ?? category,
        receiptIds: recs.map((r) => r.id),
        total,
        tax,
        net: total - tax,
      });
    }
    return { lineItems: items, totals: { total: gTotal, tax: gTax, net: gTotal - gTax } };
  }, [receipts, included, descriptions]);

  function toggle(id: string) {
    setIncluded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function save(): Promise<boolean> {
    if (!invoice) return false;
    setBusy('save');
    try {
      const line_items: InvoiceLineItem[] = lineItems.map((li) => ({
        category: li.category,
        description: li.description,
        receiptIds: li.receiptIds,
      }));
      await updateInvoice(invoice.id, {
        invoice_number: invoiceNumber.trim() || invoice.invoice_number || undefined,
        client_name: clientName.trim() || null,
        custom_notes: notes.trim() || null,
        line_items,
        total_amount: totals.total,
        tax_amount: totals.tax,
      });
      toast.success('Saved.');
      return true;
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Save failed');
      return false;
    } finally {
      setBusy(null);
    }
  }

  async function submitForApproval() {
    if (!invoice) return;
    if (!(await save())) return;
    setBusy('submit');
    try {
      await setInvoiceStatus(invoice.id, 'pending_approval');
      setInvoice({ ...invoice, status: 'pending_approval' });
      toast.success('Submitted for approval.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    } finally {
      setBusy(null);
    }
  }

  async function handleSigned(dataUrl: string) {
    if (!invoice) return;
    setBusy('sign');
    try {
      // Upload the signature PNG to the invoices bucket, then approve.
      const blob = await (await fetch(dataUrl)).blob();
      const path = `${invoice.project_id}/signatures/${invoice.id}.png`;
      const { error: upErr } = await supabase.storage
        .from('invoices')
        .upload(path, blob, { contentType: 'image/png', upsert: true });
      if (upErr) throw upErr;
      const { data: signed } = await supabase.storage.from('invoices').createSignedUrl(path, 60 * 60 * 24 * 365);
      await updateInvoice(invoice.id, {} as never);
      await supabase
        .from('invoices')
        .update({
          status: 'approved',
          signature_url: signed?.signedUrl ?? path,
          signed_by: profile?.id,
          signed_at: new Date().toISOString(),
        })
        .eq('id', invoice.id);
      setInvoice({ ...invoice, status: 'approved', signature_url: signed?.signedUrl ?? path });
      setSigning(false);
      toast.success('Approved & signed.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Signing failed');
    } finally {
      setBusy(null);
    }
  }

  async function sendToClient() {
    if (!invoice) return;
    setBusy('send');
    try {
      await setInvoiceStatus(invoice.id, 'sent');
      const url = invoicePublicUrl(invoice.public_token);
      try {
        await navigator.clipboard.writeText(url);
        toast.success('Live link copied to clipboard.');
      } catch {
        toast.info(url);
      }
      setInvoice({ ...invoice, status: 'sent' });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed');
    } finally {
      setBusy(null);
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-4xl p-6">
        <div className="mb-4 h-8 w-40 animate-pulse rounded-lg bg-surface-muted" />
        <div className="h-64 animate-pulse rounded-xl bg-surface-muted" />
      </div>
    );
  }
  if (!invoice) {
    return <div className="p-8 text-ink-muted">Invoice not found.</div>;
  }

  const canEdit = invoice.status === 'draft' || invoice.status === 'pending_approval';

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6">
      <Link to="/invoices" className="mb-4 inline-flex items-center gap-1 text-sm text-ink-muted hover:text-ink">
        <ArrowLeft className="h-4 w-4" /> Back to invoices
      </Link>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink">
            {invoiceNumber || invoice.invoice_number || 'Invoice'}
          </h1>
          <p className="text-sm text-ink-muted">
            {formatDate(invoice.period_start)} — {formatDate(invoice.period_end)} · {statusLabel(invoice.status)}
          </p>
        </div>

        {/* Tab switch */}
        <div className="inline-flex rounded-lg border border-surface-border bg-surface p-0.5 text-sm">
          <TabBtn active={tab === 'edit'} onClick={() => setTab('edit')} disabled={!canEdit}>Edit</TabBtn>
          <TabBtn active={tab === 'view'} onClick={() => setTab('view')}>
            <Eye className="mr-1 inline h-3.5 w-3.5" /> View
          </TabBtn>
        </div>
      </div>

      {tab === 'edit' && canEdit ? (
        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader><CardTitle>Invoice header</CardTitle></CardHeader>
            <div className="grid gap-3 sm:grid-cols-2">
              <Input label="Invoice number" value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} />
              <Input label="Client name" value={clientName} onChange={(e) => setClientName(e.target.value)} placeholder="e.g. Wizara ya Maji" />
            </div>
          </Card>

          <Card>
            <CardHeader><CardTitle>Line items</CardTitle></CardHeader>
            <p className="mb-3 text-xs text-ink-muted">
              Untick a receipt to drop it from this invoice. Totals recalculate instantly.
            </p>
            <div className="flex flex-col gap-4">
              {lineItems.length === 0 && <p className="text-sm text-ink-muted">No receipts included.</p>}
              {Array.from(new Set(receipts.map((r) => r.category ?? 'Other'))).map((cat) => {
                const catReceipts = receipts.filter((r) => (r.category ?? 'Other') === cat);
                return (
                  <div key={cat} className="rounded-lg border border-surface-border p-3">
                    <input
                      className="mb-2 w-full rounded border-none bg-transparent text-sm font-semibold text-ink focus:outline-none"
                      value={descriptions[cat] ?? cat}
                      onChange={(e) => setDescriptions((d) => ({ ...d, [cat]: e.target.value }))}
                    />
                    <div className="flex flex-col gap-1">
                      {catReceipts.map((r) => (
                        <label key={r.id} className="flex items-center justify-between gap-2 text-sm">
                          <span className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              checked={included.has(r.id)}
                              onChange={() => toggle(r.id)}
                              className="accent-role-admin"
                            />
                            <span className="text-ink">{r.vendor_name ?? '—'}</span>
                          </span>
                          <span className="tabular-nums text-ink-muted">{formatMoney(r.total_amount)}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 flex flex-col gap-1 border-t border-surface-border pt-3 text-sm">
              <Row label="Net" value={formatMoney(totals.net)} />
              <Row label="VAT" value={formatMoney(totals.tax)} />
              <Row label="Total" value={formatMoney(totals.total)} strong />
            </div>
          </Card>

          <Card>
            <CardHeader><CardTitle>Notes & terms</CardTitle></CardHeader>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={4}
              placeholder="Payment terms, bank details, thank-you note…"
              className="w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-role-admin/30"
            />
          </Card>

          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" tint="admin" disabled={busy !== null} onClick={() => void save()}>
              {busy === 'save' && <Loader2 className="h-4 w-4 animate-spin" />} Save draft
            </Button>
            {invoice.status === 'draft' && (
              <Button tint="admin" disabled={busy !== null} onClick={() => void submitForApproval()}>
                {busy === 'submit' && <Loader2 className="h-4 w-4 animate-spin" />} Submit for approval
              </Button>
            )}
          </div>
        </div>
      ) : (
        // View mode — how the client sees it.
        <>
          <InvoiceView
            invoice={{ ...invoice, invoice_number: invoiceNumber, client_name: clientName, custom_notes: notes }}
            lineItems={lineItems}
            totals={totals}
            receipts={receipts.filter((r) => included.has(r.id))}
          />

          {/* Lifecycle actions in view mode */}
          <div className="mt-4 flex flex-wrap gap-2">
            {isOwner && invoice.status === 'pending_approval' && (
              <Button tint="admin" onClick={() => setSigning(true)}>
                <Signature className="h-4 w-4" /> Approve & Sign
              </Button>
            )}
            {invoice.status === 'approved' && (
              <Button tint="admin" disabled={busy !== null} onClick={() => void sendToClient()}>
                {busy === 'send' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Send to Client
              </Button>
            )}
            {invoice.status === 'sent' && (
              <Button variant="secondary" tint="admin" onClick={() => void sendToClient()}>
                <Send className="h-4 w-4" /> Copy live link again
              </Button>
            )}
          </div>
        </>
      )}

      {signing && (
        <SignaturePad
          busy={busy === 'sign'}
          onCancel={() => setSigning(false)}
          onSign={(url) => void handleSigned(url)}
        />
      )}
    </div>
  );
}

function statusLabel(s: Invoice['status']): string {
  return {
    draft: 'Draft',
    pending_approval: 'Pending approval',
    approved: 'Approved',
    sent: 'Sent to client',
    accepted: 'Accepted by client',
    disputed: 'Disputed',
  }[s];
}

function TabBtn({ active, onClick, disabled, children }: { active: boolean; onClick: () => void; disabled?: boolean; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={
        'rounded-md px-3 py-1.5 font-medium transition disabled:opacity-40 ' +
        (active ? 'bg-role-admin/10 text-role-admin' : 'text-ink-muted hover:text-ink')
      }
    >
      {children}
    </button>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-baseline justify-between">
      <span className="text-ink-muted">{label}</span>
      <span className={`font-display tabular-nums ${strong ? 'text-lg font-semibold text-ink' : 'text-ink'}`}>{value}</span>
    </div>
  );
}
