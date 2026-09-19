import { useCallback, useEffect, useState } from 'react';
import { Check, Loader2, PackageSearch, Store, Truck, X } from 'lucide-react';
import Button from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ListItemSkeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';
import { useAuth } from '@/lib/auth';
import { getLang } from '@/lib/lang';
import { formatDateTime } from '@/lib/format';
import {
  answerOrder, fetchIncomingOrders, fetchMarketplaceSettings, fetchOutgoingOrders,
  setMarketplaceOptIn, type MarketplaceOrder, type MarketplaceSettings,
} from '@/features/marketplace/marketplace';

type Tab = 'incoming' | 'outgoing';

const statusLabel = (status: string, sw: boolean): string => {
  if (sw) {
    return status === 'placed' ? 'Inasubiri'
      : status === 'accepted' ? 'Imekubaliwa'
      : status === 'rejected' ? 'Imekataliwa'
      : status === 'delivered' ? 'Imefikishwa' : 'Imeghairiwa';
  }
  return status === 'placed' ? 'Waiting'
    : status === 'accepted' ? 'Accepted'
    : status === 'rejected' ? 'Declined'
    : status === 'delivered' ? 'Delivered' : 'Cancelled';
};

const statusClass = (status: string): string =>
  status === 'accepted' || status === 'delivered' ? 'text-emerald-700 bg-emerald-50'
  : status === 'rejected' || status === 'cancelled' ? 'text-rose-700 bg-rose-50'
  : 'text-amber-700 bg-amber-50';

export default function MarketplacePage() {
  const auth = useAuth();
  const profile = auth.status === 'signed-in' ? auth.profile : null;
  const isOwner = profile?.role === 'owner';
  const sw = getLang() === 'sw';
  const toast = useToast();

  const [settings, setSettings] = useState<MarketplaceSettings | null>(null);
  const [incoming, setIncoming] = useState<MarketplaceOrder[]>([]);
  const [outgoing, setOutgoing] = useState<MarketplaceOrder[]>([]);
  const [tab, setTab] = useState<Tab>('incoming');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = await fetchMarketplaceSettings();
      setSettings(next);
      // Orders are only meaningful once the shop is in; asking for them before
      // that just shows two empty lists.
      if (next.optIn) {
        const [inc, out] = await Promise.all([fetchIncomingOrders(), fetchOutgoingOrders()]);
        setIncoming(inc);
        setOutgoing(out);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : (sw ? 'Imeshindikana kupakia.' : 'Could not load.'));
    } finally {
      setLoading(false);
    }
  }, [toast, sw]);

  useEffect(() => { void load(); }, [load]);

  async function toggleJoin(next: boolean) {
    if (!isOwner) return;
    setBusy('join');
    try {
      await setMarketplaceOptIn(next, settings?.sharePrices ?? false, settings?.maxStockAgeDays ?? 14);
      toast.success(next
        ? (sw ? 'Umejiunga. Maduka mengine sasa yanaona una nini.' : 'Joined. Other shops can now see what you hold.')
        : (sw ? 'Umejitoa. Bidhaa zako hazionekani tena.' : 'Left. Your products are no longer visible.'));
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : (sw ? 'Imeshindikana.' : 'Could not save.'));
    } finally {
      setBusy(null);
    }
  }

  async function togglePrices(next: boolean) {
    if (!isOwner || !settings) return;
    setBusy('prices');
    try {
      await setMarketplaceOptIn(true, next, settings.maxStockAgeDays);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : (sw ? 'Imeshindikana.' : 'Could not save.'));
    } finally {
      setBusy(null);
    }
  }

  async function respond(order: MarketplaceOrder, status: 'accepted' | 'rejected' | 'delivered') {
    setBusy(order.orderId);
    try {
      await answerOrder(order.orderId, status);
      toast.success(status === 'accepted'
        ? (sw ? 'Umekubali oda.' : 'Order accepted.')
        : status === 'rejected'
          ? (sw ? 'Umekataa oda.' : 'Order declined.')
          : (sw ? 'Imewekwa kama imefikishwa.' : 'Marked delivered.'));
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : (sw ? 'Imeshindikana.' : 'Could not update the order.'));
    } finally {
      setBusy(null);
    }
  }

  const rows = tab === 'incoming' ? incoming : outgoing;

  return (
    <div className="mx-auto max-w-4xl p-4 sm:p-6 lg:p-8">
      <header className="mb-6">
        <h1 className="flex items-center gap-2 text-xl font-semibold text-ink">
          <Store className="h-5 w-5" />
          {sw ? 'Mzigo kwa maduka' : 'Restock marketplace'}
        </h1>
        <p className="mt-1 text-sm text-ink-muted">
          {sw
            ? 'Ukiishiwa bidhaa, andika Risip kwenye WhatsApp: "Nimeishiwa sabuni". Utaonyeshwa maduka yenye bidhaa hiyo.'
            : 'When you run out, message Risip on WhatsApp: "Nimeishiwa sabuni". You will be shown shops that have it.'}
        </p>
      </header>

      {loading && !settings ? <ListItemSkeleton /> : (
        <>
          {/* Joining is a consent decision about this shop's own data, so only
              the owner can make it. Everyone else sees the state, read-only. */}
          <Card className="mb-6 p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0">
                <h2 className="font-medium text-ink">
                  {settings?.optIn
                    ? (sw ? 'Umejiunga' : 'You have joined')
                    : (sw ? 'Hujajiunga bado' : 'Not joined yet')}
                </h2>
                <p className="mt-1 text-sm text-ink-muted">
                  {settings?.optIn
                    ? (sw
                      ? `Bidhaa ${settings.indexedProducts} zinaonekana kwa maduka mengine yaliyojiunga.`
                      : `${settings.indexedProducts} products are visible to other joined shops.`)
                    : (sw
                      ? `Ukijiunga, bidhaa ${settings?.countedProducts ?? 0} zenye hesabu mpya zitaonekana kwa maduka mengine yaliyojiunga — nao utaona zao.`
                      : `If you join, ${settings?.countedProducts ?? 0} recently counted products become visible to other joined shops — and you can see theirs.`)}
                </p>
                {!settings?.optIn && (
                  <p className="mt-2 text-xs text-ink-muted">
                    {sw
                      ? 'Bei haionyeshwi isipokuwa ukiruhusu. Unaweza kujitoa wakati wowote.'
                      : 'Prices stay hidden unless you allow them. You can leave at any time.'}
                  </p>
                )}
              </div>
              {isOwner ? (
                <Button
                  variant={settings?.optIn ? 'secondary' : 'primary'}
                  disabled={busy === 'join'}
                  onClick={() => void toggleJoin(!settings?.optIn)}
                >
                  {busy === 'join' && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {settings?.optIn ? (sw ? 'Jitoe' : 'Leave') : (sw ? 'Jiunge' : 'Join')}
                </Button>
              ) : (
                <span className="text-xs text-ink-muted">
                  {sw ? 'Mmiliki pekee ndiye anaweza kubadilisha' : 'Only the owner can change this'}
                </span>
              )}
            </div>

            {settings?.optIn && isOwner && (
              <label className="mt-4 flex items-center gap-2 border-t border-border pt-4 text-sm text-ink">
                <input
                  type="checkbox"
                  checked={settings.sharePrices}
                  disabled={busy === 'prices'}
                  onChange={(e) => void togglePrices(e.target.checked)}
                />
                {sw ? 'Onyesha bei zangu za jumla' : 'Show my wholesale prices'}
              </label>
            )}
          </Card>

          {settings?.optIn && (
            <>
              <div className="mb-3 flex gap-2">
                <Button variant={tab === 'incoming' ? 'primary' : 'ghost'} onClick={() => setTab('incoming')}>
                  <Truck className="mr-2 h-4 w-4" />
                  {sw ? 'Oda zilizoingia' : 'Incoming'} ({incoming.length})
                </Button>
                <Button variant={tab === 'outgoing' ? 'primary' : 'ghost'} onClick={() => setTab('outgoing')}>
                  <PackageSearch className="mr-2 h-4 w-4" />
                  {sw ? 'Oda zangu' : 'My orders'} ({outgoing.length})
                </Button>
              </div>

              {rows.length === 0 ? (
                <Card className="p-6 text-center text-sm text-ink-muted">
                  {tab === 'incoming'
                    ? (sw ? 'Hakuna duka lililokuagiza mzigo bado.' : 'No shop has ordered from you yet.')
                    : (sw ? 'Hujaagiza mzigo kwa duka lingine bado.' : 'You have not ordered from another shop yet.')}
                </Card>
              ) : (
                <ul className="space-y-3">
                  {rows.map((order) => (
                    <li key={order.orderId}>
                      <Card className="p-4">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="font-medium text-ink">
                              {Math.round(order.quantity).toLocaleString('en-US')}
                              {order.unit ? ` ${order.unit}` : ''} {order.productName}
                            </p>
                            <p className="mt-1 text-sm text-ink-muted">
                              {tab === 'incoming'
                                ? (sw ? `Kutoka ${order.buyerName}` : `From ${order.buyerName}`)
                                : (sw ? `Kwa ${order.supplierName}` : `To ${order.supplierName}`)}
                              {' · '}{formatDateTime(order.placedAt)}
                            </p>
                            {/* A fuzzy match means the two shops never shared a
                                barcode and only the names resembled each other.
                                The supplier is the one who can catch it. */}
                            {tab === 'incoming' && order.matchBasis === 'fuzzy_name' && (
                              <p className="mt-2 text-xs text-amber-700">
                                {sw
                                  ? 'Hakikisha bidhaa ni sahihi — jina lilifanana tu, halikulingana kabisa.'
                                  : 'Check the product is right — the names only resembled each other.'}
                              </p>
                            )}
                          </div>
                          <span className={`shrink-0 rounded px-2 py-1 text-xs font-medium ${statusClass(order.status)}`}>
                            {statusLabel(order.status, sw)}
                          </span>
                        </div>

                        {tab === 'incoming' && order.status === 'placed' && (
                          <div className="mt-3 flex gap-2 border-t border-border pt-3">
                            <Button disabled={busy === order.orderId} onClick={() => void respond(order, 'accepted')}>
                              {busy === order.orderId
                                ? <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                : <Check className="mr-2 h-4 w-4" />}
                              {sw ? 'Kubali' : 'Accept'}
                            </Button>
                            <Button variant="secondary" disabled={busy === order.orderId} onClick={() => void respond(order, 'rejected')}>
                              <X className="mr-2 h-4 w-4" />
                              {sw ? 'Kataa' : 'Decline'}
                            </Button>
                          </div>
                        )}
                        {tab === 'incoming' && order.status === 'accepted' && (
                          <div className="mt-3 border-t border-border pt-3">
                            <Button variant="secondary" disabled={busy === order.orderId} onClick={() => void respond(order, 'delivered')}>
                              <Truck className="mr-2 h-4 w-4" />
                              {sw ? 'Nimempelekea' : 'Mark delivered'}
                            </Button>
                          </div>
                        )}
                      </Card>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
