import type { DailyRecordPaymentMethod } from './whatsappDailyRecords.ts';
import type { QuantityWanted } from './whatsappMissingQuantity.ts';
import type { QuantitySale, QuantitySaleItem } from './whatsappQuantitySale.ts';

export const MAX_AI_TRANSACTION_LINES = 50;

const ROOT_KEYS = new Set([
  'kind', 'party_name', 'payment_method', 'lines', 'missing_fields',
  'credit_wording', 'occurred_at_wording', 'price_band_wording',
]);
/**
 * Which of the shop's two prices the trader named, in their own word.
 *
 * MEASURED FAILURE, straight after the model was put in front of the parsers:
 * "nimeuza nguvu ya sala 7 jumla" was answered "umeuza kwa bei gani?" — a
 * question the sentence had already answered. The deterministic parser read
 * "jumla" perfectly; the tool schema simply had nowhere to put it, so the word
 * was dropped on the way through the model and the server had to ask.
 *
 * The model carries the WORD. The server decides what it is worth.
 */
function bandFromWording(value: unknown): 'retail' | 'wholesale' | null {
  if (typeof value !== 'string') return null;
  const said = value.toLowerCase().trim();
  if (/\b(?:jumla|wholesale|bulk)\b/.test(said)) return 'wholesale';
  if (/\b(?:rejareja|retail)\b/.test(said)) return 'retail';
  return null;
}

const LINE_KEYS = new Set(['product', 'quantity', 'unit', 'price_band_wording']);
const PAYMENT_METHODS = new Set<DailyRecordPaymentMethod>(['cash', 'mobile_money', 'bank', 'other']);
const MISSING_FIELDS = new Set(['product', 'quantity', 'unit', 'party']);

type AiTransactionLine = {
  product?: unknown;
  quantity?: unknown;
  unit?: unknown;
  price_band_wording?: unknown;
};

type AiTransactionCandidate = {
  kind?: unknown;
  party_name?: unknown;
  payment_method?: unknown;
  lines?: unknown;
  missing_fields?: unknown;
  credit_wording?: unknown;
  occurred_at_wording?: unknown;
};

export type ValidatedAiTransaction = {
  kind: 'transaction';
  sale: QuantitySale;
  credit: { party: string } | null;
  paymentMethod: DailyRecordPaymentMethod | null;
  occurredAtWording: string | null;
};

export type ValidatedAiMissingQuantity = {
  kind: 'missing_quantity';
  wanted: QuantityWanted;
};

export type AiTransactionValidation = ValidatedAiTransaction | ValidatedAiMissingQuantity;

const cleanText = (value: unknown, max: number): string | null => {
  if (typeof value !== 'string') return null;
  const cleaned = value.replace(/\s+/g, ' ').trim();
  return cleaned && cleaned.length <= max ? cleaned : null;
};

const hasOnlyKeys = (value: Record<string, unknown>, allowed: Set<string>): boolean =>
  Object.keys(value).every((key) => allowed.has(key));

function paymentMethod(value: unknown): DailyRecordPaymentMethod | null | undefined {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string' || !PAYMENT_METHODS.has(value as DailyRecordPaymentMethod)) return undefined;
  return value as DailyRecordPaymentMethod;
}

/**
 * Validates language interpreted by Claude. This deliberately accepts no price,
 * total, conversion, stock or product id. Those values can only be supplied by
 * the company-scoped deterministic pipeline after this function returns.
 */
export function validateAiTransactionCandidate(candidate: unknown): AiTransactionValidation | null {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) return null;
  const raw = candidate as AiTransactionCandidate & Record<string, unknown>;
  if (!hasOnlyKeys(raw, ROOT_KEYS)) return null;
  if (raw.kind !== 'sale' && raw.kind !== 'debt_issued') return null;
  if (!Array.isArray(raw.lines) || raw.lines.length === 0 || raw.lines.length > MAX_AI_TRANSACTION_LINES) return null;

  const method = paymentMethod(raw.payment_method);
  if (method === undefined || (raw.kind === 'debt_issued' && method !== null)) return null;
  const party = raw.party_name == null ? null : cleanText(raw.party_name, 80);
  if (raw.party_name != null && !party) return null;
  if (raw.kind === 'debt_issued' && !party) return null;

  const creditWording = raw.credit_wording == null ? null : cleanText(raw.credit_wording, 100);
  if (raw.credit_wording != null && !creditWording) return null;
  const occurredAtWording = raw.occurred_at_wording == null
    ? null
    : cleanText(raw.occurred_at_wording, 100);
  if (raw.occurred_at_wording != null && !occurredAtWording) return null;

  const missing = Array.isArray(raw.missing_fields)
    ? raw.missing_fields.map((field) => typeof field === 'string' ? field : '').filter(Boolean)
    : [];
  if (missing.some((field) => !MISSING_FIELDS.has(field))) return null;
  if (missing.includes('product') || missing.includes('party')) return null;

  const items: QuantitySaleItem[] = [];
  let missingQuantityProduct: string | null = null;
  for (const entry of raw.lines) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
    const line = entry as AiTransactionLine & Record<string, unknown>;
    if (!hasOnlyKeys(line, LINE_KEYS)) return null;
    const product = cleanText(line.product, 120);
    if (!product) return null;
    const unit = line.unit == null ? null : cleanText(line.unit, 40);
    if (line.unit != null && !unit) return null;

    if (line.quantity == null) {
      if (raw.lines.length !== 1 || missingQuantityProduct || !missing.includes('quantity')) return null;
      missingQuantityProduct = product;
      continue;
    }
    if (typeof line.quantity !== 'number' || !Number.isFinite(line.quantity)
      || line.quantity <= 0 || line.quantity > 100_000) return null;
    items.push({
      product: unit ? `${product} ${unit}` : product,
      quantity: line.quantity,
      spokenUnit: unit,
      productWithoutUnit: unit ? product : null,
      unit: null,
      // A band belongs to the line where the trader said it. The event-level
      // value remains a compatibility fallback for one band stated globally.
      band: bandFromWording(line.price_band_wording ?? raw.price_band_wording),
    });
  }

  if (missingQuantityProduct) {
    return {
      kind: 'missing_quantity',
      wanted: {
        kind: 'quantity_wanted',
        ledger: raw.kind,
        product: missingQuantityProduct,
        party,
        paymentMethod: raw.kind === 'debt_issued' ? null : method,
      },
    };
  }
  if (missing.length > 0 || items.length !== raw.lines.length) return null;

  return {
    kind: 'transaction',
    sale: { kind: 'quantity_sale', items, expenses: [] },
    credit: raw.kind === 'debt_issued' ? { party: party! } : null,
    paymentMethod: raw.kind === 'debt_issued' ? null : method,
    // Kept as untrusted language context only. Historical pricing/date changes
    // are explicitly outside Phase 5 Part 8 and this value cannot affect money.
    occurredAtWording,
  };
}
