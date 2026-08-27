/**
 * ONE CONTRACT FOR EVERY UNFINISHED QUESTION.
 *
 * Risip parks a question when it cannot safely finish a record: which band,
 * how many, which product, paid how. Until now each of those questions owned
 * its own parser, and those parsers stood in front of the model:
 *
 *   parsePriceBandAnswer     "reja", "rejarej", "jumla"
 *   parseQuantityAnswer      "tano", "thelathini", "mbili na nusu"
 *   parseQuantityMeaningAnswer  "mauzo", "manunuzi", "hesabu"
 *
 * So a shop met a language model when it opened a subject and a regular
 * expression when it answered a follow-up — two brains, switching on nothing
 * the shopkeeper could see. "Namaanisha anton" fell through every one of those
 * lists and got the same question a third time.
 *
 * Now there is one shape. The pending question is described to the model, the
 * model returns which field it thinks was answered and in what words, and the
 * server decides whether that is a legal value for the question actually on the
 * table. Claude interprets wording. Code validates canonical values.
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

/** What Risip is waiting for, described so a model can read it. */
export type PendingClarification = {
  field: ClarificationField;
  /** What the record will be once it is finished. */
  intent: string;
  /** The product under discussion, when the question is about one. */
  product?: string | null;
  /** The only answers this question can have, when it is a closed set. */
  allowedValues?: readonly string[];
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
  const parts = [
    `RISIP IS WAITING FOR AN ANSWER: field=${pending.field}`,
    `pending_intent=${pending.intent}`,
  ];
  if (pending.product) parts.push(`about_product=${pending.product}`);
  if (pending.allowedValues?.length) parts.push(`allowed_values=${pending.allowedValues.join('|')}`);
  parts.push(
    'If this message answers that question, call resolve_pending_clarification with the field and the'
    + " trader's own words. If it changes the subject instead, treat it as a new message and answer that;"
    + ' the server releases the parked question.',
  );
  return parts.join('\n');
}

// ── what the model may send back ────────────────────────────────────────────

export type ClarificationAnswer = {
  field: ClarificationField;
  /** The trader's own words. The evidence. */
  wording: string;
  /** The model's reading of a number, cross-checked by the server. */
  numericCandidate: number | null;
};

const text = (value: unknown, max = 120): string | null => {
  const said = String(value ?? '').replace(/\s+/gu, ' ').trim();
  if (!said || /^(null|none|n\/a|undefined)$/i.test(said)) return null;
  return said.slice(0, max);
};

export function validateClarificationAnswer(input: unknown): ClarificationAnswer | null {
  if (!input || typeof input !== 'object') return null;
  const row = input as Record<string, unknown>;
  const field = String(row.field ?? '') as ClarificationField;
  if (!(CLARIFICATION_FIELDS as readonly string[]).includes(field)) return null;
  const wording = text(row.wording);
  if (!wording) return null;
  const candidate = typeof row.numeric_candidate === 'number' && Number.isFinite(row.numeric_candidate)
    ? row.numeric_candidate
    : null;
  return { field, wording, numericCandidate: candidate };
}

// ── canonicalising an answer, once the model has read it ────────────────────
//
// These are VALIDATORS, not routers. They receive a phrase the model has
// already identified as the answer to a specific question and decide whether it
// names a legal value for that question. The difference matters: the same
// function that decides "is this sentence about a price band?" is a language
// router, and the one that decides "does this phrase name retail or wholesale?"
// is a bounds check.

const BAND_WORDS: Array<{ re: RegExp; band: Band }> = [
  { re: /\b(jumla|jumlla|wholesale|bulk)\b/iu, band: 'wholesale' },
  { re: /\b(rejareja|rejarej|reja\s*reja|reja|retail)\b/iu, band: 'retail' },
];

export function canonicalBand(wording: string): Band | null {
  const said = String(wording ?? '').toLowerCase();
  for (const { re, band } of BAND_WORDS) if (re.test(said)) return band;
  return null;
}

const EVENT_WORDS: Array<{ re: RegExp; kind: 'sale' | 'stock_purchase' | 'stock_count' }> = [
  { re: /\b(mauzo|nimeuza|sale|sales|sold)\b/iu, kind: 'sale' },
  { re: /\b(manunuzi|nimenunua|purchase|bought|stock)\b/iu, kind: 'stock_purchase' },
  { re: /\b(hesabu|kuhesabu|count|stock\s*count)\b/iu, kind: 'stock_count' },
];

export function canonicalEventType(wording: string): 'sale' | 'stock_purchase' | 'stock_count' | null {
  const said = String(wording ?? '').toLowerCase();
  for (const { re, kind } of EVENT_WORDS) if (re.test(said)) return kind;
  return null;
}

/**
 * A number the server worked out for itself, or a reason to ask again.
 *
 * The model's candidate never wins alone. It confirms a reading reached here
 * independently, and a disagreement is a question rather than a coin toss —
 * the same rule the Stage B language contract uses for every other figure.
 */
export type NumberCheck =
  | { kind: 'value'; value: number }
  | { kind: 'ask'; reason: 'unreadable' | 'disagreement' | 'out_of_range' };

export function checkQuantity(
  wording: string,
  candidate: number | null,
  readNumber: (said: string) => number | null,
): NumberCheck {
  const mine = readNumber(wording);
  if (mine === null) return { kind: 'ask', reason: 'unreadable' };
  if (!(mine > 0) || mine > 1_000_000) return { kind: 'ask', reason: 'out_of_range' };
  if (candidate === null) return { kind: 'value', value: mine };
  const agrees = Math.abs(candidate - mine) <= Math.max(0.001, Math.abs(mine) * 1e-9);
  return agrees ? { kind: 'value', value: mine } : { kind: 'ask', reason: 'disagreement' };
}
