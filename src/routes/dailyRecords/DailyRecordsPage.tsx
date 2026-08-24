import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Check, CheckCircle2, ChevronLeft, Filter, RefreshCw, X } from 'lucide-react';
import { Card, CardHeader, CardTitle } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Select from '@/components/ui/Select';
import { Skeleton } from '@/components/ui/Skeleton';
import WhatsappIcon from '@/components/ui/WhatsappIcon';
import { useAuth } from '@/lib/auth';
import { friendlyError } from '@/lib/errors';
import { formatDateTime, formatMoney } from '@/lib/format';
import { formatLongDate } from '@/lib/format';
import { getLang } from '@/lib/lang';
import { useToast } from '@/components/ui/Toast';
import {
  confirmDailyRecord,
  getDailyRecordAudit,
  useDailyRecords,
  voidDailyRecord,
  type DailyRecordWithDetails,
} from '@/features/dailyRecords/dailyRecords';
import { isSameLocalDay, moveDailyRecordsDate, startOfLocalDay } from '@/features/dailyRecords/uiRules';
import { groupByDay, type DayGroup } from './groupByDay';
import type { DailyRecordAudit, DailyRecordKind, DailyRecordStatus } from '@/types/db';

const lang = getLang();
const ui = lang === 'sw' ? {
  title: 'Rekodi za Siku', description: 'Rekodi za shughuli kutoka WhatsApp na app. Zinatenganishwa na matumizi ya risiti.', refresh: 'Onyesha upya', filter: 'Chuja', filterRecords: 'Chuja rekodi', kind: 'Aina', status: 'Hali', source: 'Chanzo', allKinds: 'Aina zote', allStatuses: 'Hali zote', allSources: 'Vyanzo vyote', app: 'App / kwa mkono', other: 'Nyingine', empty: 'Bado hakuna rekodi za siku.', emptyHint: 'Tuma mauzo, matumizi, madeni, au malipo kupitia WhatsApp.', loading: 'Inapakia rekodi za siku…', confirmed: 'Imethibitishwa', pending: 'Inasubiri uthibitisho', voided: 'Imeghairiwa', sale: 'Mauzo', expense: 'Matumizi', stockPurchase: 'Ununuzi wa bidhaa', debt: 'Mkopo uliotolewa', payment: 'Malipo ya mteja', daily: 'Rekodi ya siku', occurred: 'Ilitokea', created: 'Iliundwa', confirm: 'Thibitisha', saving: 'Inahifadhi…', void: 'Ghairi', details: 'Maelezo ya rekodi ya siku', total: 'Jumla', descriptionLabel: 'Maelezo', party: 'Mhusika', recordedBy: 'Iliyorekodiwa na', calculation: 'Mgawanyo wa hesabu', audit: 'Historia ya ukaguzi', historyLoading: 'Inapakia historia…', auditError: 'Historia ya ukaguzi haikuweza kupakiwa.', close: 'Funga', voidTitle: 'Ghairi rekodi ya siku', voidExplanation: 'Ghairi inaweka rekodi hii kuwa imefutwa kwa matumizi ya hesabu. Haifutwi. Rekodi ya awali na historia ya ukaguzi vinabaki, lakini haijumuishwi kwenye jumla.', reason: 'Sababu', reasonPlaceholder: 'Eleza kwa nini rekodi hii inaghairiwa', cancel: 'Ghairi', voidRecord: 'Ghairi rekodi', voiding: 'Inaghairi…', confirmSuccess: 'Rekodi ya siku imethibitishwa.', voidSuccess: 'Rekodi ya siku imeghairiwa. Historia yake imehifadhiwa.', reasonError: 'Andika sababu yenye maana kabla ya kughairi rekodi hii.', confirmError: 'Imeshindikana kuthibitisha rekodi hii.', voidError: 'Imeshindikana kughairi rekodi hii.', whatsApp: 'WhatsApp', voidReason: 'Sababu ya kughairi', today: 'Leo', yesterday: 'Jana', previousDay: 'Juzi', back: 'Nyuma', dateNavigation: 'Urambazaji wa tarehe', oneEntry: 'kipengele 1', manyEntries: 'vipengele {n}',
} : {
  title: 'Daily Records', description: 'Operational records from WhatsApp and the app. They stay separate from receipt expenses.', refresh: 'Refresh', filter: 'Filter', filterRecords: 'Filter records', kind: 'Kind', status: 'Status', source: 'Source', allKinds: 'All kinds', allStatuses: 'All statuses', allSources: 'All sources', app: 'App / manual', other: 'Other', empty: 'No daily records yet.', emptyHint: 'Send sales, expenses, debts, or payments on WhatsApp.', loading: 'Loading daily records…', confirmed: 'Confirmed', pending: 'Pending confirmation', voided: 'Voided', sale: 'Sale', expense: 'Expense', stockPurchase: 'Product purchase', debt: 'Debt issued', payment: 'Customer payment', daily: 'Daily record', occurred: 'Occurred', created: 'Created', confirm: 'Confirm', saving: 'Saving…', void: 'Void', details: 'Daily record details', total: 'Total', descriptionLabel: 'Description', party: 'Party', recordedBy: 'Recorded by', calculation: 'Calculation breakdown', audit: 'Audit history', historyLoading: 'Loading history…', auditError: 'Audit history could not be loaded.', close: 'Close', voidTitle: 'Void daily record', voidExplanation: 'Void marks this record as cancelled. It is not deleted. The original record and audit history remain, but it is excluded from totals.', reason: 'Reason', reasonPlaceholder: 'Explain why this record is being voided', cancel: 'Cancel', voidRecord: 'Void record', voiding: 'Voiding…', confirmSuccess: 'Daily record confirmed.', voidSuccess: 'Daily record voided. Its history is preserved.', reasonError: 'Enter a meaningful reason before voiding this record.', confirmError: 'Could not confirm this daily record.', voidError: 'Could not void this daily record.', whatsApp: 'WhatsApp', voidReason: 'Void reason', today: 'Today', yesterday: 'Yesterday', previousDay: 'Previous day', back: 'Back', dateNavigation: 'Date navigation', oneEntry: '1 entry', manyEntries: '{n} entries',
};
const kindLabels: Record<DailyRecordKind, string> = { sale: ui.sale, expense: ui.expense, stock_purchase: ui.stockPurchase, debt_issued: ui.debt, customer_payment: ui.payment };
const statusLabels: Record<DailyRecordStatus, string> = { pending_confirmation: ui.pending, confirmed: ui.confirmed, voided: ui.voided };
const partyHint = lang === 'sw'
  ? 'Mhusika anaweza kuwa mteja, supplier/muuzaji, mlipwaji, mdaiwa, au mlipaji.'
  : 'Party identifies the customer, supplier/payee, debtor, or payer.';

export default function DailyRecordsPage() {
  const auth = useAuth();
  const toast = useToast();
  const state = useDailyRecords();
  const role = auth.status === 'signed-in' ? auth.profile?.role : undefined;
  const canManage = role === 'owner' || role === 'accountant';
  const [kind, setKind] = useState('');
  const [status, setStatus] = useState('');
  const [source, setSource] = useState('');
  const [selected, setSelected] = useState<DailyRecordWithDetails | null>(null);
  const [voiding, setVoiding] = useState<DailyRecordWithDetails | null>(null);
  const [voidReason, setVoidReason] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [selectedDate, setSelectedDate] = useState(() => startOfLocalDay());
  // The day-card that is open, if any. A card is a summary; tapping it opens
  // the thing it summarises rather than growing and pushing the day off screen.
  const [openGroup, setOpenGroup] = useState<DayGroup<DailyRecordWithDetails> | null>(null);

  function moveToDate(date: Date) {
    const safeDate = startOfLocalDay(date);
    if (safeDate > startOfLocalDay()) return;
    setSelectedDate(safeDate);
    state.reload();
  }

  function setRelativeDay(offset: number) {
    const date = moveDailyRecordsDate(startOfLocalDay(), offset);
    if (date) moveToDate(date);
  }

  function goBackOneDay() {
    const date = moveDailyRecordsDate(selectedDate, -1);
    if (date) moveToDate(date);
  }

  const filtered = useMemo(() => state.records.filter((record) => {
    return isSameLocalDay(record.occurred_at, selectedDate)
      && (!kind || record.kind === kind)
      && (!status || record.status === status)
      && (!source || record.source === source);
  }), [kind, selectedDate, source, state.records, status]);

  async function handleConfirm(record: DailyRecordWithDetails) {
    setBusyId(record.id);
    try {
      await confirmDailyRecord(record.id);
      toast.success(ui.confirmSuccess);
      setSelected(null);
      state.reload();
    } catch (error) {
      toast.error(friendlyError(error, ui.confirmError));
    } finally {
      setBusyId(null);
    }
  }

  async function handleVoid() {
    if (!voiding) return;
    const reason = voidReason.trim();
    if (reason.length < 3) {
      toast.error(ui.reasonError);
      return;
    }
    setBusyId(voiding.id);
    try {
      await voidDailyRecord(voiding.id, reason);
      toast.success(ui.voidSuccess);
      setVoiding(null);
      setVoidReason('');
      setSelected(null);
      state.reload();
    } catch (error) {
      toast.error(friendlyError(error, ui.voidError));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink">{ui.title}</h1>
          <p className="mt-1 text-sm text-ink-muted">{ui.description}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" className="sm:hidden" onClick={() => setFiltersOpen(true)}><Filter className="h-4 w-4" /> {ui.filter}</Button>
          <Button variant="secondary" onClick={state.reload} disabled={state.status === 'loading'}>
            <RefreshCw className="h-4 w-4" /> {ui.refresh}
          </Button>
        </div>
      </div>

      <Card className="mb-6 hidden sm:block">
        <CardHeader><CardTitle>{ui.filterRecords}</CardTitle></CardHeader>
        <FilterFields kind={kind} status={status} source={source} setKind={setKind} setStatus={setStatus} setSource={setSource} />
      </Card>
      {filtersOpen && <Modal title={ui.filterRecords} onClose={() => setFiltersOpen(false)}>
        <FilterFields kind={kind} status={status} source={source} setKind={setKind} setStatus={setStatus} setSource={setSource} />
        <div className="mt-5 flex justify-end"><Button tint="admin" onClick={() => setFiltersOpen(false)}>{ui.filter}</Button></div>
      </Modal>}
      <div className="mb-6 flex flex-wrap items-center gap-2" aria-label={ui.dateNavigation}>
        {/* "Previous day" and "Back" both stepped one day into the past and read
            as two different things. The arrow is the one that keeps going. */}
        <Button variant="ghost" onClick={goBackOneDay} aria-label={ui.back} title={ui.back}>
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </Button>
        <Button variant="ghost" onClick={() => setRelativeDay(0)}>{ui.today}</Button>
        <Button variant="ghost" onClick={() => setRelativeDay(-1)}>{ui.yesterday}</Button>
        <span className="ml-auto text-xs font-semibold text-role-admin">{formatLongDate(selectedDate, lang)}</span>
      </div>

      {state.status === 'error' && (
        <Card className="mb-4 border-red-200">
          <p className="text-sm text-red-700">{friendlyError(state.error, ui.description)}</p>
        </Card>
      )}

      {state.status === 'loading' && state.records.length === 0 ? (
        <div className="space-y-3" aria-label={ui.loading}><Skeleton className="h-28 w-full" /><Skeleton className="h-28 w-full" /><Skeleton className="h-28 w-full" /></div>
      ) : filtered.length === 0 ? (
        <Card>
          <div className="py-8 text-center">
            <p className="text-base font-medium text-ink">{ui.empty}</p>
            <p className="mt-1 text-sm text-ink-muted">{ui.emptyHint}</p>
          </div>
        </Card>
      ) : (
        <div className="space-y-3">
          {groupByDay(filtered).map((group) => (
            <DayGroupCard key={group.key} group={group} onOpen={() => setOpenGroup(group)} />
          ))}
        </div>
      )}

      {openGroup && !selected && (
        <DayGroupModal
          group={openGroup}
          canManage={canManage}
          busyId={busyId}
          onClose={() => setOpenGroup(null)}
          onOpenRecord={setSelected}
          onConfirmRecord={(record) => void handleConfirm(record)}
          onVoidRecord={(record) => { setVoiding(record); setVoidReason(''); }}
        />
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
        <Modal title={ui.voidTitle} onClose={() => setVoiding(null)}>
          <p className="text-sm text-ink-muted">{ui.voidExplanation}</p>
          <div className="mt-4">
            <label className="text-sm font-medium text-ink" htmlFor="void-reason">{ui.reason}</label>
            <textarea
              id="void-reason"
              value={voidReason}
              onChange={(event) => setVoidReason(event.target.value)}
              rows={4}
              className="mt-1 w-full rounded-lg border border-surface-border bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-role-admin/30"
              placeholder={ui.reasonPlaceholder}
            />
          </div>
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setVoiding(null)}>{ui.cancel}</Button>
            <Button variant="danger" onClick={() => void handleVoid()} disabled={busyId === voiding.id}>
              {busyId === voiding.id ? ui.voiding : ui.voidRecord}
            </Button>
          </div>
        </Modal>
      )}
    </div>
  );
}

function FilterFields({
  kind, status, source, setKind, setStatus, setSource,
}: {
  kind: string; status: string; source: string;
  setKind: (value: string) => void;
  setStatus: (value: string) => void; setSource: (value: string) => void;
}) {
  return <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
    <Select label={ui.kind} value={kind} onChange={setKind} options={[{ value: '', label: ui.allKinds }, ...Object.entries(kindLabels).map(([value, label]) => ({ value, label }))]} />
    <Select label={ui.status} value={status} onChange={setStatus} options={[{ value: '', label: ui.allStatuses }, ...Object.entries(statusLabels).map(([value, label]) => ({ value, label }))]} />
    <Select label={ui.source} value={source} onChange={setSource} options={[{ value: '', label: ui.allSources }, { value: 'whatsapp', label: ui.whatsApp }, { value: 'app', label: ui.app }, { value: 'other', label: ui.other }]} />
  </div>;
}

/**
 * A day's worth of one kind, in one card.
 *
 * The owner recorded a day's takings and three expenses and got four cards, none
 * of which answered "what did today make?". Sales arrive through the day —
 * morning, after lunch, at closing — and every one of them belongs to the same
 * day. The card holds the total; opening it shows what went into it.
 */
function DayGroupCard({
  group,
  onOpen,
}: {
  group: DayGroup<DailyRecordWithDetails>;
  onOpen: () => void;
}) {
  const entries = group.records.length;
  return (
    <Card className="p-0">
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full flex-col gap-3 p-5 text-left sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-ink">{kindLabels[group.kind as DailyRecordKind] ?? group.kind}</span>
            {group.hasUnconfirmed && <StatusBadge status="pending_confirmation" />}
          </div>
          <p className="mt-1 text-sm text-ink-muted">
            {formatLongDate(new Date(`${group.day}T00:00:00`), lang)}
            {' · '}
            {entries === 1 ? ui.oneEntry : ui.manyEntries.replace('{n}', String(entries))}
          </p>
        </div>
        <span className="text-xl font-semibold tabular-nums text-ink">{formatMoney(group.total)}</span>
      </button>
    </Card>
  );
}

/**
 * The whole day, in one window.
 *
 * It opened as a drop-down at first, and that was not what was asked for: the
 * card grew downwards and pushed the rest of the day off the screen. A card is
 * a summary; tapping it should open the thing it summarises.
 */
function DayGroupModal({
  group,
  canManage,
  busyId,
  onClose,
  onOpenRecord,
  onConfirmRecord,
  onVoidRecord,
}: {
  group: DayGroup<DailyRecordWithDetails>;
  canManage: boolean;
  busyId: string | null;
  onClose: () => void;
  onOpenRecord: (record: DailyRecordWithDetails) => void;
  onConfirmRecord: (record: DailyRecordWithDetails) => void;
  onVoidRecord: (record: DailyRecordWithDetails) => void;
}) {
  const kindLabel = kindLabels[group.kind as DailyRecordKind] ?? group.kind;
  return (
    <Modal title={`${kindLabel} · ${formatLongDate(new Date(`${group.day}T00:00:00`), lang)}`} onClose={onClose}>
      <div className="mb-4 rounded-xl bg-surface-muted px-4 py-3">
        <p className="text-xs font-medium uppercase tracking-wide text-ink-muted">{ui.total}</p>
        <p className="font-display text-2xl text-ink">{formatMoney(group.total)}</p>
        <p className="mt-1 text-xs text-ink-muted">
          {group.records.length === 1 ? ui.oneEntry : ui.manyEntries.replace('{n}', String(group.records.length))}
        </p>
      </div>
      {/* A list, not cards inside a card. Every entry of the day sits on one
          line and a new one simply joins the bottom — the same shape as the
          calculation breakdown, which is what this is a breakdown of. */}
      <ul className="divide-y divide-surface-border rounded-xl border border-surface-border">
        {group.records.map((record) => (
          <li key={record.id}>
            <div className="flex items-center gap-3 px-3 py-2.5">
              <button
                type="button"
                onClick={() => onOpenRecord(record)}
                className="min-w-0 flex-1 text-left"
              >
                <span className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm text-ink">
                    {record.description || kindLabels[record.kind] || ui.daily}
                  </span>
                  {record.status !== 'confirmed' && <StatusBadge status={record.status} />}
                </span>
                <span className="mt-0.5 block text-xs text-ink-muted">
                  {formatDateTime(record.occurred_at)}
                  {record.source === 'whatsapp' ? ` · ${ui.whatsApp}` : ''}
                </span>
              </button>
              <span className="shrink-0 text-sm font-semibold tabular-nums text-ink">
                {formatMoney(record.amount)}
              </span>
              {canManage && record.status !== 'voided' && (
                <span className="flex shrink-0 gap-1">
                  {record.status === 'pending_confirmation' && (
                    <Button variant="ghost" onClick={() => onConfirmRecord(record)} disabled={busy(busyId, record.id)}>
                      <Check className="h-4 w-4" aria-hidden="true" />
                      <span className="sr-only">{ui.confirm}</span>
                    </Button>
                  )}
                  <Button variant="ghost" onClick={() => onVoidRecord(record)} disabled={busy(busyId, record.id)}>
                    <X className="h-4 w-4" aria-hidden="true" />
                    <span className="sr-only">{ui.void}</span>
                  </Button>
                </span>
              )}
            </div>
          </li>
        ))}
      </ul>
    </Modal>
  );
}

const busy = (busyId: string | null, id: string) => busyId === id;

function StatusBadge({ status }: { status: DailyRecordStatus }) {
  const style = status === 'voided'
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
        if (!cancelled) setAuditError(ui.auditError);
      });
    return () => {
      cancelled = true;
    };
  }, [record.id]);

  return (
    <Modal
      title={record.status === 'confirmed' ? <span className="inline-flex items-center gap-2"><CheckCircle2 className="h-5 w-5 text-emerald-600" strokeWidth={3} aria-hidden="true" />{ui.details}</span> : ui.details}
      onClose={onClose}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-ink">{kindLabels[record.kind]}</span>
        {record.status !== 'confirmed' && <StatusBadge status={record.status} />}
        {record.source === 'whatsapp' && <span className="inline-flex items-center gap-1 text-xs font-medium text-ink-muted" aria-label={ui.whatsApp} title={ui.whatsApp}><WhatsappIcon className="h-4 w-4" />{ui.whatsApp}</span>}
      </div>
      <div className="mt-4 rounded-lg bg-surface-muted p-4">
        <p className="text-xs uppercase tracking-wide text-ink-muted">{ui.total}</p>
        <p className="mt-1 font-display text-2xl font-semibold text-ink">{formatMoney(record.amount, record.currency)}</p>
      </div>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <Detail label={ui.descriptionLabel} value={record.description || '—'} />
        <Detail label={ui.party} value={record.party_name || '—'} />
        <Detail label={ui.recordedBy} value={record.recordedByName || record.recorded_by || '—'} />
        <Detail label={ui.occurred} value={`${formatLongDate(record.occurred_at, lang)} · ${formatDateTime(record.occurred_at)}`} />
        <Detail label={ui.created} value={formatDateTime(record.created_at)} />
        <Detail label={ui.source} value={record.source === 'whatsapp' ? ui.whatsApp : record.source === 'app' ? ui.app : record.source} />
        {record.status === 'voided' && <Detail label={ui.voidReason} value={record.void_reason || '—'} />}
      </dl>
      <p className="mt-2 text-xs text-ink-muted">{partyHint}</p>

      {record.lines.length > 0 && (
        <section className="mt-5">
          <h3 className="text-sm font-semibold text-ink">{ui.calculation}</h3>
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
        <h3 className="text-sm font-semibold text-ink">{ui.audit}</h3>
        {auditError ? <p className="mt-2 text-sm text-red-600">{auditError}</p> : audit.length === 0 ? <p className="mt-2 text-sm text-ink-muted">{ui.historyLoading}</p> : (
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
          {record.status === 'pending_confirmation' && <Button tint="accountant" onClick={onConfirm} disabled={busy}><Check className="h-4 w-4" /> {ui.confirm}</Button>}
          <Button variant="secondary" onClick={onVoid} disabled={busy}>{ui.void}</Button>
        </div>
      )}
    </Modal>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs uppercase tracking-wide text-ink-muted">{label}</dt><dd className="mt-1 break-words text-ink">{value}</dd></div>;
}

function Modal({ title, onClose, children }: { title: ReactNode; onClose: () => void; children: ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 sm:items-center sm:p-4" role="presentation" onMouseDown={onClose}>
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-t-2xl bg-surface p-5 shadow-xl sm:rounded-2xl" role="dialog" aria-modal="true" aria-label={typeof title === 'string' ? title : ui.details} onMouseDown={(event) => event.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-ink">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-ink-muted hover:bg-surface-muted hover:text-ink" aria-label={ui.close}>
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
