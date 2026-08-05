import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock, ExternalLink, Handshake, ReceiptText, XCircle } from 'lucide-react';
import Button from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/lib/auth';
import { formatDateTime, formatMoney } from '@/lib/format';
import {
  fetchSupplierClaims,
  fetchSupplierConnections,
  updateSupplierClaim,
  updateSupplierConnection,
  type SupplierClaim,
  type SupplierConnection,
} from '@/features/supplierClaims/supplierClaims';

export default function ClaimsInbox() {
  const auth = useAuth();
  const toast = useToast();
  const profile = auth.status === 'signed-in' ? auth.profile : null;
  const [connections, setConnections] = useState<SupplierConnection[]>([]);
  const [claims, setClaims] = useState<SupplierClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [missingSchema, setMissingSchema] = useState(false);

  async function refresh() {
    if (!profile) return;
    setLoading(true);
    setMissingSchema(false);
    try {
      const [nextConnections, nextClaims] = await Promise.all([
        fetchSupplierConnections(profile.company_id),
        fetchSupplierClaims(profile.company_id),
      ]);
      setConnections(nextConnections);
      setClaims(nextClaims);
    } catch (err) {
      if (isMissingSupplierSchema(err)) {
        setMissingSchema(true);
        setConnections([]);
        setClaims([]);
      } else {
      toast.error(err instanceof Error ? err.message : 'Could not load claims');
      }
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.company_id]);

  const pendingConnections = useMemo(() => connections.filter((c) => c.status === 'pending'), [connections]);

  async function approveConnection(connection: SupplierConnection) {
    if (!profile) return;
    setBusy(connection.id);
    try {
      await updateSupplierConnection(connection.id, {
        status: 'connected',
        approved_by: profile.id,
        approved_at: new Date().toISOString(),
      });
      toast.success('Supplier connected.');
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not approve');
    } finally {
      setBusy(null);
    }
  }

  async function declineConnection(connection: SupplierConnection) {
    setBusy(connection.id);
    try {
      await updateSupplierConnection(connection.id, { status: 'declined' });
      toast.success('Request declined.');
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not decline');
    } finally {
      setBusy(null);
    }
  }

  async function setClaimStatus(claim: SupplierClaim, status: SupplierClaim['status']) {
    const patch: Partial<SupplierClaim> = { status };
    if (status === 'viewed') patch.viewed_at = new Date().toISOString();
    if (status === 'paid') patch.paid_at = new Date().toISOString();
    if (status === 'received_confirmed') patch.received_confirmed_at = new Date().toISOString();

    setBusy(claim.id);
    try {
      await updateSupplierClaim(claim.id, patch);
      toast.success('Claim updated.');
      await refresh();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not update claim');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="p-6">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Supplier claims</h1>
          <p className="mt-1 text-sm text-ink-muted">Approve supplier access and track receipt-backed claims.</p>
        </div>
        <a
          href="/supplier-claims"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-lg border border-role-admin px-4 py-2 text-sm font-medium text-role-admin hover:bg-role-admin/10"
        >
          <ExternalLink className="h-4 w-4" /> Public portal
        </a>
      </div>

      {loading ? (
        <div className="h-40 animate-pulse rounded-xl bg-surface-muted" />
      ) : missingSchema ? (
        <Card className="border-amber-200 bg-amber-50 text-sm text-amber-900">
          <div className="font-semibold">Supplier claims database tables are not installed yet.</div>
          <p className="mt-2">
            Apply migration <span className="font-mono">0020_supplier_claims.sql</span>, then refresh this page.
            Until that is done Supabase returns 404 for <span className="font-mono">supplier_claims</span> and{' '}
            <span className="font-mono">supplier_connections</span>.
          </p>
          <code className="mt-3 block overflow-x-auto rounded-lg bg-white px-3 py-2 text-xs text-ink">
            supabase link --project-ref rrywprcqrxknsayzacpl{'\n'}
            supabase db push --linked
          </code>
        </Card>
      ) : (
        <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-ink">
              <Handshake className="h-4 w-4" /> Knocks
            </h2>
            <div className="flex flex-col gap-3">
              {pendingConnections.length === 0 && (
                <Card className="text-sm text-ink-muted">No pending supplier requests.</Card>
              )}
              {pendingConnections.map((connection) => (
                <Card key={connection.id} className="p-4">
                  <div className="font-semibold text-ink">{connection.supplier_name}</div>
                  <div className="mt-1 text-sm text-ink-muted">{connection.contact_name}</div>
                  {(connection.contact_email || connection.contact_phone) && (
                    <div className="mt-1 text-xs text-ink-muted">
                      {[connection.contact_email, connection.contact_phone].filter(Boolean).join(' · ')}
                    </div>
                  )}
                  {connection.note && <p className="mt-3 text-sm text-ink">{connection.note}</p>}
                  <div className="mt-4 flex gap-2">
                    <Button tint="admin" disabled={busy === connection.id} onClick={() => void approveConnection(connection)}>
                      <CheckCircle2 className="h-4 w-4" /> Approve
                    </Button>
                    <Button variant="secondary" disabled={busy === connection.id} onClick={() => void declineConnection(connection)}>
                      <XCircle className="h-4 w-4" /> Decline
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          </section>

          <section>
            <h2 className="mb-3 flex items-center gap-2 text-base font-semibold text-ink">
              <ReceiptText className="h-4 w-4" /> Claims
            </h2>
            <div className="flex flex-col gap-3">
              {claims.length === 0 && <Card className="text-sm text-ink-muted">No supplier claims yet.</Card>}
              {claims.map((claim) => (
                <Card key={claim.id} className="p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="font-semibold text-ink">{claim.title}</div>
                      <div className="mt-1 flex items-center gap-1 text-xs text-ink-muted">
                        <Clock className="h-3.5 w-3.5" /> {formatDateTime(claim.created_at)}
                      </div>
                    </div>
                    <span className="rounded-full bg-surface-muted px-2 py-1 text-xs font-medium text-ink-muted">
                      {claim.status.replaceAll('_', ' ')}
                    </span>
                  </div>
                  {claim.claim_note && <p className="mt-3 text-sm text-ink">{claim.claim_note}</p>}
                  <div className="mt-3 text-sm font-semibold text-ink">{formatMoney(claim.amount)}</div>
                  {claim.supplier_claim_receipts && claim.supplier_claim_receipts.length > 0 && (
                    <div className="mt-3 rounded-lg border border-surface-border bg-surface-muted p-3">
                      <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-ink-muted">
                        {claim.supplier_claim_receipts.length} receipt(s)
                      </div>
                      <div className="flex flex-col gap-2">
                        {claim.supplier_claim_receipts.map((receipt) => (
                          <div key={receipt.id} className="flex items-start justify-between gap-3 text-sm">
                            <div>
                              <div className="font-medium text-ink">{receipt.vendor_name || 'Receipt'}</div>
                              <div className="text-xs text-ink-muted">
                                {[receipt.receipt_date, receipt.category, receipt.image_url ? 'image attached' : null].filter(Boolean).join(' · ')}
                              </div>
                            </div>
                            <div className="font-semibold text-ink">{formatMoney(receipt.total_amount)}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  <div className="mt-4 flex flex-wrap gap-2">
                    <Button variant="secondary" disabled={busy === claim.id} onClick={() => void setClaimStatus(claim, 'viewed')}>
                      Mark viewed
                    </Button>
                    <Button variant="secondary" tint="admin" disabled={busy === claim.id} onClick={() => void setClaimStatus(claim, 'approved_for_payment')}>
                      Approve for payment
                    </Button>
                    <Button tint="admin" disabled={busy === claim.id} onClick={() => void setClaimStatus(claim, 'paid')}>
                      Mark paid
                    </Button>
                  </div>
                </Card>
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

function isMissingSupplierSchema(err: unknown): boolean {
  const asRecord = err && typeof err === 'object' ? err as Record<string, unknown> : null;
  const message = [
    err instanceof Error ? err.message : '',
    asRecord?.message,
    asRecord?.details,
    asRecord?.hint,
    asRecord?.code,
    asRecord?.status,
  ].filter(Boolean).join(' ');
  return /supplier_(claims|connections)|could not find|schema cache|404/i.test(message);
}
