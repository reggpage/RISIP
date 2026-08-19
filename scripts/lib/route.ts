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
import {
  isDailyRecordCandidate,
  isDailyRecordConfirmation,
  isDailyRecordRejection,
  parseDailyRecord,
  parseDailyRecordPriceChoice,
} from '../../supabase/functions/_shared/whatsappDailyRecords.ts';
import { isLoginRequest } from '../../supabase/functions/_shared/whatsappOnboarding.ts';
import { parseHypotheticalProfitRequest } from '../../supabase/functions/_shared/whatsappHypotheticalProfit.ts';
import { isCancel, parseLanguageCommand } from '../../supabase/functions/_shared/whatsappIntent.ts';
import { parseInviteRequest } from '../../supabase/functions/_shared/whatsappInvite.ts';
import { parseNewProductPricing } from '../../supabase/functions/_shared/whatsappNewProduct.ts';
import { parseProductAnalyticsRequest } from '../../supabase/functions/_shared/whatsappProductAnalytics.ts';
import { parseProductCost } from '../../supabase/functions/_shared/whatsappProductCosts.ts';
import { parseProductCostBatch } from '../../supabase/functions/_shared/whatsappCostBatch.ts';
import { parseBareExpense, parseBareQuantityList, parseQuantityOnlySale } from '../../supabase/functions/_shared/whatsappQuantitySale.ts';
import { parseReadRequest } from '../../supabase/functions/_shared/whatsappReadTools.ts';
import { parseSellingPrice } from '../../supabase/functions/_shared/whatsappSellingPrice.ts';
import { parseSellingPriceBatch } from '../../supabase/functions/_shared/whatsappSellingPriceBatch.ts';
import { parseStockCount, parseStockQuestion } from '../../supabase/functions/_shared/whatsappStock.ts';
import { parseStockCountBatch } from '../../supabase/functions/_shared/whatsappStockBatch.ts';
import { splitSecondInstruction } from '../../supabase/functions/_shared/whatsappMixedTopics.ts';

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

/** The webhook's own test for "does a write parser take this half". */
function claimsWrite(said: string): boolean {
  return Boolean(
    parseStockCountBatch(said) ?? parseStockCount(said) ?? parseSellingPrice(said)
    ?? parseProductCostBatch(said) ?? parseProductCost(said),
  ) || isDailyRecordCandidate(said);
}

/**
 * Which parser claims this message.
 *
 * Read requests return the tool they resolved to rather than a flat
 * "read_tool", because that is the name the eval set asserts on and a runner
 * that collapsed them all would pass cases it never actually checked.
 */
export function route(text: string): string {
  // The webhook splits two instructions before any parser sees the message, so
  // this table has to as well or it stops describing production. The second
  // half is named back to the sender, never routed.
  const split = splitSecondInstruction(text);
  if (split && claimsWrite(split.action)) return route(split.action);
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
    if (batch.kind !== 'none') return `daily_record_${batch.kind}`;
    // A single record that comes back as a QUESTION is not the same outcome as
    // one that comes back as a draft, and calling both "daily_record" let a
    // case expecting arithmetic pass while the shop was being asked something.
    const single = parseDailyRecord(text, 'sw');
    return single.kind === 'clarify' ? 'daily_record_clarify' : 'daily_record';
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
  // Counting the shelf is arithmetic over the shop's own counts, so it is
  // answered from the database and never by the model.
  if (parseStockQuestion(text)) return 'stock_question';
  return 'conversational_ai';
}

/**
 * What a message means when it is an ANSWER or a COMMAND rather than a topic.
 *
 * These are deliberately outside route(): "NDIYO" is not a message the router
 * claims, it is a reply to a question the webhook is already holding. But they
 * are still deterministic, and leaving them out of the harness is what left a
 * quarter of the eval set marked "not routable here" — as though nobody could
 * ever check whether HAPANA cancels.
 */
export function controlIntent(text: string): string | null {
  if (isLoginRequest(text)) return 'login_control';
  if (parseDailyRecordPriceChoice(text)) return 'clarification_continue';
  // Cancel before reject: "toka" is both, and it is the stronger of the two.
  if (isCancel(text)) return 'cancel_control';
  if (isDailyRecordRejection(text)) return 'reject_control';
  if (isDailyRecordConfirmation(text)) return 'confirm_control';
  if (parseReadRequest(text)?.tool === 'ai_my_businesses') return 'switch_business_control';
  return null;
}

/**
 * Which kind of ledger record a message would create, or null.
 *
 * route() collapses every one of these into "daily_record", which is right for
 * routing and useless for the eval set: recording a DEBT when the shop said
 * PAYMENT is the same route and the opposite fact.
 */
export function recordKind(text: string): string | null {
  const batch = parseDailyRecordBatch(text, 'sw');
  if (batch.kind === 'parsed' && batch.records.length > 0) return batch.records[0].kind;
  const single = parseDailyRecord(text, 'sw');
  return single.kind === 'parsed' ? single.record.kind : null;
}
