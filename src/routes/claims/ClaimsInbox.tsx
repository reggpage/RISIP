import { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, Clock, ExternalLink, Handshake, ReceiptText, XCircle } from 'lucide-react';
import Button from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/lib/auth';
import { friendlyError } from '@/lib/errors';
import { formatDateTime, formatMoney } from '@/lib/format';
import {
  confirmSupplierClaimReceived,
  decideSupplierClaim,
  fetchSupplierClaims,
  fetchSupplierConnections,
  markSupplierClaimPaid,
  updateSupplierConnection,
  type SupplierClaim,
  type SupplierClaimPaymentMethod,
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
        toast.error(friendlyError(err, 'Could not load claims'));
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
      toast.error(friendlyError(err, 'Could not approve'));
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
      toast.error(friendlyError(err, 'Could not decline'));
    } finally {
      setBusy(null);
    }
  }

  async function decideClaim(claim: SupplierClaim, action: 'viewed' | 'approve' | 'dispute', reason?: string) {
    setBusy(claim.id);
    try {
      await decideSupplierClaim(claim.id, action, reason);
      toast.success('Claim updated.');
      await refresh();
    } catch (err) {
      toast.error(friendlyError(err, 'Could not update claim'));
    } finally {
      setBusy(null);
    }
  }

  async function markPaid(claim: SupplierClaim, payment: SupplierPaymentInput) {
    setBusy(claim.id);
    try {
      await markSupplierClaimPaid({
        id: claim.id,
        amount: payment.amount,
        method: payment.method,
        reference: payment.reference,
        note: payment.note,
      });
      toast.success('Supplier claim marked paid.');
      await refresh();
    } catch (err) {
      toast.error(friendlyError(err, 'Could not mark claim paid'));
    } finally {
      setBusy(null);
    }
  }

  async function confirmReceived(claim: SupplierClaim) {
    setBusy(claim.id);
    try {
      await confirmSupplierClaimReceived(claim.id);
      toast.success('Supplier claim confirmed received.');
      await refresh();
    } catch (err) {
      toast.error(friendlyError(err, 'Could not confirm receipt'));
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
            Apply migration <span className="font-mono">0021_supplier_claims.sql</span>, then refresh this page.
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
                <SupplierClaimCard
                  key={claim.id}
                  claim={claim}
                  busy={busy === claim.id}
                  onDecide={decideClaim}
                  onMarkPaid={markPaid}
                  onConfirmReceived={confirmReceived}
                />
              ))}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

type SupplierPaymentInput = {
  amount: number;
  method: SupplierClaimPaymentMethod;
  reference?: string;
  note?: string;
};

function SupplierClaimCard({
  claim,
  busy,
  onDecide,
  onMarkPaid,
  onConfirmReceived,
}: {
  claim: SupplierClaim;
  busy: boolean;
  onDecide: (claim: SupplierClaim, action: 'viewed' | 'approve' | 'dispute', reason?: string) => Promise<void>;
  onMarkPaid: (claim: SupplierClaim, payment: SupplierPaymentInput) => Promise<void>;
  onConfirmReceived: (claim: SupplierClaim) => Promise<void>;
}) {
  const [disputeOpen, setDisputeOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const canView = claim.status === 'submitted';
  const canApprove = claim.status === 'submitted' || claim.status === 'viewed';
  const canDispute = claim.status === 'submitted' || claim.status === 'viewed' || claim.status === 'approved_for_payment';
  const canPay = claim.status === 'approved_for_payment';
  const canConfirm = claim.status === 'paid';

  return (
    <Card className="p-4">
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
      {claim.paid_amount_snapshot != null && (
        <div className="mt-1 text-xs text-ink-muted">
          Paid snapshot: {formatMoney(claim.paid_amount_snapshot)}
          {claim.payment_reference ? ` · Ref: ${claim.payment_reference}` : ''}
        </div>
      )}
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
        {canView && (
          <Button variant="secondary" disabled={busy} onClick={() => void onDecide(claim, 'viewed')}>
            Mark viewed
          </Button>
        )}
        {canApprove && (
          <Button variant="secondary" tint="admin" disabled={busy} onClick={() => void onDecide(claim, 'approve')}>
            Approve for payment
          </Button>
        )}
        {canDispute && (
          <Button variant="secondary" disabled={busy} onClick={() => setDisputeOpen(true)}>
            <XCircle className="h-4 w-4" /> Dispute
          </Button>
        )}
        {canPay && (
          <Button tint="admin" disabled={busy} onClick={() => setPayOpen(true)}>
            Mark paid
          </Button>
        )}
        {canConfirm && (
          <Button tint="admin" disabled={busy} onClick={() => void onConfirmReceived(claim)}>
            Confirm received
          </Button>
        )}
      </div>

      {disputeOpen && (
        <DisputeDialog
          onCancel={() => setDisputeOpen(false)}
          onSubmit={async (reason) => {
            await onDecide(claim, 'dispute', reason);
            setDisputeOpen(false);
          }}
        />
      )}
      {payOpen && (
        <SupplierClaimPaymentDialog
          claim={claim}
          onCancel={() => setPayOpen(false)}
          onSubmit={async (payment) => {
            await onMarkPaid(claim, payment);
            setPayOpen(false);
          }}
        />
      )}
    </Card>
  );
}

function DisputeDialog({ onCancel, onSubmit }: { onCancel: () => void; onSubmit: (reason: string) => Promise<void> }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit() {
    setBusy(true);
    try {
      await onSubmit(reason);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <Card className="w-full max-w-md rounded-t-2xl sm:rounded-2xl">
        <h3 className="text-base font-semibold text-ink">Dispute supplier claim</h3>
        <p className="mt-1 text-sm text-ink-muted">Write a clear reason so the dispute is useful in the audit trail.</p>
        <label className="mt-4 block">
          <span className="text-sm font-medium text-ink">Reason</span>
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={4}
            placeholder="Example: The delivery note does not match the attached invoice and amount."
            className="mt-1 w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-role-admin/30"
          />
        </label>
        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" disabled={busy} onClick={onCancel}>Cancel</Button>
          <Button tint="admin" disabled={busy || !reason.trim()} onClick={() => void submit()}>
            Dispute claim
          </Button>
        </div>
      </Card>
    </div>
  );
}

const SUPPLIER_PAYMENT_METHODS: Array<{ value: SupplierClaimPaymentMethod; label: string }> = [
  { value: 'cash', label: 'Cash' },
  { value: 'mobile_money', label: 'Mobile money' },
  { value: 'bank', label: 'Bank' },
  { value: 'other', label: 'Other' },
];

function SupplierClaimPaymentDialog({
  claim,
  onCancel,
  onSubmit,
}: {
  claim: SupplierClaim;
  onCancel: () => void;
  onSubmit: (payment: SupplierPaymentInput) => Promise<void>;
}) {
  const [amount, setAmount] = useState(String(claim.amount ?? ''));
  const [method, setMethod] = useState<SupplierClaimPaymentMethod>('mobile_money');
  const [reference, setReference] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const numericAmount = Number(amount.replace(/[^\d.]/g, ''));
  const validAmount = Number.isFinite(numericAmount) && numericAmount > 0;

  async function submit() {
    if (!validAmount) return;
    setBusy(true);
    try {
      await onSubmit({ amount: numericAmount, method, reference, note });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4">
      <Card className="w-full max-w-md rounded-t-2xl sm:rounded-2xl">
        <h3 className="text-base font-semibold text-ink">Mark supplier claim paid</h3>
        <p className="mt-1 text-sm text-ink-muted">Record payment for “{claim.title}”.</p>
        <p className="mt-3 rounded-lg bg-surface-muted px-3 py-2 text-xs text-ink-muted">
          This records payment of a supplier AP claim. It does not create or count an expense in Risip.
        </p>

        <div className="mt-4 space-y-3">
          <label className="block">
            <span className="text-sm font-medium text-ink">Amount</span>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
              className="mt-1 w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-role-admin/30"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-ink">Payment method</span>
            <select
              value={method}
              onChange={(e) => setMethod(e.target.value as SupplierClaimPaymentMethod)}
              className="mt-1 w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-role-admin/30"
            >
              {SUPPLIER_PAYMENT_METHODS.map((m) => (
                <option key={m.value} value={m.value}>{m.label}</option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className="text-sm font-medium text-ink">Payment reference</span>
            <input
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="M-Pesa code, bank reference, cheque number"
              className="mt-1 w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-role-admin/30"
            />
          </label>
          <label className="block">
            <span className="text-sm font-medium text-ink">Note</span>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              placeholder="Optional, for audit history"
              className="mt-1 w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-role-admin/30"
            />
          </label>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <Button variant="ghost" disabled={busy} onClick={onCancel}>Cancel</Button>
          <Button tint="admin" disabled={busy || !validAmount} onClick={() => void submit()}>
            Record payment
          </Button>
        </div>
      </Card>
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
