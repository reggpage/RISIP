/**
 * Canonical contract for a price-setting message.
 *
 * The model may read language, but the server owns the meaning of every
 * number.  Keeping the four fields separate prevents the old screenshot bug:
 * a buying cost must never silently become a retail or wholesale price.
 */
export type PriceUpdateCandidate = {
  product: string;
  cost: number | null;
  retail_price: number | null;
  wholesale_price: number | null;
  wholesale_min_qty: number | null;
};

export type PriceUpdateContractResult =
  | { kind: 'ok'; value: PriceUpdateCandidate }
  | { kind: 'ask'; reason: 'missing_product' | 'missing_selling_price' | 'invalid_number' | 'wholesale_above_retail' };

function clean(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\s+/g, ' ').trim().slice(0, 80) : '';
}

function positive(value: unknown, max = 100_000_000): number | null {
  if (value === null || value === undefined || value === '') return null;
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number) || number <= 0 || number > max) return null;
  return Math.round(number * 100) / 100;
}

/**
 * Validate already-normalised model fields before they can reach a write path.
 * This does not resolve a product name or calculate a price; those remain
 * database/server responsibilities.
 */
export function validatePriceUpdateCandidate(input: unknown): PriceUpdateContractResult {
  if (!input || typeof input !== 'object') return { kind: 'ask', reason: 'missing_product' };
  const row = input as Record<string, unknown>;
  const product = clean(row.product);
  if (product.length < 2 || !/[\p{L}]/u.test(product)) {
    return { kind: 'ask', reason: 'missing_product' };
  }

  const hasRetail = row.retail_price !== null && row.retail_price !== undefined;
  const hasWholesale = row.wholesale_price !== null && row.wholesale_price !== undefined;
  const cost = positive(row.cost);
  const retail = positive(row.retail_price);
  const wholesale = positive(row.wholesale_price);
  const minQty = positive(row.wholesale_min_qty, 1_000_000);

  if ((hasRetail && retail === null) || (hasWholesale && wholesale === null)
    || (row.cost !== null && row.cost !== undefined && cost === null)
    || (row.wholesale_min_qty !== null && row.wholesale_min_qty !== undefined && minQty === null)) {
    return { kind: 'ask', reason: 'invalid_number' };
  }
  if (retail === null && wholesale === null) {
    return { kind: 'ask', reason: 'missing_selling_price' };
  }
  if (wholesale !== null && retail !== null && wholesale > retail) {
    return { kind: 'ask', reason: 'wholesale_above_retail' };
  }
  if (minQty !== null && wholesale === null) {
    return { kind: 'ask', reason: 'invalid_number' };
  }

  return {
    kind: 'ok',
    value: { product, cost, retail_price: retail, wholesale_price: wholesale, wholesale_min_qty: minQty },
  };
}

/** Convert a validated canonical candidate to the existing selling-price shape. */
export function sellingPriceFromCandidate(value: PriceUpdateCandidate): {
  product: string;
  retail: number;
  wholesale: number | null;
  minQty: number | null;
} | null {
  if (value.retail_price === null) return null;
  return {
    product: value.product,
    retail: value.retail_price,
    wholesale: value.wholesale_price,
    minQty: value.wholesale_min_qty,
  };
}
