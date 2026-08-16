// whatsapp-webhook · Meta WhatsApp Cloud API webhook for receipt capture.
//
//   GET  → Meta's subscription challenge (hub.verify_token / hub.challenge).
//   POST → message events. We verify the signature against the RAW body, record
//          the message idempotently, and return 200. Receipt images are queued;
//          linked free text may use the bounded conversational AI tool loop.
//
// Two message shapes matter:
//   "LINK <token>" text → binds this WhatsApp number to a Risip profile.
//   image               → queued as a job for whatsapp-worker.
//
// verify_jwt = false — this is a public webhook. Security is the HMAC signature
// plus the fact that an unlinked number can do nothing but read a help message.
//
// Env: WHATSAPP_VERIFY_TOKEN, WHATSAPP_APP_SECRET, WHATSAPP_ACCESS_TOKEN,
//      WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_API_VERSION?, RISIP_PUBLIC_APP_URL,
//      SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';
import {
  buildUnlinkedReply,
  evaluateLinkToken,
  linkFailureMessage,
  maskPhone,
  normalizeE164,
  parseLinkToken,
  sha256Hex,
  verifyMetaSignature,
} from '../_shared/whatsapp.ts';
import { sendWhatsAppText, showTyping } from '../_shared/whatsappApi.ts';
import {
  detectLanguage,
  isHelp,
  parseLanguageCommand,
  parseProjectChoice,
  routeIntent,
  t,
  type Lang,
  type ProjectRef,
} from '../_shared/whatsappIntent.ts';
import {
  buildDailyRecordCancelled,
  buildDailyRecordConfirmation,
  buildDailyRecordConfirmationChunks,
  buildDailyRecordConfirmed,
  buildDailyRecordPending,
  dailyRecordStorageDescription,
  isDailyRecordCandidate,
  isDailyRecordConfirmation,
  isDailyRecordRejection,
  parseDailyRecordPriceChoice,
  parseDailyRecord,
  resumeDailyRecordClarification,
  splitWhatsAppText,
  detectDailyRecordPriceAnomalies,
  type DailyRecordClarification,
  type DailyRecordConversation,
  type ParsedDailyRecord,
} from '../_shared/whatsappDailyRecords.ts';
import {
  buildDailyRecordBatchConfirmation,
  buildDailyRecordBatchConfirmed,
  buildDailyRecordBatchPending,
  parseDailyRecordBatch,
  resumeDailyRecordBatchClarification,
  type DailyRecordBatchClarification,
  type DailyRecordBatchParse,
  type DailyRecordBatchConversation,
} from '../_shared/whatsappDailyRecordBatch.ts';
import {
  advanceOnboarding,
  businessList,
  isLoginRequest,
  isSwitchRequest,
  parseBusinessChoice,
  startOnboarding,
  type OnboardingStep,
} from '../_shared/whatsappOnboarding.ts';
import { waSyntheticEmail } from '../_shared/waIdentityEmail.ts';
import {
  costConfirmation,
  costSaved,
  parseProductCost,
  productCostErrorMessage,
  productCostReply,
  validateProductCostCandidate,
  type ProductCost,
} from '../_shared/whatsappProductCosts.ts';
import {
  aggregateProducts,
  parseProductAnalyticsFollowUp,
  parseProductAnalyticsRequest,
  periodStart,
  productAnalyticsReply,
  rankProducts,
  type ProductAggregate,
  type ProductAnalyticsContext,
  type ProductAnalyticsRequest,
  type ProductCostPoint,
  type ProductSaleLine,
} from '../_shared/whatsappProductAnalytics.ts';
import { interpretDailyRecordWithAi, MAX_INTERPRETATION_CHARS, validateAiCandidate } from '../_shared/whatsappDailyRecordsAi.ts';
import { interpretReadIntentWithAi, shouldInterpretReadWithAi } from '../_shared/whatsappReadIntentAi.ts';
import { buildKnowledgeReply } from '../_shared/risipKnowledge.ts';
import { findNameWarnings, nameWarningText } from '../_shared/whatsappProductNames.ts';
import {
  parseSellingPriceBatch,
  sellingPriceBatchCancelled,
  sellingPriceBatchConfirmation,
  sellingPriceBatchCostWarnings,
  sellingPriceBatchSaved,
  sellingPriceBatchUnknownProducts,
  type SellingPriceBatch,
} from '../_shared/whatsappSellingPriceBatch.ts';
import {
  addProductNeedsCost,
  parseAddProduct,
  productAlreadyExists,
  productLooksLikeExisting,
} from '../_shared/whatsappAddProduct.ts';
import {
  parseQuantityOnlySale,
  priceLine,
  quantitySaleConfirmation,
  type QuantitySaleItem,
  quantitySaleMissingPrices,
  type PricedLine,
  type ProductPricing,
  type QuantitySale,
} from '../_shared/whatsappQuantitySale.ts';
import {
  normalizeProductReadResolution,
  productReadClarification,
  productReadMatchNotice,
  type ProductReadResolution,
} from '../_shared/whatsappProductResolver.ts';
import {
  buildHypotheticalProfitReply,
  parseHypotheticalProfitRequest,
} from '../_shared/whatsappHypotheticalProfit.ts';
import { parseTypedVerificationCode, typedCodeRejected } from '../_shared/typedCode.ts';
import {
  type StockCountBatch,
  parseStockCountBatch,
  stockCountBatchCancelled,
  stockCountBatchConfirmation,
  stockCountBatchSaved,
} from '../_shared/whatsappStockBatch.ts';
import {
  riderQuestionNotice,
  splitRiderQuestion,
} from '../_shared/whatsappMixedTopics.ts';
import {
  parseSellingPrice,
  priceBandNotice,
  sellingPriceSaved,
} from '../_shared/whatsappSellingPrice.ts';
import { compareWithTra, fetchTraReceipt } from '../_shared/traVerify.ts';
import { qrCorrectionReply } from '../_shared/qrFollowUp.ts';
import {
  parseStockCount,
  stockCountConfirmation,
  stockListReply,
  stockReply,
} from '../_shared/whatsappStock.ts';
import {
  type ProductCostBatch,
  costBatchCancelled,
  costBatchConfirmation,
  costBatchFailed,
  costBatchSaved,
  parseProductCostBatch,
} from '../_shared/whatsappCostBatch.ts';
import {
  type CostPrompt,
  costAccepted,
  costQuestion,
  costSkipped,
  costUnclear,
  isSkip,
  parseCostAnswer,
  toCostPrompt,
} from '../_shared/whatsappCostPrompt.ts';
import { type ResolvedRange, isFuture, rangeLabel, resolveDateRange, withinTimeOfDay } from '../_shared/whatsappDateRange.ts';
import {
  type LogoutState,
  logoutCancelled,
  logoutConfirmation,
  logoutDisambiguation,
  logoutDone,
  logoutFailed,
  logoutNotLinked,
  logoutReask,
  parseDisambiguationChoice,
  parseLogoutIntent,
} from '../_shared/whatsappLogout.ts';
import {
  canUseCompanyFinanceReads,
  runConversationalAssistant,
  shouldDeferRecordLikeReply,
  type AssistantHistoryMessage,
  type AssistantIdentityContext,
  sanitizeAssistantFirstName,
  type AssistantToolExecution,
} from '../_shared/whatsappAssistant.ts';
import {
  aiBudgetMessage,
  normalizeAiBudgetDecision,
  type AiBudgetDecision,
} from '../_shared/whatsappAiBudget.ts';
import {
  buildBusinessesReply,
  buildBusinessSummaryReply,
  buildDebtorDetailReply,
  buildDebtorsReply,
  buildOwedToMeReply,
  buildPendingApprovalsReply,
  buildPettyCashReply,
  buildProfitReply,
  buildReceiptsReply,
  calculateBusinessSummary,
  calculateDebtors,
  calculateProfitEstimate,
  parseReadRequest,
  type ReadDailyLine,
  type ReadDailyRow,
  type ReadProductCost,
  type ReadRequest,
} from '../_shared/whatsappReadTools.ts';
import {
  isProjectSetupState,
  parseProjectSetupChoice,
  parseProjectSetupConfirmation,
  projectSetupConfirmation,
  projectSetupCreatedReply,
  projectSetupNamePrompt,
  projectSetupPrompt,
  projectSetupWorkerReply,
  canCreateProject,
  sanitizeProjectName,
  type ProjectSetupState,
} from '../_shared/whatsappProjectSetup.ts';

type Admin = ReturnType<typeof createClient>;

type ResolvedWhatsAppIdentity = {
  id: string;
  identity_id: string;
  profile_id: string;
  company_id: string;
  company_name: string;
  profile_name: string | null;
  role: string;
  lang: Lang;
  approval_flow_enabled: boolean;
  reversal_enabled: boolean;
  payouts_enabled: boolean;
  revoked_at: string | null;
};

/**
 * Prices a quantities-only sale from the shop's own price list.
 *
 * Every name is resolved the same forgiving way a read is, so "nguvu ya sala"
 * typed six different ways still finds the price that was set for it. A product
 * with no price is named on its own — the sale is refused whole rather than
 * saved half-priced, because a sale missing a line is a sale nobody can audit.
 */
async function priceQuantitySale(
  db: Admin,
  identity: ResolvedWhatsAppIdentity,
  sale: QuantitySale,
  lang: Lang,
): Promise<
  | { kind: 'priced'; record: ParsedDailyRecord; lines: PricedLine[]; notCounted: string[] }
  | { kind: 'blocked'; message: string }
  | { kind: 'skip' }
> {
  const resolvedItems: { key: string; name: string; quantity: number; band: QuantitySaleItem['band'] }[] = [];
  // Named back to the shopkeeper, never silently dropped: a line missing from a
  // till roll is money they believe they took and Risip does not.
  const unknown: string[] = [];
  for (const item of sale.items) {
    const resolved = await resolveProductForRead(db, identity, item.product);
    if (resolved.error) return { kind: 'skip' };
    if (resolved.resolution.kind === 'ambiguous') {
      return { kind: 'blocked', message: productReadClarification(resolved.resolution, lang) };
    }
    // An unknown product on a ONE-LINE sale is not this parser's business: the
    // ordinary path can still ask for a price and record it under the name as
    // typed. On a till roll it is, because there is no ordinary path that can
    // read forty-five lines — handing the paste back meant "is this the total or
    // the price for each?", again, over one name the shop spells differently
    // ("biblia" for "Bibilia ndogo"). Name it and price the rest.
    if (resolved.resolution.kind === 'not_found') {
      if (sale.items.length === 1) return { kind: 'skip' };
      unknown.push(item.product);
      continue;
    }
    resolvedItems.push({
      key: resolved.resolution.match.productKey,
      name: resolved.resolution.match.productName,
      quantity: item.quantity,
      // Carried through. Without this the word somebody typed at the end of the
      // line — "jumla" — is read, understood, and then quietly dropped here.
      band: item.band,
    });
  }

  const { data, error } = await db.rpc('wa_product_pricing', {
    p_company_id: identity.company_id,
    p_product_keys: resolvedItems.map((item) => item.key),
  });
  if (error) return { kind: 'skip' };

  const pricing = new Map<string, ProductPricing>();
  for (const row of (data ?? []) as Array<Record<string, unknown>>) {
    pricing.set(String(row.product_key), {
      retail: row.retail_price == null ? null : Number(row.retail_price),
      wholesale: row.wholesale_price == null ? null : Number(row.wholesale_price),
      wholesaleMinQty: row.wholesale_min_qty == null ? null : Number(row.wholesale_min_qty),
    });
  }

  const lines: PricedLine[] = [];
  const missing: string[] = [];
  for (const item of resolvedItems) {
    const known = pricing.get(item.key) ?? { retail: null, wholesale: null, wholesaleMinQty: null };
    const line = priceLine({ product: item.name, quantity: item.quantity, band: item.band }, known);
    if (!line) { if (!missing.includes(item.name)) missing.push(item.name); continue; }
    // Merged only now, and only across lines that reached the SAME price. Two
    // sales of the same product at two different prices are two facts, and
    // adding them before pricing is what turned four retail sales of daftari
    // into one wholesale sale of forty-eight.
    const at = lines.findIndex((seen) => seen.product === line.product && seen.unitPrice === line.unitPrice);
    if (at >= 0) lines[at] = { ...lines[at], quantity: lines[at].quantity + line.quantity };
    else lines.push(line);
  }
  const notCounted = [...unknown, ...missing];
  // Nothing at all could be priced: the ordinary path may still help.
  if (lines.length === 0) {
    return sale.items.length === 1
      ? { kind: 'skip' }
      : { kind: 'blocked', message: quantitySaleMissingPrices(notCounted, lang) };
  }
  // One unrecognised name out of thirty used to refuse the whole paste and ask
  // for all forty-eight lines again. Nobody retypes that; they give up. The
  // twenty-nine Risip can price are worth recording, and the one it cannot is
  // named directly above the confirm question — where it cannot be missed and
  // is still the shopkeeper's decision, not a silent omission.

  const amount = Math.round(lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0) * 100) / 100;
  return {
    kind: 'priced',
    lines,
    record: {
      kind: 'sale',
      amount,
      partyName: null,
      description: null,
      lines: lines.map((line) => ({
        description: line.product,
        quantity: line.quantity,
        unit_amount: line.unitPrice,
      })),
      confidence: 0.99,
    },
  };
}

async function resolveProductForRead(
  db: Admin,
  identity: ResolvedWhatsAppIdentity,
  asked: string,
): Promise<{ resolution: ProductReadResolution; error: boolean }> {
  const { data, error } = await db.rpc('wa_resolve_company_product_read', {
    p_profile_id: identity.profile_id,
    p_company_id: identity.company_id,
    p_name: asked,
  });
  return {
    resolution: normalizeProductReadResolution(data, asked),
    error: Boolean(error),
  };
}

function admin(): Admin {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) throw new Error('server misconfigured');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

async function resolveWhatsAppContext(
  db: Admin,
  rawIdentity: { id: string; revoked_at?: string | null } | null,
): Promise<ResolvedWhatsAppIdentity | null> {
  if (!rawIdentity?.id) return null;
  const { data, error } = await db.rpc('wa_resolve_context', { p_identity_id: rawIdentity.id });
  if (error || !data || typeof data !== 'object') return null;
  const value = data as Record<string, unknown>;
  if (!value.profile_id || !value.company_id || !value.identity_id) return null;
  return {
    id: String(value.identity_id),
    identity_id: String(value.identity_id),
    profile_id: String(value.profile_id),
    company_id: String(value.company_id),
    company_name: String(value.company_name ?? 'Risip business'),
    profile_name: typeof value.profile_name === 'string' ? value.profile_name : null,
    role: String(value.role ?? 'worker'),
    lang: value.lang === 'sw' ? 'sw' : 'en',
    approval_flow_enabled: value.approval_flow_enabled === true,
    reversal_enabled: value.reversal_enabled === true,
    payouts_enabled: value.payouts_enabled === true,
    revoked_at: rawIdentity.revoked_at ?? null,
  };
}

function assistantIdentityContext(identity: ResolvedWhatsAppIdentity): AssistantIdentityContext {
  return {
    identityId: identity.id,
    profileId: identity.profile_id,
    companyId: identity.company_id,
    companyName: identity.company_name,
    userName: sanitizeAssistantFirstName(identity.profile_name),
    role: identity.role,
    lang: identity.lang,
    approvalFlowEnabled: identity.approval_flow_enabled,
    reversalEnabled: identity.reversal_enabled,
    payoutsEnabled: identity.payouts_enabled,
  };
}

async function loadAssistantHistory(db: Admin, identity: ResolvedWhatsAppIdentity): Promise<AssistantHistoryMessage[]> {
  const { data: thread } = await db.from('whatsapp_ai_threads')
    .select('identity_id')
    .eq('identity_id', identity.id)
    .eq('company_id', identity.company_id)
    .gte('expires_at', new Date().toISOString())
    .maybeSingle();
  if (!thread) return [];
  const { data, error } = await db.from('whatsapp_ai_messages')
    .select('role, content, created_at')
    .eq('identity_id', identity.id)
    .eq('company_id', identity.company_id)
    .gte('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(12);
  if (error) return [];
  return (data ?? []).reverse().flatMap((row: { role: string; content: string }) =>
    row.role === 'user' || row.role === 'assistant'
      ? [{ role: row.role, content: String(row.content) } as AssistantHistoryMessage]
      : []);
}

async function storeAssistantExchange(
  db: Admin,
  identity: ResolvedWhatsAppIdentity,
  waMessageId: string,
  userText: string,
  assistantText: string,
  memory: { topic: string | null; entities: Record<string, unknown>; lastTool: string | null },
): Promise<boolean> {
  const { error } = await db.rpc('wa_store_ai_exchange', {
    p_identity_id: identity.id,
    p_company_id: identity.company_id,
    p_wa_message_id: waMessageId,
    p_user_text: userText,
    p_assistant_text: assistantText,
    p_topic: memory.topic,
    p_entities: memory.entities,
    p_last_tool: memory.lastTool,
  });
  return !error;
}

async function clearAssistantMemory(db: Admin, identity: ResolvedWhatsAppIdentity): Promise<void> {
  await db.rpc('wa_clear_ai_context', {
    p_identity_id: identity.id,
    p_company_id: identity.company_id,
  });
}


function appUrl(): string {
  return Deno.env.get('RISIP_PUBLIC_APP_URL') || 'https://risip.online';
}

function isStopCommand(text: string | null | undefined): boolean {
  return /^(?:toka|futa|cancel|ghairi|start over|anza upya|acha|sitisha)\b/i.test(String(text ?? '').trim());
}

/** Live conversation state, or null when nothing is pending or it has expired. */
async function loadConversation(db: Admin, identityId: string) {
  const { data } = await db
    .from('whatsapp_conversations')
    .select('awaiting, receipt_id, options, expires_at')
    .eq('identity_id', identityId)
    .maybeSingle();
  if (!data) return null;
  if (new Date(data.expires_at as string).getTime() < Date.now()) {
    await db.from('whatsapp_conversations').delete().eq('identity_id', identityId);
    return null;
  }
  return data;
}

async function clearConversation(db: Admin, identityId: string): Promise<void> {
  await db.from('whatsapp_conversations').delete().eq('identity_id', identityId);
}

/**
 * Asks what a just-sold product costs to buy, when there is one worth asking
 * about. Everything here is best-effort: the sale is already saved, and a
 * failure means only that the question is not asked.
 */
async function askForBuyingPrice(
  db: Admin,
  identity: ResolvedWhatsAppIdentity,
  phone: string,
  dailyRecordId: string,
  waMessageId: string,
  lang: Lang,
): Promise<void> {
  try {
    const { data, error } = await db.rpc('wa_next_cost_prompt', {
      p_phone: phone,
      p_daily_record_id: dailyRecordId,
    });
    if (error) return;
    const prompt = toCostPrompt(data);
    if (!prompt) return;

    await db.from('whatsapp_conversations').upsert({
      identity_id: identity.id,
      company_id: identity.company_id,
      profile_id: identity.profile_id,
      awaiting: 'product_cost',
      receipt_id: null,
      options: prompt,
      expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'identity_id' });

    await replyQuietly(phone, costQuestion(prompt, lang));
    await audit(db, identity, waMessageId, 'product_cost', 'asked', prompt.productKey);
  } catch {
    /* Never let an optional question disturb a saved record. */
  }
}

/**
 * A sale line that went out under every price the shop set for itself.
 *
 * Only "below" is worth interrupting a confirmation for. A wholesale sale is the
 * shop working as intended, and saying so on every trade sale would teach people
 * to scroll past the line — and then the one that mattered gets scrolled past
 * too. Best-effort: a price check is never worth failing a confirmation over.
 */
async function belowOwnPriceNotice(
  db: Admin,
  companyId: string,
  record: ParsedDailyRecord,
  lang: Lang,
): Promise<string> {
  if (record.kind !== 'sale' || record.lines.length === 0) return '';
  try {
    const bands = await Promise.all(record.lines.map(async (line) => {
      const { data } = await db.rpc('price_band', {
        p_company: companyId,
        p_key: line.description,
        p_unit_price: line.unit_amount,
        p_quantity: line.quantity,
      });
      return { product: line.description, unitPrice: line.unit_amount, band: String(data ?? 'unpriced') };
    }));
    return priceBandNotice(bands, lang);
  } catch {
    return '';
  }
}

/** Parks the logout question on the ordinary timer, so an abandoned one expires. */
async function parkLogout(
  db: Admin,
  identity: ResolvedWhatsAppIdentity,
  step: LogoutState['step'],
): Promise<void> {
  const state: LogoutState = { kind: 'logout', step, businessName: identity.company_name };
  await db.from('whatsapp_conversations').upsert({
    identity_id: identity.id,
    company_id: identity.company_id,
    profile_id: identity.profile_id,
    awaiting: 'logout_confirm',
    receipt_id: null,
    options: state,
    expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'identity_id' });
}

/**
 * Unlinks the number. The conversation row is deleted by wa_logout itself, so
 * the state is cleared by the same transaction that revokes the identity — a
 * failure cannot leave a stale "are you sure?" behind an already-live number.
 */
async function performLogout(
  db: Admin,
  identity: ResolvedWhatsAppIdentity,
  phone: string,
  lang: Lang,
): Promise<{ reply: string; outcome: string }> {
  const { error } = await db.rpc('wa_logout', { p_phone: phone });
  if (error) {
    // Either way the question has been answered, so it must not stay parked:
    // a stale "are you sure?" in front of a still-live number is worse than
    // making them ask again.
    await clearConversation(db, identity.id as string);
    const notLinked = String(error.message ?? '').includes('not linked');
    return {
      reply: notLinked ? logoutNotLinked(lang) : logoutFailed(lang),
      outcome: notLinked ? 'not_linked' : 'failed',
    };
  }
  return { reply: logoutDone(identity.company_name, lang), outcome: 'applied' };
}

async function createDailyRecordDraft(
  db: Admin,
  identity: any,
  messageId: string,
  record: import('../_shared/whatsappDailyRecords.ts').ParsedDailyRecord,
  lang: Lang,
): Promise<{ id: string | null; error: any }> {
  const { data, error } = await db.rpc('wa_create_daily_record_draft', {
    p_profile_id: identity.profile_id,
    p_company_id: identity.company_id,
    p_kind: record.kind,
    p_amount: record.amount,
    p_party_name: record.partyName,
    p_description: dailyRecordStorageDescription(record, lang),
    p_occurred_at: new Date().toISOString(),
    p_source_message_id: messageId,
    p_lines: record.lines,
  });
  return { id: data ? String(data) : null, error };
}

async function createDailyRecordBatchDrafts(
  db: Admin,
  identity: ResolvedWhatsAppIdentity,
  messageId: string,
  records: ParsedDailyRecord[],
  lang: Lang,
): Promise<{ ids: string[]; error: unknown }> {
  const payload = records.map((record) => ({
    kind: record.kind,
    amount: record.amount,
    party_name: record.partyName,
    description: dailyRecordStorageDescription(record, lang),
    lines: record.lines,
  }));
  const { data, error } = await db.rpc('wa_create_daily_record_batch_drafts', {
    p_profile_id: identity.profile_id,
    p_company_id: identity.company_id,
    p_source_message_id: messageId,
    p_records: payload,
  });
  return { ids: Array.isArray(data) ? data.map(String) : [], error };
}

async function addHistoricalPriceWarnings(db: Admin, companyId: string, record: ParsedDailyRecord): Promise<ParsedDailyRecord> {
  if (record.lines.length === 0) return record;
  const { data: historicalRecords } = await db.from('daily_records')
    .select('id').eq('company_id', companyId).eq('status', 'confirmed').order('occurred_at', { ascending: false }).limit(200);
  const ids = (historicalRecords ?? []).map((row) => String((row as { id: string }).id));
  if (ids.length === 0) return record;
  const { data: historicalLines } = await db.from('daily_record_lines')
    .select('description, unit_amount').in('daily_record_id', ids).limit(1000);
  const warnings = detectDailyRecordPriceAnomalies(record, (historicalLines ?? []) as { description: string; unit_amount: number }[]);
  return warnings.length > 0 ? { ...record, warnings } : record;
}

/**
 * A product name one edit away from something already sold.
 *
 * 0091 folds away splits caused by punctuation or spacing on its own. A real
 * difference in letters — "Bibilia" against "Biblia" — it deliberately leaves
 * alone, because folding those automatically would eventually merge two products
 * that are genuinely different. So the confirmation asks, and the trader decides:
 * they know whether it is the same thing, and nothing here does.
 */
async function nearNameNotice(
  db: Admin,
  companyId: string,
  record: ParsedDailyRecord,
  lang: Lang,
): Promise<string> {
  if (record.kind !== 'sale' || record.lines.length === 0) return '';
  try {
    const { data } = await db.rpc('company_product_names', { p_company_id: companyId });
    const existing = Array.isArray(data) ? (data as { product_name: string }[]).map((row) => row.product_name) : [];
    if (existing.length === 0) return '';
    return nameWarningText(findNameWarnings(record.lines.map((line) => line.description), existing), lang);
  } catch {
    // A suggestion is never worth failing a confirmation over.
    return '';
  }
}

async function consumeAiBudget(db: Admin, identity: ResolvedWhatsAppIdentity, inputChars: number): Promise<AiBudgetDecision> {
  const { data, error } = await db.rpc('consume_whatsapp_ai_budget', {
    p_company_id: identity.company_id,
    p_identity_id: identity.id,
    p_input_chars: Math.min(Math.max(1, inputChars), MAX_INTERPRETATION_CHARS),
  });
  return normalizeAiBudgetDecision(data, error);
}

async function productAnalytics(
  db: Admin,
  companyId: string,
  request: import('../_shared/whatsappProductAnalytics.ts').ProductAnalyticsRequest,
): Promise<{ replyData: ProductSaleLine[]; costs: ProductCostPoint[] }> {
  const from = periodStart(request.period).toISOString();
  const { data: records } = await db.from('daily_records')
    .select('id, occurred_at')
    .eq('company_id', companyId)
    .eq('kind', 'sale')
    .eq('status', 'confirmed')
    .gte('occurred_at', from)
    .lt('occurred_at', new Date().toISOString())
    .order('occurred_at', { ascending: true })
    .limit(2000);
  const rows = (records ?? []) as Array<{ id: string; occurred_at: string }>;
  if (rows.length === 0) return { replyData: [], costs: [] };
  const byId = new Map(rows.map((row) => [row.id, row.occurred_at]));
  const { data: lines } = await db.from('daily_record_lines')
    .select('daily_record_id, description, quantity, line_total')
    .in('daily_record_id', rows.map((row) => row.id))
    .limit(10000);
  const replyData = ((lines ?? []) as Array<{ daily_record_id: string; description: string; quantity: number; line_total: number }>)
    .map((line) => ({
      description: String(line.description ?? '').trim(),
      quantity: Number(line.quantity),
      lineTotal: Number(line.line_total),
      occurredAt: byId.get(line.daily_record_id) ?? new Date().toISOString(),
    }))
    .filter((line) => line.description && line.quantity > 0 && line.lineTotal > 0);
  const { data: costs } = await db.from('product_costs')
    .select('product_key, unit_cost, effective_from')
    .eq('company_id', companyId)
    .order('effective_from', { ascending: true })
    .limit(5000);
  return {
    replyData,
    costs: ((costs ?? []) as Array<{ product_key: string; unit_cost: number; effective_from: string }>).map((cost) => ({
      productKey: String(cost.product_key), unitCost: Number(cost.unit_cost), effectiveFrom: String(cost.effective_from),
    })),
  };
}

async function rememberProductAnalytics(
  db: Admin,
  identity: any,
  request: ProductAnalyticsRequest,
  items: ProductAggregate[],
): Promise<void> {
  const firstRanked = rankProducts(items, request.rankBy, request.compareNames)[0]?.product;
  const focusNames = (request.compareNames.length > 0 ? request.compareNames : firstRanked ? [firstRanked] : []).slice(0, 2);
  if (focusNames.length === 0) return;
  const context: ProductAnalyticsContext = { kind: 'product_analytics_context', request, focusNames };
  await db.from('whatsapp_conversations').upsert({
    identity_id: identity.id,
    company_id: identity.company_id,
    profile_id: identity.profile_id,
    awaiting: 'product_analytics',
    receipt_id: null,
    options: context,
    expires_at: new Date(Date.now() + 15 * 60_000).toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'identity_id' });
}

async function answerProductAnalytics(
  db: Admin,
  identity: any,
  phone: string,
  request: ProductAnalyticsRequest,
  lang: Lang,
): Promise<void> {
  await replyQuietly(phone, await productAnalyticsToolReply(db, identity, request, lang));
}

async function productAnalyticsToolReply(
  db: Admin,
  identity: any,
  request: ProductAnalyticsRequest,
  lang: Lang,
): Promise<string> {
  if (!canUseCompanyFinanceReads(String(identity.role ?? 'worker'))) {
    return lang === 'sw'
      ? 'Taarifa za mauzo ya bidhaa za kampuni nzima zinaonekana kwa owner au accountant tu.'
      : 'Company-wide product sales information is available only to an owner or accountant.';
  }
  const resolvedNames: string[] = [];
  const notices: string[] = [];
  for (const asked of request.compareNames) {
    const resolved = await resolveProductForRead(db, identity, asked);
    if (resolved.error) {
      return lang === 'sw' ? 'Sikuweza kutafuta bidhaa hiyo sasa.' : 'I could not look up that product right now.';
    }
    if (resolved.resolution.kind === 'ambiguous') {
      return productReadClarification(resolved.resolution, lang);
    }
    if (resolved.resolution.kind === 'not_found') {
      return lang === 'sw'
        ? `Sikupata bidhaa “${asked}” kwenye orodha ya biashara hii.`
        : `I could not find “${asked}” in this business's product catalogue.`;
    }
    resolvedNames.push(resolved.resolution.match.productName);
    const notice = productReadMatchNotice(resolved.resolution, lang).trim();
    if (notice) notices.push(notice);
  }
  const resolvedRequest: ProductAnalyticsRequest = {
    ...request,
    compareNames: [...new Set(resolvedNames)],
  };
  const { replyData, costs } = await productAnalytics(db, identity.company_id, resolvedRequest);
  const items = aggregateProducts(replyData, costs);
  await rememberProductAnalytics(db, identity, resolvedRequest, items);
  return [...notices, productAnalyticsReply(resolvedRequest, items, lang)].filter(Boolean).join('\n');
}

async function hypotheticalProfitToolReply(
  db: Admin,
  identity: ResolvedWhatsAppIdentity,
  asked: string,
  lang: Lang,
): Promise<string> {
  if (!canUseCompanyFinanceReads(identity.role)) {
    return lang === 'sw'
      ? 'Makisio ya faida ya kampuni yanaonekana kwa owner au accountant tu.'
      : 'Company profit estimates are available only to an owner or accountant.';
  }
  const productName = asked.trim().slice(0, 100);
  if (productName.length < 2 || !/[\p{L}]/u.test(productName)) {
    return lang === 'sw' ? 'Unataka kukadiria faida ya bidhaa gani?' : 'Which product profit do you want to estimate?';
  }
  const resolved = await resolveProductForRead(db, identity, productName);
  if (resolved.error) {
    return lang === 'sw' ? 'Sikuweza kutafuta bidhaa hiyo sasa.' : 'I could not look up that product right now.';
  }
  if (resolved.resolution.kind === 'ambiguous') return productReadClarification(resolved.resolution, lang);
  if (resolved.resolution.kind === 'not_found') {
    return lang === 'sw'
      ? `Sikupata bidhaa “${productName}” kwenye orodha ya biashara hii.`
      : `I could not find “${productName}” in this business's product catalogue.`;
  }

  const match = resolved.resolution.match;
  const [stockResult, costResult, priceResult] = await Promise.all([
    db.rpc('wa_stock_on_hand', { p_company_id: identity.company_id, p_product: match.productKey }),
    db.from('product_costs').select('unit_cost').eq('company_id', identity.company_id)
      .eq('product_key', match.productKey).order('effective_from', { ascending: false })
      .order('created_at', { ascending: false }).limit(1).maybeSingle(),
    db.rpc('wa_product_pricing', { p_company_id: identity.company_id, p_product_keys: [match.productKey] }),
  ]);
  if (stockResult.error || costResult.error || priceResult.error) {
    return lang === 'sw'
      ? `Sikuweza kusoma vipande vya makisio ya ${match.productName} sasa.`
      : `I could not load the inputs for the ${match.productName} estimate right now.`;
  }
  const stock = ((stockResult.data ?? []) as Array<Record<string, unknown>>)[0] ?? null;
  const cost = costResult.data as { unit_cost?: number } | null;
  const price = ((priceResult.data ?? []) as Array<Record<string, unknown>>)[0] ?? null;
  return productReadMatchNotice(resolved.resolution, lang) + buildHypotheticalProfitReply({
    productName: match.productName,
    onHand: stock ? Number(stock.on_hand) : null,
    hasCount: Boolean(stock?.has_count),
    unit: stock?.unit ? String(stock.unit) : null,
    unitCost: cost?.unit_cost === undefined ? null : Number(cost.unit_cost),
    retailPrice: price?.retail_price == null ? null : Number(price.retail_price),
    wholesalePrice: price?.wholesale_price == null ? null : Number(price.wholesale_price),
    avgUnitPrice: price?.avg_unit_price == null ? null : Number(price.avg_unit_price),
  }, lang);
}

/**
 * The window a question is about.
 *
 * A named range ("juzi", "wiki iliyopita", "tarehe 7 Mei 2025") wins; otherwise
 * one of the four coarse defaults is used. Both now start at midnight in
 * Africa/Dar_es_Salaam rather than UTC — three hours apart, which is enough to
 * file an evening sale on the wrong day.
 */
function readPeriodBounds(request: ReadRequest): { from: string; to: string } {
  const now = new Date();
  if (request.range) {
    return { from: request.range.from.toISOString(), to: request.range.to.toISOString() };
  }
  const fallback = resolveDateRange(
    request.period === 'today' ? 'leo'
      : request.period === 'week' ? 'wiki hii'
      : request.period === 'month' ? 'mwezi huu' : 'mwaka huu',
    now,
  )!;
  return { from: fallback.from.toISOString(), to: now.toISOString() };
}

/**
 * A1 tools are read-only and tenant-scoped from the already-resolved WhatsApp
 * identity. No user text is used as a company id, and no branch in this helper
 * writes a row or calls a finance mutation RPC.
 */
async function readOnlyToolReply(db: Admin, identity: any, request: ReadRequest, lang: Lang): Promise<string> {
  // There are no records from the future. Saying so is better than quietly
  // returning zero, which reads as "your shop sold nothing".
  if (request.range && isFuture(request.range)) {
    const label = rangeLabel(request.range, lang);
    return lang === 'sw'
      ? `${label.charAt(0).toUpperCase()}${label.slice(1)} bado haijafika, kwa hiyo hakuna rekodi zake. Ungependa nikuonyeshe za leo?`
      : `${label} has not happened yet, so there are no records for it. Would you like today instead?`;
  }
  const { from, to } = readPeriodBounds(request);
  const companyId = String(identity.company_id);
  const profileId = String(identity.profile_id);
  const financeOnly = new Set(['ai_business_summary', 'ai_debtors', 'ai_debtor_detail', 'daily_profit_estimate', 'ai_pending_approvals']);
  if (financeOnly.has(request.tool) && !canUseCompanyFinanceReads(String(identity.role ?? 'worker'))) {
    return lang === 'sw'
      ? 'Taarifa za kampuni nzima zinaonekana kwa owner au accountant tu. Unaweza kuniuliza kuhusu risiti zako, petty cash yako au reimbursement yako.'
      : 'Company-wide financial information is available only to an owner or accountant. You can ask about your own receipts, petty cash, or reimbursement.';
  }

  if (request.tool === 'ai_my_businesses') {
    const { data: memberships, error } = await db.from('company_members')
      .select('company_id, role').eq('profile_id', profileId).is('deactivated_at', null);
    if (error) return lang === 'sw' ? 'Sikuweza kupata orodha ya biashara zako sasa.' : 'I could not load your businesses right now.';
    const ids = (memberships ?? []).map((row: { company_id: string }) => row.company_id);
    if (ids.length === 0) return buildBusinessesReply([], lang);
    const { data: companies, error: companyError } = await db.from('companies').select('id, name').in('id', ids);
    if (companyError) return lang === 'sw' ? 'Sikuweza kupata orodha ya biashara zako sasa.' : 'I could not load your businesses right now.';
    const names = new Map((companies ?? []).map((row: { id: string; name: string }) => [row.id, row.name]));
    return buildBusinessesReply((memberships ?? []).map((row: { company_id: string; role: string }) => ({
      companyId: row.company_id, companyName: names.get(row.company_id) ?? 'Business', role: row.role,
    })), lang);
  }

  if (request.tool === 'ai_petty_cash_balance') {
    const { data, error } = await db.from('petty_cash_accounts').select('current_balance')
      .eq('company_id', companyId).eq('user_id', profileId).maybeSingle();
    return error ? buildPettyCashReply(null, lang) : buildPettyCashReply(data ? Number(data.current_balance) : null, lang);
  }

  if (request.tool === 'ai_owed_to_me') {
    const { data, error } = await db.from('receipts').select('total_amount')
      .eq('company_id', companyId).eq('uploaded_by', profileId).eq('status', 'confirmed')
      .eq('payment_method', 'cash_personal').is('reimbursed_at', null).limit(5000);
    if (error) return lang === 'sw' ? 'Sikuweza kupata taarifa ya madai yako sasa.' : 'I could not load what Risip owes you right now.';
    const amount = (data ?? []).reduce((sum: number, row: { total_amount: number | null }) => sum + Number(row.total_amount ?? 0), 0);
    return buildOwedToMeReply(amount, (data ?? []).length, lang);
  }

  if (request.tool === 'ai_my_receipts') {
    let query = db.from('receipts').select('id, status, total_amount, vendor_name, created_at')
      .eq('company_id', companyId).eq('uploaded_by', profileId).gte('created_at', from).lt('created_at', to)
      .order('created_at', { ascending: false }).limit(10);
    if (request.status) query = query.eq('status', request.status);
    const { data, error } = await query;
    if (error) return lang === 'sw' ? 'Sikuweza kupata risiti zako sasa.' : 'I could not load your receipts right now.';
    return buildReceiptsReply((data ?? []).map((row: { id: string; status: string; total_amount: number | null; vendor_name: string | null; created_at: string }) => ({
      id: row.id, status: row.status, amount: row.total_amount === null ? null : Number(row.total_amount), vendor: row.vendor_name, createdAt: row.created_at,
    })), lang, appUrl());
  }

  if (request.tool === 'ai_pending_approvals') {
    const { count, error } = await db.from('receipts').select('id', { count: 'exact', head: true })
      .eq('company_id', companyId).in('status', ['pending_review', 'submitted']);
    return error ? (lang === 'sw' ? 'Sikuweza kupata approvals zinazosubiri.' : 'I could not load pending approvals.') : buildPendingApprovalsReply(count ?? 0, lang);
  }

  const rangeQuery = db.from('daily_records').select('id, kind, status, amount, party_name, occurred_at')
    .eq('company_id', companyId).eq('status', 'confirmed');
  const dailyQuery = request.tool === 'ai_debtors'
    ? rangeQuery.order('occurred_at', { ascending: true }).limit(10000)
    : rangeQuery.gte('occurred_at', from).lt('occurred_at', to).order('occurred_at', { ascending: true }).limit(10000);
  const { data: dailyRows, error: dailyError } = await dailyQuery;
  if (dailyError) return lang === 'sw' ? 'Sikuweza kupata taarifa za biashara sasa.' : 'I could not load business records right now.';
  const rows = (dailyRows ?? []).map((row: { kind: string; status: string; amount: number; party_name: string | null; occurred_at: string }) => ({
    kind: row.kind, status: row.status, amount: Number(row.amount), partyName: row.party_name, occurredAt: row.occurred_at,
  })) as ReadDailyRow[];

  if (request.tool === 'ai_business_summary') return buildBusinessSummaryReply(calculateBusinessSummary(rows), request.period, lang, request.range);
  if (request.tool === 'ai_debtors' || request.tool === 'ai_debtor_detail') {
    const debtors = calculateDebtors(rows);
    if (request.tool === 'ai_debtor_detail') {
      const wanted = String(request.partyName ?? '').trim().toLocaleLowerCase();
      const debtor = debtors.find((row) => row.partyName.toLocaleLowerCase() === wanted) ?? null;
      return buildDebtorDetailReply(debtor, request.partyName ?? '', lang);
    }
    return buildDebtorsReply(debtors, lang);
  }

  const ids = (dailyRows ?? []).map((row: { id: string }) => row.id);
  const { data: rawLines } = ids.length > 0
    ? await db.from('daily_record_lines').select('daily_record_id, description, quantity, line_total').in('daily_record_id', ids).limit(20000)
    : { data: [] };
  const occurredById = new Map((dailyRows ?? []).map((row: { id: string; occurred_at: string }) => [row.id, row.occurred_at]));
  const lines = (rawLines ?? []).map((line: { daily_record_id: string; description: string; quantity: number; line_total: number }) => ({
    description: line.description, quantity: Number(line.quantity), lineTotal: Number(line.line_total), occurredAt: occurredById.get(line.daily_record_id) ?? from,
  })) as ReadDailyLine[];
  const { data: rawCosts } = await db.from('product_costs').select('product_key, unit_cost, effective_from')
    .eq('company_id', companyId).order('effective_from', { ascending: true }).limit(10000);
  const costs = (rawCosts ?? []).map((cost: { product_key: string; unit_cost: number; effective_from: string }) => ({
    productKey: cost.product_key, unitCost: Number(cost.unit_cost), effectiveFrom: cost.effective_from,
  })) as ReadProductCost[];
  return buildProfitReply(calculateProfitEstimate(rows, lines, costs), request.period, lang, request.range);
}

/**
 * The user's own time words, resolved server-side. Null when they named no
 * period, in which case the coarse enum decides — so the model getting this
 * wrong can only ever fall back to today's behaviour.
 */
function assistantRange(value: unknown): ResolvedRange | null {
  return typeof value === 'string' ? resolveDateRange(value) : null;
}

function assistantPeriod(value: unknown): ReadRequest['period'] {
  return value === 'week' || value === 'month' || value === 'year' ? value : 'today';
}

function assistantProductNames(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
      .map((item) => item.trim().slice(0, 100)).filter(Boolean).slice(0, 2)
    : [];
}

async function executeAssistantTool(
  db: Admin,
  identity: ResolvedWhatsAppIdentity,
  waMessageId: string,
  lang: Lang,
  name: string,
  input: Record<string, unknown>,
): Promise<AssistantToolExecution> {
  if (name === 'get_business_summary') {
    return { content: await readOnlyToolReply(db, identity, { tool: 'ai_business_summary', period: assistantPeriod(input.period), range: assistantRange(input.when) }, lang) };
  }
  if (name === 'get_product_performance') {
    const metric = input.metric === 'revenue' || input.metric === 'margin' ? input.metric : 'quantity';
    return {
      content: await productAnalyticsToolReply(db, identity, {
        rankBy: metric,
        period: assistantPeriod(input.period),
        compareNames: assistantProductNames(input.product_names),
      }, lang),
    };
  }
  if (name === 'get_product_cost') {
    if (!canUseCompanyFinanceReads(identity.role)) {
      const denied = lang === 'sw'
        ? 'Bei za kununua za kampuni zinaonekana kwa owner au accountant tu.'
        : 'Company buying costs are available only to an owner or accountant.';
      return { content: denied, isError: true, terminalReply: denied };
    }
    const productName = typeof input.product_name === 'string' ? input.product_name.trim().slice(0, 100) : '';
    if (productName.length < 2 || !/[\p{L}]/u.test(productName)) {
      const clarification = lang === 'sw' ? 'Unataka bei ya kununua ya bidhaa gani?' : 'Which product buying cost do you want?';
      return { content: clarification, isError: true, terminalReply: clarification };
    }
    const resolved = await resolveProductForRead(db, identity, productName);
    if (resolved.error) {
      const failed = lang === 'sw' ? 'Sikuweza kutafuta bidhaa hiyo sasa.' : 'I could not look up that product right now.';
      return { content: failed, isError: true, terminalReply: failed };
    }
    if (resolved.resolution.kind === 'ambiguous') {
      const clarification = productReadClarification(resolved.resolution, lang);
      return { content: clarification, isError: true, terminalReply: clarification };
    }
    if (resolved.resolution.kind === 'not_found') {
      return { content: productCostReply(productName, null, lang) };
    }
    const productKey = resolved.resolution.match.productKey;
    const canonicalName = resolved.resolution.match.productName;
    const { data, error } = await db.from('product_costs')
      .select('product_name, unit_cost, unit, currency, effective_from')
      .eq('company_id', identity.company_id)
      .eq('product_key', productKey)
      .order('effective_from', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) {
      const failed = lang === 'sw' ? 'Sikuweza kupata bei hiyo ya kununua sasa.' : 'I could not load that buying cost right now.';
      return { content: failed, isError: true, terminalReply: failed };
    }
    return {
      content: productReadMatchNotice(resolved.resolution, lang) + productCostReply(canonicalName, data ? {
        productName: String(data.product_name), unitCost: Number(data.unit_cost),
        unit: data.unit ? String(data.unit) : null, currency: String(data.currency), effectiveFrom: String(data.effective_from),
      } : null, lang),
    };
  }
  if (name === 'get_hypothetical_product_profit') {
    const productName = typeof input.product_name === 'string' ? input.product_name : '';
    const content = await hypotheticalProfitToolReply(db, identity, productName, lang);
    return { content, terminalReply: content };
  }
  if (name === 'get_open_debts') {
    const partyName = typeof input.party_name === 'string' ? input.party_name.trim().slice(0, 100) || null : null;
    return {
      content: await readOnlyToolReply(db, identity, {
        tool: partyName ? 'ai_debtor_detail' : 'ai_debtors',
        period: 'today',
        partyName,
      }, lang),
    };
  }
  if (name === 'get_my_receipts') {
    const status = input.status === 'confirmed' || input.status === 'submitted' ? input.status : null;
    return { content: await readOnlyToolReply(db, identity, { tool: 'ai_my_receipts', period: assistantPeriod(input.period), status, range: assistantRange(input.when) }, lang) };
  }
  if (name === 'get_my_petty_cash_balance') {
    return { content: await readOnlyToolReply(db, identity, { tool: 'ai_petty_cash_balance', period: 'today' }, lang) };
  }
  if (name === 'get_my_reimbursements') {
    return { content: await readOnlyToolReply(db, identity, { tool: 'ai_owed_to_me', period: 'today' }, lang) };
  }
  if (name === 'get_my_businesses') {
    return { content: await readOnlyToolReply(db, identity, { tool: 'ai_my_businesses', period: 'today' }, lang) };
  }
  if (name === 'get_stock_on_hand') {
    const asked = typeof input.product_name === 'string' ? input.product_name.trim().slice(0, 80) : '';
    const resolved = asked ? await resolveProductForRead(db, identity, asked) : null;
    if (resolved?.error) {
      return { content: lang === 'sw' ? 'Sikuweza kutafuta bidhaa hiyo sasa.' : 'I could not look up that product right now.' };
    }
    if (resolved?.resolution.kind === 'ambiguous') {
      return { content: productReadClarification(resolved.resolution, lang) };
    }
    if (resolved?.resolution.kind === 'not_found') {
      return { content: stockReply(null, asked, lang) };
    }
    const matched = resolved?.resolution.kind === 'matched' ? resolved.resolution : null;
    const { data, error } = await db.rpc('wa_stock_on_hand', {
      p_company_id: identity.company_id,
      p_product: matched?.match.productKey ?? null,
    });
    if (error) {
      return { content: lang === 'sw' ? 'Sikuweza kupata hesabu ya stock sasa.' : 'I could not load stock right now.' };
    }
    const rows = ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
      productName: String(row.product_name ?? ''),
      unit: row.unit ? String(row.unit) : null,
      measured: Boolean(row.measured),
      onHand: Number(row.on_hand ?? 0),
      hasCount: Boolean(row.has_count),
      countedAt: row.counted_at ? String(row.counted_at) : null,
      boughtSince: Number(row.bought_since ?? 0),
      soldSince: Number(row.sold_since ?? 0),
      incompletePurchases: Boolean(row.incomplete_purchases),
    }));
    return {
      content: asked && matched
        ? productReadMatchNotice(matched, lang) + stockReply(rows[0] ?? null, matched.match.productName, lang)
        : stockListReply(rows, lang),
    };
  }
  if (name === 'get_pending_approvals') {
    return { content: await readOnlyToolReply(db, identity, { tool: 'ai_pending_approvals', period: 'today' }, lang) };
  }
  if (name === 'search_risip_help') {
    const query = typeof input.query === 'string' ? input.query.slice(0, 500) : '';
    return { content: buildKnowledgeReply(query, lang) };
  }
  if (name === 'propose_product_cost') {
    if (!canUseCompanyFinanceReads(identity.role)) {
      const denied = lang === 'sw'
        ? 'Ni owner au accountant pekee anayeweza kuweka bei ya kununua bidhaa.'
        : 'Only an owner or accountant can set a product buying cost.';
      return { content: denied, isError: true, terminalReply: denied };
    }
    const cost = validateProductCostCandidate(input);
    if (!cost) {
      const clarification = lang === 'sw'
        ? 'Taja jina la bidhaa, bei yake ya kununua, na unit kama ipo. Mfano: unga unanigharimu TSh 900 kwa kilo.'
        : 'State the product, its buying cost, and the unit if known. For example: flour costs me TSh 900 per kilo.';
      return { content: clarification, isError: true, terminalReply: clarification };
    }
    const { data: previous } = await db.from('product_costs')
      .select('unit_cost')
      .eq('company_id', identity.company_id)
      .eq('product_key', cost.product.trim().toLowerCase())
      .order('effective_from', { ascending: false })
      .limit(1)
      .maybeSingle();
    await db.from('whatsapp_conversations').upsert({
      identity_id: identity.id,
      company_id: identity.company_id,
      profile_id: identity.profile_id,
      awaiting: 'product_cost',
      receipt_id: null,
      options: cost,
      expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'identity_id' });
    const confirmation = costConfirmation(
      cost,
      identity.company_name,
      previous ? Number((previous as { unit_cost: number }).unit_cost) : null,
      lang,
    );
    return { content: confirmation, terminalReply: confirmation };
  }
  if (name === 'propose_daily_record') {
    const parsed = validateAiCandidate(input);
    if (!parsed) {
      const clarification = lang === 'sw'
        ? 'Sijaweza kuthibitisha kiasi na hesabu zake. Taja aina ya rekodi, bidhaa au matumizi, quantity na bei—na useme kama bei ni jumla au ya kila moja.'
        : 'I could not validate the amount and its arithmetic. State the record type, item or expense, quantity and price—and say whether the price is the total or per item.';
      return { content: clarification, isError: true, terminalReply: clarification };
    }
    const guardedRecord = await addHistoricalPriceWarnings(db, identity.company_id, parsed);
    const created = await createDailyRecordDraft(db, identity, waMessageId, guardedRecord, lang);
    if (created.error || !created.id) {
      const failed = lang === 'sw'
        ? 'Sikuweza kuhifadhi draft hii. Hakuna rekodi iliyothibitishwa; tafadhali jaribu tena.'
        : 'I could not save this draft. No record was confirmed; please try again.';
      return { content: failed, isError: true, terminalReply: failed };
    }
    const state: DailyRecordConversation = {
      kind: 'daily_record_confirmation',
      dailyRecordId: created.id,
      sourceMessageId: waMessageId,
      record: guardedRecord,
    };
    await db.from('whatsapp_conversations').upsert({
      identity_id: identity.id,
      company_id: identity.company_id,
      profile_id: identity.profile_id,
      awaiting: 'payment_source',
      receipt_id: null,
      options: state,
      expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'identity_id' });
    // Asked before NDIYO, while the trader can still change the name. Afterwards
    // it would be a second product with sales already in it.
    const nearName = await nearNameNotice(db, identity.company_id, guardedRecord, lang);
    const underPrice = await belowOwnPriceNotice(db, identity.company_id, guardedRecord, lang);
    const confirmation = `${identity.company_name} — ${buildDailyRecordConfirmation(guardedRecord, lang)}${nearName}${underPrice}`;
    return { content: confirmation, terminalReply: confirmation };
  }
  return {
    content: lang === 'sw' ? 'Tool hiyo haipatikani.' : 'That tool is not available.',
    isError: true,
  };
}

async function activeProjects(db: Admin, companyId: string): Promise<{ id: string; name: string }[]> {
  const { data } = await db
    .from('projects')
    .select('id, name')
    .eq('company_id', companyId)
    .eq('status', 'active')
    .order('created_at', { ascending: false });
  return (data ?? []) as { id: string; name: string }[];
}

async function parkProjectSetup(
  db: Admin,
  identity: any,
  messageId: string,
  mediaId: string,
  mediaMime: string | null,
  caption: string | null,
  lang: Lang,
): Promise<string> {
  const { data: profile } = await db
    .from('profiles')
    .select('id, company_id, role, deactivated_at')
    .eq('id', identity.profile_id)
    .maybeSingle();

  const projects = await activeProjects(db, identity.company_id as string);
  const canUseProject = projects.length > 0;
  let workerHasProject = false;
  if (profile?.role === 'worker' && projects.length > 0) {
    const { data: memberships } = await db.from('project_members')
      .select('project_id').eq('profile_id', identity.profile_id);
    const memberIds = new Set((memberships ?? []).map((row) => String(row.project_id)));
    workerHasProject = projects.some((project) => memberIds.has(project.id));
  }
  if ((profile?.role === 'owner' || profile?.role === 'accountant') && canUseProject) return '';
  if (profile?.role === 'worker' && workerHasProject) return '';

  await db.from('whatsapp_messages').update({
    profile_id: identity.profile_id,
    company_id: identity.company_id,
    media_id: mediaId,
    media_mime: mediaMime,
    caption,
    status: 'skipped',
    last_error: 'awaiting_project_setup',
    processed_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }).eq('wa_message_id', messageId);

  if (!profile || profile.deactivated_at || profile.company_id !== identity.company_id || profile.role === 'worker') {
    return projectSetupWorkerReply(lang);
  }

  const { data: company } = await db.from('companies').select('name').eq('id', identity.company_id).maybeSingle();
  const setup: ProjectSetupState = {
    kind: 'project_setup', stage: 'choose', mediaMessageId: messageId,
  };
  await db.from('whatsapp_conversations').upsert({
    identity_id: identity.id,
    company_id: identity.company_id,
    profile_id: identity.profile_id,
    awaiting: 'project',
    receipt_id: null,
    options: setup,
    expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'identity_id' });

  return projectSetupPrompt(lang, String(company?.name ?? 'your business'));
}

async function createOrReuseProject(
  db: Admin,
  identity: any,
  projectName: string,
): Promise<{ id: string; name: string; created: boolean } | null> {
  const { data: profile } = await db
    .from('profiles')
    .select('id, company_id, role, deactivated_at')
    .eq('id', identity.profile_id)
    .maybeSingle();
  if (!profile || profile.deactivated_at || profile.company_id !== identity.company_id) return null;
  if (!canCreateProject(profile.role)) return null;

  const { data: existing } = await db
    .from('projects')
    .select('id, name')
    .eq('company_id', identity.company_id)
    .eq('status', 'active')
    .eq('name', projectName)
    .limit(1)
    .maybeSingle();

  let project = existing as { id: string; name: string } | null;
  let created = false;
  if (!project) {
    const { data, error } = await db.from('projects').insert({
      company_id: identity.company_id,
      name: projectName,
      status: 'active',
      created_by: identity.profile_id,
    }).select('id, name').single();
    if (data) {
      project = data as { id: string; name: string };
      created = true;
    } else if (error) {
      // A concurrent setup may have created the same name. Reuse it rather than
      // turning a harmless duplicate into a failed receipt flow.
      const { data: raced } = await db
        .from('projects').select('id, name').eq('company_id', identity.company_id)
        .eq('status', 'active').eq('name', projectName).limit(1).maybeSingle();
      if (!raced) return null;
      project = raced as { id: string; name: string };
    }
  }

  const { error: memberError } = await db.from('project_members').upsert({
    project_id: project.id,
    profile_id: identity.profile_id,
  }, { onConflict: 'project_id,profile_id' });
  if (memberError) return null;
  return { ...project, created };
}

async function resumePendingReceipt(db: Admin, identity: any, mediaMessageId: string): Promise<boolean> {
  const { data, error } = await db.from('whatsapp_messages').update({
    status: 'pending',
    last_error: null,
    processed_at: null,
    retry_count: 0,
    updated_at: new Date().toISOString(),
  }).eq('wa_message_id', mediaMessageId)
    .eq('company_id', identity.company_id)
    .eq('profile_id', identity.profile_id)
    .is('receipt_id', null)
    .select('id')
    .maybeSingle();
  return !error && Boolean(data);
}

/** Append-only trail: intent and outcome only, never bodies or secrets. */
/**
 * The message currently being handled, so `audit` can record what was asked.
 *
 * Every answer-quality defect in this project so far was found because the owner
 * screenshotted it. That does not scale past one shop and only catches what
 * somebody happened to be looking at. Keeping the question — with anything
 * phone-shaped masked, and never a linking token — turns the audit log into the
 * work queue it should always have been.
 */
let auditedText: string | null = null;

const LINK_TOKEN = /^\s*link\b/i;

function rememberForAudit(body: string | null | undefined): void {
  const text = String(body ?? '').trim();
  // A LINK message carries a single-use secret. It is never worth learning from
  // and must never be written down.
  auditedText = !text || LINK_TOKEN.test(text) ? null : text.slice(0, 2000);
}

async function audit(
  db: Admin, identity: any, waMessageId: string,
  intent: string, action: string, outcome: string, receiptId?: string,
  claimedBy?: string,
): Promise<void> {
  try {
    await db.from('whatsapp_audit_log').insert({
      company_id: identity?.company_id ?? null,
      profile_id: identity?.profile_id ?? null,
      wa_message_id: waMessageId,
      intent, action, outcome,
      receipt_id: receiptId ?? null,
      message_text: auditedText === null ? null : maskDigits(auditedText),
      claimed_by: claimedBy ?? intent,
    });
  } catch { /* auditing must not break the flow */ }
}

/** A run of nine or more digits is a phone number far more often than a price. */
function maskDigits(text: string): string {
  return text.replace(/\+?\d[\d\s-]{8,}\d/g, '[namba]');
}

/** Best-effort reply. A send failure must never turn into a non-200 for Meta. */
async function replyQuietly(to: string, body: string): Promise<void> {
  try {
    await sendWhatsAppText(to, body);
  } catch (err) {
    console.error('reply failed', maskPhone(to), err instanceof Error ? err.message : 'unknown');
  }
}

async function replyDailyRecordConfirmationQuietly(
  to: string,
  record: ParsedDailyRecord,
  lang: Lang,
): Promise<void> {
  for (const chunk of buildDailyRecordConfirmationChunks(record, lang)) {
    await replyQuietly(to, chunk);
  }
}

async function replyDailyRecordBatchConfirmationQuietly(
  to: string,
  records: ParsedDailyRecord[],
  lang: Lang,
): Promise<void> {
  for (const chunk of splitWhatsAppText(buildDailyRecordBatchConfirmation(records, lang))) {
    await replyQuietly(to, chunk);
  }
}

/**
 * Bind a verified WhatsApp number to a profile using a single-use token.
 * The token is compared by hash, so the plaintext never has to be stored.
 */
async function handleLink(db: Admin, phone: string, waId: string, token: string): Promise<string> {
  const hash = await sha256Hex(token);
  const { data: row } = await db
    .from('whatsapp_link_tokens')
    .select('id, profile_id, company_id, expires_at, used_at, revoked_at, attempts')
    .eq('token_hash', hash)
    .maybeSingle();

  const verdict = evaluateLinkToken(row ?? null);
  if (!verdict.ok) {
    // Record the failed attempt so token probing is visible in the data.
    if (row?.id) {
      await db.from('whatsapp_link_tokens')
        .update({ attempts: Number(row.attempts ?? 0) + 1 })
        .eq('id', row.id);
    }
    return linkFailureMessage(verdict.reason);
  }

  // The employee must still be active in their company.
  const { data: profile } = await db
    .from('profiles')
    .select('id, full_name, company_id, deactivated_at')
    .eq('id', row.profile_id)
    .maybeSingle();
  if (!profile || profile.deactivated_at) {
    return 'That Risip account is no longer active. Contact your administrator.';
  }

  // A number may only ever point at one live profile.
  const { data: clash } = await db
    .from('whatsapp_identities')
    .select('id, profile_id')
    .eq('phone_e164', phone)
    .is('revoked_at', null)
    .maybeSingle();
  if (clash && clash.profile_id !== profile.id) {
    return 'This WhatsApp number is already connected to a different Risip account. Revoke it there first.';
  }

  // Replace any previous identity for this profile, then link.
  await db.from('whatsapp_identities')
    .update({ revoked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('profile_id', profile.id)
    .is('revoked_at', null);

  const { data: created, error: insErr } = await db.from('whatsapp_identities').insert({
    profile_id: profile.id,
    company_id: profile.company_id,
    phone_e164: phone,
    wa_id: waId,
  }).select('id').single();
  if (insErr || !created) {
    console.error('identity insert failed', insErr?.message);
    return 'Could not connect this number right now. Please try again.';
  }

  await db.from('whatsapp_link_tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('id', row.id);

  // Ask for a language once, right after linking, and park the conversation there
  // so the next message is read as the answer.
  await db.from('whatsapp_conversations').upsert({
    identity_id: created.id,
    company_id: profile.company_id,
    profile_id: profile.id,
    awaiting: 'language',
    expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
    updated_at: new Date().toISOString(),
  }, { onConflict: 'identity_id' });

  return `Connected.\n\n${t('chooseLanguage', 'en')}`;
}

// ── Onboarding a number Risip has never seen ────────────────────────────────
//
// The gate that matters: this path never touches the AI. An unknown sender's
// photo is acknowledged and dropped — media_id is never written, so
// whatsapp-worker never picks it up and nothing is extracted. A stranger cannot
// make us spend money.
async function handleOnboarding(
  db: Admin, phone: string, text: string | null, isImage: boolean,
): Promise<string> {
  const { data: state } = await db
    .from('whatsapp_onboarding')
    .select('phone_e164, step, lang, draft, expires_at')
    .eq('phone_e164', phone)
    .maybeSingle();

  const fresh = !state || new Date(state.expires_at as string) < new Date();
  if (fresh) {
    const open = startOnboarding();
    await db.from('whatsapp_onboarding').upsert({
      phone_e164: phone, step: open.step, draft: {},
      expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'phone_e164' });
    return open.reply;
  }

  const lang: Lang = (state.lang as Lang | null) ?? 'en';
  // A photo mid-onboarding is not an answer to the question we asked.
  if (isImage) {
    return lang === 'sw'
      ? 'Nimeipokea picha, lakini tumalize kujiandikisha kwanza.'
      : 'I have your photo, but let us finish signing you up first.';
  }

  const next = advanceOnboarding(
    state.step as OnboardingStep, text, lang,
    (state.draft ?? {}) as Record<string, string>,
  );

  if (next.action.kind === 'set_language') {
    await db.from('whatsapp_onboarding').update({
      step: next.step, lang: next.action.lang, draft: next.draft,
      updated_at: new Date().toISOString(),
    }).eq('phone_e164', phone);
    return next.reply;
  }

  if (next.action.kind === 'create_business' || next.action.kind === 'join_business') {
    // The auth user has to exist before a profile can point at it, and only the
    // Admin API can make one. No password is set and none is ever sent: the way
    // in is the short-lived login link.
    //
    // Identified by a synthetic .invalid address, not by phone: GoTrue's phone
    // provider is off on this project and enabling it would mean paying Twilio
    // for SMS we never send. See _shared/waIdentityEmail.ts.
    const { data: created, error: userErr } = await db.auth.admin.createUser({
      email: waSyntheticEmail(phone),
      email_confirm: true,
      user_metadata: { source: 'whatsapp', phone },
    });
    if (userErr || !created?.user) {
      console.error('onboarding user create failed', userErr?.message);
      return lang === 'sw' ? 'Imeshindikana kwa sasa. Jaribu tena.' : 'That did not work just now. Please try again.';
    }

    const rpc = next.action.kind === 'create_business'
      ? db.rpc('wa_create_business', {
          p_user: created.user.id, p_phone: phone,
          p_full_name: next.action.fullName,
          p_company_name: next.action.businessName, p_location: '',
        })
      : db.rpc('wa_join_by_code', {
          p_user: created.user.id, p_phone: phone,
          p_code: next.action.code, p_full_name: next.action.fullName,
        });

    const { data: result, error: rpcErr } = await rpc;
    if (rpcErr) {
      await db.auth.admin.deleteUser(created.user.id).catch(() => {});
      return rpcErr.message;
    }

    const name = (result as { company_name?: string } | null)?.company_name ?? '';
    const person = next.action.fullName;
    return lang === 'sw'
      ? `Sawa ${person}, karibu ${name} 🎉\nRisip iko tayari kukusaidia kurekodi risiti na biashara yako.\n\nAndika "ingia" kupata link ya kufungua Risip.`
      : `Okay ${person}, welcome to ${name} 🎉\nRisip is ready to help you record receipts and manage your business.\n\nSend "login" to get a link to open Risip.`;
  }

  await db.from('whatsapp_onboarding').update({
    step: next.step, draft: next.draft, updated_at: new Date().toISOString(),
  }).eq('phone_e164', phone);
  return next.reply;
}

/** A short-lived way in to the web. Never a password. */
async function handleLoginLink(db: Admin, phone: string, lang: Lang): Promise<{ reply: string; issued: boolean }> {
  const { data: token, error } = await db.rpc('wa_issue_login_token', { p_phone: phone });
  if (error || !token) {
    return {
      issued: false,
      reply: lang === 'sw'
        ? 'Sikuweza kutengeneza link ya kuingia sasa. Tafadhali jaribu tena baada ya muda mfupi.'
        : 'I could not create a login link right now. Please try again in a moment.',
    };
  }
  const url = `${appUrl()}/wa-login?t=${token}`;
  return {
    issued: true,
    reply: lang === 'sw'
      ? `Fungua link hii ndani ya dakika 5. Inatumika mara moja tu.\nUsimtumie mtu mwingine link hii.\n${url}`
      : `Open this link within 5 minutes. It works once only.\nDo not share this link with anyone.\n${url}`,
  };
}

/** Fire-and-forget: nudge the worker without blocking the 200 back to Meta. */
function nudgeWorker(): void {
  const url = Deno.env.get('SUPABASE_URL');
  const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!url || !key) return;
  void fetch(`${url}/functions/v1/whatsapp-worker`, {
    method: 'POST',
    headers: { authorization: `Bearer ${key}`, 'content-type': 'application/json' },
    body: JSON.stringify({ sweep: true }),
  }).catch(() => undefined);
}

Deno.serve(async (req) => {
  const url = new URL(req.url);

  // ── Meta subscription challenge ──────────────────────────────────────────
  if (req.method === 'GET') {
    const mode = url.searchParams.get('hub.mode');
    const token = url.searchParams.get('hub.verify_token');
    const challenge = url.searchParams.get('hub.challenge') ?? '';
    const expected = Deno.env.get('WHATSAPP_VERIFY_TOKEN') ?? '';
    if (mode === 'subscribe' && expected && token === expected) {
      return new Response(challenge, { status: 200, headers: { 'content-type': 'text/plain' } });
    }
    return new Response('forbidden', { status: 403 });
  }

  if (req.method !== 'POST') return new Response('method not allowed', { status: 405 });

  // ── Signature over the raw body ──────────────────────────────────────────
  const raw = await req.text();
  const appSecret = Deno.env.get('WHATSAPP_APP_SECRET') ?? '';
  const ok = await verifyMetaSignature(raw, req.headers.get('x-hub-signature-256'), appSecret);
  if (!ok) {
    console.error('rejected: bad signature');
    return new Response('invalid signature', { status: 401 });
  }

  let payload: any;
  try { payload = JSON.parse(raw); } catch { return new Response('ok', { status: 200 }); }

  let db: Admin;
  try { db = admin(); } catch { return new Response('misconfigured', { status: 500 }); }

  const entries = Array.isArray(payload?.entry) ? payload.entry : [];
  for (const entry of entries) {
    for (const change of entry?.changes ?? []) {
      const value = change?.value ?? {};
      // Delivery/read receipts carry `statuses`, not `messages` — ignore them.
      const messages = Array.isArray(value.messages) ? value.messages : [];

      for (const message of messages) {
        const waMessageId = String(message?.id ?? '');
        const phone = normalizeE164(message?.from);
        if (!waMessageId || !phone) continue;

        // Idempotency gate: Meta delivers at least once, so a repeat delivery must
        // collide here rather than create a second job. Unique index does the work.
        const { error: dupErr } = await db.from('whatsapp_messages').insert({
          wa_message_id: waMessageId,
          phone_e164: phone,
          kind: String(message?.type ?? 'unknown'),
          status: 'pending',
        });
        if (dupErr) {
          if (dupErr.code === '23505') continue; // already seen — nothing to do
          console.error('message insert failed', dupErr.message);
          continue;
        }

        // Give immediate feedback before onboarding, tools or the model do any
        // slower work. This runs only after signature verification and the
        // idempotency gate, so status webhooks and duplicate deliveries cannot
        // flash a misleading typing indicator.
        await showTyping(waMessageId);

        // Resolve identity once; used by both branches below.
        const { data: rawIdentity } = await db
          .from('whatsapp_identities')
          .select('id, revoked_at')
          .eq('phone_e164', phone)
          .is('revoked_at', null)
          .maybeSingle();

        const body: string | null = message?.text?.body ?? null;
        const identity = await resolveWhatsAppContext(db, rawIdentity as { id: string; revoked_at: string | null } | null);
        const lang: Lang = identity?.lang ?? detectLanguage(body) ?? 'en';
        const finish = (status: string, error?: string) =>
          db.from('whatsapp_messages')
            .update({
              status, ...(error ? { last_error: error } : {}),
              processed_at: new Date().toISOString(), updated_at: new Date().toISOString(),
            })
            .eq('wa_message_id', waMessageId);

        // Everything audited from here on records what was asked, not only what
        // was done with it. Cleared per message so nothing leaks across.
        rememberForAudit(body);

        // ── One message, two topics ───────────────────────────────────────
        // "nimeuza daftari 5 kwa 7500, faida ya leo ni ngapi?" used to be
        // claimed whole by the first parser that matched, and the question was
        // dropped without a word. The split is only trusted when the action
        // half genuinely reaches a write parser — otherwise the whole message
        // goes to the read path untouched, which already handles it.
        const rider = splitRiderQuestion(body);
        const claimsWrite = (said: string) => Boolean(
          parseStockCountBatch(said) ?? parseStockCount(said) ?? parseSellingPrice(said)
          ?? parseProductCostBatch(said) ?? parseProductCost(said),
        ) || isDailyRecordCandidate(said);
        const mixed = rider && claimsWrite(rider.action) ? rider : null;
        const writeBody = mixed ? mixed.action : body;
        let riderPending = mixed !== null;
        /**
         * The write branches reply through this, so the rider question is named
         * once — on the first reply the message produces — and then answered.
         */
        const reply = async (to: string, text: string) => {
          if (!mixed || !riderPending) return replyQuietly(to, text);
          riderPending = false;
          await replyQuietly(to, text + riderQuestionNotice(mixed.question, lang));
          if (!identity) return;
          // Read-only, so it runs now rather than after the confirmation. The
          // notice above already says the figure excludes what is pending.
          const hypotheticalProduct = parseHypotheticalProfitRequest(mixed.question);
          if (hypotheticalProduct) {
            await replyQuietly(to, await hypotheticalProfitToolReply(db, identity, hypotheticalProduct, lang));
            await audit(db, identity, waMessageId, 'rider_question', 'hypothetical_product_profit', 'applied');
            return;
          }
          const product = parseProductAnalyticsRequest(mixed.question);
          if (product) {
            await answerProductAnalytics(db, identity, to, product, lang);
            await audit(db, identity, waMessageId, 'rider_question', 'product_analytics', 'applied');
            return;
          }
          const read = parseReadRequest(mixed.question);
          if (read) {
            try {
              await replyQuietly(to, await readOnlyToolReply(db, identity, read, lang));
              await audit(db, identity, waMessageId, 'rider_question', read.tool, 'applied');
            } catch {
              await replyQuietly(to, lang === 'sw'
                ? 'Sikuweza kupata jibu la swali lako la pili sasa. Liulize peke yake.'
                : 'I could not answer your second question just now. Ask it on its own.');
              await audit(db, identity, waMessageId, 'rider_question', read.tool, 'failed');
            }
            return;
          }
          // MEASURED FAILURE: the two parsers above cover a narrow set of exact
          // phrases, so "nionyeshe risiti za leo" — which the assistant answers
          // perfectly well — came back as "I did not understand", in the same
          // breath as an answer. The assistant gets the question too.
          const budget = await consumeAiBudget(db, identity, mixed.question.length);
          const assistant = budget.allowed
            ? await runConversationalAssistant({
              context: assistantIdentityContext(identity),
              history: [],
              userText: mixed.question,
              executeTool: (name, input) => executeAssistantTool(db, identity, waMessageId, lang, name, input),
              onFailure: () => {},
            })
            : null;
          if (assistant) {
            await replyQuietly(to, assistant.reply);
            await audit(db, identity, waMessageId, 'rider_question', 'conversational_ai', 'applied');
            return;
          }
          await replyQuietly(to, lang === 'sw'
            ? 'Swali lako la pili sikulielewa. Liulize peke yake ili nikujibu vizuri.'
            : 'I did not understand your second question. Ask it on its own so I can answer properly.');
          await audit(db, identity, waMessageId, 'rider_question', 'unknown', 'clarification');
        };

        if (rawIdentity && !identity) {
          await replyQuietly(phone, lang === 'sw'
            ? 'Akaunti hii imeunganishwa, lakini haina biashara hai yenye membership halali. Fungua Risip uchague biashara, kisha jaribu tena.'
            : 'This account is linked, but it has no valid active business membership. Open Risip, choose a business, then try again.');
          await finish('skipped', 'invalid_active_company');
          continue;
        }

        if (identity) {
          await db.from('whatsapp_messages').update({
            profile_id: identity.profile_id,
            company_id: identity.company_id,
            updated_at: new Date().toISOString(),
          }).eq('wa_message_id', waMessageId);
        }

        // Login is a protected control-plane command. Resolve it before any
        // conversational/record parser so natural requests such as “nipe link
        // ya login nichek dashboard” cannot be answered (or refused) by AI.
        if (identity && isLoginRequest(body)) {
          const login = await handleLoginLink(db, phone, lang);
          await replyQuietly(phone, login.reply);
          await audit(db, identity, waMessageId, 'login_link', 'issued', login.issued ? 'applied' : 'failed');
          await finish('skipped');
          continue;
        }

        // ── Receipt image (with its optional caption) ─────────────────────
        if (message?.type === 'image' && message?.image?.id) {
          if (!identity) {
            // Onboard, never extract. media_id stays null, so whatsapp-worker
            // never sees this and no AI is called for a stranger.
            await replyQuietly(phone, await handleOnboarding(db, phone, null, true));
            await finish('skipped', 'onboarding');
            continue;
          }
          const setupReply = await parkProjectSetup(
            db,
            identity,
            waMessageId,
            String(message.image.id),
            message.image.mime_type ? String(message.image.mime_type) : null,
            message.image.caption ? String(message.image.caption).slice(0, 500) : null,
            lang,
          );
          if (setupReply) {
            await replyQuietly(phone, setupReply);
            continue;
          }
          await db.from('whatsapp_messages').update({
            profile_id: identity.profile_id,
            company_id: identity.company_id,
            media_id: String(message.image.id),
            media_mime: message.image.mime_type ? String(message.image.mime_type) : null,
            // Untrusted text. Only ever matched against the sender's own projects.
            caption: message.image.caption ? String(message.image.caption).slice(0, 500) : null,
            updated_at: new Date().toISOString(),
          }).eq('wa_message_id', waMessageId);
          continue; // worker takes it from here
        }

        if (message?.type !== 'text') {
          if (!identity) {
            await replyQuietly(phone, await handleOnboarding(db, phone, null, true));
            await finish('skipped', 'onboarding');
            continue;
          }
          await replyQuietly(phone, t('photoOnly', lang));
          await finish('skipped', 'unsupported_message_type');
          continue;
        }

        // ── Text: deterministic routing, no model involved ────────────────
        const linkToken = parseLinkToken(body);
        const convo = identity ? await loadConversation(db, identity.id as string) : null;
        const intent = routeIntent({
          messageType: 'text',
          text: body,
          hasLinkToken: Boolean(linkToken),
          awaitingClarification: Boolean(convo),
        });

        if (intent === 'link_account') {
          const reply = await handleLink(db, phone, String(message?.from ?? ''), linkToken!);
          await replyQuietly(phone, reply);
          await finish('skipped');
          continue;
        }

        if (!identity) {
          await replyQuietly(phone, await handleOnboarding(db, phone, body, false));
          await finish('skipped', 'onboarding');
          continue;
        }

        if (isHelp(body)) {
          await replyQuietly(phone, `${t('help', lang)}\n\n${buildKnowledgeReply(body, lang)}`);
          await audit(db, identity, waMessageId, 'help', 'knowledge_reply', 'applied');
          await finish('skipped');
          continue;
        }

        // Daily-record draft confirmation uses the existing payment_source
        // conversation slot. Receipt/project state stays mutually exclusive.
        const dailyConversation = convo?.awaiting === 'payment_source'
          && (convo.options as Partial<DailyRecordConversation> | null)?.kind === 'daily_record_confirmation'
          ? convo.options as DailyRecordConversation
          : null;
        const dailyClarification = convo?.awaiting === 'payment_source'
          && (convo.options as Partial<DailyRecordClarification> | null)?.kind === 'daily_record_clarification'
          ? convo.options as DailyRecordClarification
          : null;
        const dailyBatchConversation = convo?.awaiting === 'payment_source'
          && (convo.options as Partial<DailyRecordBatchConversation> | null)?.kind === 'daily_record_batch_confirmation'
          ? convo.options as DailyRecordBatchConversation
          : null;
        const dailyBatchClarification = convo?.awaiting === 'payment_source'
          && (convo.options as Partial<DailyRecordBatchClarification> | null)?.kind === 'daily_record_batch_clarification'
          ? convo.options as DailyRecordBatchClarification
          : null;
        // A buying price awaiting NDIYO. Its own slot, so it can never be
        // confused with a daily-record draft sitting in payment_source.
        // Two different things live in the product_cost slot, so both are tagged.
        // A question Risip asked ("unainunua kwa shingapi?") is answered with a
        // bare price; a claim the person volunteered still needs NDIYO.
        const costPrompt = convo?.awaiting === 'product_cost'
          && (convo.options as Partial<CostPrompt> | null)?.kind === 'cost_prompt'
          ? convo.options as CostPrompt
          : null;
        const stockBatchPending = convo?.awaiting === 'product_cost'
          && (convo.options as Partial<StockCountBatch> | null)?.kind === 'stock_count_batch'
          ? convo.options as StockCountBatch
          : null;
        const costBatchPending = convo?.awaiting === 'product_cost'
          && (convo.options as Partial<ProductCostBatch> | null)?.kind === 'product_cost_batch'
          ? convo.options as ProductCostBatch
          : null;
        const sellingBatchPending = convo?.awaiting === 'product_cost'
          && (convo.options as Partial<SellingPriceBatch> | null)?.kind === 'selling_price_batch'
          ? convo.options as SellingPriceBatch
          : null;
        const costConversation = convo?.awaiting === 'product_cost' && convo.options
          && !costPrompt && !costBatchPending && !stockBatchPending && !sellingBatchPending
          ? { cost: convo.options as unknown as ProductCost }
          : null;
        const productContext = convo?.awaiting === 'product_analytics'
          && (convo.options as Partial<ProductAnalyticsContext> | null)?.kind === 'product_analytics_context'
          ? convo.options as ProductAnalyticsContext
          : null;
        // ── Signing out ──────────────────────────────────────────────────
        // The phone number is the credential, so this unlinks it. It runs
        // before the stop command on purpose: bare "toka" means both "cancel
        // this" and "let me out", and until now it silently meant the first.
        const logoutPending = convo?.awaiting === 'logout_confirm'
          && (convo.options as Partial<LogoutState> | null)?.kind === 'logout'
          ? convo.options as LogoutState
          : null;

        if (logoutPending) {
          if (logoutPending.step === 'disambiguate') {
            const choice = parseDisambiguationChoice(body);
            if (choice === 'logout') {
              await parkLogout(db, identity, 'confirm');
              await replyQuietly(phone, logoutConfirmation(identity.company_name, lang));
              await audit(db, identity, waMessageId, 'logout', 'confirm_asked', 'applied');
            } else if (choice === 'cancel') {
              // Nothing was pending when the question was asked — that is why it
              // was asked at all — so this only drops the question itself.
              await clearConversation(db, identity.id as string);
              await replyQuietly(phone, t('cancelled', lang));
              await audit(db, identity, waMessageId, 'logout', 'meant_cancel', 'applied');
            } else {
              await replyQuietly(phone, logoutReask('disambiguate', lang));
              await audit(db, identity, waMessageId, 'logout', 'reask', 'skipped');
            }
            await finish('skipped');
            continue;
          }

          if (isDailyRecordConfirmation(body)) {
            const result = await performLogout(db, identity, phone, lang);
            await replyQuietly(phone, result.reply);
            await audit(db, identity, waMessageId, 'logout', 'unlink', result.outcome);
          } else if (isDailyRecordRejection(body)) {
            await clearConversation(db, identity.id as string);
            await replyQuietly(phone, logoutCancelled(lang));
            await audit(db, identity, waMessageId, 'logout', 'declined', 'applied');
          } else {
            await replyQuietly(phone, logoutReask('confirm', lang));
            await audit(db, identity, waMessageId, 'logout', 'reask', 'skipped');
          }
          await finish('skipped');
          continue;
        }

        const logoutIntent = parseLogoutIntent(body);
        // Any live conversation state means something is genuinely pending, and
        // "toka" keeps its old cancel meaning there — a person mid-draft almost
        // always means that one. With nothing pending there is nothing to
        // cancel, so the word is worth a question. Only an unmistakable
        // "logout"/"ondoa namba" overrides a draft.
        if (logoutIntent === 'explicit' || (logoutIntent === 'ambiguous' && !convo)) {
          const step: LogoutState['step'] = logoutIntent === 'explicit' ? 'confirm' : 'disambiguate';
          await parkLogout(db, identity, step);
          await replyQuietly(phone, step === 'confirm'
            ? logoutConfirmation(identity.company_name, lang)
            : logoutDisambiguation(lang));
          await audit(db, identity, waMessageId, 'logout', step === 'confirm' ? 'confirm_asked' : 'disambiguate', 'applied');
          await finish('skipped');
          continue;
        }

        // A stop command cancels a pending daily-record draft through the same
        // RPC used by HAPANA/NO. Clarification-only state has no DB draft yet,
        // so it is safely cleared without creating a ledger event.
        if (isStopCommand(body)) {
          if (dailyBatchConversation) {
            const { error } = await db.rpc('wa_cancel_daily_record_batch', {
              p_profile_id: identity.profile_id,
              p_company_id: identity.company_id,
              p_daily_record_ids: dailyBatchConversation.dailyRecordIds,
              p_reason: 'WhatsApp user cancelled daily record batch',
            });
            await clearConversation(db, identity.id as string);
            await clearAssistantMemory(db, identity);
            await replyQuietly(phone, error
              ? buildDailyRecordBatchPending(dailyBatchConversation.records, lang)
              : (lang === 'sw' ? 'Sawa. Rekodi zote za ujumbe huu zimeghairiwa.' : 'Okay. All records from this message were cancelled.'));
            await audit(db, identity, waMessageId, 'cancel_action', 'daily_record_batch', error ? 'failed' : 'voided');
          } else if (dailyConversation) {
            const { error } = await db.rpc('wa_cancel_daily_record_draft', {
              p_profile_id: identity.profile_id,
              p_company_id: identity.company_id,
              p_daily_record_id: dailyConversation.dailyRecordId,
              p_reason: 'WhatsApp user cancelled daily record draft',
            });
            await clearConversation(db, identity.id as string);
            await clearAssistantMemory(db, identity);
            await replyQuietly(phone, error ? buildDailyRecordPending(dailyConversation.record, lang) : t('cancelled', lang));
            await audit(db, identity, waMessageId, 'cancel_action', 'daily_record', error ? 'failed' : 'voided');
          } else {
            await clearConversation(db, identity.id as string);
            await clearAssistantMemory(db, identity);
            await replyQuietly(phone, t('cancelled', lang));
            await audit(db, identity, waMessageId, 'cancel_action', 'clear_state', 'applied');
          }
          await finish('skipped');
          continue;
        }
        // A pending question must not swallow a change of subject. Asked to
        // clarify a debt, the trader instead pasted 36 buying prices; the
        // clarification consumed the whole message and asked the same question
        // again, and not one price was saved. A person who has plainly moved on
        // gets the new thing done, and is told the old question was let go.
        const changedSubject = (dailyBatchClarification || dailyClarification)
          ? parseProductCostBatch(body)
          : null;
        if (changedSubject) {
          await clearConversation(db, identity.id as string);
          await replyQuietly(phone, lang === 'sw'
            ? 'Nimeacha swali la awali.'
            : 'I have let the earlier question go.');
          await audit(db, identity, waMessageId, 'daily_record_batch', 'abandoned_for_costs', 'applied');
        }

        if (dailyBatchClarification && !changedSubject) {
          if (isDailyRecordRejection(body)) {
            await clearConversation(db, identity.id as string);
            await replyQuietly(phone, lang === 'sw'
              ? 'Sawa. Ujumbe wote umeghairiwa; hakuna rekodi mpya iliyohifadhiwa.'
              : 'Okay. The whole message was cancelled; no new record was saved.');
            await audit(db, identity, waMessageId, 'daily_record_batch', 'clarification_cancel', 'applied');
            await finish('skipped');
            continue;
          }
          const resumed = resumeDailyRecordBatchClarification(dailyBatchClarification, body ?? '');
          if (resumed.kind === 'unsupported_payable' || resumed.kind === 'clarify') {
            await db.from('whatsapp_conversations').upsert({
              identity_id: identity.id,
              company_id: identity.company_id,
              profile_id: identity.profile_id,
              awaiting: 'payment_source',
              receipt_id: null,
              options: resumed.state,
              expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
              updated_at: new Date().toISOString(),
            }, { onConflict: 'identity_id' });
            await replyQuietly(phone, resumed.kind === 'unsupported_payable' ? resumed.message : resumed.question);
            await audit(db, identity, waMessageId, 'daily_record_batch', 'clarification', resumed.kind);
            await finish('skipped');
            continue;
          }
          const guardedRecords = await Promise.all(resumed.records.map((record) =>
            addHistoricalPriceWarnings(db, identity.company_id, record)));
          const created = await createDailyRecordBatchDrafts(
            db, identity, dailyBatchClarification.sourceMessageId ?? waMessageId, guardedRecords, lang,
          );
          if (created.error || created.ids.length !== guardedRecords.length) {
            await replyQuietly(phone, lang === 'sw'
              ? 'Sikuweza kuandaa rekodi hizi pamoja. Hakuna rekodi mpya iliyohifadhiwa; tafadhali jaribu tena.'
              : 'I could not prepare these records together. No new record was saved; please try again.');
            await audit(db, identity, waMessageId, 'daily_record_batch', 'create', 'failed');
            await finish('skipped', 'daily_record_batch_create_failed');
            continue;
          }
          const state: DailyRecordBatchConversation = {
            kind: 'daily_record_batch_confirmation',
            sourceMessageId: dailyBatchClarification.sourceMessageId ?? waMessageId,
            dailyRecordIds: created.ids,
            records: guardedRecords,
          };
          await db.from('whatsapp_conversations').upsert({
            identity_id: identity.id,
            company_id: identity.company_id,
            profile_id: identity.profile_id,
            awaiting: 'payment_source',
            receipt_id: null,
            options: state,
            expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
            updated_at: new Date().toISOString(),
          }, { onConflict: 'identity_id' });
          await replyDailyRecordBatchConfirmationQuietly(phone, guardedRecords, lang);
          await audit(db, identity, waMessageId, 'daily_record_batch', 'create', 'pending');
          await finish('skipped');
          continue;
        }
        if (dailyClarification && !changedSubject) {
          const choice = parseDailyRecordPriceChoice(body);
          if (isDailyRecordRejection(body)) {
            await clearConversation(db, identity.id as string);
            await replyQuietly(phone, lang === 'sw' ? 'Sawa. Ujumbe huu wa mauzo umeghairiwa.' : 'Okay. This sale draft was cancelled.');
            await audit(db, identity, waMessageId, 'daily_record', 'clarification_cancel', 'applied');
            await finish('skipped');
            continue;
          }
          if (choice) {
            const resumed = resumeDailyRecordClarification(dailyClarification, choice);
            if (resumed.kind === 'parsed') {
              const guardedRecord = await addHistoricalPriceWarnings(db, identity.company_id, resumed.record);
              const created = await createDailyRecordDraft(
                db,
                identity,
                dailyClarification.sourceMessageId ?? waMessageId,
                guardedRecord,
                lang,
              );
              if (created.error || !created.id) {
                await replyQuietly(phone, lang === 'sw'
                  ? 'Sikuweza kuhifadhi draft hii. Tafadhali jaribu tena.'
                  : 'I could not save this draft. Please try again.');
                await audit(db, identity, waMessageId, 'daily_record', 'clarification_create', 'failed');
                await finish('skipped', 'daily_record_create_failed');
                continue;
              }
              const state: DailyRecordConversation = {
                kind: 'daily_record_confirmation',
                dailyRecordId: created.id,
                sourceMessageId: dailyClarification.sourceMessageId ?? waMessageId,
                record: guardedRecord,
              };
              await db.from('whatsapp_conversations').upsert({
                identity_id: identity.id,
                company_id: identity.company_id,
                profile_id: identity.profile_id,
                awaiting: 'payment_source',
                receipt_id: null,
                options: state,
                expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
                updated_at: new Date().toISOString(),
              }, { onConflict: 'identity_id' });
              await replyDailyRecordConfirmationQuietly(phone, guardedRecord, lang);
              await audit(db, identity, waMessageId, 'daily_record', 'clarification_resumed', 'pending');
              await finish('skipped');
              continue;
            }
          }
          await replyQuietly(phone, lang === 'sw'
            ? 'Jibu *bei ya kila moja* au *jumla* ili niendelee na mauzo haya.'
            : 'Reply *unit price* or *total* so I can continue this sale.');
          await finish('skipped');
          continue;
        }
        if (dailyBatchConversation) {
          if (isDailyRecordConfirmation(body)) {
            const { error } = await db.rpc('wa_confirm_daily_record_batch', {
              p_profile_id: identity.profile_id,
              p_company_id: identity.company_id,
              p_daily_record_ids: dailyBatchConversation.dailyRecordIds,
            });
            await clearConversation(db, identity.id as string);
            await replyQuietly(phone, error
              ? buildDailyRecordBatchPending(dailyBatchConversation.records, lang)
              : buildDailyRecordBatchConfirmed(dailyBatchConversation.records, lang));
            await audit(db, identity, waMessageId, 'daily_record_batch', 'confirm', error ? 'pending' : 'applied');
            await finish('skipped');
            continue;
          }
          if (isDailyRecordRejection(body)) {
            const { error } = await db.rpc('wa_cancel_daily_record_batch', {
              p_profile_id: identity.profile_id,
              p_company_id: identity.company_id,
              p_daily_record_ids: dailyBatchConversation.dailyRecordIds,
              p_reason: 'WhatsApp user declined daily record batch',
            });
            await clearConversation(db, identity.id as string);
            await replyQuietly(phone, error
              ? buildDailyRecordBatchPending(dailyBatchConversation.records, lang)
              : (lang === 'sw' ? 'Sawa. Rekodi zote za ujumbe huu zimeghairiwa.' : 'Okay. All records from this message were cancelled.'));
            await audit(db, identity, waMessageId, 'daily_record_batch', 'cancel', error ? 'failed' : 'applied');
            await finish('skipped');
            continue;
          }
          await replyDailyRecordBatchConfirmationQuietly(phone, dailyBatchConversation.records, lang);
          await finish('skipped');
          continue;
        }
        if (dailyConversation) {
          if (isDailyRecordConfirmation(body)) {
            const { error } = await db.rpc('wa_confirm_daily_record', {
              p_profile_id: identity.profile_id,
              p_company_id: identity.company_id,
              p_daily_record_id: dailyConversation.dailyRecordId,
            });
            await clearConversation(db, identity.id as string);
            if (error) {
              await replyQuietly(phone, buildDailyRecordPending(dailyConversation.record, lang));
              await audit(db, identity, waMessageId, 'daily_record', 'confirm', 'pending');
            } else {
              await replyQuietly(phone, buildDailyRecordConfirmed(dailyConversation.record, lang));
              await audit(db, identity, waMessageId, 'daily_record', 'confirm', 'applied');
              // The record is safely saved first. Asking what the product costs
              // is a separate, optional favour — if any of it fails, the sale is
              // still recorded and the person is simply not asked.
              await askForBuyingPrice(db, identity, phone, dailyConversation.dailyRecordId, waMessageId, lang);
            }
            await finish('skipped');
            continue;
          }
          if (isDailyRecordRejection(body)) {
            const { error } = await db.rpc('wa_cancel_daily_record_draft', {
              p_profile_id: identity.profile_id,
              p_company_id: identity.company_id,
              p_daily_record_id: dailyConversation.dailyRecordId,
              p_reason: 'WhatsApp user declined daily record draft',
            });
            await clearConversation(db, identity.id as string);
            await replyQuietly(phone, error
              ? buildDailyRecordPending(dailyConversation.record, lang)
              : buildDailyRecordCancelled(lang));
            await audit(db, identity, waMessageId, 'daily_record', 'cancel', error ? 'failed' : 'applied');
            await finish('skipped');
            continue;
          }
          await replyDailyRecordConfirmationQuietly(phone, dailyConversation.record, lang);
          await finish('skipped');
          continue;
        }

        // ── A buying price ──────────────────────────────────────────────
        // Before the daily-record parser, because "unga unanigharimu 900 kwa
        // kilo" contains a product and a number and would otherwise be read as
        // something that moved money. Nothing here moves money: it records what a
        // product costs, which is what makes the profit estimate possible at all.
        // An answer to a price question Risip itself asked. No NDIYO here: the
        // question was the confirmation, and asking "are you sure?" straight
        // after somebody answered a direct question is the robotic move.
        if (stockBatchPending) {
          if (isDailyRecordConfirmation(body)) {
            const { data: saved, error } = await db.rpc('wa_record_stock_counts', {
              p_phone: phone,
              p_items: stockBatchPending.counts.map((c) => ({
                product: c.product, quantity: c.quantity, unit: c.unit,
              })),
            });
            await clearConversation(db, identity.id as string);
            const result = saved as { saved?: number; company_name?: string } | null;
            await replyQuietly(phone, error
              ? productCostErrorMessage(error, lang)
              : stockCountBatchSaved(result?.saved ?? stockBatchPending.counts.length, result?.company_name ?? '', lang));
            await audit(db, identity, waMessageId, 'stock_count_batch',
              String(stockBatchPending.counts.length), error ? 'failed' : 'applied');
          } else if (isDailyRecordRejection(body)) {
            await clearConversation(db, identity.id as string);
            await replyQuietly(phone, stockCountBatchCancelled(lang));
            await audit(db, identity, waMessageId, 'stock_count_batch', 'cancel', 'applied');
          } else {
            await replyQuietly(phone, stockCountBatchConfirmation(stockBatchPending, lang));
            await audit(db, identity, waMessageId, 'stock_count_batch', 'reask', 'skipped');
          }
          await finish('skipped');
          continue;
        }

        // NDIYO on a whole selling-price list. All or nothing: a list half
        // applied leaves the shop believing it set prices it did not set, and
        // the assistant then quotes the old ones with complete confidence.
        if (sellingBatchPending) {
          if (isDailyRecordConfirmation(body)) {
            const { data: saved, error } = await db.rpc('wa_set_selling_prices', {
              p_phone: phone,
              p_items: sellingBatchPending.prices.map((price) => ({
                product: price.product,
                retail: price.retail,
                wholesale: price.wholesale,
                min_qty: price.minQty,
              })),
            });
            await clearConversation(db, identity.id as string);
            const result = saved as { saved?: number; company_name?: string } | null;
            await replyQuietly(phone, error
              ? productCostErrorMessage(error, lang)
              : sellingPriceBatchSaved(
                result?.saved ?? sellingBatchPending.prices.length, result?.company_name ?? '', lang));
            await audit(db, identity, waMessageId, 'selling_price_batch',
              String(sellingBatchPending.prices.length), error ? 'failed' : 'applied');
          } else if (isDailyRecordRejection(body)) {
            await clearConversation(db, identity.id as string);
            await replyQuietly(phone, sellingPriceBatchCancelled(lang));
            await audit(db, identity, waMessageId, 'selling_price_batch', 'cancel', 'applied');
          } else {
            await replyQuietly(phone, sellingPriceBatchConfirmation(sellingBatchPending, lang));
            await audit(db, identity, waMessageId, 'selling_price_batch', 'reask', 'skipped');
          }
          await finish('skipped');
          continue;
        }

        // NDIYO on a whole price list. One transaction, so a half-applied list
        // can never leave the coverage figure reporting a number nobody chose.
        if (costBatchPending) {
          if (isDailyRecordConfirmation(body)) {
            const { data: saved, error } = await db.rpc('wa_set_product_costs', {
              p_phone: phone,
              p_items: costBatchPending.costs.map((cost) => ({
                product: cost.product, unit_cost: cost.unitCost, unit: cost.unit,
              })),
            });
            await clearConversation(db, identity.id as string);
            const result = saved as { saved?: number; company_name?: string } | null;
            await replyQuietly(phone, error
              ? (productCostErrorMessage(error, lang) || costBatchFailed(lang))
              : costBatchSaved(result?.saved ?? costBatchPending.costs.length, result?.company_name ?? '', lang));
            await audit(db, identity, waMessageId, 'product_cost_batch',
              String(costBatchPending.costs.length), error ? 'failed' : 'applied');
          } else if (isDailyRecordRejection(body)) {
            await clearConversation(db, identity.id as string);
            await replyQuietly(phone, costBatchCancelled(lang));
            await audit(db, identity, waMessageId, 'product_cost_batch', 'cancel', 'applied');
          } else {
            await replyQuietly(phone, costBatchConfirmation(costBatchPending, lang));
            await audit(db, identity, waMessageId, 'product_cost_batch', 'reask', 'skipped');
          }
          await finish('skipped');
          continue;
        }

        if (costPrompt) {
          if (isSkip(body)) {
            await db.rpc('wa_skip_cost_prompt', { p_phone: phone, p_product: costPrompt.product });
            await clearConversation(db, identity.id as string);
            await replyQuietly(phone, costSkipped(lang));
            await audit(db, identity, waMessageId, 'product_cost', 'skipped', costPrompt.productKey);
            await finish('skipped');
            continue;
          }
          const answered = parseCostAnswer(body);
          if (answered === null) {
            // Not a price and not a skip. Almost always a new instruction, so
            // the question is dropped rather than held over the conversation.
            await clearConversation(db, identity.id as string);
            await db.rpc('wa_skip_cost_prompt', { p_phone: phone, p_product: costPrompt.product });
            await replyQuietly(phone, costUnclear(costPrompt, lang));
            await audit(db, identity, waMessageId, 'product_cost', 'unclear', costPrompt.productKey);
            await finish('skipped');
            continue;
          }
          const { error } = await db.rpc('wa_set_product_cost', {
            p_phone: phone, p_name: costPrompt.product, p_unit_cost: answered, p_unit: null,
          });
          await clearConversation(db, identity.id as string);
          await replyQuietly(phone, error
            ? productCostErrorMessage(error, lang)
            : costAccepted(costPrompt, answered, lang));
          await audit(db, identity, waMessageId, 'product_cost', costPrompt.productKey, error ? 'failed' : 'applied');
          await finish('skipped');
          continue;
        }

        if (costConversation) {
          const pending = costConversation.cost;
          if (isDailyRecordConfirmation(body)) {
            const { data: saved, error } = await db.rpc('wa_set_product_cost', {
              p_phone: phone, p_name: pending.product,
              p_unit_cost: pending.unitCost, p_unit: pending.unit,
            });
            await clearConversation(db, identity.id as string);
            const business = (saved as { company_name?: string } | null)?.company_name ?? '';
            await replyQuietly(phone, error ? productCostErrorMessage(error, lang) : costSaved(pending, business, lang));
            await audit(db, identity, waMessageId, 'product_cost', pending.product, error ? 'failed' : 'applied');
            await finish('skipped');
            continue;
          }
          if (isDailyRecordRejection(body)) {
            await clearConversation(db, identity.id as string);
            await replyQuietly(phone, lang === 'sw' ? 'Sawa, sijaandika.' : 'Fine, nothing saved.');
            await audit(db, identity, waMessageId, 'product_cost', pending.product, 'cancelled');
            await finish('skipped');
            continue;
          }
        }

        // A verification code, typed out. The last resort when the square will
        // not read: measured against a real close-up, ninety preprocessing
        // combinations failed on it — blur plus TRA's watermark over the finder
        // patterns is past what a decoder can recover. Twelve characters printed
        // in plain text above that square work every time.
        //
        // Still verified, never trusted: the typed code goes to TRA with the
        // receipt's own printed time, and only TRA's answer changes anything.
        const typedCode = parseTypedVerificationCode(body);
        if (typedCode) {
          const { data: pending } = await db
            .from('receipts')
            .select('id, vendor_name, total_amount, receipt_time, verification_code')
            .eq('company_id', identity.company_id)
            .eq('uploaded_by', identity.profile_id)
            .eq('tra_status', 'not_found')
            .not('receipt_time', 'is', null)
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

          if (pending) {
            const row = pending as Record<string, any>;
            const lookup = await fetchTraReceipt(typedCode, String(row.receipt_time));
            if (lookup.ok) {
              const official = lookup.receipt;
              const differences = compareWithTra({
                vendorName: row.vendor_name,
                totalInclTax: row.total_amount === null ? null : Number(row.total_amount),
                verificationCode: row.verification_code,
              }, official);
              await db.from('receipts').update({
                vendor_name: official.vendorName ?? row.vendor_name,
                vendor_tin: official.vendorTin ?? undefined,
                vendor_vrn: official.vendorVrn ?? undefined,
                receipt_number: official.receiptNumber ?? undefined,
                receipt_date: official.receiptDate ?? undefined,
                total_amount: official.totalInclTax ?? undefined,
                tax_amount: official.totalTax ?? undefined,
                verification_code: official.verificationCode ?? typedCode,
                tra_status: 'verified',
                tra_verified_at: new Date().toISOString(),
                tra_differences: differences.length ? differences : null,
              }).eq('id', row.id);
              await replyQuietly(phone, qrCorrectionReply(
                { vendorName: row.vendor_name, total: row.total_amount === null ? null : Number(row.total_amount) },
                official, lang, `${appUrl()}/receipts?receipt=${row.id}`,
              ));
              await audit(db, identity, waMessageId, 'tra_verify', 'typed_code', 'applied');
            } else {
              // Naming the look-alike characters is the useful part: these codes
              // are read off thermal paper, where 0/O and 1/I are a coin toss.
              await replyQuietly(phone, typedCodeRejected(typedCode, lang));
              await audit(db, identity, waMessageId, 'tra_verify', 'typed_code', 'not_found');
            }
            await finish('skipped');
            continue;
          }

          // A code with nothing to attach it to. Falling through sent it to the
          // assistant, which answered "sijaelewa unachomaanisha" to a perfectly
          // clear message — the worst possible reply, because the person did
          // exactly what they were asked to do.
          await replyQuietly(phone, lang === 'sw'
            ? `Nimepokea kodi ${typedCode}, lakini hakuna risiti inayosubiri kuthibitishwa kwa sasa.\n\n`
              + 'Tuma picha ya risiti kwanza, kisha kodi hii ikihitajika.'
            : `I have the code ${typedCode}, but no receipt is waiting to be verified right now.\n\n`
              + 'Send the receipt photo first, then this code if it is needed.');
          await audit(db, identity, waMessageId, 'tra_verify', 'typed_code', 'nothing_pending');
          await finish('skipped');
          continue;
        }

        // Adding a product is checked before anything records money, because
        // the whole value of it is refusing to create the near-duplicate.
        const addProduct = parseAddProduct(writeBody);
        if (addProduct) {
          const resolved = await resolveProductForRead(db, identity, addProduct.product);
          if (!resolved.error && resolved.resolution.kind === 'matched') {
            const match = resolved.resolution.match;
            if (match.matchKind === 'exact') {
              const [stockResult, pricingResult] = await Promise.all([
                db.rpc('wa_stock_on_hand', { p_company_id: identity.company_id, p_product: match.productKey }),
                db.rpc('wa_product_pricing', { p_company_id: identity.company_id, p_product_keys: [match.productKey] }),
              ]);
              const stock = ((stockResult.data ?? []) as Array<Record<string, unknown>>)[0] ?? null;
              const pricing = ((pricingResult.data ?? []) as Array<Record<string, unknown>>)[0] ?? null;
              await reply(phone, productAlreadyExists(match.productName, {
                soldQuantity: pricing?.sold_quantity == null ? 0 : Number(pricing.sold_quantity),
                onHand: stock?.has_count ? Number(stock.on_hand) : null,
                unitCost: pricing?.unit_cost == null ? null : Number(pricing.unit_cost),
              }, lang));
              await audit(db, identity, waMessageId, 'add_product', 'exists', 'refused');
              await finish('skipped');
              continue;
            }
            await reply(phone, productLooksLikeExisting(addProduct.product, match.productName, lang));
            await audit(db, identity, waMessageId, 'add_product', 'near_duplicate', 'clarification');
            await finish('skipped');
            continue;
          }
          if (!resolved.error && resolved.resolution.kind === 'ambiguous') {
            await reply(phone, productReadClarification(resolved.resolution, lang));
            await audit(db, identity, waMessageId, 'add_product', 'ambiguous', 'clarification');
            await finish('skipped');
            continue;
          }
          if (addProduct.unitCost === null) {
            await reply(phone, addProductNeedsCost(addProduct.product, lang));
            await audit(db, identity, waMessageId, 'add_product', 'needs_cost', 'clarification');
            await finish('skipped');
            continue;
          }
          const { error: addError } = await db.rpc('wa_set_product_cost', {
            p_phone: phone,
            p_name: addProduct.product,
            p_unit_cost: addProduct.unitCost,
            p_unit: addProduct.unit,
          });
          if (addError) {
            await reply(phone, productCostErrorMessage(addError, lang));
            await audit(db, identity, waMessageId, 'add_product', 'create', 'failed');
            await finish('skipped');
            continue;
          }
          await reply(phone, costSaved(
            { product: addProduct.product, unitCost: addProduct.unitCost, unit: addProduct.unit },
            identity.company_name, lang));
          await audit(db, identity, waMessageId, 'add_product', 'create', 'applied');
          await finish('skipped');
          continue;
        }

        // A pasted selling-price list. Checked against what the shop pays before
        // it is confirmed, because a retail price under the buying cost reads
        // and saves perfectly while turning every future sale into a loss.
        const sellingBatch = parseSellingPriceBatch(writeBody);
        if (sellingBatch) {
          const { data: costRows } = await db.rpc('wa_product_pricing', {
            p_company_id: identity.company_id,
            p_product_keys: sellingBatch.prices.map((price) => price.product),
          });
          const costs = new Map<string, number>();
          const known = new Set<string>();
          for (const row of (costRows ?? []) as Array<Record<string, unknown>>) {
            const key = String(row.product_key).toLowerCase();
            if (row.unit_cost != null) costs.set(key, Number(row.unit_cost));
            // Bought or sold at some point: the shop has met this product.
            if (row.unit_cost != null || Number(row.sold_quantity ?? 0) > 0) known.add(key);
          }
          const unknown = sellingBatch.prices
            .filter((price) => !known.has(price.product.toLowerCase()))
            .map((price) => price.product);
          await db.from('whatsapp_conversations').upsert({
            identity_id: identity.id,
            company_id: identity.company_id,
            profile_id: identity.profile_id,
            awaiting: 'product_cost',
            receipt_id: null,
            options: sellingBatch,
            expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
            updated_at: new Date().toISOString(),
          }, { onConflict: 'identity_id' });
          // For each unrecognised name, ask the read resolver what it is nearest
          // to. Reads are allowed to be forgiving, so this is safe — it only
          // suggests, and the write itself still uses the exact name given.
          const suggestions = new Map<string, string>();
          for (const name of unknown) {
            const near = await resolveProductForRead(db, identity, name);
            if (!near.error && near.resolution.kind === 'matched'
              && near.resolution.match.matchKind !== 'exact') {
              suggestions.set(name.toLowerCase(), near.resolution.match.productName);
            }
          }
          await reply(phone, sellingPriceBatchConfirmation(
            sellingBatch,
            lang,
            sellingPriceBatchCostWarnings(sellingBatch.prices, costs, lang),
            sellingPriceBatchUnknownProducts(unknown, lang, suggestions),
          ));
          await audit(db, identity, waMessageId, 'selling_price_batch',
            String(sellingBatch.prices.length), 'pending');
          await finish('skipped');
          continue;
        }

        const stockBatch = parseStockCountBatch(writeBody);
        if (stockBatch) {
          await db.from('whatsapp_conversations').upsert({
            identity_id: identity.id,
            company_id: identity.company_id,
            profile_id: identity.profile_id,
            awaiting: 'product_cost',
            receipt_id: null,
            options: stockBatch,
            expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
            updated_at: new Date().toISOString(),
          }, { onConflict: 'identity_id' });
          await reply(phone, stockCountBatchConfirmation(stockBatch, lang));
          await audit(db, identity, waMessageId, 'stock_count_batch', String(stockBatch.counts.length), 'pending');
          await finish('skipped');
          continue;
        }

        // A physical count. Checked before the record parser because "nina
        // daftari 90" states what is on the shelf, not what moved — and reading
        // it as a movement would be the one mistake that silently rewrites a
        // stock figure the trader is about to rely on.
        const stockCount = parseStockCount(writeBody);
        if (stockCount) {
          const { data: saved, error } = await db.rpc('wa_record_stock_count', {
            p_phone: phone,
            p_name: stockCount.product,
            p_quantity: stockCount.quantity,
            p_unit: stockCount.unit,
          });
          if (error) {
            await reply(phone, productCostErrorMessage(error, lang));
            await audit(db, identity, waMessageId, 'stock_count', stockCount.product, 'failed');
          } else {
            const previous = (saved as { previous?: number | null } | null)?.previous;
            await reply(phone, stockCountConfirmation(
              stockCount, previous === null || previous === undefined ? null : Number(previous), lang,
            ));
            await audit(db, identity, waMessageId, 'stock_count', stockCount.product, 'applied');
          }
          await finish('skipped');
          continue;
        }

        // What the shop CHARGES, as opposed to what it pays. Checked before the
        // record parser because a price list names a product and numbers just
        // like a sale does, and reading it as a sale would invent revenue.
        const sellingPrice = parseSellingPrice(writeBody);
        if (sellingPrice) {
          const { data: saved, error } = await db.rpc('wa_set_selling_price', {
            p_phone: phone,
            p_name: sellingPrice.product,
            p_retail: sellingPrice.retail,
            p_wholesale: sellingPrice.wholesale,
            p_min_qty: sellingPrice.minQty,
          });
          if (error) {
            await reply(phone, productCostErrorMessage(error, lang));
            await audit(db, identity, waMessageId, 'selling_price', sellingPrice.product, 'failed');
          } else {
            void saved;
            await reply(phone, sellingPriceSaved(sellingPrice, lang));
            await audit(db, identity, waMessageId, 'selling_price', sellingPrice.product, 'applied');
          }
          await finish('skipped');
          continue;
        }

        // A whole price list in one message. Checked before the single-price
        // path and before the record parser, because a 36-line paste matched
        // neither and was silently dropped.
        const costBatch = parseProductCostBatch(writeBody);
        if (costBatch) {
          await db.from('whatsapp_conversations').upsert({
            identity_id: identity.id,
            company_id: identity.company_id,
            profile_id: identity.profile_id,
            awaiting: 'product_cost',
            receipt_id: null,
            options: costBatch,
            expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
            updated_at: new Date().toISOString(),
          }, { onConflict: 'identity_id' });
          await reply(phone, costBatchConfirmation(costBatch, lang));
          await audit(db, identity, waMessageId, 'product_cost_batch', String(costBatch.costs.length), 'pending');
          await finish('skipped');
          continue;
        }

        const costCandidate = parseProductCost(writeBody);
        if (costCandidate) {
          // The previous price is read here so the confirmation can show what it
          // was changing from. "Saved" alone hides a number that quietly rewrites
          // every profit figure after it.
          const { data: prev } = await db
            .from('product_costs')
            .select('unit_cost')
            .eq('company_id', identity.company_id)
            .eq('product_key', costCandidate.product.trim().toLowerCase())
            .order('effective_from', { ascending: false })
            .limit(1)
            .maybeSingle();
          const { data: company } = await db
            .from('companies').select('name').eq('id', identity.company_id).maybeSingle();

          await db.from('whatsapp_conversations').upsert({
            identity_id: identity.id,
            company_id: identity.company_id,
            profile_id: identity.profile_id,
            awaiting: 'product_cost',
            options: costCandidate,
            expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
            updated_at: new Date().toISOString(),
          }, { onConflict: 'identity_id' });

          await reply(phone, costConfirmation(
            costCandidate,
            (company as { name?: string } | null)?.name ?? '',
            prev ? Number((prev as { unit_cost: number }).unit_cost) : null,
            lang,
          ));
          await finish('skipped');
          continue;
        }

        const hypotheticalProduct = mixed ? null : parseHypotheticalProfitRequest(body);
        if (hypotheticalProduct) {
          await reply(phone, await hypotheticalProfitToolReply(db, identity, hypotheticalProduct, lang));
          await audit(db, identity, waMessageId, 'read_only_tool', 'hypothetical_product_profit', 'applied');
          await finish('skipped');
          continue;
        }

        // ── Risip conversational AI ─────────────────────────────────────
        // Protected control/confirmation states stay deterministic above.
        // Every other linked free-text business turn is interpreted by the
        // model first, with bounded client tools and recent company-scoped
        // conversation history. The deterministic parsers below remain the
        // availability fallback when the provider or budget is unavailable.
        let conversationalAiBudgetBlock: AiBudgetDecision | null = null;
        const aiEligible = Boolean(body?.trim())
          && (!convo || convo.awaiting === 'product_analytics')
          && !isSwitchRequest(body)
          && !isLoginRequest(body)
          && !parseLanguageCommand(body)
          && intent !== 'cancel_action'
          && intent !== 'change_language'
          // Daily-record arithmetic is deterministic first. Its dedicated
          // branch below owns the bounded structured-AI fallback.
          && !isDailyRecordCandidate(body)
          // A mixed message belongs to the write chain below. MEASURED FAILURE:
          // "nimeuza nguvu ya sala 2 kwa 20000 kisha nionyeshe risiti za leo"
          // was claimed here by the read half, the receipts were listed, and the
          // SALE WAS NEVER RECORDED. The instruction has to win.
          && !mixed;
        if (aiEligible) {
          const history = await loadAssistantHistory(db, identity);
          const contextChars = body!.length + history.reduce((sum, message) => sum + message.content.length, 0);
          const budget = await consumeAiBudget(db, identity, contextChars);
          if (budget.allowed) {
            let assistantFailure = 'unknown_failure';
            const assistant = await runConversationalAssistant({
              context: assistantIdentityContext(identity),
              history,
              userText: body!,
              executeTool: (name, input) => executeAssistantTool(db, identity, waMessageId, lang, name, input),
              onFailure: (code) => { assistantFailure = code; },
            });
            // A record-looking sentence may never be acknowledged as saved by
            // prose alone. If the model did not call the proposal tool, let the
            // existing deterministic validator/clarifier below take over.
            const unsafeRecordProse = assistant
              && shouldDeferRecordLikeReply(isDailyRecordCandidate(body), assistant.toolNames);
            if (assistant && !unsafeRecordProse) {
              await reply(phone, assistant.reply);
              const remembered = await storeAssistantExchange(
                db, identity, waMessageId, body!, assistant.reply, assistant.memory,
              );
              await audit(
                db,
                identity,
                waMessageId,
                'conversational_ai',
                assistant.toolNames.join(',') || 'answer',
                remembered ? (assistant.usedSafeFallback ? 'safe_fallback' : 'applied') : 'memory_failed',
              );
              await finish('skipped');
              continue;
            }
            if (!assistant) {
              await audit(db, identity, waMessageId, 'conversational_ai', 'provider', assistantFailure);
            }
          } else {
            conversationalAiBudgetBlock = budget;
            await audit(db, identity, waMessageId, 'conversational_ai', 'budget', 'fallback');
          }
        }

        const productRequest = mixed ? null : (parseProductAnalyticsFollowUp(body, productContext) ?? parseProductAnalyticsRequest(body));
        if (productRequest) {
          await answerProductAnalytics(db, identity, phone, productRequest, lang);
          await audit(db, identity, waMessageId, 'product_analytics', productRequest.rankBy, 'applied');
          await finish('skipped');
          continue;
        }

        const readRequest = mixed ? null : parseReadRequest(body);
        if (readRequest) {
          try {
            await reply(phone, await readOnlyToolReply(db, identity, readRequest, lang));
            await audit(db, identity, waMessageId, 'read_only_tool', readRequest.tool, 'applied');
          } catch {
            await reply(phone, lang === 'sw'
              ? 'Sikuweza kupata taarifa hiyo sasa. Jaribu tena baadaye.'
              : 'I could not load that information right now. Please try again later.');
            await audit(db, identity, waMessageId, 'read_only_tool', readRequest.tool, 'failed');
          }
          await finish('skipped');
          continue;
        }

        if (!aiEligible && shouldInterpretReadWithAi(body)) {
          const budget = await consumeAiBudget(db, identity, body.length);
          if (!budget.allowed) {
            await reply(phone, aiBudgetMessage(lang, budget.resetAt, budget.reason));
            await audit(db, identity, waMessageId, 'semantic_read_ai', 'budget', 'blocked');
            await finish('skipped', 'ai_budget_blocked');
            continue;
          }
          const semanticIntent = await interpretReadIntentWithAi(body, lang);
          if (semanticIntent?.kind === 'product_analytics') {
            await answerProductAnalytics(db, identity, phone, semanticIntent.request, lang);
            await audit(db, identity, waMessageId, 'semantic_read_ai', 'product_analytics', 'applied');
            await finish('skipped');
            continue;
          }
          if (semanticIntent?.kind === 'read_tool') {
            await reply(phone, await readOnlyToolReply(db, identity, semanticIntent.request, lang));
            await audit(db, identity, waMessageId, 'semantic_read_ai', semanticIntent.request.tool, 'applied');
            await finish('skipped');
            continue;
          }
          await reply(phone, lang === 'sw'
            ? 'Sijaelewa vizuri swali hilo la biashara. Taja unachotaka kuona, kwa mfano mauzo, bidhaa, deni, risiti au faida.'
            : 'I did not fully understand that business question. Say what you want to see, for example sales, products, debts, receipts, or profit.');
          await audit(db, identity, waMessageId, 'semantic_read_ai', 'unknown', 'clarification');
          await finish('skipped');
          continue;
        }

        if (isDailyRecordCandidate(writeBody)) {
          // MEASURED FAILURE: a thirty-line till roll naming no money at all was
          // reaching parseDailyRecordBatch first, which asked "is this the total
          // or the price for each?" — a question with no answer, since the
          // message contains no price to be either. The quantity path below
          // already knows what to do with it; the batch parser must stand aside
          // rather than ask.
          const namesNoMoney = parseQuantityOnlySale(writeBody) !== null;
          const batch: DailyRecordBatchParse = namesNoMoney
            ? { kind: 'none' }
            : parseDailyRecordBatch(writeBody, lang);
          if (batch.kind === 'clarify') {
            const state: DailyRecordBatchClarification = {
              ...batch.state,
              sourceMessageId: waMessageId,
            };
            await db.from('whatsapp_conversations').upsert({
              identity_id: identity.id,
              company_id: identity.company_id,
              profile_id: identity.profile_id,
              awaiting: 'payment_source',
              receipt_id: null,
              options: state,
              expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
              updated_at: new Date().toISOString(),
            }, { onConflict: 'identity_id' });
            await reply(phone, batch.question);
            await audit(db, identity, waMessageId, 'daily_record_batch', 'clarify', 'pending');
            await finish('skipped');
            continue;
          }
          if (batch.kind === 'unreadable') {
            await reply(phone, batch.message);
            await audit(db, identity, waMessageId, 'daily_record_batch', 'clarify', 'unreadable');
            await finish('skipped');
            continue;
          }
          if (batch.kind === 'parsed') {
            if (batch.records.length === 1) {
              const guardedRecord = await addHistoricalPriceWarnings(db, identity.company_id, batch.records[0]);
              const created = await createDailyRecordDraft(db, identity, waMessageId, guardedRecord, lang);
              if (created.error || !created.id) {
                await reply(phone, lang === 'sw'
                  ? 'Sikuweza kuhifadhi draft hii. Tafadhali jaribu tena.'
                  : 'I could not save this draft. Please try again.');
                await audit(db, identity, waMessageId, 'daily_record', 'create', 'failed');
                await finish('skipped', 'daily_record_create_failed');
                continue;
              }
              const state: DailyRecordConversation = {
                kind: 'daily_record_confirmation',
                dailyRecordId: created.id,
                sourceMessageId: waMessageId,
                record: guardedRecord,
              };
              await db.from('whatsapp_conversations').upsert({
                identity_id: identity.id,
                company_id: identity.company_id,
                profile_id: identity.profile_id,
                awaiting: 'payment_source',
                receipt_id: null,
                options: state,
                expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
                updated_at: new Date().toISOString(),
              }, { onConflict: 'identity_id' });
              await replyDailyRecordConfirmationQuietly(phone, guardedRecord, lang);
              await audit(db, identity, waMessageId, 'daily_record', 'create', 'pending');
              await finish('skipped');
              continue;
            }
            const guardedRecords = await Promise.all(batch.records.map((record) =>
              addHistoricalPriceWarnings(db, identity.company_id, record)));
            const created = await createDailyRecordBatchDrafts(db, identity, waMessageId, guardedRecords, lang);
            if (created.error || created.ids.length !== guardedRecords.length) {
              await reply(phone, lang === 'sw'
                ? 'Sikuweza kuandaa rekodi hizi pamoja. Hakuna rekodi mpya iliyohifadhiwa; tafadhali jaribu tena.'
                : 'I could not prepare these records together. No new record was saved; please try again.');
              await audit(db, identity, waMessageId, 'daily_record_batch', 'create', 'failed');
              await finish('skipped', 'daily_record_batch_create_failed');
              continue;
            }
            const state: DailyRecordBatchConversation = {
              kind: 'daily_record_batch_confirmation',
              sourceMessageId: waMessageId,
              dailyRecordIds: created.ids,
              records: guardedRecords,
            };
            await db.from('whatsapp_conversations').upsert({
              identity_id: identity.id,
              company_id: identity.company_id,
              profile_id: identity.profile_id,
              awaiting: 'payment_source',
              receipt_id: null,
              options: state,
              expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
              updated_at: new Date().toISOString(),
            }, { onConflict: 'identity_id' });
            await replyDailyRecordBatchConfirmationQuietly(phone, guardedRecords, lang);
            await audit(db, identity, waMessageId, 'daily_record_batch', 'create', 'pending');
            await finish('skipped');
            continue;
          }
          // A sale that states quantities and no money is priced from the shop's
          // own list before anything asks the trader to retype a price they
          // already gave. Only reached when no parser above claimed the message.
          const quantitySale = parseQuantityOnlySale(writeBody);
          if (quantitySale) {
            const priced = await priceQuantitySale(db, identity, quantitySale, lang);
            if (priced.kind === 'blocked') {
              await reply(phone, priced.message);
              await audit(db, identity, waMessageId, 'quantity_sale', 'priced', 'clarification');
              await finish('skipped');
              continue;
            }
            if (priced.kind === 'priced') {
              const guardedRecord = await addHistoricalPriceWarnings(db, identity.company_id, priced.record);
              // Money out, written at the foot of the same paste, is a separate
              // record — never netted off the takings. Both are drafted in one
              // transaction so a NDIYO can never confirm the sales and lose the
              // spending, which is the half nobody would notice was missing.
              const closingRecords: ParsedDailyRecord[] = [guardedRecord];
              for (const spent of quantitySale.expenses) {
                closingRecords.push({
                  kind: 'expense',
                  amount: spent.amount,
                  partyName: null,
                  description: spent.label,
                  lines: [],
                  confidence: 0.95,
                });
              }
              if (closingRecords.length > 1) {
                const batch = await createDailyRecordBatchDrafts(
                  db, identity, waMessageId, closingRecords, lang);
                if (!batch.error && batch.ids.length > 0) {
                  await db.from('whatsapp_conversations').upsert({
                    identity_id: identity.id,
                    company_id: identity.company_id,
                    profile_id: identity.profile_id,
                    awaiting: 'payment_source',
                    receipt_id: null,
                    options: {
                      kind: 'daily_record_batch_confirmation',
                      dailyRecordIds: batch.ids,
                      sourceMessageId: waMessageId,
                      records: closingRecords,
                    },
                    expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
                    updated_at: new Date().toISOString(),
                  }, { onConflict: 'identity_id' });
                  await replyQuietly(phone,
                    quantitySaleConfirmation(priced.lines, lang, quantitySale.expenses, priced.notCounted));
                  await audit(db, identity, waMessageId, 'quantity_sale',
                    `${priced.lines.length}+${quantitySale.expenses.length}`, 'pending');
                  await finish('skipped');
                  continue;
                }
              }
              const created = await createDailyRecordDraft(db, identity, waMessageId, guardedRecord, lang);
              if (!created.error && created.id) {
                const state: DailyRecordConversation = {
                  kind: 'daily_record_confirmation',
                  dailyRecordId: created.id,
                  sourceMessageId: waMessageId,
                  record: guardedRecord,
                };
                await db.from('whatsapp_conversations').upsert({
                  identity_id: identity.id,
                  company_id: identity.company_id,
                  profile_id: identity.profile_id,
                  awaiting: 'payment_source',
                  receipt_id: null,
                  options: state,
                  expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
                  updated_at: new Date().toISOString(),
                }, { onConflict: 'identity_id' });
                await replyQuietly(phone, quantitySaleConfirmation(priced.lines, lang, quantitySale.expenses, priced.notCounted));
                await audit(db, identity, waMessageId, 'quantity_sale', 'create', 'pending');
                await finish('skipped');
                continue;
              }
            }
            // Anything else falls through to the parsers below, unchanged.
          }

          const parsed = parseDailyRecord(writeBody, lang);
          if (parsed.kind === 'clarify') {
            if (parsed.draft) {
              await db.from('whatsapp_conversations').upsert({
                identity_id: identity.id,
                company_id: identity.company_id,
                profile_id: identity.profile_id,
                awaiting: 'payment_source',
                receipt_id: null,
                options: { ...parsed.draft, sourceMessageId: waMessageId },
                expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
                updated_at: new Date().toISOString(),
              }, { onConflict: 'identity_id' });
            }
            if (!parsed.draft && parsed.reason !== 'ambiguity') {
              const budget = await consumeAiBudget(db, identity, body.length);
              if (!budget.allowed) {
                await reply(phone, aiBudgetMessage(lang, budget.resetAt, budget.reason));
                await audit(db, identity, waMessageId, 'daily_record_ai_fallback', 'budget', 'blocked');
                await finish('skipped', 'ai_budget_blocked');
                continue;
              }
              const aiRecord = await interpretDailyRecordWithAi(body, lang);
              if (aiRecord) {
                const guardedRecord = await addHistoricalPriceWarnings(db, identity.company_id, aiRecord);
                const created = await createDailyRecordDraft(db, identity, waMessageId, guardedRecord, lang);
                if (!created.error && created.id) {
                  const state: DailyRecordConversation = {
                    kind: 'daily_record_confirmation', dailyRecordId: created.id, sourceMessageId: waMessageId, record: guardedRecord,
                  };
                  await db.from('whatsapp_conversations').upsert({
                    identity_id: identity.id, company_id: identity.company_id, profile_id: identity.profile_id,
                    awaiting: 'payment_source', receipt_id: null, options: state,
                    expires_at: new Date(Date.now() + 30 * 60_000).toISOString(), updated_at: new Date().toISOString(),
                  }, { onConflict: 'identity_id' });
                  await replyDailyRecordConfirmationQuietly(phone, guardedRecord, lang);
                  await audit(db, identity, waMessageId, 'daily_record_ai_fallback', 'create', 'pending');
                  await finish('skipped');
                  continue;
                }
              }
            }
            await reply(phone, parsed.question);
            await audit(db, identity, waMessageId, 'daily_record', 'clarify', parsed.reason);
            await finish('skipped');
            continue;
          }
          if (parsed.kind === 'parsed') {
            const guardedRecord = await addHistoricalPriceWarnings(db, identity.company_id, parsed.record);
            const created = await createDailyRecordDraft(db, identity, waMessageId, guardedRecord, lang);
            if (created.error || !created.id) {
              await reply(phone, lang === 'sw'
                ? 'Sikuweza kuhifadhi draft hii. Tafadhali jaribu tena.'
                : 'I could not save this draft. Please try again.');
              await audit(db, identity, waMessageId, 'daily_record', 'create', 'failed');
              await finish('skipped', 'daily_record_create_failed');
              continue;
            }
            const state: DailyRecordConversation = {
              kind: 'daily_record_confirmation',
              dailyRecordId: created.id,
              sourceMessageId: waMessageId,
              record: guardedRecord,
            };
            await db.from('whatsapp_conversations').upsert({
              identity_id: identity.id,
              company_id: identity.company_id,
              profile_id: identity.profile_id,
              awaiting: 'payment_source',
              receipt_id: null,
              options: state,
              expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
              updated_at: new Date().toISOString(),
            }, { onConflict: 'identity_id' });
            await replyDailyRecordConfirmationQuietly(phone, guardedRecord, lang);
            await audit(db, identity, waMessageId, 'daily_record', 'create', 'pending');
            await finish('skipped');
            continue;
          }
        }

        // ── Which business am I recording into? ─────────────────────────
        if (isSwitchRequest(body)) {
          const { data: rows } = await db.rpc('wa_memberships', { p_phone: phone });
          const list = (rows ?? []) as { company_id: string; company_name: string; role: string; is_active: boolean }[];
          if (list.length <= 1) {
            await reply(phone, lang === 'sw'
              ? `Una biashara moja tu: ${list[0]?.company_name ?? '-'}`
              : `You only have one business: ${list[0]?.company_name ?? '-'}`);
          } else {
            await db.from('whatsapp_conversations').upsert({
              identity_id: identity.id,
              company_id: identity.company_id,
              profile_id: identity.profile_id,
              awaiting: 'business',
              options: list.map((r) => ({ id: r.company_id, name: r.company_name })),
              expires_at: new Date(Date.now() + 30 * 60_000).toISOString(),
              updated_at: new Date().toISOString(),
            }, { onConflict: 'identity_id' });
            await reply(phone, businessList(list, lang));
          }
          await finish('skipped', 'business_list');
          continue;
        }

        if (convo?.awaiting === 'business') {
          const options = (convo.options ?? []) as { id: string; name: string }[];
          const idx = parseBusinessChoice(body, options.length);
          if (idx === null) {
            await reply(phone, businessList(
              options.map((o) => ({ company_name: o.name, role: '', is_active: false })), lang));
            await finish('skipped', 'business_choice_unclear');
            continue;
          }
          // Only ever an index into the list we just sent. A company id typed
          // into a message is never trusted.
          const { data: name, error: swErr } = await db.rpc('wa_switch_active_company', {
            p_phone: phone, p_company: options[idx].id,
          });
          await clearConversation(db, identity.id as string);
          await reply(phone, swErr
            ? swErr.message
            : (lang === 'sw' ? `Sasa unatumia: ${name}` : `You are now using: ${name}`));
          await audit(db, identity, waMessageId, 'switch_business', String(options[idx].id), swErr ? 'failed' : 'applied');
          await finish('skipped');
          continue;
        }

        if (intent === 'change_language') {
          const next = parseLanguageCommand(body)!;
          // Syncs the choice onto the person too, so the web opens in the
          // language they picked here. The browser keeps its own override.
          await db.rpc('wa_set_language', { p_phone: phone, p_lang: next });
          await clearConversation(db, identity.id as string);
          await reply(phone, t('languageSet', next));
          await audit(db, identity, waMessageId, 'change_language', next, 'applied');
          await finish('skipped');
          continue;
        }

        if (intent === 'cancel_action') {
          await clearConversation(db, identity.id as string);
          await clearAssistantMemory(db, identity);
          await reply(phone, t('cancelled', lang));
          await audit(db, identity, waMessageId, 'cancel_action', 'clear_state', 'applied');
          await finish('skipped');
          continue;
        }

        // Answering a question we asked. Language selection is handled first
        // because it is the only one a brand-new user can be in.
        if (convo?.awaiting === 'language') {
          const picked = /^1$/.test((body ?? '').trim()) ? 'sw'
            : /^2$/.test((body ?? '').trim()) ? 'en'
            : parseLanguageCommand(body);
          if (picked) {
            await db.from('whatsapp_identities').update({ lang: picked, updated_at: new Date().toISOString() })
              .eq('id', identity.id);
            await clearConversation(db, identity.id as string);
            await reply(phone, `${t('languageSet', picked)}\n\n${t('help', picked)}`);
            await finish('skipped');
            continue;
          }
          await reply(phone, t('chooseLanguage', lang));
          await finish('skipped');
          continue;
        }

        if (convo?.awaiting === 'project' && isProjectSetupState(convo.options)) {
          const setup = convo.options as ProjectSetupState;
          const { data: company } = await db.from('companies')
            .select('name').eq('id', identity.company_id).maybeSingle();
          const companyName = String(company?.name ?? 'your business');

          if (setup.stage === 'choose') {
            const choice = parseProjectSetupChoice(body);
            if (choice === 3) {
              const next: ProjectSetupState = { ...setup, stage: 'name' };
              await db.from('whatsapp_conversations').update({ options: next, updated_at: new Date().toISOString() })
                .eq('identity_id', identity.id);
              await reply(phone, projectSetupNamePrompt(lang));
            } else if (choice === 1 || choice === 2) {
              const projectName = choice === 1 ? 'General' : (sanitizeProjectName(companyName) ?? 'General');
              const next: ProjectSetupState = { ...setup, stage: 'confirm', projectName };
              await db.from('whatsapp_conversations').update({ options: next, updated_at: new Date().toISOString() })
                .eq('identity_id', identity.id);
              await reply(phone, projectSetupConfirmation(lang, projectName));
            } else {
              await reply(phone, projectSetupPrompt(lang, companyName));
            }
            await finish('skipped');
            continue;
          }

          if (setup.stage === 'name') {
            const projectName = sanitizeProjectName(body);
            if (!projectName) {
              await reply(phone, lang === 'sw'
                ? 'Jina la project ni fupi sana. Jaribu tena.'
                : 'That project name is too short. Try again.');
              await finish('skipped');
              continue;
            }
            const next: ProjectSetupState = { ...setup, stage: 'confirm', projectName };
            await db.from('whatsapp_conversations').update({ options: next, updated_at: new Date().toISOString() })
              .eq('identity_id', identity.id);
            await replyQuietly(phone, projectSetupConfirmation(lang, projectName));
            await finish('skipped');
            continue;
          }

          const confirmed = parseProjectSetupConfirmation(body);
          if (confirmed === false) {
            const next: ProjectSetupState = { ...setup, stage: 'choose', projectName: undefined };
            await db.from('whatsapp_conversations').update({ options: next, updated_at: new Date().toISOString() })
              .eq('identity_id', identity.id);
            await replyQuietly(phone, projectSetupPrompt(lang, companyName));
            await finish('skipped');
            continue;
          }
          if (confirmed !== true || !setup.projectName) {
            await replyQuietly(phone, projectSetupConfirmation(lang, setup.projectName ?? 'General'));
            await finish('skipped');
            continue;
          }

          const project = await createOrReuseProject(db, identity, setup.projectName);
          if (!project) {
            await replyQuietly(phone, lang === 'sw'
              ? 'Sikuweza kutengeneza project sasa. Hakikisha wewe ni owner au accountant, kisha jaribu tena.'
              : 'I could not create that project right now. Make sure you are the owner or accountant, then try again.');
            await finish('skipped');
            continue;
          }
          const resumed = await resumePendingReceipt(db, identity, setup.mediaMessageId);
          await clearConversation(db, identity.id as string);
          await replyQuietly(phone, resumed
            ? projectSetupCreatedReply(lang, project.name)
            : (lang === 'sw' ? `Project "${project.name}" iko tayari.` : `Project "${project.name}" is ready.`));
          await audit(db, identity, waMessageId, 'project_setup', project.created ? 'created' : 'reused', resumed ? 'applied' : 'no_pending_receipt');
          await finish('skipped');
          continue;
        }

        if (convo?.awaiting === 'project' && convo.receipt_id) {
          const options = (convo.options as ProjectRef[] | null) ?? [];
          const chosen = parseProjectChoice(body, options);
          if (!chosen) {
            await replyQuietly(
              phone,
              lang === 'sw'
                ? 'Sijaelewa. Jibu na namba ya mradi kutoka kwenye orodha, au andika *ghairi*.'
                : 'I did not catch that. Reply with the number of the project from the list, or type *cancel*.',
            );
            await finish('skipped');
            continue;
          }
          // Scope the write by company as well as id: a stale conversation row can
          // never be used to move a receipt belonging to another tenant.
          await db.from('receipts')
            .update({ project_id: chosen.id })
            .eq('id', convo.receipt_id)
            .eq('company_id', identity.company_id);
          await clearConversation(db, identity.id as string);
          await replyQuietly(
            phone,
            lang === 'sw'
              ? `Sawa. Risiti imewekwa kwenye ${chosen.name}. Kamilisha kategoria na chanzo cha malipo hapa:\n${appUrl()}/receipts?receipt=${convo.receipt_id}`
              : `Done. Filed under ${chosen.name}. Finish the category and payment source here:\n${appUrl()}/receipts?receipt=${convo.receipt_id}`,
          );
          await audit(db, identity, waMessageId, 'clarification_reply', 'project_selected', 'applied', convo.receipt_id as string);
          await finish('skipped');
          continue;
        }

        // Nothing pending: help, or a polite scope boundary.
        await replyQuietly(phone, conversationalAiBudgetBlock
          ? aiBudgetMessage(lang, conversationalAiBudgetBlock.resetAt, conversationalAiBudgetBlock.reason)
          : (intent === 'help' ? `${t('help', lang)}\n\n${buildKnowledgeReply(body, lang)}` : t('onlyRisip', lang)));
        await finish('skipped');
      }
    }
  }

  nudgeWorker();
  // Always 200: a non-200 makes Meta retry a payload we have already recorded.
  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
});
