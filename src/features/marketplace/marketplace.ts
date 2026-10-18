import { supabase } from '@/lib/supabase';

/**
 * Cross-shop restocking.
 *
 * The company is never passed from the browser: every RPC here derives it from
 * the signed-in profile, so a tampered client cannot read or join on behalf of
 * another business.
 */

export type MarketplaceSettings = {
  companyId: string;
  optIn: boolean;
  sharePrices: boolean;
  maxStockAgeDays: number;
  optedInAt: string | null;
  indexedProducts: number;
  /** Products with a count fresh enough to be offered — what joining would publish. */
  countedProducts: number;
  /** Indexed but too old to be returned: the number that explains an empty marketplace. */
  staleProducts: number;
  ordersIncoming: number;
  ordersOutgoing: number;
};

export type MarketplaceOrder = {
  orderId: string;
  status: 'placed' | 'accepted' | 'rejected' | 'delivered' | 'cancelled';
  productName: string;
  quantity: number;
  unit: string | null;
  unitPrice: number | null;
  currency: string | null;
  matchConfidence?: number;
  matchBasis?: 'barcode' | 'exact_name' | 'prefix_name' | 'fuzzy_name';
  buyerCompanyId?: string;
  buyerName?: string;
  supplierCompanyId?: string;
  supplierName?: string;
  placedAt: string;
};

function unwrap<T>(data: unknown, error: unknown, fallback: T): T {
  if (error) throw error instanceof Error ? error : new Error(String((error as { message?: string })?.message ?? error));
  return (data as T) ?? fallback;
}

export async function fetchMarketplaceSettings(): Promise<MarketplaceSettings> {
  const { data, error } = await supabase.rpc('marketplace_my_settings');
  return unwrap<MarketplaceSettings>(data, error, {
    companyId: '', optIn: false, sharePrices: false, maxStockAgeDays: 30,
    optedInAt: null, indexedProducts: 0, countedProducts: 0, staleProducts: 0,
    ordersIncoming: 0, ordersOutgoing: 0,
  });
}

export async function setMarketplaceOptIn(
  optIn: boolean,
  sharePrices: boolean,
  maxStockAgeDays = 30,
): Promise<void> {
  const { error } = await supabase.rpc('marketplace_set_my_optin', {
    p_opt_in: optIn,
    p_share_prices: sharePrices,
    p_max_stock_age_days: maxStockAgeDays,
  });
  if (error) throw new Error(error.message);
}

export async function fetchIncomingOrders(): Promise<MarketplaceOrder[]> {
  const { data, error } = await supabase.rpc('marketplace_my_incoming_orders', { p_status: null });
  return unwrap<MarketplaceOrder[]>(data, error, []);
}

export async function fetchOutgoingOrders(): Promise<MarketplaceOrder[]> {
  const { data, error } = await supabase.rpc('marketplace_my_outgoing_orders', { p_status: null });
  return unwrap<MarketplaceOrder[]>(data, error, []);
}

export async function answerOrder(
  orderId: string,
  status: 'accepted' | 'rejected' | 'delivered' | 'cancelled',
  reason?: string,
): Promise<void> {
  const { error } = await supabase.rpc('marketplace_answer_order', {
    p_order_id: orderId,
    p_status: status,
    p_reason: reason ?? null,
  });
  if (error) throw new Error(error.message);
}
