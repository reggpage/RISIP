/** AI owns language; exact controls are scoped to a known active question. */
export type MessageRoute = 'ai_primary' | 'pending_protocol' | 'ai_outage_fallback';
export type PendingConversation = {
  awaiting?: string | null;
  options?: unknown;
  expires_at?: string | null;
} | null | undefined;

const CONFIRMATION_KINDS = new Set([
  'daily_record_confirmation', 'daily_record_batch_confirmation',
  'whole_animal_breakdown_confirmation', 'stock_count_batch',
  'product_cost_batch', 'selling_price_batch', 'price_and_cost_pending',
  'record_queue', 'void_record', 'new_product_registration_confirmation',
  'new_product_pricing', 'portion_setup_confirmation', 'product_rename_confirmation',
  'combo_save', 'vocabulary_teaching', 'product_setup_pending',
]);

/** Exact commands, never prefixes like "login and show yesterday's sales".
 * Credential/bootstrap commands remain protected; ordinary account requests
 * are interpreted through the AI account-action tool.
 */
export function isProtectedSystemCommand(said: string | null | undefined): boolean {
  return /^(?:login|scan|sitisha|stop)$/i.test(String(said ?? '').trim());
}

export function answersPendingQuestion(convo: PendingConversation, said: string | null | undefined): boolean {
  const text = String(said ?? '').trim();
  if (!convo?.awaiting || !text) return false;
  if (convo.expires_at && !(Date.parse(convo.expires_at) > Date.now())) return false;
  // Cancel always refers to this active question; longer sentences remain AI.
  if (/^(?:ghairi|cancel)$/i.test(text)) return true;
  const options = (convo.options ?? {}) as Record<string, unknown>;
  const kind = String(options.kind ?? '');
  const confirm = /^(?:1|2|ndiyo|ndio|yes|no|hapana|confirm|thibitisha)$/i.test(text);
  if (convo.awaiting === 'account_delete_confirm') {
    return /^(?:FUTA KABISA|DELETE PERMANENTLY|2|hapana|no)$/i.test(text);
  }
  if (convo.awaiting === 'logout_confirm') {
    return options.step === 'disambiguate' ? /^[12]$/.test(text) : confirm;
  }
  // A unit/product clarification nested in a price preview is NOT a save prompt.
  if (kind === 'price_and_cost_pending' && options.clarification) return false;
  if (CONFIRMATION_KINDS.has(kind)) return confirm;
  if (convo.awaiting === 'day_close') return confirm;
  // Older single-cost confirmations carry no kind, but do carry the proposal.
  if (convo.awaiting === 'product_cost' && !kind && typeof options.product === 'string'
    && typeof options.unitCost === 'number') return confirm;

  if (['price_band_choice', 'quantity_meaning_clarification'].includes(kind)) {
    return /^\(?[abc]\)?$/i.test(text);
  }
  if (kind === 'stock_purchase_cost_choice') return /^[123]$/.test(text);
  if (kind === 'help_menu') return /^[123]$/.test(text);
  if (kind === 'invite_role') return /^[12]$/.test(text);
  const candidates = kind === 'product_read_choice' || kind === 'whole_animal_breakdown_source_selection'
    ? options.candidates : convo.awaiting === 'business' ? convo.options : null;
  if (Array.isArray(candidates)) {
    return /^[1-9]\d*$/.test(text) && Number(text) <= candidates.length;
  }
  if (convo.awaiting === 'language') return /^[12]$/.test(text);
  // In particular quantity "1" and amount "2" are values, not menu answers.
  return false;
}

export function messageGoesToModel(
  convo: PendingConversation,
  said: string | null | undefined,
  systemCommand = false,
): boolean {
  return Boolean(String(said ?? '').trim())
    && !answersPendingQuestion(convo, said)
    && !systemCommand;
}

export const PARSERS_BEHIND_CLAUDE = [
  'parseBareQuantityList', 'parseDailyRecordBatch', 'parseQuantityOnlySale',
  'parseDailyRecord', 'parseStockLoss', 'parseSupplierCreditPurchase',
  'parseSupplierPayment', 'parseWholeAnimalProcurement', 'parseWholeAnimalBreakdown',
] as const;

/** The advertised a/b menu already supplies meaning; no language is inferred. */
export function protectedPriceBandAnswer(convo: PendingConversation, said: string | null | undefined): 'retail' | 'wholesale' | null {
  if (!answersPendingQuestion(convo, said)) return null;
  const options = (convo?.options ?? {}) as Record<string, unknown>;
  if (options.kind !== 'price_band_choice' || !Array.isArray(options.choices) || !options.choices.length) return null;
  const choice = String(said ?? '').trim().toLowerCase();
  if (choice === 'a' || choice === '(a)') return 'retail';
  if (choice === 'b' || choice === '(b)') return 'wholesale';
  return null;
}

/** A numbered product choice resumes its typed sale; never re-parse the list. */
export function protectedSaleProductAnswer(convo: PendingConversation, said: string | null | undefined): string | null {
  if (!answersPendingQuestion(convo, said)) return null;
  const options = (convo?.options ?? {}) as Record<string, unknown>;
  if (options.kind !== 'product_read_choice' || !options.recovery || !Array.isArray(options.candidates)) return null;
  const text = String(said ?? '').trim();
  if (!/^[1-9]\d*$/.test(text)) return null;
  const candidate = options.candidates[Number(text) - 1];
  return typeof candidate === 'string' && candidate.trim() ? candidate : null;
}
