import { useMemo, useState } from 'react';
import { AlertTriangle, Package, RefreshCw, Search, TrendingDown } from 'lucide-react';
import { Card } from '@/components/ui/Card';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import { Skeleton } from '@/components/ui/Skeleton';
import EmptyState from '@/components/ui/EmptyState';
import { useAuth } from '@/lib/auth';
import { formatDate, formatMoney } from '@/lib/format';
import { getLang } from '@/lib/lang';
import {
  formatQuantity,
  marginPercent,
  needsCost,
  soldBelowCost,
  useProductCatalog,
  type CatalogProduct,
  type CatalogRange,
} from '@/features/products/products';
import ProductCostDialog from '@/components/products/ProductCostDialog';

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
  sold: 'Imeuzwa', revenue: 'Mapato', buying: 'Kununua', selling: 'Kuuza', margin: 'Faida',
  lastSold: 'Mauzo ya mwisho', never: 'Bado haijauzwa',
  setCost: 'Weka bei ya kununua', editCost: 'Badilisha bei',
  unknown: 'Haijulikani',
  needsCostBadge: 'Bei ya kununua inakosekana',
  belowCostBadge: 'Chini ya gharama',
  perUnit: 'kwa kimoja',
  empty: 'Bado hakuna bidhaa.',
  emptyHint: 'Rekodi mauzo kupitia WhatsApp au app, na bidhaa zitajitokeza hapa zenyewe.',
  noMatch: 'Hakuna bidhaa yenye jina hilo.',
  onlyFinance: 'Bei za kununua zinaonekana kwa owner na accountant tu.',
  measured: 'Inapimwa', counted: 'Inahesabiwa',
} : {
  title: 'Products',
  description: 'Everything you sell, built from confirmed sales.',
  refresh: 'Refresh',
  search: 'Search products',
  all: 'All time', month: 'This month', week: 'This week',
  products: 'Products', missingCost: 'Missing a buying price', belowCost: 'Sold below cost',
  coverage: 'Profit visible',
  coverageHint: 'The share of sales the profit estimate can actually see.',
  sold: 'Sold', revenue: 'Revenue', buying: 'Buying', selling: 'Selling', margin: 'Margin',
  lastSold: 'Last sold', never: 'Not sold yet',
  setCost: 'Set buying price', editCost: 'Change price',
  unknown: 'Unknown',
  needsCostBadge: 'Buying price missing',
  belowCostBadge: 'Below cost',
  perUnit: 'each',
  empty: 'No products yet.',
  emptyHint: 'Record sales on WhatsApp or in the app and products appear here on their own.',
  noMatch: 'No product matches that name.',
  onlyFinance: 'Buying prices are visible to an owner or accountant only.',
  measured: 'Measured', counted: 'Counted',
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
    : tone === 'bad' ? 'text-rose-600' : 'text-ink';
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
  const accent = tone === 'bad' ? 'text-rose-600' : tone === 'warn' ? 'text-amber-600' : 'text-ink';
  return (
    <Card className="p-4">
      <div className="text-xs text-ink-muted">{label}</div>
      <div className={`mt-1 text-2xl font-semibold tabular-nums ${accent}`}>{value}</div>
      {hint ? <div className="mt-1 text-[11px] leading-snug text-ink-muted">{hint}</div> : null}
    </Card>
  );
}

function ProductRow({ product, canPrice, onPrice }: {
  product: CatalogProduct; canPrice: boolean; onPrice: (product: CatalogProduct) => void;
}) {
  const missing = needsCost(product);
  const below = soldBelowCost(product);
  const percent = marginPercent(product);

  return (
    <div className="flex flex-col gap-3 border-b border-surface-border px-4 py-3 last:border-b-0 sm:flex-row sm:items-center">
      {/* Name and what kind of thing it is. */}
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate font-medium text-ink">{product.productName}</span>
          {missing ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
              <AlertTriangle className="h-3 w-3" aria-hidden />{ui.needsCostBadge}
            </span>
          ) : null}
          {below ? (
            <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700">
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
      <div className="grid grid-cols-2 gap-x-4 gap-y-2 sm:w-[30rem] sm:grid-cols-4 sm:gap-y-0">
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
        <div className="sm:w-40 sm:text-right">
          <Button variant={missing ? 'primary' : 'secondary'} onClick={() => onPrice(product)}>
            {missing ? ui.setCost : ui.editCost}
          </Button>
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
  const [pricing, setPricing] = useState<CatalogProduct | null>(null);
  const state = useProductCatalog(range);

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return state.products;
    return state.products.filter((product) => product.productKey.includes(needle));
  }, [state.products, query]);

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-ink">{ui.title}</h1>
          <p className="text-sm text-ink-muted">{ui.description}</p>
        </div>
        <Button variant="secondary" onClick={() => void state.reload()}>
          <RefreshCw className="mr-2 h-4 w-4" aria-hidden />{ui.refresh}
        </Button>
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

      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex rounded-lg border border-surface-border bg-surface p-0.5">
          {ranges.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setRange(option.value)}
              className={`rounded-md px-3 py-1.5 text-sm ${
                range === option.value ? 'bg-brand text-white' : 'text-ink-muted hover:text-ink'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="relative min-w-[12rem] flex-1">
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

      {!canPrice ? <p className="text-xs text-ink-muted">{ui.onlyFinance}</p> : null}

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
              canPrice={canPrice}
              onPrice={setPricing}
            />
          ))
        )}
      </Card>

      {pricing ? (
        <ProductCostDialog
          product={pricing}
          onClose={() => setPricing(null)}
          onSaved={() => { setPricing(null); void state.reload(); }}
        />
      ) : null}
    </div>
  );
}
