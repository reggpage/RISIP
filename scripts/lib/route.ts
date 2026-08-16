// The webhook's order of precedence, in one place.
//
// Both the probe and the eval runner need to answer the same question — which
// parser claims this message? — and if each kept its own copy they would drift
// apart from the webhook and from each other, and the answer would stop meaning
// anything. This is the single copy.
//
// It is not the webhook itself: conversation state, roles and the model are not
// here. What it does cover is every message that arrives with no prior turn, and
// that is most of them.

import { parseDailyRecordBatch } from '../../supabase/functions/_shared/whatsappDailyRecordBatch.ts';
import { isDailyRecordCandidate } from '../../supabase/functions/_shared/whatsappDailyRecords.ts';
import { parseHypotheticalProfitRequest } from '../../supabase/functions/_shared/whatsappHypotheticalProfit.ts';
import { parseLanguageCommand } from '../../supabase/functions/_shared/whatsappIntent.ts';
import { parseNewProductPricing } from '../../supabase/functions/_shared/whatsappNewProduct.ts';
import { parseProductAnalyticsRequest } from '../../supabase/functions/_shared/whatsappProductAnalytics.ts';
import { parseProductCost } from '../../supabase/functions/_shared/whatsappProductCosts.ts';
import { parseProductCostBatch } from '../../supabase/functions/_shared/whatsappCostBatch.ts';
import { parseQuantityOnlySale } from '../../supabase/functions/_shared/whatsappQuantitySale.ts';
import { parseReadRequest } from '../../supabase/functions/_shared/whatsappReadTools.ts';
import { parseSellingPrice } from '../../supabase/functions/_shared/whatsappSellingPrice.ts';
import { parseSellingPriceBatch } from '../../supabase/functions/_shared/whatsappSellingPriceBatch.ts';
import { parseStockCount } from '../../supabase/functions/_shared/whatsappStock.ts';
import { parseStockCountBatch } from '../../supabase/functions/_shared/whatsappStockBatch.ts';

/**
 * Which parser claims this message.
 *
 * Read requests return the tool they resolved to rather than a flat
 * "read_tool", because that is the name the eval set asserts on and a runner
 * that collapsed them all would pass cases it never actually checked.
 */
export function route(text: string): string {
  if (parseLanguageCommand(text)) return 'change_language';
  if (parseSellingPriceBatch(text)) return 'selling_price_batch';
  if (parseStockCountBatch(text)) return 'stock_count_batch';
  if (parseProductCostBatch(text)) return 'product_cost_batch';
  if (parseNewProductPricing(text).length > 0) return 'new_product';
  if (parseSellingPrice(text)) return 'selling_price';
  if (parseProductCost(text)) return 'product_cost';
  if (parseStockCount(text)) return 'stock_count';
  if (parseHypotheticalProfitRequest(text)) return 'hypothetical_profit';
  if (isDailyRecordCandidate(text)) {
    if (parseQuantityOnlySale(text)) return 'quantity_sale';
    const batch = parseDailyRecordBatch(text, 'sw');
    return batch.kind === 'none' ? 'daily_record' : `daily_record_${batch.kind}`;
  }
  if (parseProductAnalyticsRequest(text)) return 'product_analytics';
  const read = parseReadRequest(text);
  if (read) return read.tool;
  return 'conversational_ai';
}
