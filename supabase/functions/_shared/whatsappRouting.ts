/**
 * WHO SEES A MESSAGE FIRST.
 *
 * The architecture is AI-first, and for four stages it has not quite been true.
 * Two deterministic parsers still stood in front of the model and took ordinary
 * business language away from it before it could look:
 *
 *   !parseBareQuantityList(body)
 *   !(deterministicBatch.kind === 'parsed' && deterministicBatch.records.length > 1)
 *
 * So a shop that sent
 *
 *   Feni 7
 *   Nguvu 6
 *   Antoni 4
 *
 * never reached Haiku at all. A parser counted the quantities, asked MAUZO or
 * MANUNUZI, and when "Antoni" did not match "Anton wa Padua" letter for letter
 * the shop was offered a new-product registration for a product it already
 * sells. That is two different personalities in one product: some sentences met
 * a language model, others met a regular expression, and the shop could not
 * tell which it was going to get.
 *
 * This module draws the line in one place so it can be tested and watched.
 *
 *   Before Claude:  security, transport, and the ANSWER to a question Risip
 *                   itself just asked.
 *   Claude:         every other message that carries language.
 *   After Claude:   the backend, which owns every figure.
 *   Instead of Claude: the deterministic parsers, but only when the model
 *                   could not be reached at all.
 *
 * The narrow exception matters as much as the rule. When Risip has drafted a
 * record and asked "Jibu NDIYO au HAPANA", the word "ndiyo" is not a sentence
 * to be understood — it is a state-machine answer, and sending it to a model
 * risks semantic drift on the one step where drift writes to a ledger.
 */

import { isDailyRecordConfirmation, isDailyRecordRejection } from './whatsappDailyRecords.ts';

/** How a message was routed, for telemetry and for tests. */
export type MessageRoute =
  /** Claude interpreted it. The expected route for ordinary business language. */
  | 'ai_primary'
  /** It answered a bounded question Risip had already asked. */
  | 'pending_protocol'
  /** Claude could not be reached, so the deterministic parsers served it. */
  | 'ai_outage_fallback';

/**
 * States where Risip has asked a question with a small, known set of answers.
 *
 * Everything else parked in whatsapp_conversations is context, not a question,
 * and must not hold a new sentence away from the model.
 */
const BOUNDED_QUESTION_STATES = new Set([
  'payment_source',           // a drafted record awaiting NDIYO / HAPANA
  'product_cost',             // a price band, a stock count, a cost batch
  'daily_record_quantity',    // "ngapi?"
  'logout_confirm',
  'account_delete_confirm',
  'language',
  'business',
  'project',
]);

/** Destructive or identity-changing states. Their answer is never a sentence. */
const PROTOCOL_ONLY_STATES = new Set([
  'logout_confirm', 'account_delete_confirm', 'language', 'business', 'project',
]);

export type PendingConversation = {
  awaiting?: string | null;
  options?: unknown;
} | null | undefined;

/**
 * Does this message answer the question Risip is actually waiting for?
 *
 * True only when the text parses as the specific bounded answer for the parked
 * state. A shop that was asked "Rejareja au jumla?" and instead types "leo
 * nimeuza shingapi" has changed the subject, and changing the subject is
 * ordinary language — it goes to Claude, which is what §15 of the correction
 * asks for and what a person would expect.
 */
export function answersPendingQuestion(convo: PendingConversation, said: string | null | undefined): boolean {
  const awaiting = String(convo?.awaiting ?? '').trim();
  const text = String(said ?? '').trim();
  if (!awaiting || !text) return false;
  if (!BOUNDED_QUESTION_STATES.has(awaiting)) return false;

  // Onboarding, language, business switching and the two destructive
  // confirmations own their whole turn. Their answers are names and codes, not
  // business language, and a wrong reading changes an identity or deletes data.
  if (PROTOCOL_ONLY_STATES.has(awaiting)) return true;

  // A drafted record is waiting for a yes or a no, and semantic drift on the
  // one step that writes to a ledger is not worth the intelligence it would
  // buy. This is the ONLY conversational bypass left.
  //
  // What used to be here as well:
  //
  //   parseQuantityAnswer(text)          "tano", "thelathini", "mbili na nusu"
  //   parsePriceBandAnswer(text, ...)    "reja", "rejarej", "jumla"
  //   parseQuantityMeaningAnswer(text)   "mauzo", "manunuzi", "hesabu"
  //
  // Those are human business language, and code was reading them. It meant a
  // shop met a language model when it opened a subject and a regular expression
  // when it answered the follow-up — two brains, switching on nothing the
  // shopkeeper could see. They are gone from the normal path. The model reads
  // the answer now and returns it through resolve_pending_clarification, and
  // the same word lists survive as validators of a value the model has already
  // identified, which is a bounds check rather than a language router.
  return isDailyRecordConfirmation(text) || isDailyRecordRejection(text);
}

/**
 * Will the model see this message?
 *
 * The eligibility test used to live inline in the message loop, hundreds of
 * lines below branches that were quietly consuming messages before it ever ran.
 * parsePaymentMethodAnswer was one: "mpesa" beside a pending draft was read by
 * a phrase list of Tanzanian mobile-money brands, eight hundred lines above the
 * gate that was supposed to decide who reads what.
 *
 * Naming it once means every branch can ask the same question and get the same
 * answer, and a test can prove they do.
 */
export function messageGoesToModel(
  convo: PendingConversation,
  said: string | null | undefined,
  systemCommand: boolean,
): boolean {
  return Boolean(String(said ?? '').trim())
    && !answersPendingQuestion(convo, said)
    && !systemCommand;
}

/**
 * The parsers that must never stand in front of Claude again.
 *
 * Named here so a test can assert their absence from the eligibility gate
 * rather than trusting a comment. Each one used to consume ordinary business
 * language: a bare catalogue list, a mixed sale-and-purchase message, an
 * expense batch whose second line was silently dropped.
 */
export const PARSERS_BEHIND_CLAUDE = [
  'parseBareQuantityList',
  'parseDailyRecordBatch',
  'parseQuantityOnlySale',
  'parseDailyRecord',
  'parseStockLoss',
  'parseSupplierCreditPurchase',
  'parseSupplierPayment',
  'parseWholeAnimalProcurement',
  'parseWholeAnimalBreakdown',
] as const;
