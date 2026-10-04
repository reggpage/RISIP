import { useCallback, useEffect, useState } from 'react';
import { ArrowDownCircle, ArrowUpCircle, Building2, Loader2, PackageSearch, RefreshCw } from 'lucide-react';
import Button from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import PlanGate from '@/components/ui/PlanGate';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/lib/auth';
import { formatDateTime, formatMoney } from '@/lib/format';
import { supabase } from '@/lib/supabase';
import { sw } from '@/i18n/sw';

type OrderLine = {
  product_name: string;
  quantity: number;
  unit?: string | null;
  wholesale_unit_price: number;
  line_total: number;
};

type ShopOrder = {
  id: string;
  order_no: string;
  status: string;
  total_wholesale: number;
  currency?: string;
  placed_at: string;
  counterparty_name: string;
  lines: OrderLine[];
};

type OrderBook = {
  outgoing: ShopOrder[];
  incoming: ShopOrder[];
};

type OrderCounts = { placed: number; accepted: number; delivered: number; verified: number; rejected: number; cancelled: number };

const ui = sw.shopOrders;

const statusLabel: Record<string, string> = {
  placed: 'Placed',
  accepted: 'Accepted',
  rejected: 'Rejected',
  delivered: 'Delivered',
  verified: 'Verified',
  cancelled: 'Cancelled',
};
const statusColor: Record<string, string> = {
  placed: 'bg-amber-100 text-amber-800',
  accepted: 'bg-sky-100 text-sky-800',
  rejected: 'bg-red-100 text-red-700',
  delivered: 'bg-violet-100 text-violet-800',
  verified: 'bg-emerald-100 text-emerald-800',
  cancelled: 'bg-surface-muted text-ink-muted',
};

export default function OrdersPage() {
  const auth = useAuth();
  const toast = useToast();
  const role = auth.status === 'signed-in' ? auth.profile?.role : undefined;
  const [book, setBook] = useState<OrderBook | null>(null);
  const [counts, setCounts] = useState<OrderCounts | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await (supabase as any).rpc('my_shop_orders');
    if (error || !data) {
      toast.error(ui.loadError);
      setBook(null);
      setCounts(null);
      setLoading(false);
      return;
    }
    const rows = data as unknown as OrderBook;
    const count = (data as unknown as { counts: OrderCounts }).counts;
    setBook({ outgoing: rows.outgoing ?? [], incoming: rows.incoming ?? [] });
    setCounts(count ?? null);
    setLoading(false);
  }, [toast]);

  useEffect(() => { void load(); }, [load]);

  async function runAction(orderId: string, action: string) {
    if (busyId) return;
    setBusyId(orderId);
    const { error } = await (supabase as any).rpc('my_shop_order_action', {
      p_order_id: orderId,
      p_action: action,
      p_note: null,
    });
    setBusyId(null);
    if (error) { toast.error(ui.actionError); return; }
    toast.success(action === 'verify' ? 'Order verified.' : 'Order updated.');
    await load();
  }

  const loadingBlock = (
    <div className="flex flex-col gap-3">
      <Card><Skeleton className="h-5 w-44" /><Skeleton className="mt-2 h-3 w-2/3" /></Card>
      <Card><Skeleton className="h-5 w-44" /><Skeleton className="mt-2 h-3 w-2/3" /></Card>
    </div>
  );

  const orderCard = (order: ShopOrder, side: 'incoming' | 'outgoing') => (
    <Card key={order.id} className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-semibold text-ink">{order.order_no}</span>
            <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${statusColor[order.status] ?? 'bg-surface-muted text-ink-muted'}`}>
              {statusLabel[order.status] ?? order.status}
            </span>
          </div>
          <p className="mt-1 flex items-center gap-1 text-xs text-ink-muted">
            <Building2 className="h-3.5 w-3.5" />
            {order.counterparty_name}
          </p>
          <p className="mt-0.5 text-xs text-ink-muted">{formatDateTime(order.placed_at)}</p>
        </div>
        <div className="text-right">
          <div className="text-base font-semibold text-ink">{formatMoney(order.total_wholesale, order.currency)}</div>
        </div>
      </div>

      <ul className="mt-4 flex flex-col gap-1.5 border-t border-surface-border pt-3">
        {order.lines.map((line, i) => (
          <li key={i} className="flex items-center justify-between gap-3 text-xs">
            <span className="min-w-0 truncate text-ink">
              {line.quantity.toLocaleString('en-US', { maximumFractionDigits: 3 })}{line.unit ? ` ${line.unit}` : ''} {line.product_name}
            </span>
            <span className="shrink-0 text-ink-muted">{formatMoney(line.line_total)}</span>
          </li>
        ))}
      </ul>

      {role === 'owner' || role === 'accountant' ? (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-surface-border pt-3">
          {side === 'incoming' && order.status === 'placed' && (
            <>
              <Button tint="admin" disabled={busyId === order.id} onClick={() => void runAction(order.id, 'accept')}>
                {busyId === order.id ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                {ui.accept}
              </Button>
              <Button variant="danger" disabled={busyId === order.id} onClick={() => void runAction(order.id, 'reject')}>
                {ui.reject}
              </Button>
            </>
          )}
          {side === 'incoming' && order.status === 'accepted' && (
            <Button tint="admin" disabled={busyId === order.id} onClick={() => void runAction(order.id, 'deliver')}>
              {busyId === order.id ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {ui.deliver}
            </Button>
          )}
          {side === 'outgoing' && order.status === 'delivered' && (
            <Button tint="admin" disabled={busyId === order.id} onClick={() => void runAction(order.id, 'verify')}>
              {busyId === order.id ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {ui.verify}
            </Button>
          )}
          {(side === 'outgoing' || side === 'incoming') && (order.status === 'placed' || order.status === 'accepted') && (
            <Button variant="secondary" tint="neutral" disabled={busyId === order.id} onClick={() => void runAction(order.id, 'cancel')}>
              {ui.cancel}
            </Button>
          )}
        </div>
      ) : null}
    </Card>
  );

  const emptyBlock = (title: string) => (
    <Card className="flex min-h-40 flex-col items-center justify-center p-6 text-center">
      <PackageSearch className="h-8 w-8 text-ink-muted" />
      <h3 className="mt-2 text-sm font-semibold text-ink">{title}</h3>
      <p className="mt-1 max-w-sm text-xs text-ink-muted">{ui.emptyHint}</p>
    </Card>
  );

  return (
    <PlanGate capability="b2b_orders" messageKey="lockB2b">
      <div className="mx-auto max-w-4xl p-4 sm:p-6 lg:p-8">
      <header className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">{ui.title}</h1>
          <p className="mt-1 text-sm text-ink-muted">{ui.subtitle}</p>
        </div>
        <Button variant="secondary" tint="admin" onClick={() => void load()}>
          <RefreshCw className="h-4 w-4" />
          {ui.refresh}
        </Button>
      </header>

      {counts && (
        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {(['placed', 'accepted', 'delivered', 'verified', 'rejected', 'cancelled'] as const).map((key) => (
            <Card key={key} className="p-4">
              <div className="text-lg font-semibold text-ink">{counts[key] ?? 0}</div>
              <div className="text-xs text-ink-muted">{statusLabel[key] ?? key}</div>
            </Card>
          ))}
        </div>
      )}

      <section className="mb-8">
        <div className="mb-3 flex items-center gap-2">
          <ArrowDownCircle className="h-4 w-4 text-role-accountant" />
          <h2 className="text-sm font-semibold text-ink">{ui.incoming}</h2>
          <span className="text-xs text-ink-muted">{ui.incomingDesc}</span>
        </div>
        {loading ? loadingBlock
          : book && book.incoming.length
            ? <div className="flex flex-col gap-3">{book.incoming.map((o) => orderCard(o, 'incoming'))}</div>
            : emptyBlock(ui.emptyIncoming)}
      </section>

      <section>
        <div className="mb-3 flex items-center gap-2">
          <ArrowUpCircle className="h-4 w-4 text-role-admin" />
          <h2 className="text-sm font-semibold text-ink">{ui.outgoing}</h2>
          <span className="text-xs text-ink-muted">{ui.outgoingDesc}</span>
        </div>
        {loading ? loadingBlock
          : book && book.outgoing.length
            ? <div className="flex flex-col gap-3">{book.outgoing.map((o) => orderCard(o, 'outgoing'))}</div>
            : emptyBlock(ui.emptyOutgoing)}
      </section>
      </div>
    </PlanGate>
  );
}