import { useMemo, useState } from 'react';
import { Building2, CheckCircle2, Search } from 'lucide-react';
import AuthShell from '@/components/layout/AuthShell';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { useCompanySearch, type CompanyHit } from '@/features/find/useCompanySearch';
import { createSupplierKnock, submitSupplierClaim } from '@/features/supplierClaims/supplierClaims';

type Mode = 'knock' | 'claim';

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

  const canKnock = useMemo(
    () => !!selectedCompany && knock.supplier_name.trim() && knock.contact_name.trim(),
    [selectedCompany, knock.supplier_name, knock.contact_name],
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
      });
      setClaimToken(token);
      toast.success('Claim submitted.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not submit claim');
    } finally {
      setBusy(false);
    }
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
              <Button tint="admin" fullWidth disabled={busy || !connectionToken.trim() || !claim.title.trim()} onClick={() => void sendClaim()}>
                {busy ? 'Submitting...' : 'Submit claim'}
              </Button>
            </>
          )}
        </div>
      )}
    </AuthShell>
  );
}
