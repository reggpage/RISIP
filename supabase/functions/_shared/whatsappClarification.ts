/**
 * ONE CONTRACT FOR EVERY UNFINISHED QUESTION.
 *
 * Risip parks a question when it cannot safely finish a record: which band,
 * how many, which product, paid how. Each of those questions used to own its
 * own parser, and those parsers stood in front of the model:
 *
 *   parsePriceBandAnswer     "reja", "rejarej", "jumla"
 *   parseQuantityAnswer      "tano", "thelathini", "mbili na nusu"
 *   parseQuantityMeaningAnswer  "mauzo", "manunuzi", "hesabu"
 *
 * So a shop met a language model when it opened a subject and a regular
 * expression when it answered a follow-up — two brains, switching on nothing
 * the shopkeeper could see.
 *
 * Moving those parsers to AFTER the model was not enough, and the audit that
 * caught it was right. This module briefly held canonicalBand() and
 * canonicalEventType(), which read "reja" and "mauzo" out of the trader's own
 * words to decide what they meant. Later in the pipeline, same job: code
 * deciding what a person meant. A word list does not stop being a word list
 * because it runs second.
 *
 * So the model now returns the MEANING and the words it read it from. This file
 * checks that the meaning is one of the answers the parked question actually
 * allows. That is the whole difference:
 *
 *   language parsing   does "reja" mean retail?          -> Claude
 *   bounds checking    is "retail" a legal answer here?   -> here
 *
 * WHAT THIS DELIBERATELY NEVER CARRIES: a price, a total, a stock level, a
 * balance, a company, a profile, a role, or a confirmation. Those are re-derived
 * from the ledger when the record resumes, exactly as they were before.
 */

import type { Band } from './whatsappPriceBand.ts';

/** The questions Risip knows how to ask, and therefore how to resume. */
export const CLARIFICATION_FIELDS = [
  'price_band',
  'quantity',
  'unit',
  'product',
  'payment_method',
  'event_type',
  'party',
] as const;
export type ClarificationField = typeof CLARIFICATION_FIELDS[number];

/**
 * The answers each closed question accepts.
 *
 * These are ENUMS, not vocabulary. Nothing here is matched against what the
 * trader typed — the model has already decided what they meant, and this is the
 * list of meanings the question can accept at all. A field absent from this map
 * is open-ended (a product name, a person's name) and is validated against the
 * company's own data instead.
 */
export const ALLOWED_VALUES: Partial<Record<ClarificationField, readonly string[]>> = {
  price_band: ['retail', 'wholesale'],
  event_type: ['sale', 'stock_purchase', 'stock_count'],
  payment_method: ['cash', 'mobile_money', 'bank', 'other'],
};

/** What Risip is waiting for, described so a model can read it. */
export type PendingClarification = {
  field: ClarificationField;
  /** What the record will be once it is finished. */
  intent: string;
  /** The product under discussion, when the question is about one. */
  product?: string | null;
  /** For a unit question: the measures this product is actually sold in. */
  choices?: readonly string[];
  /** Extra factual instructions for a multi-line parked question. */
  details?: string;
};

/**
 * A compact description of the parked question, for the assistant's context.
 *
 * Deliberately terse and deliberately factual. It says what was asked and what
 * would count as an answer; it does not say how to phrase anything, and it
 * carries no figure the model could restate as truth.
 */
export function describePending(pending: PendingClarification | null): string | null {
  if (!pending) return null;
  const allowed = ALLOWED_VALUES[pending.field] ?? pending.choices;
  const saleRecovery = pending.intent === 'sale_missing_selling_price';
  const parts = [
    `RISIP IS WAITING FOR AN ANSWER: field=${pending.field}`,
    `pending_intent=${pending.intent}`,
  ];
  if (pending.product) parts.push(`about_product=${pending.product}`);
  if (allowed?.length) parts.push(`allowed_values=${allowed.join('|')}`);
  if (pending.details) parts.push(pending.details);
  parts.push(saleRecovery
    ? 'This is a recovery of the original sale. Do not call resolve_pending_clarification or propose_price_update. If the trader corrects product names, call propose_business_event with the original quantities and corrected names so the server can use the catalogue prices. If the trader gives genuinely new prices, handle that as a new explicit price-setting request.'
    : 'If this message answers that question, call resolve_pending_clarification. Send canonical_value as'
      + " one of the allowed values above — YOU decide which of them the trader's words mean, because the"
      + ' server no longer reads their words at all. Send raw_wording as what they actually typed, so the'
      + ' shop can be shown its own words back. If the message changes the subject instead, treat it as a'
      + ' new message and answer that; the server releases the parked question.');
  return parts.join('\n');
}

// ── what the model sends back ───────────────────────────────────────────────

export type ClarificationAnswer = {
  field: ClarificationField;
  /** What the trader typed. Evidence and audit trail, never parsed. */
  rawWording: string | null;
  /** THE MEANING, decided by the model. */
  canonicalValue: string | null;
  /** A number, decided by the model and range-checked here. */
  numericValue: number | null;
};

const text = (value: unknown, max = 120): string | null => {
  const said = String(value ?? '').replace(/\s+/gu, ' ').trim();
  if (!said || /^(null|none|n\/a|undefined)$/i.test(said)) return null;
  return said.slice(0, max);
};

/** One answer, or several when a trader settles two facts in one breath. */
export function validateClarificationAnswers(input: unknown): ClarificationAnswer[] {
  if (!input || typeof input !== 'object') return [];
  const row = input as Record<string, unknown>;
  const raw = Array.isArray(row.answers) ? row.answers : [row];
  const answers: ClarificationAnswer[] = [];
  for (const entry of raw.slice(0, 50)) {
    if (!entry || typeof entry !== 'object') continue;
    const one = entry as Record<string, unknown>;
    const field = String(one.field ?? '') as ClarificationField;
    if (!(CLARIFICATION_FIELDS as readonly string[]).includes(field)) continue;
    const numeric = typeof one.numeric_value === 'number' && Number.isFinite(one.numeric_value)
      ? one.numeric_value
      : null;
    const canonical = text(one.canonical_value, 60);
    if (canonical === null && numeric === null) continue;
    answers.push({
      field,
      rawWording: text(one.raw_wording),
      canonicalValue: canonical,
      numericValue: numeric,
    });
  }
  return answers;
}

// ── bounds checking, which is not language ─────────────────────────────────

export type ValueCheck =
  | { kind: 'ok'; value: string }
  | { kind: 'reject'; reason: 'not_allowed' | 'missing' };

/**
 * Is this MEANING one the parked question can accept?
 *
 * A membership test against a closed list. It never looks at what the trader
 * typed, so no wording — however it is spelled, whatever language it is in —
 * changes the outcome.
 */
export function checkCanonicalValue(field: ClarificationField, value: string | null): ValueCheck {
  if (!value) return { kind: 'reject', reason: 'missing' };
  const allowed = ALLOWED_VALUES[field];
  if (!allowed) return { kind: 'ok', value };
  return allowed.includes(value) ? { kind: 'ok', value } : { kind: 'reject', reason: 'not_allowed' };
}

export const asBand = (value: string): Band | null =>
  value === 'retail' || value === 'wholesale' ? value : null;

export type NumberCheck =
  | { kind: 'value'; value: number }
  | { kind: 'ask'; reason: 'missing' | 'out_of_range' };

/**
 * A range check on a number the model has already read.
 *
 * MEASURED, and the reason this is a check rather than a second reading: the
 * server used to re-parse "thelathini" itself and compare. That was two
 * language readings of one sentence, and it disagreed with itself on wording
 * neither list had seen. Safety here comes from the range, from the preview the
 * shop is shown, and from NDIYO — not from parsing the sentence twice.
 */
export function checkNumber(value: number | null, max = 1_000_000): NumberCheck {
  if (value === null) return { kind: 'ask', reason: 'missing' };
  if (!(value > 0) || value > max) return { kind: 'ask', reason: 'out_of_range' };
  return { kind: 'value', value };
}
