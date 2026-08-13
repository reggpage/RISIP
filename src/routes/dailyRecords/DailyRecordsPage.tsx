import { useEffect, useMemo, useState } from 'react';
import { Check, MessageCircle, Search, X } from 'lucide-react';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import { useAuth } from '@/lib/auth';
import { friendlyError } from '@/lib/errors';
import { formatDateTime, formatMoney } from '@/lib/format';
import { useToast } from '@/components/ui/Toast';
import {
  confirmDailyRecord,
  getDailyRecordAudit,
  useDailyRecords,
  voidDailyRecord,
  type DailyRecordWithDetails,
} from '@/features/dailyRecords/dailyRecords';
import type { DailyRecordAudit, DailyRecordKind, DailyRecordStatus } from '@/types/db';

const kindLabels: Record<DailyRecordKind, string> = {
  sale: 'Sale / Mauzo',
  expense: 'Expense / Matumizi',
  debt_issued: 'Debt issued / Mkopo',
  customer_payment: 'Customer payment / Malipo',
};

const statusLabels: Record<DailyRecordStatus, string> = {
  pending_confirmation: 'Pending confirmation',
  confirmed: 'Confirmed',
  voided: 'Voided',
};

function isInDateRange(record: DailyRecordWithDetails, from: string, to: string) {
  const day = record.occurred_at.slice(0, 10);
  return (!from || day >= from) && (!to || day <= to);
}

export default function DailyRecordsPage() {
  const auth = useAuth();
  const toast = useToast();
  const state = useDailyRecords();
  const role = auth.status === 'signed-in' ? auth.profile?.role : undefined;
  const canManage = role === 'owner' || role === 'accountant';
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [kind, setKind] = useState('');
  const [status, setStatus] = useState('');
  const [source, setSource] = useState('');
  const [selected, setSelected] = useState<DailyRecordWithDetails | null>(null);
  const [voiding, setVoiding] = useState<DailyRecordWithDetails | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  const filtered = useMemo(() => state.records.filter((record) => {
    return isInDateRange(record, from, to)
      && (!kind || record.kind === kind)
      && (!status || record.status === status)
      && (!source || record.source === source);
  }), [from, kind, source, state.records, status, to]);

  async function handleConfirm(record: DailyRecordWithDetails) {
    setBusyId(record.id);
    try {
      await confirmDailyRecord(record.id);
      toast.success('Daily record confirmed.');
      setSelected(null);
      state.reload();
    } catch (error) {
      toast.error(friendlyError(error, 'Could not confirm this daily record.'));
    } finally {
      setBusyId(null);
    }
  }

  async function handleVoid() {
    if (!voiding) return;
    const reason = voidReason.trim();
    if (reason.length < 3) {
      toast.error('Enter a meaningful reason before voiding this record.');
      return;
    }
    setBusyId(voiding.id);
    try {
      await voidDailyRecord(voiding.id, reason);
      toast.success('Daily record voided. Its history is preserved.');
      setVoiding(null);
      setVoidReason('');
      setSelected(null);
      state.reload();
    } catch (error) {
      toast.error(friendlyError(error, 'Could not void this daily record.'));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink">Daily Records / Rekodi za Siku</h1>
          <p className="mt-1 text-sm text-ink-muted">Operational records from WhatsApp and the app. They stay separate from receipt expenses.</p>
        </div>
        <Button variant="secondary" onClick={state.reload} disabled={state.status === 'loading'}>
          <Search className="h-4 w-4" /> Refresh
        </Button>
      </div>

      <Card className="mb-6">
        <CardHeader><CardTitle>Filter records</CardTitle></CardHeader>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <Input label="From" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
          <Input label="To" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
          <Select
            label="Kind"
            value={kind}
            onChange={setKind}
            placeholder="All kinds"
            options={[{ value: '', label: 'All kinds' }, ...Object.entries(kindLabels).map(([value, label]) => ({ value, label }))]}
          />
          <Select
            label="Status"
            value={status}
            onChange={setStatus}
            placeholder="All statuses"
            options={[{ value: '', label: 'All statuses' }, ...Object.entries(statusLabels).map(([value, label]) => ({ value, label }))]}
          />
          <Select
            label="Source"
            value={source}
            onChange={setSource}
            placeholder="All sources"
            options={[
              { value: '', label: 'All sources' },
              { value: 'whatsapp', label: 'WhatsApp' },
              { value: 'app', label: 'App / manual' },
              { value: 'other', label: 'Other' },
            ]}
          />
        </div>
      </Card>

      {state.status === 'error' && (
        <Card className="mb-4 border-red-200">
          <p className="text-sm text-red-700">{friendlyError(state.error, 'Could not load daily records. Please try again.')}</p>
        </Card>
      )}

      {state.status === 'loading' && state.records.length === 0 ? (
        <Card><p className="text-sm text-ink-muted">Loading daily records…</p></Card>
      ) : filtered.length === 0 ? (
        <Card>
          <div className="py-8 text-center">
            <p className="text-base font-medium text-ink">No daily records yet.</p>
            <p className="mt-1 text-sm text-ink-muted">Send sales, expenses, debts, or payments on WhatsApp.</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map((record) => (
            <RecordRow
              key={record.id}
              record={record}
              canManage={canManage}
              busy={busyId === record.id}
              onOpen={() => setSelected(record)}
              onConfirm={() => void handleConfirm(record)}
              onVoid={() => {
                setVoiding(record);
                setVoidReason('');
              }}
            />
          ))}
        </div>
      )}

      {selected && (
        <RecordDetailsModal
          record={selected}
          canManage={canManage}
          busy={busyId === selected.id}
          onClose={() => setSelected(null)}
          onConfirm={() => void handleConfirm(selected)}
          onVoid={() => {
            setVoiding(selected);
            setVoidReason('');
          }}
        />
      )}

      {voiding && (
        <Modal title="Void daily record" onClose={() => setVoiding(null)}>
          <p className="text-sm text-ink-muted">
            This keeps the original record and audit history, but excludes it from daily summaries.
          </p>
          <div className="mt-4">
            <label className="text-sm font-medium text-ink" htmlFor="void-reason">Reason</label>
            <textarea
              id="void-reason"
              value={voidReason}
              onChange={(event) => setVoidReason(event.target.value)}
              rows={4}
              className="mt-1 w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-role-admin/30"
              placeholder="Explain why this record is being voided"
            />
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setVoiding(null)}>Cancel</Button>
            <Button variant="danger" onClick={() => void handleVoid()} disabled={busyId === voiding.id}>
              {busyId === voiding.id ? 'Voiding…' : 'Void record'}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function RecordRow({
  record,
  canManage,
  busy,
  onOpen,
  onConfirm,
  onVoid,
}: {
  record: DailyRecordWithDetails;
  canManage: boolean;
  busy: boolean;
  onOpen: () => void;
  onConfirm: () => void;
  onVoid: () => void;
}) {
  return (
    <Card className={record.status === 'voided' ? 'opacity-70' : ''}>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <button type="button" onClick={onOpen} className="min-w-0 flex-1 text-left">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-ink">{kindLabels[record.kind]}</span>
            <StatusBadge status={record.status} />
            {record.source === 'whatsapp' && (
              <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700">
                <MessageCircle className="h-3 w-3" /> WhatsApp
              </span>
            )}
          </div>
          <p className="mt-2 truncate text-sm text-ink-muted">{record.description || record.party_name || 'Daily record'}</p>
          <p className="mt-1 text-xs text-ink-muted">
            {record.recordedByName || 'Recorded user'} · Occurred {formatDateTime(record.occurred_at)} · Created {formatDateTime(record.created_at)}
          </p>
        </button>
        <div className="flex items-center justify-between gap-4 lg:justify-end">
          <strong className="font-display text-lg font-semibold text-ink">{formatMoney(record.amount, record.currency)}</strong>
          {canManage && record.status !== 'voided' && (
            <div className="flex gap-2">
              {record.status === 'pending_confirmation' && (
                <Button tint="accountant" onClick={onConfirm} disabled={busy}>
                  <Check className="h-4 w-4" /> {busy ? 'Saving…' : 'Confirm'}
                </Button>
              )}
              <Button variant="secondary" onClick={onVoid} disabled={busy}>Void</Button>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

function StatusBadge({ status }: { status: DailyRecordStatus }) {
  const style = status === 'confirmed'
    ? 'bg-green-50 text-green-700'
    : status === 'voided'
      ? 'bg-red-50 text-red-700'
      : 'bg-amber-50 text-amber-700';
  return <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${style}`}>{statusLabels[status]}</span>;
}

function RecordDetailsModal({
  record,
  canManage,
  busy,
  onClose,
  onConfirm,
  onVoid,
}: {
  record: DailyRecordWithDetails;
  canManage: boolean;
  busy: boolean;
  onClose: () => void;
  onConfirm: () => void;
  onVoid: () => void;
}) {
  const [audit, setAudit] = useState<DailyRecordAudit[]>([]);
  const [auditError, setAuditError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setAuditError(null);
    void getDailyRecordAudit(record.id)
      .then((rows) => {
        if (!cancelled) setAudit(rows);
      })
      .catch(() => {
        if (!cancelled) setAuditError('Audit history could not be loaded.');
      });
    return () => {
      cancelled = true;
    };
  }, [record.id]);

  return (
    <Modal title="Daily record details" onClose={onClose}>
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-ink">{kindLabels[record.kind]}</span>
        <StatusBadge status={record.status} />
        {record.source === 'whatsapp' && <span className="text-xs font-medium text-green-700">WhatsApp source</span>}
      </div>
      <div className="mt-4 rounded-lg bg-surface-muted p-4">
        <p className="text-xs uppercase tracking-wide text-ink-muted">Total</p>
        <p className="mt-1 font-display text-2xl font-semibold text-ink">{formatMoney(record.amount, record.currency)}</p>
      </div>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <Detail label="Description" value={record.description || '—'} />
        <Detail label="Party" value={record.party_name || '—'} />
        <Detail label="Recorded by" value={record.recordedByName || record.recorded_by || '—'} />
        <Detail label="Occurred" value={formatDateTime(record.occurred_at)} />
        <Detail label="Created" value={formatDateTime(record.created_at)} />
        <Detail label="Source" value={record.source === 'whatsapp' ? `WhatsApp · ${record.source_message_id || 'message'}` : record.source} />
      </dl>

      {record.lines.length > 0 && (
        <section className="mt-5">
          <h3 className="text-sm font-semibold text-ink">Calculation breakdown</h3>
          <div className="mt-2 divide-y divide-surface-border rounded-lg border border-surface-border">
            {record.lines.map((line) => (
              <div key={line.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                <span className="text-ink">{line.description} · {line.quantity} × {formatMoney(line.unit_amount, record.currency)}</span>
                <strong className="shrink-0 text-ink">{formatMoney(line.line_total, record.currency)}</strong>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="mt-5">
        <h3 className="text-sm font-semibold text-ink">Audit history</h3>
        {auditError ? <p className="mt-2 text-sm text-red-600">{auditError}</p> : audit.length === 0 ? <p className="mt-2 text-sm text-ink-muted">Loading history…</p> : (
          <ol className="mt-2 space-y-3 border-l border-surface-border pl-4">
            {audit.map((entry) => (
              <li key={entry.id} className="relative text-sm">
                <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full bg-role-admin" />
                <div className="font-medium text-ink">{entry.action} · {entry.from_status ? `${entry.from_status} → ` : ''}{entry.to_status}</div>
                <div className="text-xs text-ink-muted">{formatDateTime(entry.created_at)}{entry.reason ? ` · ${entry.reason}` : ''}</div>
              </li>
            ))}
          </ol>
        )}
      </section>

      {canManage && record.status !== 'voided' && (
        <div className="mt-6 flex justify-end gap-2">
          {record.status === 'pending_confirmation' && <Button tint="accountant" onClick={onConfirm} disabled={busy}><Check className="h-4 w-4" /> Confirm</Button>}
          <Button variant="secondary" onClick={onVoid} disabled={busy}>Void</Button>
        </div>
      )}
    </Modal>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs uppercase tracking-wide text-ink-muted">{label}</dt><dd className="mt-1 break-words text-ink">{value}</dd></div>;
}

function Modal({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" role="presentation" onMouseDown={onClose}>
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-surface p-5 shadow-xl sm:rounded-2xl" role="dialog" aria-modal="true" aria-label={title} onMouseDown={(event) => event.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-ink">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-ink-muted hover:bg-surface-muted hover:text-ink" aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
