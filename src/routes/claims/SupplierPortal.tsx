import { useMemo, useState } from 'react';
import { Building2, CheckCircle2, Copy, FileUp, Plus, Search, Trash2 } from 'lucide-react';
import AuthShell from '@/components/layout/AuthShell';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { useCompanySearch, type CompanyHit } from '@/features/find/useCompanySearch';
import { createSupplierKnock, submitSupplierClaim } from '@/features/supplierClaims/supplierClaims';

type Mode = 'knock' | 'claim';
type ReceiptDraft = {
  id: string;
  vendor_name: string;
  receipt_date: string;
  total_amount: string;
  tax_amount: string;
  category: string;
  verification_code: string;
  note: string;
  file: File | null;
};

const categories = ['Fuel', 'Food', 'Transport', 'Materials', 'Utilities', 'Other'];

export default function SupplierPortal() {
  const toast = useToast();
  const params = new URLSearchParams(window.location.search);
  const [mode, setMode] = useState<Mode>(params.get('token') ? 'claim' : 'knock');
  const [query, setQuery] = useState('');
  const [selectedCompany, setSelectedCompany] = useState<CompanyHit | null>(null);
  const { results, loading } = useCompanySearch(query);
  const [busy, setBusy] = useState(false);
  const [connectionToken, setConnectionToken] = useState(params.get('token') ?? '');
  const [claimToken, setClaimToken] = useState<string | null>(null);
  const [knockToken, setKnockToken] = useState<string | null>(null);

  const [knock, setKnock] = useState({
    supplier_name: '',
    contact_name: '',
    contact_email: '',
    contact_phone: '',
    supplier_tin: '',
    note: '',
  });

  const [claim, setClaim] = useState({
    title: '',
    amount: '',
    note: '',
  });
  const [receipts, setReceipts] = useState<ReceiptDraft[]>([emptyReceipt()]);

  const canKnock = useMemo(
    () => !!selectedCompany && knock.supplier_name.trim() && knock.contact_name.trim(),
    [selectedCompany, knock.supplier_name, knock.contact_name],
  );
  const canClaim = useMemo(
    () => connectionToken.trim() && claim.title.trim() && receipts.some((receipt) => receipt.vendor_name.trim() || receipt.total_amount.trim() || receipt.file),
    [claim.title, connectionToken, receipts],
  );

  async function sendKnock() {
    if (!selectedCompany || !canKnock) return;
    setBusy(true);
    try {
      const token = await createSupplierKnock({
        target_company_id: selectedCompany.id,
        ...knock,
      });
      setKnockToken(token);
      setConnectionToken(token ?? '');
      toast.success('Request sent.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not send request');
    } finally {
      setBusy(false);
    }
  }

  async function sendClaim() {
    setBusy(true);
    try {
      const amount = claim.amount.trim() ? Number(claim.amount.replace(/[^\d.]/g, '')) : null;
      const token = await submitSupplierClaim({
        connection_token: connectionToken.trim(),
        title: claim.title,
        claim_note: claim.note,
        amount,
        receipts: await Promise.all(
          receipts
            .filter((receipt) => receipt.vendor_name.trim() || receipt.total_amount.trim() || receipt.file)
            .map(async (receipt) => ({
              vendor_name: receipt.vendor_name,
              receipt_date: receipt.receipt_date,
              total_amount: toAmount(receipt.total_amount),
              tax_amount: toAmount(receipt.tax_amount),
              category: receipt.category,
              verification_code: receipt.verification_code,
              note: receipt.note,
              file_name: receipt.file?.name,
              file_type: receipt.file?.type,
              file_base64: receipt.file ? await fileToBase64(receipt.file) : undefined,
            })),
        ),
      });
      setClaimToken(token);
      toast.success('Claim submitted.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not submit claim');
    } finally {
      setBusy(false);
    }
  }

  function updateReceipt(id: string, patch: Partial<ReceiptDraft>) {
    setReceipts((current) => current.map((receipt) => receipt.id === id ? { ...receipt, ...patch } : receipt));
  }

  function removeReceipt(id: string) {
    setReceipts((current) => current.length === 1 ? current : current.filter((receipt) => receipt.id !== id));
  }

  return (
    <AuthShell>
      <div className="mb-6 text-center">
        <h1 className="text-2xl font-semibold text-ink">Supplier claims</h1>
        <p className="mt-1 text-sm text-ink-muted">Send receipts and payment claims to a company using Risip.</p>
      </div>

      <div className="mb-5 grid grid-cols-2 gap-1 rounded-lg bg-surface-muted p-1 text-sm">
        <button
          type="button"
          onClick={() => setMode('knock')}
          className={`rounded-md px-3 py-2 font-medium transition ${mode === 'knock' ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted hover:text-ink'}`}
        >
          Request access
        </button>
        <button
          type="button"
          onClick={() => setMode('claim')}
          className={`rounded-md px-3 py-2 font-medium transition ${mode === 'claim' ? 'bg-surface text-ink shadow-sm' : 'text-ink-muted hover:text-ink'}`}
        >
          Submit claim
        </button>
      </div>

      {mode === 'knock' ? (
        <div className="flex flex-col gap-4">
          {knockToken ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
              <div className="mb-1 flex items-center gap-2 font-semibold">
                <CheckCircle2 className="h-4 w-4" /> Request sent
              </div>
              Save this access token. Once the company approves you, use it in “Submit claim”.
              <div className="mt-2 rounded bg-white px-3 py-2 font-mono text-ink">{knockToken}</div>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button
                  variant="secondary"
                  onClick={() => {
                    void navigator.clipboard.writeText(knockToken);
                    toast.success('Token copied.');
                  }}
                >
                  <Copy className="h-4 w-4" /> Copy token
                </Button>
                <Button tint="admin" onClick={() => setMode('claim')}>
                  Use token to submit claim
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" />
                <input
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setSelectedCompany(null);
                  }}
                  placeholder="Search company..."
                  className="w-full rounded-lg border border-surface-border bg-surface py-2 pl-9 pr-3 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-role-admin/30"
                />
              </div>

              {!selectedCompany && query.trim().length > 1 && (
                <div className="flex max-h-44 flex-col gap-2 overflow-y-auto">
                  {loading && <p className="text-sm text-ink-muted">Searching...</p>}
                  {results.map((company) => (
                    <button
                      type="button"
                      key={company.id}
                      onClick={() => setSelectedCompany(company)}
                      className="flex items-center gap-3 rounded-lg border border-surface-border px-3 py-2 text-left hover:bg-surface-muted"
                    >
                      <Building2 className="h-4 w-4 text-role-admin" />
                      <span className="text-sm font-medium text-ink">{company.name}</span>
                    </button>
                  ))}
                </div>
              )}

              {selectedCompany && (
                <div className="rounded-lg border border-surface-border bg-surface-muted px-3 py-2 text-sm text-ink">
                  Sending to <span className="font-semibold">{selectedCompany.name}</span>
                </div>
              )}

              <Input label="Business name" value={knock.supplier_name} onChange={(e) => setKnock({ ...knock, supplier_name: e.target.value })} />
              <Input label="Contact person" value={knock.contact_name} onChange={(e) => setKnock({ ...knock, contact_name: e.target.value })} />
              <Input label="Email" type="email" value={knock.contact_email} onChange={(e) => setKnock({ ...knock, contact_email: e.target.value })} />
              <Input label="Phone" value={knock.contact_phone} onChange={(e) => setKnock({ ...knock, contact_phone: e.target.value })} />
              <Input label="TIN" value={knock.supplier_tin} onChange={(e) => setKnock({ ...knock, supplier_tin: e.target.value })} />
              <label className="flex flex-col gap-1 text-sm font-medium text-ink">
                Note
                <textarea
                  value={knock.note}
                  onChange={(e) => setKnock({ ...knock, note: e.target.value })}
                  rows={3}
                  className="rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-role-admin/30"
                />
              </label>
              <Button tint="admin" fullWidth disabled={busy || !canKnock} onClick={() => void sendKnock()}>
                {busy ? 'Sending...' : 'Knock / request access'}
              </Button>
            </>
          )}
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          {claimToken ? (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-800">
              <div className="mb-1 flex items-center gap-2 font-semibold">
                <CheckCircle2 className="h-4 w-4" /> Claim submitted
              </div>
              Claim tracking token:
              <div className="mt-2 rounded bg-white px-3 py-2 font-mono text-ink">{claimToken}</div>
            </div>
          ) : (
            <>
              <Input label="Approved connection token" value={connectionToken} onChange={(e) => setConnectionToken(e.target.value)} />
              <Input label="Claim title" value={claim.title} onChange={(e) => setClaim({ ...claim, title: e.target.value })} />
              <Input label="Amount" inputMode="decimal" value={claim.amount} onChange={(e) => setClaim({ ...claim, amount: e.target.value })} />
              <label className="flex flex-col gap-1 text-sm font-medium text-ink">
                Message / notes
                <textarea
                  value={claim.note}
                  onChange={(e) => setClaim({ ...claim, note: e.target.value })}
                  rows={4}
                  className="rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-role-admin/30"
                />
              </label>
              <div className="rounded-xl border border-surface-border">
                <div className="flex items-center justify-between gap-3 border-b border-surface-border px-4 py-3">
                  <div>
                    <div className="font-semibold text-ink">Receipts</div>
                    <div className="text-xs text-ink-muted">Add up to 5 receipt images or details.</div>
                  </div>
                  <Button
                    variant="secondary"
                    disabled={receipts.length >= 5}
                    onClick={() => setReceipts((current) => [...current, emptyReceipt()])}
                  >
                    <Plus className="h-4 w-4" /> Add
                  </Button>
                </div>
                <div className="flex flex-col gap-4 p-4">
                  {receipts.map((receipt, index) => (
                    <div key={receipt.id} className="rounded-lg border border-surface-border bg-surface-muted p-3">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div className="text-sm font-semibold text-ink">Receipt {index + 1}</div>
                        <button
                          type="button"
                          onClick={() => removeReceipt(receipt.id)}
                          className="rounded-md p-1 text-ink-muted hover:bg-surface hover:text-role-admin"
                          aria-label="Remove receipt"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      <label className="mb-3 flex cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-surface-border bg-surface px-3 py-3 text-sm font-medium text-ink hover:border-role-admin">
                        <FileUp className="h-4 w-4" />
                        <span>{receipt.file ? receipt.file.name : 'Receipt image or PDF'}</span>
                        <input
                          type="file"
                          accept="image/*,application/pdf"
                          className="hidden"
                          onChange={(event) => updateReceipt(receipt.id, { file: event.target.files?.[0] ?? null })}
                        />
                      </label>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <Input label="Vendor" value={receipt.vendor_name} onChange={(e) => updateReceipt(receipt.id, { vendor_name: e.target.value })} />
                        <Input label="Date" type="date" value={receipt.receipt_date} onChange={(e) => updateReceipt(receipt.id, { receipt_date: e.target.value })} />
                        <label className="flex flex-col gap-1 text-sm font-medium text-ink">
                          Category
                          <select
                            value={receipt.category}
                            onChange={(e) => updateReceipt(receipt.id, { category: e.target.value })}
                            className="rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-role-admin/30"
                          >
                            {categories.map((category) => <option key={category}>{category}</option>)}
                          </select>
                        </label>
                        <Input label="Total" inputMode="decimal" value={receipt.total_amount} onChange={(e) => updateReceipt(receipt.id, { total_amount: e.target.value })} />
                        <Input label="VAT" inputMode="decimal" value={receipt.tax_amount} onChange={(e) => updateReceipt(receipt.id, { tax_amount: e.target.value })} />
                        <Input label="Verification code" value={receipt.verification_code} onChange={(e) => updateReceipt(receipt.id, { verification_code: e.target.value })} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              <Button tint="admin" fullWidth disabled={busy || !canClaim} onClick={() => void sendClaim()}>
                {busy ? 'Submitting...' : 'Submit claim'}
              </Button>
            </>
          )}
        </div>
      )}
    </AuthShell>
  );
}

function emptyReceipt(): ReceiptDraft {
  return {
    id: crypto.randomUUID(),
    vendor_name: '',
    receipt_date: '',
    total_amount: '',
    tax_amount: '',
    category: 'Other',
    verification_code: '',
    note: '',
    file: null,
  };
}

function toAmount(value: string): number | null {
  const amount = Number(value.replace(/[^\d.]/g, ''));
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
