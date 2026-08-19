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
import { isDailyRecordCandidate, parseDailyRecord } from '../../supabase/functions/_shared/whatsappDailyRecords.ts';
import { parseHypotheticalProfitRequest } from '../../supabase/functions/_shared/whatsappHypotheticalProfit.ts';
import { parseLanguageCommand } from '../../supabase/functions/_shared/whatsappIntent.ts';
import { parseInviteRequest } from '../../supabase/functions/_shared/whatsappInvite.ts';
import { parseNewProductPricing } from '../../supabase/functions/_shared/whatsappNewProduct.ts';
import { parseProductAnalyticsRequest } from '../../supabase/functions/_shared/whatsappProductAnalytics.ts';
import { parseProductCost } from '../../supabase/functions/_shared/whatsappProductCosts.ts';
import { parseProductCostBatch } from '../../supabase/functions/_shared/whatsappCostBatch.ts';
import { parseBareExpense, parseBareQuantityList, parseQuantityOnlySale } from '../../supabase/functions/_shared/whatsappQuantitySale.ts';
import { parseReadRequest } from '../../supabase/functions/_shared/whatsappReadTools.ts';
import { parseSellingPrice } from '../../supabase/functions/_shared/whatsappSellingPrice.ts';
import { parseSellingPriceBatch } from '../../supabase/functions/_shared/whatsappSellingPriceBatch.ts';
import { parseStockCount } from '../../supabase/functions/_shared/whatsappStock.ts';
import { parseStockCountBatch } from '../../supabase/functions/_shared/whatsappStockBatch.ts';

/**
 * What the deterministic parsers say this message is worth.
 *
 * The routing check answers "did the right parser take it". This answers the
 * question that actually costs money: "did it get the number right". Both
 * failures that lost real shillings this week — a comma list recorded as 1,500
 * instead of 9,000, and four retail sales priced as one wholesale sale of
 * forty-eight — went to the correct parser and came out with the wrong total.
 *
 * Null means no deterministic amount exists: the message needs a price list, a
 * database, or the model, and this cannot judge it.
 */
export function computedAmount(text: string): number | null {
  const batch = parseDailyRecordBatch(text, 'sw');
  if (batch.kind === 'parsed') {
    return Math.round(batch.records.reduce((sum, record) => sum + record.amount, 0) * 100) / 100;
  }
  if (batch.kind !== 'none') return null;
  const single = parseDailyRecord(text, 'sw');
  return single.kind === 'parsed' ? single.record.amount : null;
}

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
  if (parseInviteRequest(text)) return 'invite';
  // A sale with no verb. The webhook adds one more condition this table cannot
  // express: it only claims the message when every name is already a product of
  // the company. Read this route as "a candidate sale", not a certainty.
  if (parseBareExpense(text)) return 'bare_expense';
  if (parseBareQuantityList(text)) return 'bare_quantity_sale';
  if (parseProductAnalyticsRequest(text)) return 'product_analytics';
  const read = parseReadRequest(text);
  if (read) return read.tool;
  return 'conversational_ai';
}
