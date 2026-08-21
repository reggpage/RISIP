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
  /** Hidden from the list, but still counted in every report. */
  archived: boolean;
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
  archived: boolean;
};

const num = (value: string | number | null): number | null =>
  value === null || value === undefined ? null : Number(value);

export function useProductCatalog(range: CatalogRange, includeArchived = false) {
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { from, to } = rangeBounds(range);
    const { data, error: rpcError } = await supabase
      .rpc('company_product_catalog', { p_from: from, p_to: to, p_include_archived: includeArchived });
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
        archived: Boolean(row.archived),
      })));
    }
    setLoading(false);
  }, [range, includeArchived]);

  useEffect(() => { void load(); }, [load]);

  const summary = useMemo(() => {
    const live = products.filter((product) => !product.archived);
    const priced = live.filter((product) => !needsCost(product));
    const revenue = live.reduce((sum, product) => sum + product.revenue, 0);
    const pricedRevenue = priced.reduce((sum, product) => sum + product.revenue, 0);
    return {
      total: live.length,
      missingCost: live.length - priced.length,
      belowCost: live.filter(soldBelowCost).length,
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

export type ProductSaleUnitSetup = {
  unit: string;
  baseQuantity: number;
  retail: number;
  wholesale?: number | null;
  minQty?: number | null;
};

/**
 * Configures a measured product in one server transaction.
 *
 * The caller supplies explicit conversions; neither this client nor the RPC
 * infers what "robo", "nusu", a bucket, or a sack means. The server validates
 * the company/role, conversions and prices before writing any unit, cost or
 * selling-price snapshot.
 */
export async function configureProductUnits(input: {
  name: string;
  baseUnit: string;
  purchaseUnit: string;
  purchaseSize: number;
  purchaseCost: number;
  saleUnits: ProductSaleUnitSetup[];
}) {
  const { data, error } = await (supabase as any).rpc('configure_product_units', {
    p_name: input.name,
    p_base_unit: input.baseUnit,
    p_purchase_unit: input.purchaseUnit,
    p_purchase_size: input.purchaseSize,
    p_purchase_cost: input.purchaseCost,
    p_sale_units: input.saleUnits.map((unit) => ({
      unit: unit.unit,
      base_quantity: unit.baseQuantity,
      retail: unit.retail,
      wholesale: unit.wholesale ?? null,
      min_qty: unit.minQty ?? null,
    })),
  });
  if (error) throw error;
  return data as unknown as {
    product: string;
    base_unit: string;
    purchase_unit: string;
    purchase_size: number;
    selling_units: number;
  };
}

/**
 * Folds one product name into another.
 *
 * The sales are re-labelled and nothing else moves — the server compares total
 * revenue before and after and refuses the merge if it changed. There is no
 * delete: a product carrying real sales cannot be removed without silently
 * changing a month that has already been reported.
 */
export async function mergeProducts(fromKey: string, intoKey: string, reason: string | null) {
  const { data, error } = await supabase.rpc('merge_products', {
    p_from_key: fromKey,
    p_into_key: intoKey,
    p_reason: reason,
  });
  if (error) throw error;
  return data as unknown as {
    merged_into: string; lines_moved: number; costs_moved: number; revenue: number;
  };
}

export type ProductRenamePreview = {
  from_key: string;
  to_key: string;
  to_name: string;
  sale_lines: number;
  cost_rows: number;
  price_rows: number;
  stock_counts: number;
  unit_rows: number;
  records: number;
};

export async function previewProductRename(from: string, to: string): Promise<ProductRenamePreview> {
  const { data, error } = await (supabase as any).rpc('preview_product_rename', { p_from: from, p_to: to });
  if (error) throw error;
  return data as unknown as ProductRenamePreview;
}

export async function renameProduct(from: string, to: string, reason: string | null) {
  const { data, error } = await (supabase as any).rpc('rename_product', { p_from: from, p_to: to, p_reason: reason });
  if (error) throw error;
  return data as unknown as ProductRenamePreview & { revenue: number };
}

/** Takes a product out of the list. Its past sales keep counting everywhere. */
export async function archiveProduct(key: string, reason: string | null) {
  const { error } = await supabase.rpc('archive_product', { p_key: key, p_reason: reason });
  if (error) throw error;
}

export async function unarchiveProduct(key: string) {
  const { error } = await supabase.rpc('unarchive_product', { p_key: key });
  if (error) throw error;
}

/**
 * Products this one could sensibly be folded into.
 *
 * Ranked by how similar the names are, because the reason two rows exist is
 * almost always a stray character rather than two genuinely different goods.
 */
export function mergeCandidates(product: CatalogProduct, all: CatalogProduct[]): CatalogProduct[] {
  const strip = (value: string) => value.toLowerCase().replace(/[^a-z0-9]/g, '');
  const target = strip(product.productKey);
  return all
    .filter((other) => other.productKey !== product.productKey && !other.archived)
    .map((other) => {
      const key = strip(other.productKey);
      const score = key === target ? 3
        : key.includes(target) || target.includes(key) ? 2
        : key.slice(0, 5) === target.slice(0, 5) && target.length >= 5 ? 1
        : 0;
      return { other, score };
    })
    .sort((a, b) => b.score - a.score || a.other.productName.localeCompare(b.other.productName))
    .map((item) => item.other);
}

export type StockLevel = {
  productKey: string;
  productName: string;
  unit: string | null;
  measured: boolean;
  countedQty: number | null;
  countedAt: string | null;
  /**
   * False means nobody has ever counted this product. `onHand` is then only the
   * movements Risip happened to see, and must never be shown as a stock figure.
   */
  hasCount: boolean;
  boughtSince: number;
  soldSince: number;
  onHand: number;
  incompletePurchases: boolean;
};

/** How a stock figure should be written, or null when there is no figure to write. */
export function formatOnHand(level: StockLevel, lang: 'sw' | 'en'): string | null {
  if (!level.hasCount) return null;
  const amount = level.onHand.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: level.measured ? 2 : 0,
  });
  if (level.unit) return `${amount} ${level.unit}`;
  return level.measured ? amount : (lang === 'sw' ? `${amount} vipande` : `${amount} pcs`);
}

/** Sold more than the count says exists — the books and the shelf disagree. */
export function stockLooksWrong(level: StockLevel): boolean {
  return level.hasCount && level.onHand < 0;
}

export function useStockLevels() {
  const [levels, setLevels] = useState<StockLevel[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('company_stock_on_hand');
    if (error) {
      setLevels([]);
    } else {
      setLevels(((data ?? []) as unknown as Record<string, unknown>[]).map((row) => ({
        productKey: String(row.product_key ?? ''),
        productName: String(row.product_name ?? ''),
        unit: row.unit ? String(row.unit) : null,
        measured: Boolean(row.measured),
        countedQty: row.counted_qty === null || row.counted_qty === undefined ? null : Number(row.counted_qty),
        countedAt: row.counted_at ? String(row.counted_at) : null,
        hasCount: Boolean(row.has_count),
        boughtSince: Number(row.bought_since ?? 0),
        soldSince: Number(row.sold_since ?? 0),
        onHand: Number(row.on_hand ?? 0),
        incompletePurchases: Boolean(row.incomplete_purchases),
      })));
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);
  return { levels, loading, reload: load };
}

/** Records a physical count. A count states what is there; it is never an adjustment. */
export async function recordStockCount(name: string, quantity: number, unit: string | null, note: string | null) {
  const { data, error } = await supabase.rpc('record_stock_count', {
    p_name: name, p_quantity: quantity, p_unit: unit, p_note: note,
  });
  if (error) throw error;
  return data as unknown as { id: string; product: string; quantity: number };
}

export type SellingPriceRow = {
  productKey?: string;
  saleUnit: string | null;
  saleUnitKey: string | null;
  unitBaseQuantity: number;
  retailPrice: number;
  wholesalePrice: number | null;
  wholesaleMinQty: number | null;
};

export type ProductUnitRow = {
  unitKey: string;
  unitName: string;
  baseQuantity: number;
  isBase: boolean;
  canPurchase: boolean;
  canSell: boolean;
  canCount: boolean;
};

export type ProductCostSnapshot = {
  unitCost: number;
  unit: string | null;
  baseUnitCost: number;
  baseUnit: string | null;
  unitBaseQuantity: number;
};

/**
 * What the shop has decided to charge — not what it happened to get.
 *
 * Kept apart from the buying cost on purpose. The cost is a fact about a
 * supplier; this is a decision about a customer, and the WhatsApp assistant
 * prices a sale from it when the message states quantities only.
 */
export async function setSellingPrice(
  name: string,
  retail: number,
  wholesale: number | null,
  minQty: number | null,
) {
  const { data, error } = await supabase.rpc('set_selling_price', {
    p_name: name,
    p_retail: retail,
    p_wholesale: wholesale,
    p_min_qty: minQty,
  });
  if (error) throw error;
  return data as unknown as { id: string; product: string };
}

/** The price currently in force, or null when the shop never set one. */
export async function fetchSellingPrice(productKey: string): Promise<SellingPriceRow | null> {
  return (await fetchCurrentSellingPrices(productKey))[0] ?? null;
}


/** Current append-only price snapshot for every product + selling unit. */
export async function fetchCurrentSellingPrices(productKey?: string): Promise<SellingPriceRow[]> {
  const { data, error } = await (supabase as any).rpc('company_current_selling_prices', {
    p_product_key: productKey ?? null,
  });
  if (error) throw error;
  return (data ?? []).map((row: Record<string, unknown>) => ({
      productKey: String(row.product_key),
      saleUnit: row.sale_unit ? String(row.sale_unit) : null,
      saleUnitKey: row.sale_unit_key ? String(row.sale_unit_key) : null,
      unitBaseQuantity: Number(row.unit_base_quantity ?? 1),
      retailPrice: Number(row.retail_price),
      wholesalePrice: row.wholesale_price === null ? null : Number(row.wholesale_price),
      wholesaleMinQty: row.wholesale_min_qty === null ? null : Number(row.wholesale_min_qty),
    }));
}

export async function fetchProductUnits(productKey: string): Promise<ProductUnitRow[]> {
  const { data, error } = await (supabase as any)
    .from('product_units')
    .select('unit_key, unit_name, base_quantity, is_base, can_purchase, can_sell, can_count')
    .eq('product_key', productKey)
    .order('base_quantity', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((row: Record<string, unknown>) => ({
    unitKey: String(row.unit_key),
    unitName: String(row.unit_name),
    baseQuantity: Number(row.base_quantity),
    isBase: Boolean(row.is_base),
    canPurchase: Boolean(row.can_purchase),
    canSell: Boolean(row.can_sell),
    canCount: Boolean(row.can_count),
  }));
}

export async function fetchCurrentProductCost(productKey: string): Promise<ProductCostSnapshot | null> {
  const { data, error } = await (supabase as any)
    .from('product_costs')
    .select('unit_cost, unit, base_unit_cost, base_unit, unit_base_quantity')
    .eq('product_key', productKey)
    .order('effective_from', { ascending: false })
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return {
    unitCost: Number(data.unit_cost),
    unit: data.unit ? String(data.unit) : null,
    baseUnitCost: Number(data.base_unit_cost ?? data.unit_cost),
    baseUnit: data.base_unit ? String(data.base_unit) : null,
    unitBaseQuantity: Number(data.unit_base_quantity ?? 1),
  };
}

export function useCurrentSellingPrices() {
  const [prices, setPrices] = useState<SellingPriceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try { setPrices(await fetchCurrentSellingPrices()); } catch { setPrices([]); }
    setLoading(false);
  }, []);
  useEffect(() => { void load(); }, [load]);
  return { prices, loading, reload: load };
}

// ── Barcodes ────────────────────────────────────────────────────────────────
//
// A scan is worth one thing: a key that cannot be mistyped. It carries no name
// and no price — there is no free database of Tanzanian goods — so the number
// is stored against the shop's own product_key and the shopkeeper supplies the
// meaning once.

export type ProductBarcode = { barcode: string; productKey: string; productName: string };

/** Which product this code belongs to in THIS shop, or null. */
export async function findProductByBarcode(barcode: string): Promise<ProductBarcode | null> {
  const { data, error } = await (supabase as any).rpc('find_product_barcode', { p_barcode: barcode });
  if (error) throw error;
  const row = (data as { barcode: string; product_key: string; product_name: string }[] | null)?.[0];
  return row ? { barcode: row.barcode, productKey: row.product_key, productName: row.product_name } : null;
}

/**
 * Ties a code to a product. Re-scanning a code the shop already knows updates
 * the name rather than failing, so correcting "sukri" to "sukari" just works.
 */
export async function saveProductBarcode(barcode: string, productName: string): Promise<ProductBarcode> {
  const key = productName.trim().toLowerCase();
  const { data, error } = await (supabase as any).rpc('set_product_barcode', {
    p_barcode: barcode,
    p_product_key: key,
    p_product_name: productName.trim(),
  });
  if (error) throw error;
  const row = data as { barcode: string; product_key: string; product_name: string };
  return { barcode: row.barcode, productKey: row.product_key, productName: row.product_name };
}
