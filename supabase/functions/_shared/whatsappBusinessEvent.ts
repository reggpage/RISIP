/**
 * STAGE B — the language contract.
 *
 * Stage A.1 measured the deployed brain against 175 labelled cases and found
 * 111 right. Of the 64 that were wrong, 33 were not the model at all: the tool
 * contract had nowhere to put what the model had understood. Five whole
 * categories scored 0 — supplier credit, supplier payments, stock loss, owner
 * use, both whole-animal events — because daily_records.kind has eleven values
 * and the tools accepted seven. propose_daily_record carried party_name, lines
 * and amount and nothing else, so "wiki iliyopita" and "kwa benki" were read
 * correctly and then dropped on the floor.
 *
 * This module is the wider contract, and the line it draws is the whole point:
 *
 *   THE MODEL SENDS WORDS. THE BACKEND DECIDES WHAT THEY ARE WORTH.
 *
 * Every money-bearing or stock-bearing field arrives twice — as the trader's
 * own wording, and as the model's candidate reading of it. The wording is the
 * evidence; the candidate is a hint. Where this module can normalize the
 * wording deterministically it does so and the candidate is only cross-checked.
 * Where it cannot, the answer is a question to the shop, never the model's
 * number.
 *
 * That rule is not theoretical. Stage A.1 caught "nimeuza soseji 12 kwa
 * tigopesa" being recorded as CASH: the model collapsed a Tanzanian
 * mobile-money brand into a four-value enum, and because no field kept the word
 * "tigopesa", nothing downstream could ever have caught it. The backend's own
 * payment table has known tigopesa the whole time. The word simply never
 * reached it.
 */

import { normalizeNumberWords } from './whatsappDailyRecords.ts';
import { pendingEscapeHint } from './whatsappIntent.ts';

/** Events that move products or stock. */
export const BUSINESS_EVENT_KINDS = [
  'sale',
  'credit_sale',
  'stock_purchase',
  'supplier_credit_purchase',
  'stock_loss',
  'owner_use',
  'stock_count',
  'whole_animal_procurement',
  'whole_animal_breakdown',
] as const;
export type BusinessEventKind = typeof BUSINESS_EVENT_KINDS[number];

/**
 * Events whose subject IS a sum of money the trader stated out loud.
 *
 * 'sale' is here for the lump sum with no product in it — "nimeuza bidhaa kwa
 * TSh 15000" names no product, so there is nothing for the catalogue to price.
 * MEASURED REGRESSION: without it the model had nowhere to put that sentence
 * and filed it as an EXPENSE, booking revenue as cost. A missing kind does not
 * make a message go away; it makes it land somewhere wrong.
 */
export const MONEY_EVENT_KINDS = ['sale', 'expense', 'customer_payment', 'supplier_payment'] as const;
export type MoneyEventKind = typeof MONEY_EVENT_KINDS[number];

/**
 * The only things the model may say are missing.
 *
 * A bounded list, so a clarification can be routed. The backend decides what is
 * REALLY missing — the model's list is a hint about what the sentence left out,
 * not an instruction about what to ask.
 */
export const MISSING_FIELDS = [
  'direction', 'product', 'quantity', 'unit', 'party', 'supplier', 'amount',
  'payment_method', 'price_band', 'animal_source', 'animal_count', 'loss_reason',
] as const;
export type MissingField = typeof MISSING_FIELDS[number];

const MAX_LINES = 50;
const MAX_WORDING = 120;
const MAX_QUANTITY = 1_000_000;
const MAX_AMOUNT = 100_000_000;

const text = (value: unknown): string | null => {
  const said = String(value ?? '').replace(/\s+/gu, ' ').trim();
  return said ? said.slice(0, MAX_WORDING) : null;
};

/**
 * A number the backend worked out, a question it needs asked, or nothing said.
 *
 * Three outcomes rather than a nullable number, because "the shop did not say"
 * and "the shop said something I could not read" must lead to different
 * behaviour. Collapsing them is how a missing quantity becomes a quantity of 1.
 */
export type Reading =
  | { kind: 'value'; value: number; source: 'wording' | 'digits'; disagreed: boolean }
  | { kind: 'ask'; reason: 'unreadable' | 'disagreement' | 'out_of_range' }
  | { kind: 'absent' };

/**
 * Swahili noun-class agreement on numbers.
 *
 * "Vifuko VITATU" is three bags; the vi- belongs to the noun class, not to the
 * number. normalizeNumberWords works on bare stems, so the prefix is peeled
 * first. This is numeric grammar, deterministic and closed — not a phrase list,
 * and adding a new product never requires touching it.
 */
const CLASS_PREFIX = /\b(vi|wa|ma|mi|si|ki|m|u|n|z)(moja|mbili|wili|tatu|nne|tano|sita|saba|nane|tisa|kumi)\b/giu;

const STEM_REPAIR: Record<string, string> = { wili: 'mbili' };

function peelNounClass(said: string): string {
  return said.replace(CLASS_PREFIX, (whole, _prefix: string, stem: string) => {
    const bare = STEM_REPAIR[stem.toLowerCase()] ?? stem;
    // "moja"/"kumi" carry no class prefix of their own in most classes, so a
    // match there is more likely a real word than an inflected number. Only
    // rewrite when peeling actually yields a number word.
    return /^(moja|mbili|tatu|nne|tano|sita|saba|nane|tisa|kumi)$/i.test(bare) ? ` ${bare} ` : whole;
  });
}

/** The first number in a phrase, after Swahili number words are resolved. */
function numberIn(said: string): number | null {
  const normalized = normalizeNumberWords(peelNounClass(said.toLowerCase()));
  const found = /-?\d+(?:[.,]\d+)?/u.exec(normalized.replace(/(\d),(\d{3})\b/gu, '$1$2'));
  if (!found) return null;
  // A Tanzanian amount is commonly grouped as 80,000. The old conversion
  // treated that comma as a decimal separator and independently read it as
  // eighty, even though the daily-record parser already accepted the same
  // money token. Keep grouped digits intact; only a non-grouped comma is a
  // decimal separator.
  const token = found[0];
  const value = /,\d{3}(?:,\d{3})*$/u.test(token)
    ? Number(token.replace(/,/g, ''))
    : Number(token.replace(',', '.'));
  return Number.isFinite(value) ? value : null;
}

/** Whether the phrase is already just digits, needing no interpretation. */
const isPlainDigits = (said: string) => /^[\s0-9.,]+$/u.test(said);

/**
 * Turn the trader's words into a number, or decide to ask.
 *
 * The model's candidate never wins on its own. It is used to CONFIRM a reading
 * this module reached independently, and a disagreement is a question rather
 * than a coin toss — Stage A.1 found "Asha amelipa nusu ya 24000" arriving as
 * quantity 1, and a contract that trusts the candidate would have written it.
 */
export function readNumber(
  wording: unknown,
  candidate: unknown,
  bounds: { min: number; max: number },
): Reading {
  const said = text(wording);
  const hinted = typeof candidate === 'number' && Number.isFinite(candidate) ? candidate : null;
  if (!said) {
    // No words. A bare candidate is the model asserting a number nobody said,
    // which is exactly the authority this contract removes.
    return hinted === null ? { kind: 'absent' } : { kind: 'ask', reason: 'unreadable' };
  }

  const mine = numberIn(said);
  if (mine === null) return { kind: 'ask', reason: 'unreadable' };
  if (!(mine > bounds.min) || mine > bounds.max) return { kind: 'ask', reason: 'out_of_range' };

  const source = isPlainDigits(said) ? 'digits' : 'wording';
  if (hinted === null) return { kind: 'value', value: mine, source, disagreed: false };

  // Tolerance is for float noise only, never for a different reading.
  const agrees = Math.abs(hinted - mine) <= Math.max(0.001, Math.abs(mine) * 1e-9);
  if (agrees) return { kind: 'value', value: mine, source, disagreed: false };
  // The words are the evidence. A candidate that disagrees with them means one
  // of the two misread the sentence, and guessing which is not a decision a
  // ledger should make.
  return { kind: 'ask', reason: 'disagreement' };
}

export const readQuantity = (wording: unknown, candidate: unknown): Reading =>
  readNumber(wording, candidate, { min: 0, max: MAX_QUANTITY });

export const readAmount = (wording: unknown, candidate: unknown): Reading =>
  readNumber(wording, candidate, { min: 0, max: MAX_AMOUNT });

// ── the validated shapes the executor receives ──────────────────────────────

export type EventLine = {
  productWording: string;
  quantity: Reading;
  quantityWording: string | null;
  unitWording: string | null;
  /** Price band stated for this product line, not for the whole message. */
  priceBandWording: string | null;
};

export type ValidatedBusinessEvent = {
  kind: BusinessEventKind;
  lines: EventLine[];
  partyWording: string | null;
  supplierWording: string | null;
  creditWording: string | null;
  paymentWording: string | null;
  priceBandWording: string | null;
  occurredAtWording: string | null;
  lossReasonWording: string | null;
  amount: Reading;
  missingFields: MissingField[];
};

export type ValidatedMoneyEvent = {
  kind: MoneyEventKind;
  amount: Reading;
  partyWording: string | null;
  descriptionWording: string | null;
  paymentWording: string | null;
  occurredAtWording: string | null;
  missingFields: MissingField[];
};

function missingOf(value: unknown): MissingField[] {
  if (!Array.isArray(value)) return [];
  const allowed = new Set<string>(MISSING_FIELDS);
  // Anything outside the vocabulary is dropped rather than passed on. An
  // invented missing-field string would become a question nobody wrote.
  return [...new Set(value.map((entry) => String(entry ?? '')).filter((entry) => allowed.has(entry)))] as MissingField[];
}

function linesOf(value: unknown): EventLine[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_LINES) return null;
  const lines: EventLine[] = [];
  for (const entry of value) {
    if (!entry || typeof entry !== 'object') return null;
    const row = entry as Record<string, unknown>;
    const productWording = text(row.product_wording);
    if (!productWording) return null;
    const quantityWording = text(row.quantity_wording);
    lines.push({
      productWording,
      quantityWording,
      unitWording: text(row.unit_wording),
      priceBandWording: text(row.price_band_wording),
      quantity: readQuantity(quantityWording, row.quantity_candidate),
    });
  }
  return lines;
}

/** Kinds whose sentence is about products, so at least one line is required. */
// Every kind names something. A whole animal is its own line — product_wording
// "ngombe", quantity_wording "wawili" — which is one fewer pair of fields for
// the model to fill and one fewer way for an animal to arrive uncounted.
const NEEDS_LINES = new Set<BusinessEventKind>(BUSINESS_EVENT_KINDS);

export function validateBusinessEvent(input: unknown): ValidatedBusinessEvent | null {
  if (!input || typeof input !== 'object') return null;
  const row = input as Record<string, unknown>;
  const kind = String(row.kind ?? '') as BusinessEventKind;
  if (!(BUSINESS_EVENT_KINDS as readonly string[]).includes(kind)) return null;

  const lines = linesOf(row.lines) ?? [];
  if (NEEDS_LINES.has(kind) && lines.length === 0) return null;

  return {
    kind,
    lines,
    partyWording: text(row.party_wording),
    supplierWording: text(row.supplier_wording),
    creditWording: text(row.credit_wording),
    paymentWording: text(row.payment_wording),
    priceBandWording: text(row.price_band_wording),
    occurredAtWording: text(row.occurred_at_wording),
    lossReasonWording: text(row.loss_reason_wording),
    amount: readAmount(text(row.amount_wording), row.amount_candidate),
    missingFields: missingOf(row.missing_fields),
  };
}

export function validateMoneyEvent(input: unknown): ValidatedMoneyEvent | null {
  if (!input || typeof input !== 'object') return null;
  const row = input as Record<string, unknown>;
  const kind = String(row.kind ?? '') as MoneyEventKind;
  if (!(MONEY_EVENT_KINDS as readonly string[]).includes(kind)) return null;

  return {
    kind,
    amount: readAmount(text(row.amount_wording), row.amount_candidate),
    partyWording: text(row.party_wording),
    descriptionWording: text(row.description_wording),
    paymentWording: text(row.payment_wording),
    occurredAtWording: text(row.occurred_at_wording),
    missingFields: missingOf(row.missing_fields),
  };
}

// ── the questions a reading turns into ──────────────────────────────────────

export function numberQuestion(
  field: 'quantity' | 'amount' | 'animal_count',
  reading: Extract<Reading, { kind: 'ask' }>,
  lang: 'sw' | 'en',
): string {
  const sw = {
    quantity: {
      unreadable: 'Sijaelewa idadi uliyosema. Niandikie kwa tarakimu, mfano *3*.',
      disagreement: 'Idadi haijakaa sawa. Niandikie kwa tarakimu, mfano *3*.',
      out_of_range: 'Idadi hiyo haiwezekani. Niandikie idadi halisi kwa tarakimu.',
    },
    amount: {
      unreadable: 'Sijaelewa kiasi cha fedha ulichosema. Niandikie kwa tarakimu, mfano *300000*.',
      disagreement: 'Kiasi hakijakaa sawa. Niandikie kwa tarakimu, mfano *300000*.',
      out_of_range: 'Kiasi hicho hakiwezekani. Niandikie kiasi halisi kwa tarakimu.',
    },
    animal_count: {
      unreadable: 'Sijaelewa idadi ya wanyama. Niandikie kwa tarakimu, mfano *2*.',
      disagreement: 'Idadi ya wanyama haijakaa sawa. Niandikie kwa tarakimu.',
      out_of_range: 'Idadi hiyo ya wanyama haiwezekani. Niandikie idadi halisi.',
    },
  };
  const en = {
    quantity: {
      unreadable: 'I could not read the quantity. Write it in digits, for example *3*.',
      disagreement: 'The quantity did not add up. Write it in digits, for example *3*.',
      out_of_range: 'That quantity is not possible. Write the real quantity in digits.',
    },
    amount: {
      unreadable: 'I could not read the amount. Write it in digits, for example *300000*.',
      disagreement: 'The amount did not add up. Write it in digits, for example *300000*.',
      out_of_range: 'That amount is not possible. Write the real amount in digits.',
    },
    animal_count: {
      unreadable: 'I could not read how many animals. Write it in digits, for example *2*.',
      disagreement: 'The number of animals did not add up. Write it in digits.',
      out_of_range: 'That number of animals is not possible. Write the real number.',
    },
  };
  return `${(lang === 'sw' ? sw : en)[field][reading.reason]} ${pendingEscapeHint(lang)}`;
}
