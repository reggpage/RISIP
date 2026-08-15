import { useMemo, useState } from 'react';
import { AlertTriangle, Archive, Package, Pencil, Plus, RefreshCw, Search, TrendingDown } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import UnderlineTabs from '@/components/ui/UnderlineTabs';
import EmptyState from '@/components/ui/EmptyState';
import { useAuth } from '@/lib/auth';
import { useToast } from '@/components/ui/Toast';
import { friendlyError } from '@/lib/errors';
import { formatDate, formatMoney } from '@/lib/format';
import { getLang } from '@/lib/lang';
import {
  formatQuantity,
  marginPercent,
  needsCost,
  soldBelowCost,
  archiveProduct,
  formatOnHand,
  stockLooksWrong,
  useStockLevels,
  type StockLevel,
  unarchiveProduct,
  useProductCatalog,
  type CatalogProduct,
  type CatalogRange,
} from '@/features/products/products';
import ProductEditDialog from '@/components/products/ProductEditDialog';
import ProductRowMenu from '@/components/products/ProductRowMenu';
import ProductMergeDialog from '@/components/products/ProductMergeDialog';
import AddProductDialog from '@/components/products/AddProductDialog';

const lang = getLang();
const ui = lang === 'sw' ? {
  title: 'Bidhaa',
  description: 'Kila kitu unachouza, kilichojengwa kutoka mauzo yaliyothibitishwa.',
  refresh: 'Onyesha upya',
  search: 'Tafuta bidhaa',
  all: 'Zote', month: 'Mwezi huu', week: 'Wiki hii',
  products: 'Bidhaa', missingCost: 'Hazina bei ya kununua', belowCost: 'Zinauzwa chini ya gharama',
  coverage: 'Faida inayoonekana',
  coverageHint: 'Sehemu ya mauzo ambayo makisio ya faida yanaweza kuiona.',
  sold: 'Imeuzwa', revenue: 'Mapato', buying: 'Kununua', selling: 'Wastani wa mauzo', margin: 'Faida',
  lastSold: 'Mauzo ya mwisho', never: 'Bado haijauzwa',
  setCost: 'Weka bei ya kununua', editCost: 'Badilisha bei', edit: 'Hariri',
  unknown: 'Haijulikani',
  needsCostBadge: 'Bei ya kununua inakosekana',
  belowCostBadge: 'Chini ya gharama',
  perUnit: 'kwa kimoja',
  empty: 'Bado hakuna bidhaa.',
  emptyHint: 'Rekodi mauzo kupitia WhatsApp au app, na bidhaa zitajitokeza hapa zenyewe.',
  noMatch: 'Hakuna bidhaa yenye jina hilo.',
  onlyFinance: 'Bei za kununua zinaonekana kwa owner na accountant tu.',
  measured: 'Inapimwa', counted: 'Inahesabiwa', period: 'Kipindi',
  add: 'Ongeza bidhaa', merge: 'Unganisha', archive: 'Ficha', restore: 'Rudisha',
  showArchived: 'Onyesha zilizofichwa', archivedBadge: 'Imefichwa',
  archived: 'Bidhaa imefichwa. Mauzo yake ya zamani bado yanahesabiwa.',
  restored: 'Bidhaa imerudishwa kwenye orodha.',
  onHand: 'Store', notCounted: 'Hazijahesabiwa', count: 'Hesabu', recount: 'Hesabu tena',
  stockWrong: 'Zimeuzwa zaidi ya zilizopo',
  noDelete: 'Hakuna kufuta. Bidhaa yenye mauzo halisi ikifutwa, mapato ya miezi iliyopita yangebadilika kimya.',
} : {
  title: 'Products',
  description: 'Everything you sell, built from confirmed sales.',
  refresh: 'Refresh',
  search: 'Search products',
  all: 'All time', month: 'This month', week: 'This week',
  products: 'Products', missingCost: 'Missing a buying price', belowCost: 'Sold below cost',
  coverage: 'Profit visible',
  coverageHint: 'The share of sales the profit estimate can actually see.',
  sold: 'Sold', revenue: 'Revenue', buying: 'Buying', selling: 'Avg sale', margin: 'Margin',
  lastSold: 'Last sold', never: 'Not sold yet',
  setCost: 'Set buying price', editCost: 'Change price', edit: 'Edit',
  unknown: 'Unknown',
  needsCostBadge: 'Buying price missing',
  belowCostBadge: 'Below cost',
  perUnit: 'each',
  empty: 'No products yet.',
  emptyHint: 'Record sales on WhatsApp or in the app and products appear here on their own.',
  noMatch: 'No product matches that name.',
  onlyFinance: 'Buying prices are visible to an owner or accountant only.',
  measured: 'Measured', counted: 'Counted', period: 'Period',
  add: 'Add product', merge: 'Merge', archive: 'Hide', restore: 'Restore',
  showArchived: 'Show hidden', archivedBadge: 'Hidden',
  archived: 'Product hidden. Its past sales still count.',
  restored: 'Product is back on the list.',
  onHand: 'Store', notCounted: 'Not counted', count: 'Count', recount: 'Recount',
  stockWrong: 'Sold more than counted',
  noDelete: 'There is no delete. Removing a product with real sales would silently change months already reported.',
};

const ranges: { value: CatalogRange; label: string }[] = [
  { value: 'all', label: ui.all },
  { value: 'month', label: ui.month },
  { value: 'week', label: ui.week },
];

/**
 * One figure with its name above it. Baymard's finding on list items is that
 * when the parts of a row run together the reader has to pull them apart again
 * for every row; keeping each number in its own labelled column is what makes a
 * long list scannable.
 */
function Figure({ label, value, tone = 'ink', hint }: {
  label: string; value: string; tone?: 'ink' | 'muted' | 'good' | 'bad'; hint?: string;
}) {
  const colour = tone === 'muted' ? 'text-ink-muted'
    : tone === 'good' ? 'text-emerald-600'
    : tone === 'bad' ? 'text-red-600' : 'text-ink';
  return (
    <div className="min-w-0">
      <div className="text-[11px] uppercase tracking-wide text-ink-muted">{label}</div>
      <div className={`truncate text-sm font-semibold tabular-nums ${colour}`}>{value}</div>
      {hint ? <div className="truncate text-[11px] text-ink-muted">{hint}</div> : null}
    </div>
  );
}

function SummaryTile({ label, value, hint, tone }: {
  label: string; value: string; hint?: string; tone?: 'warn' | 'bad';
}) {
  const accent = tone === 'bad' ? 'text-red-600' : tone === 'warn' ? 'text-amber-600' : 'text-ink';
  return (
    <Card className="p-4">
      <div className="text-xs text-ink-muted">{label}</div>
      <div className={`mt-1 font-display text-2xl font-semibold tabular-nums ${accent}`}>{value}</div>
      {hint ? <div className="mt-1 text-[11px] leading-snug text-ink-muted">{hint}</div> : null}
    </Card>
  );
}

function ProductRow({ product, level, canPrice, onEdit, onMerge, onArchive, onRestore }: {
  product: CatalogProduct;
  level: StockLevel | null;
  canPrice: boolean;
  onEdit: (product: CatalogProduct, tab: 'count' | 'price') => void;
  onMerge: (product: CatalogProduct) => void;
  onArchive: (product: CatalogProduct) => void;
  onRestore: (product: CatalogProduct) => void;
}) {
  const missing = needsCost(product);
  const below = soldBelowCost(product);
  const percent = marginPercent(product);
  const onHand = level ? formatOnHand(level, lang) : null;
  const stockOff = level ? stockLooksWrong(level) : false;

  return (
    <div className={`flex flex-col gap-3 border-b border-surface-border px-4 py-3 last:border-b-0 sm:flex-row sm:items-center ${product.archived ? 'opacity-60' : ''}`}>
      {/* Name and what kind of thing it is. */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-medium text-ink">{product.productName}</span>
          {product.archived ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-surface-muted px-2 py-0.5 text-[11px] font-medium text-ink-muted">
              <Archive className="h-3 w-3" aria-hidden />{ui.archivedBadge}
            </span>
          ) : null}
          {missing ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
              <AlertTriangle className="h-3 w-3" aria-hidden />{ui.needsCostBadge}
            </span>
          ) : null}
          {below ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700">
              <TrendingDown className="h-3 w-3" aria-hidden />{ui.belowCostBadge}
            </span>
          ) : null}
        </div>
        <div className="mt-0.5 text-xs text-ink-muted">
          {product.measured ? ui.measured : ui.counted}
          {product.unit ? ` · ${product.unit}` : ''}
          {product.lastSoldAt ? ` · ${ui.lastSold} ${formatDate(product.lastSoldAt)}` : ` · ${ui.never}`}
        </div>
      </div>

      {/* The numbers, each in its own labelled column so rows stay comparable. */}
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:w-[36rem] sm:grid-cols-5 sm:gap-y-0">
        <Figure
          label={ui.onHand}
          value={onHand ?? ui.notCounted}
          tone={onHand === null ? 'muted' : stockOff ? 'bad' : 'ink'}
          hint={stockOff ? ui.stockWrong : undefined}
        />
        <Figure label={ui.sold} value={formatQuantity(product, lang)} />
        <Figure label={ui.revenue} value={formatMoney(product.revenue)} />
        <Figure
          label={ui.buying}
          value={product.unitCost === null ? '—' : formatMoney(product.unitCost)}
          tone={product.unitCost === null ? 'muted' : 'ink'}
          hint={product.avgUnitPrice === null ? undefined : `${ui.selling} ${formatMoney(product.avgUnitPrice)}`}
        />
        <Figure
          label={ui.margin}
          value={product.estimatedMargin === null ? '—' : formatMoney(product.estimatedMargin)}
          tone={product.estimatedMargin === null ? 'muted' : product.estimatedMargin < 0 ? 'bad' : 'good'}
          hint={percent === null ? undefined : `${percent.toFixed(0)}%`}
        />
      </div>

      {canPrice ? (
        <div className="flex items-center gap-1.5 sm:w-40 sm:justify-end">
          {/* One everyday button. Counting and pricing are the two things done
              often, and they are two tabs of one card rather than two buttons
              competing for the same corner of a busy row. */}
          <Button
            variant={missing ? 'primary' : 'secondary'}
            onClick={() => onEdit(product, missing ? 'price' : 'count')}
          >
            <Pencil className="h-4 w-4" aria-hidden />{ui.edit}
          </Button>
          <ProductRowMenu
            product={product}
            onMerge={onMerge}
            onArchive={onArchive}
            onRestore={onRestore}
          />
        </div>
      ) : null}
    </div>
  );
}

export default function ProductsPage() {
  const auth = useAuth();
  const role = auth.status === 'signed-in' ? auth.profile?.role : undefined;
  const canPrice = role === 'owner' || role === 'accountant';
  const [range, setRange] = useState<CatalogRange>('all');
  const [query, setQuery] = useState('');
  const [editing, setEditing] = useState<{ product: CatalogProduct; tab: 'count' | 'price' } | null>(null);
  const [merging, setMerging] = useState<CatalogProduct | null>(null);
  const [adding, setAdding] = useState(false);
  const stock = useStockLevels();
  const [showArchived, setShowArchived] = useState(false);
  const toast = useToast();
  const state = useProductCatalog(range, showArchived);
  const levelFor = (key: string) => stock.levels.find((level) => level.productKey === key) ?? null;

  async function hide(product: CatalogProduct) {
    try {
      await archiveProduct(product.productKey, null);
      toast.success(ui.archived);
      void state.reload();
    } catch (error) { toast.error(friendlyError(error)); }
  }

  async function restore(product: CatalogProduct) {
    try {
      await unarchiveProduct(product.productKey);
      toast.success(ui.restored);
      void state.reload();
    } catch (error) { toast.error(friendlyError(error)); }
  }

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return state.products;
    return state.products.filter((product) => product.productKey.includes(needle));
  }, [state.products, query]);

  return (
    <div className="mx-auto max-w-6xl p-4 sm:p-6">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-ink">{ui.title}</h1>
          <p className="mt-1 text-sm text-ink-muted">{ui.description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => void state.reload()}>
            <RefreshCw className="h-4 w-4" aria-hidden />{ui.refresh}
          </Button>
          {canPrice ? (
            <Button onClick={() => setAdding(true)}>
              <Plus className="h-4 w-4" aria-hidden />{ui.add}
            </Button>
          ) : null}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <SummaryTile label={ui.products} value={String(state.summary.total)} />
        <SummaryTile
          label={ui.missingCost}
          value={String(state.summary.missingCost)}
          tone={state.summary.missingCost > 0 ? 'warn' : undefined}
        />
        <SummaryTile
          label={ui.belowCost}
          value={String(state.summary.belowCost)}
          tone={state.summary.belowCost > 0 ? 'bad' : undefined}
        />
        <SummaryTile
          label={ui.coverage}
          value={`${state.summary.coverage.toFixed(0)}%`}
          hint={ui.coverageHint}
        />
      </div>

      <div className="mt-5 flex flex-wrap items-end gap-3">
        <UnderlineTabs tabs={ranges} value={range} onChange={setRange} label={ui.period} className="flex-1" />
        <div className="relative w-full min-w-[12rem] sm:w-64">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-muted" aria-hidden />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={ui.search}
            aria-label={ui.search}
            className="pl-9"
          />
        </div>
      </div>

      <div className="mt-3 mb-3 flex flex-wrap items-center justify-between gap-2">
        {canPrice ? (
          <label className="flex items-center gap-2 text-xs text-ink-muted">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(event) => setShowArchived(event.target.checked)}
              className="h-3.5 w-3.5 accent-role-admin"
            />
            {ui.showArchived}
          </label>
        ) : (
          <p className="text-xs text-ink-muted">{ui.onlyFinance}</p>
        )}
      </div>

      <Card className="p-0">
        {state.loading ? (
          <div className="space-y-3 p-4">
            {[0, 1, 2, 3].map((row) => <Skeleton key={row} className="h-12 w-full" />)}
          </div>
        ) : visible.length === 0 ? (
          <div className="p-6">
            <EmptyState
              icon={<Package className="h-8 w-8" aria-hidden />}
              title={state.products.length === 0 ? ui.empty : ui.noMatch}
              description={state.products.length === 0 ? ui.emptyHint : undefined}
            />
          </div>
        ) : (
          visible.map((product) => (
            <ProductRow
              key={product.productKey}
              product={product}
              level={levelFor(product.productKey)}
              canPrice={canPrice}
              onEdit={(item, tab) => setEditing({ product: item, tab })}
              onMerge={setMerging}
              onArchive={(item) => void hide(item)}
              onRestore={(item) => void restore(item)}
            />
          ))
        )}
      </Card>

      {/* Said once, at the bottom, so nobody hunts for a delete button that is
          deliberately not there. */}
      {canPrice ? <p className="mt-3 text-[11px] leading-snug text-ink-muted">{ui.noDelete}</p> : null}

      {editing ? (
        <ProductEditDialog
          product={editing.product}
          level={levelFor(editing.product.productKey)}
          initialTab={editing.tab}
          onClose={() => setEditing(null)}
          // Saving refreshes the list behind the dialog but leaves the dialog
          // open. One product usually needs two or three of these tabs filled
          // in, and closing after each one meant finding the row again every
          // time. Only the X closes it.
          onSaved={() => { void state.reload(); void stock.reload(); }}
        />
      ) : null}

      {merging ? (
        <ProductMergeDialog
          product={merging}
          all={state.products}
          onClose={() => setMerging(null)}
          onDone={() => { setMerging(null); void state.reload(); }}
        />
      ) : null}

      {adding ? (
        <AddProductDialog
          onClose={() => setAdding(false)}
          onAdded={() => { setAdding(false); void state.reload(); }}
        />
      ) : null}
    </div>
  );
}
