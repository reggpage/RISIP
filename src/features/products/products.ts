import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '@/lib/supabase';

export type CatalogProduct = {
  productKey: string;
  productName: string;
  /** Descriptive only — "kilo", "kipande", "lita". Nothing converts between them. */
  unit: string | null;
  quantitySold: number;
  revenue: number;
  saleLines: number;
  lastSoldAt: string | null;
  /** True when a quantity has ever been fractional, so this is weighed or measured. */
  measured: boolean;
  unitCost: number | null;
  costEffectiveFrom: string | null;
  avgUnitPrice: number | null;
  estimatedMargin: number | null;
};

export type CatalogRange = 'all' | 'month' | 'week';

/**
 * How a quantity should be written.
 *
 * A shop sells 2.5 kilos of sugar and 3 exercise books. Printing "2.5" and "3"
 * with no unit makes the two look like the same kind of number, and the trader
 * has to remember which is which for every row. Where the trader has told us a
 * unit we use it; otherwise we fall back to the shape of the numbers themselves.
 */
export function formatQuantity(product: CatalogProduct, lang: 'sw' | 'en'): string {
  const decimals = product.measured ? 2 : 0;
  const amount = product.quantitySold.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
  if (product.unit) return `${amount} ${product.unit}`;
  if (product.measured) return amount;
  return lang === 'sw' ? `${amount} vipande` : `${amount} pcs`;
}

/** Margin as a share of revenue, or null when either half is unknown. */
export function marginPercent(product: CatalogProduct): number | null {
  if (product.estimatedMargin === null || product.revenue <= 0) return null;
  return (product.estimatedMargin / product.revenue) * 100;
}

/**
 * A product is only fully known once its buying price is in. Everything else on
 * the row comes from the sales themselves, so this is the single gap the owner
 * can close — and the reason profit is an estimate rather than a figure.
 */
export function needsCost(product: CatalogProduct): boolean {
  return product.unitCost === null;
}

/** Selling below what it costs. Worth seeing immediately, not at month end. */
export function soldBelowCost(product: CatalogProduct): boolean {
  return product.unitCost !== null
    && product.avgUnitPrice !== null
    && product.avgUnitPrice < product.unitCost;
}

function rangeBounds(range: CatalogRange): { from: string | null; to: string | null } {
  if (range === 'all') return { from: null, to: null };
  const now = new Date();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  if (range === 'week') {
    const mondayOffset = (start.getDay() + 6) % 7;
    start.setDate(start.getDate() - mondayOffset);
  } else {
    start.setDate(1);
  }
  return { from: start.toISOString(), to: null };
}

type Row = {
  product_key: string;
  product_name: string;
  unit: string | null;
  quantity_sold: string | number;
  revenue: string | number;
  sale_lines: number;
  last_sold_at: string | null;
  measured: boolean;
  unit_cost: string | number | null;
  cost_effective_from: string | null;
  avg_unit_price: string | number | null;
  estimated_margin: string | number | null;
};

const num = (value: string | number | null): number | null =>
  value === null || value === undefined ? null : Number(value);

export function useProductCatalog(range: CatalogRange) {
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { from, to } = rangeBounds(range);
    const { data, error: rpcError } = await supabase
      .rpc('company_product_catalog', { p_from: from, p_to: to });
    if (rpcError) {
      setError(rpcError);
      setProducts([]);
    } else {
      setProducts(((data ?? []) as unknown as Row[]).map((row) => ({
        productKey: row.product_key,
        productName: row.product_name,
        unit: row.unit,
        quantitySold: Number(row.quantity_sold ?? 0),
        revenue: Number(row.revenue ?? 0),
        saleLines: Number(row.sale_lines ?? 0),
        lastSoldAt: row.last_sold_at,
        measured: Boolean(row.measured),
        unitCost: num(row.unit_cost),
        costEffectiveFrom: row.cost_effective_from,
        avgUnitPrice: num(row.avg_unit_price),
        estimatedMargin: num(row.estimated_margin),
      })));
    }
    setLoading(false);
  }, [range]);

  useEffect(() => { void load(); }, [load]);

  const summary = useMemo(() => {
    const priced = products.filter((product) => !needsCost(product));
    const revenue = products.reduce((sum, product) => sum + product.revenue, 0);
    const pricedRevenue = priced.reduce((sum, product) => sum + product.revenue, 0);
    return {
      total: products.length,
      missingCost: products.length - priced.length,
      belowCost: products.filter(soldBelowCost).length,
      revenue,
      // The share of trade the profit estimate can actually see. Reporting a
      // profit without this number would present a partial figure as a whole one.
      coverage: revenue > 0 ? (pricedRevenue / revenue) * 100 : 0,
    };
  }, [products]);

  return { products, summary, loading, error, reload: load };
}

/** Records a new buying price. Append-only: a change is a new row, never an edit. */
export async function setProductCost(name: string, unitCost: number, unit: string | null, note: string | null) {
  const { data, error } = await supabase.rpc('set_product_cost', {
    p_name: name,
    p_unit_cost: unitCost,
    p_unit: unit,
    p_note: note,
  });
  if (error) throw error;
  return data as unknown as { id: string; product: string; unit_cost: number; previous_cost: number | null };
}
