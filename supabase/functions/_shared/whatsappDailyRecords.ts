import type { Lang } from './whatsappIntent.ts';

export type DailyRecordKind =
  | 'sale' | 'expense' | 'debt_issued' | 'customer_payment' | 'stock_purchase';

export type DailyRecordLine = {
  description: string;
  quantity: number;
  unit_amount: number;
  /**
   * "kilo", "lita", "gunia" — descriptive only, never converted. Present when
   * the trader named one, so three litres are not reported as three pieces.
   */
  unit?: string | null;
};

export type ParsedDailyRecord = {
  kind: DailyRecordKind;
  amount: number;
  partyName: string | null;
  description: string | null;
  lines: DailyRecordLine[];
  referenceAmount?: number | null;
  /** Parser confidence is advisory; server-side arithmetic remains authoritative. */
  confidence?: number;
  warnings?: string[];
};

export type DailyRecordParse =
  | { kind: 'parsed'; record: ParsedDailyRecord }
  | { kind: 'clarify'; reason: 'amount' | 'message' | 'ambiguity' | 'limit'; question: string; draft?: DailyRecordClarification }
  | { kind: 'none' };

export type DailyRecordClarification = {
  kind: 'daily_record_clarification';
  originalText: string;
  sourceMessageId?: string;
  lang: Lang;
  sale: { description: string; quantity: number; amount: number };
  sales?: Array<{ description: string; quantity: number; amount: number }>;
};

export type DailyRecordConversation = {
  kind: 'daily_record_confirmation';
  dailyRecordId: string;
  sourceMessageId: string;
  record: ParsedDailyRecord;
};

export const MAX_DAILY_RECORD_AMOUNT = 100_000_000;

const MONEY_PATTERN = '(?:@\\s*)?(?:(?:tshs?|tzs|sh)\\s*)?[0-9][0-9,]*(?:\\.[0-9]+)?\\s*(?:k\\b)?\\s*(?:/=)?';
const QUANTITY_PATTERN = '[0-9]+(?:\\.[0-9]+)?';

type MoneyToken = { raw: string; value: number; start: number; end: number };

function clean(text: string): string {
  return text.toLowerCase().replace(/\r?\n/g, ' - ').replace(/\s+/g, ' ').trim();
}

function normalizeSpelling(text: string): string {
  return text
    .replace(/\bnimeuz+a\b/gi, 'nimeuza')
    .replace(/\bnimelip+a\b/gi, 'nimelipa')
    .replace(/\bnimetumi+a\b/gi, 'nimetumia')
    .replace(/\bamelip+a\b/gi, 'amelipa')
    .replace(/\bkalip+a\b/gi, 'kalipa')
    .replace(/\bki?a?la\s+moja\b/gi, 'kila moja')
    .replace(/[：]/g, ':');
}

const NUMBER_WORDS: Record<string, string> = {
  sifuri: '0', zero: '0', moja: '1', mmoja: '1', mbili: '2', tatu: '3', nne: '4', tano: '5',
  sita: '6', saba: '7', nane: '8', tisa: '9', kumi: '10', kuminamoja: '11', kuminambili: '12',
  kuminatatu: '13', kuminanne: '14', kuminatano: '15', kuminasita: '16', kuminasaba: '17',
  kuminanane: '18', kuminatisa: '19', ishirini: '20',
};

function normalizeNumberWords(text: string): string {
  const protectedPhrases: string[] = [];
  let normalized = text.replace(/\bkila\s+moja\b/gi, () => {
    const token = `__KILA_MOJA_${protectedPhrases.length}__`;
    protectedPhrases.push(token);
    return token;
  });
  const compoundNumbers: Array<[string, string]> = [
    ['kumi na moja', '11'], ['kumi na mbili', '12'], ['kumi na tatu', '13'], ['kumi na nne', '14'],
    ['kumi na tano', '15'], ['kumi na sita', '16'], ['kumi na saba', '17'], ['kumi na nane', '18'], ['kumi na tisa', '19'],
  ];
  for (const [words, number] of compoundNumbers) {
    normalized = normalized.replace(new RegExp(`\\b${words}\\b`, 'gi'), number);
  }
  for (const [word, number] of Object.entries(NUMBER_WORDS).sort((a, b) => b[0].length - a[0].length)) {
    normalized = normalized.replace(new RegExp(`\\b${word}\\b`, 'gi'), number);
  }
  return normalized.replace(/__KILA_MOJA_\d+__/g, 'kila moja');
}

function parseMoneyToken(raw: string): number | null {
  let value = raw.toLowerCase().replace(/\s+/g, '').replace(/\/$/, '').replace(/=$/, '').replace(/\/$/, '');
  value = value.replace(/^@/, '').replace(/^(?:tshs?|tzs|sh)/, '');
  const thousands = value.endsWith('k');
  if (thousands) value = value.slice(0, -1);
  const amount = Number(value.replace(/,/g, ''));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  return thousands ? amount * 1000 : amount;
}

function moneyTokens(text: string): MoneyToken[] {
  const regex = new RegExp(MONEY_PATTERN, 'gi');
  return [...text.matchAll(regex)].map((match) => ({
    raw: match[0],
    value: parseMoneyToken(match[0]) ?? 0,
    start: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length,
  }));
}

function validAmount(amount: number): boolean {
  return Number.isFinite(amount) && amount > 0 && amount <= MAX_DAILY_RECORD_AMOUNT;
}

function roundMoney(amount: number): number {
  return Math.round(amount * 100) / 100;
}

function titleCase(value: string | null): string | null {
  if (!value) return null;
  return value.split(/\s+/).filter(Boolean).map((word) => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

function stripMoney(text: string): string {
  return text.replace(new RegExp(MONEY_PATTERN, 'gi'), ' ')
    .replace(/\s+/g, ' ').replace(/[.,;:]+$/g, '').trim();
}

function stripPrefix(text: string, prefix: RegExp): string {
  return text.replace(prefix, '').replace(/\s+/g, ' ').trim();
}

function splitParts(text: string): string[] {
  return text.split(/\s+(?:na|and)\s+|\s+-\s+|\s*;\s*/i).map((part) => part.trim()).filter(Boolean);
}

function stripRepeatedSalePrefix(text: string): string {
  return text.replace(/^(?:leo\s+|today\s+)?(?:nimeuza|uza|mauzo|(?:i\s+)?sold)\s+/i, '').trim();
}

function lineTotal(line: DailyRecordLine): number {
  return roundMoney(line.quantity * line.unit_amount);
}

/**
 * Units of weight, volume, length and the containers traders actually sell by.
 *
 * Kept to words that are only ever units, so a product cannot be mistaken for
 * one. "Debe", "gunia" and "ndoo" are containers rather than true measures, but
 * that is how goods are sold here and nothing converts between them anyway —
 * the word is carried through exactly as the trader said it.
 */
const MEASURE_UNITS = [
  'kilo', 'kilos', 'kg', 'kgs', 'gramu', 'gram', 'grams',
  'lita', 'litre', 'litres', 'liter', 'liters', 'ml',
  'mita', 'metre', 'metres', 'meter', 'meters', 'futi',
  'gunia', 'magunia', 'sack', 'sacks', 'debe', 'madebe',
  'ndoo', 'pakiti', 'packet', 'packets', 'boksi', 'box',
  'rimu', 'reams', 'ream', 'bando', 'dazeni', 'dozen',
];
const UNIT_PATTERN = `(?:${MEASURE_UNITS.join('|')})`;

/**
 * A price per unit is exact; a total divided by a quantity is not. 7,500 for 2.5
 * kilos is 3,000 a kilo with nothing left over, but 7,000 for 3 litres is
 * 2,333.33 and the three lines no longer add back to 7,000.
 *
 * The draft RPC rejects a record whose lines miss the stated amount by more than
 * a cent, and rightly so. Where the division does not come out we keep today's
 * behaviour — the total is recorded without a line — rather than quietly filing
 * an amount the trader never said.
 */
function unitPriceFromTotal(total: number, quantity: number): number | null {
  if (!(quantity > 0)) return null;
  const unitAmount = roundMoney(total / quantity);
  return Math.abs(roundMoney(unitAmount * quantity) - total) <= 0.01 ? unitAmount : null;
}

/**
 * Goods sold by weight or volume, in the orders people write them:
 *
 *   sukari 2.5 kilo kwa 7500      quantity before the unit, total price
 *   mafuta lita 3 kwa 21000       unit before the quantity, total price
 *   unga kilo 5 kila kilo 2600    price stated per unit, which needs no division
 *   sukari 3 kilo kila moja 3000  the same, said the other way
 */
function parseMeasuredLine(text: string): DailyRecordLine | null {
  const perUnit = text.match(new RegExp(
    '^(.+?)\\s+(?:(' + UNIT_PATTERN + ')\\s+(' + QUANTITY_PATTERN + ')|(' + QUANTITY_PATTERN + ')\\s+(' + UNIT_PATTERN + '))'
    + '\\s+(?:kila|per|each)\\s+(?:moja|item|' + UNIT_PATTERN + ')(?:\\s+ni)?\\s+(' + MONEY_PATTERN + ')$',
    'i',
  ));
  if (perUnit) {
    const quantity = Number(perUnit[3] ?? perUnit[4]);
    const unit = (perUnit[2] ?? perUnit[5] ?? '').toLowerCase();
    const unitAmount = parseMoneyToken(perUnit[6]);
    if (Number.isFinite(quantity) && quantity > 0 && unitAmount !== null) {
      return { description: perUnit[1].trim(), quantity, unit_amount: unitAmount, unit };
    }
  }

  const withTotal = text.match(new RegExp(
    '^(.+?)\\s+(?:(' + UNIT_PATTERN + ')\\s+(' + QUANTITY_PATTERN + ')|(' + QUANTITY_PATTERN + ')\\s+(' + UNIT_PATTERN + '))'
    + '\\s+(?:kwa|for|jumla|total)\\s+(' + MONEY_PATTERN + ')$',
    'i',
  ));
  if (!withTotal) return null;
  const quantity = Number(withTotal[3] ?? withTotal[4]);
  const unit = (withTotal[2] ?? withTotal[5] ?? '').toLowerCase();
  const total = parseMoneyToken(withTotal[6]);
  if (!Number.isFinite(quantity) || quantity <= 0 || total === null) return null;
  const unitAmount = unitPriceFromTotal(total, quantity);
  if (unitAmount === null) return null;
  return { description: withTotal[1].trim(), quantity, unit_amount: unitAmount, unit };
}

function parseSwahiliUnitLine(text: string): DailyRecordLine | null {
  const match = text.match(new RegExp(
    '^(.+?)\\s+(' + QUANTITY_PATTERN + ')\\s+kila moja(?:\\s+ni)?\\s+(' + MONEY_PATTERN + ')$',
    'i',
  ));
  if (!match) return null;
  const quantity = Number(match[2]);
  const unitAmount = parseMoneyToken(match[3]);
  if (!Number.isFinite(quantity) || quantity <= 0 || unitAmount === null) return null;
  return { description: match[1].trim(), quantity, unit_amount: unitAmount };
}

function parseEnglishUnitLine(text: string): DailyRecordLine | null {
  const afterQuantity = text.match(new RegExp(
    '^(.+?)\\s+(' + QUANTITY_PATTERN + ')\\s+(?:each|per\\s+item)(?:\\s+(?:is|at))?\\s+(' + MONEY_PATTERN + ')$',
    'i',
  ));
  if (afterQuantity) {
    const quantity = Number(afterQuantity[2]);
    const unitAmount = parseMoneyToken(afterQuantity[3]);
    if (Number.isFinite(quantity) && quantity > 0 && unitAmount !== null) {
      return { description: afterQuantity[1].trim(), quantity, unit_amount: unitAmount };
    }
  }

  const beforeQuantity = text.match(new RegExp(
    '^(' + QUANTITY_PATTERN + ')\\s+(.+?)\\s+(?:each|per\\s+item)(?:\\s+(?:is|at))?\\s+(' + MONEY_PATTERN + ')$',
    'i',
  ));
  if (!beforeQuantity) return null;
  const quantity = Number(beforeQuantity[1]);
  const unitAmount = parseMoneyToken(beforeQuantity[3]);
  if (!Number.isFinite(quantity) || quantity <= 0 || unitAmount === null) return null;
  return { description: beforeQuantity[2].trim(), quantity, unit_amount: unitAmount };
}

function parseSaleLines(payload: string): DailyRecordLine[] | null {
  const parts = splitParts(payload);
  if (parts.length === 0) return null;
  const lines = parts.map((part) => {
    const normalizedPart = stripRepeatedSalePrefix(part);
    // Measured goods are tried first: "sukari 2.5 kilo kwa 7500" would otherwise
    // fall through to the total-only path and never become a line at all.
    return parseMeasuredLine(normalizedPart)
      ?? parseSwahiliUnitLine(normalizedPart)
      ?? parseEnglishUnitLine(normalizedPart);
  });
  return lines.every(Boolean) ? lines as DailyRecordLine[] : null;
}

type AmbiguousSaleLine = { description: string; quantity: number; amount: number };

function parseAmbiguousSaleLines(payload: string): AmbiguousSaleLine[] | null {
  const parts = splitParts(payload);
  if (parts.length === 0) return null;
  const lines = parts.map((part) => {
    part = stripRepeatedSalePrefix(part);
    const afterDescription = part.match(new RegExp('^(.+?)\\s+(' + QUANTITY_PATTERN + ')\\s+(' + MONEY_PATTERN + ')$', 'i'));
    if (afterDescription) {
      const quantity = Number(afterDescription[2]);
      const amount = parseMoneyToken(afterDescription[3]);
      return amount !== null && quantity > 0
        ? { description: afterDescription[1].trim(), quantity, amount }
        : null;
    }
    const beforeDescription = part.match(new RegExp('^(' + QUANTITY_PATTERN + ')\\s+(.+?)\\s+(' + MONEY_PATTERN + ')$', 'i'));
    if (beforeDescription) {
      const quantity = Number(beforeDescription[1]);
      const amount = parseMoneyToken(beforeDescription[3]);
      return amount !== null && quantity > 0
        ? { description: beforeDescription[2].trim(), quantity, amount }
        : null;
    }
    return null;
  });
  return lines.every(Boolean) ? lines as AmbiguousSaleLine[] : null;
}

function saleRecord(text: string): ParsedDailyRecord | null {
  const swahili = text.match(/^(?:leo\s+)?nimeuza\s+(.+)$/i);
  const english = text.match(/^(?:today\s+)?(?:i\s+)?sold\s+(.+)$/i);
  const payload = swahili?.[1] ?? english?.[1];
  if (!payload) return null;

  const unitLines = parseSaleLines(payload);
  if (unitLines) {
    const amount = roundMoney(unitLines.reduce((sum, line) => sum + lineTotal(line), 0));
    return { kind: 'sale', amount, partyName: null, description: null, lines: unitLines };
  }

  // Repeated "kwa <amount>" clauses are a list of item totals. The batch
  // parser owns that shape; the generic trailing-total rule below must never
  // collapse the list into one sale using only the final amount.
  const statedTotals = payload.match(new RegExp('\\b(?:kwa|for)\\s+' + MONEY_PATTERN, 'gi')) ?? [];
  if (statedTotals.length > 1) return null;

  const explicitTotal = payload.match(new RegExp('^(.+?)\\s+(?:kwa|for|jumla|total)\\s+(' + MONEY_PATTERN + ')$', 'i'));
  if (explicitTotal) {
    const amount = parseMoneyToken(explicitTotal[2]);
    if (amount !== null) {
      return { kind: 'sale', amount, partyName: null, description: explicitTotal[1].trim(), lines: [] };
    }
  }

  const tokens = moneyTokens(payload);
  if (tokens.length === 1) {
    const amount = tokens[0].value;
    const before = payload.slice(0, tokens[0].start).trim();
    if (payload.slice(tokens[0].end).trim()) return null;
    const quantityWords = before.match(new RegExp('(?:^|\\s)' + QUANTITY_PATTERN + '(?:\\s|$)'));
    const explicitTotalWord = /\b(?:kwa|for|jumla|total)\b/i.test(payload);
    const explicitCurrency = /(?:tshs?|tzs|sh)/i.test(tokens[0].raw);
    if (!quantityWords && (explicitTotalWord || explicitCurrency) && validAmount(amount)) {
      return { kind: 'sale', amount, partyName: null, description: before || null, lines: [] };
    }
  }
  return null;
}

function expenseRecord(text: string): ParsedDailyRecord | null {
  const payload = stripPrefix(text, /^(?:nimelipa|nimetumia|expense\s+(?:ya|for)|paid|spent(?:\s+on)?)\s+/i);
  if (!payload || !moneyTokens(payload).length) return null;

  const parts = splitParts(payload);
  const lines: DailyRecordLine[] = [];
  for (const part of parts) {
    const lineText = part.replace(/^(?:nimelipa|nimetumia|expense\s+(?:ya|for)|paid|spent(?:\s+on)?)\s+/i, '').trim();
    const tokens = moneyTokens(lineText);
    if (tokens.length !== 1 || tokens[0].value <= 0) return null;
    if (lineText.slice(tokens[0].end).trim()) return null;
    const description = lineText.slice(0, tokens[0].start).trim().replace(/^(?:ya|for)\s+/i, '').replace(/[:]+$/, '').trim();
    if (!description) return null;
    lines.push({ description, quantity: 1, unit_amount: tokens[0].value });
  }
  const amount = roundMoney(lines.reduce((sum, line) => sum + lineTotal(line), 0));
  return validAmount(amount)
    ? { kind: 'expense', amount, partyName: null, description: lines.length === 1 ? lines[0].description : null, lines }
    : null;
}

/**
 * Buying goods to resell, as opposed to spending on running the shop.
 *
 * Deliberately narrow: it only claims a message that says "stock" or "bidhaa"
 * outright. "nimenunua mkaa 7000" stays an expense, because charcoal is stock in
 * a charcoal shop and a cooking cost everywhere else, and the parser cannot know
 * which. That ambiguity is resolved by asking — once, upstream — not by guessing
 * here. Guessing wrong in either direction moves money between two lines of the
 * report that a trader reads very differently.
 */
function stockPurchaseRecord(text: string): ParsedDailyRecord | null {
  const payload = stripPrefix(
    text,
    /^(?:nimenunua|nimeongeza|nimeingiza|bought|purchased|added)\s+/i,
  );
  if (!payload) return null;
  // The explicit signal. Without it we do not claim the message.
  if (!/\b(stock|stoo|bidhaa|mzigo)\b/i.test(payload)) return null;

  // What came in, and how much of it. Stock purchases used to record only a
  // total, which is why stock-on-hand could not exist: you cannot subtract sales
  // from a number nobody counted. The same line shapes as a sale are accepted —
  // "daftari 100 kila moja 900", "sukari kilo 50 kwa 130000" — so a trader does
  // not have to learn a second grammar for goods coming in.
  const goods = payload
    .replace(/\b(?:stock|stoo|mzigo)\b/gi, ' ')
    .replace(/\bbidhaa\b/gi, ' ')
    .replace(/^\s*(?:ya|za|wa|of|for)\s+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  const stockLines = goods ? parseSaleLines(goods) : null;
  if (stockLines) {
    const amount = roundMoney(stockLines.reduce((sum, line) => sum + lineTotal(line), 0));
    if (validAmount(amount)) {
      return {
        kind: 'stock_purchase',
        amount,
        partyName: null,
        description: stockLines.length === 1 ? null : goods,
        lines: stockLines,
      };
    }
  }

  const tokens = moneyTokens(payload);
  if (tokens.length === 0) return null;
  const amount = tokens[tokens.length - 1].value;
  if (!validAmount(amount)) return null;

  // No quantity anywhere in the message. The purchase is still recorded — the
  // money is real — but it cannot contribute to stock counts, and the reply
  // says so rather than leaving the trader to wonder why the count did not move.
  const description = stripMoney(payload)
    .replace(/^(?:ya|za|wa|of|for)\s+/i, '')
    .replace(/[:]+$/, '')
    .trim() || null;
  return { kind: 'stock_purchase', amount, partyName: null, description, lines: [] };
}

function partyName(text: string): string | null {
  return titleCase(text.match(/^([\p{L}][\p{L}'-]*)\s+/u)?.[1] ?? null);
}

function debtRecord(text: string): ParsedDailyRecord | null {
  const party = partyName(text);
  if (!party) return null;
  const body = text.replace(/^[\p{L}][\p{L}'-]*\s+/u, '');
  const took = body.match(/^amechukua\s+(.+?)(?:\s+kwa\s+mkopo)?$/i)?.[1] ?? body;
  const unitLine = parseSwahiliUnitLine(took);
  if (unitLine) {
    const amount = lineTotal(unitLine);
    return validAmount(amount)
      ? { kind: 'debt_issued', amount, partyName: party, description: unitLine.description, lines: [unitLine] }
      : null;
  }
  const tokens = moneyTokens(body);
  if (tokens.length === 0) return null;
  const amount = tokens[tokens.length - 1].value;
  if (!validAmount(amount)) return null;
  const description = stripMoney(body).replace(/\bkwa\s+mkopo\b.*$/i, '').trim() || null;
  return { kind: 'debt_issued', amount, partyName: party, description, lines: [] };
}

function customerPaymentRecord(text: string): ParsedDailyRecord | null {
  const party = partyName(text);
  if (!party) return null;
  const tokens = moneyTokens(text);
  if (tokens.length === 0 || !validAmount(tokens[0].value)) return null;
  const referenceAmount = tokens.length > 1 && validAmount(tokens[1].value) ? tokens[1].value : null;
  return {
    kind: 'customer_payment',
    amount: tokens[0].value,
    partyName: party,
    description: referenceAmount ? 'Malipo ya deni' : null,
    lines: [],
    referenceAmount,
  };
}

// A verb says something HAPPENED. Past tense in every person, because "niliuza
// st rita wa kashia 3 kwa 13500" reached no parser at all — only the perfect
// "nimeuza" was listed — and a plain sale went to the model to improvise.
const RECORD_VERBS = new RegExp(
  '\\b(?:'
  + 'ni(?:me|li)uza|tu(?:me|li)uza|a(?:me|li)uza|uza|sold'
  + '|ni(?:me|li)lipa|a(?:me|li)lipa|kalipa|ni(?:me|li)tumia|paid|spent|expense'
  + '|ni(?:me|li)nunua|tu(?:me|li)nunua|bought|purchased'
  + '|ni(?:me|li)ongeza|ni(?:me|li)ingiza'
  + '|mkopo|loan|ananidai|customer payment'
  + ')\\b', 'i');

// A noun only NAMES the subject. On its own it is as likely to open a question
// as a record — "mauzo ya leo ni ngapi" is not a sale, and routing it into the
// write chain put a question one step away from becoming a draft.
// "bidhaa" and "mzigo" are gone: they never carried a record on their own, and
// they opened "top 5 bidhaa zangu" and "nionyeshe bidhaa zote ninazouza" into
// the write chain. Every real record that uses them also uses a verb.
const RECORD_NOUNS = /\b(?:mauzo|deni|stock|stoo)\b/i;

// Words that make a message a question even when it holds no interrogative
// about an amount: who, which, when, and the superlatives that ask for a
// ranking. "wht sold most tday" opens with a selling verb and is a question.
const QUESTIONISH = /\?|\b(?:nani|who|gani|what|which|lini|when|zaidi|sana|most|top|bora|kubwa\s+zaidi)\b/i;

const HAS_DIGITS = /[0-9]/;

const ASKING = /\?|\b(?:ngapi|shingapi|kiasi gani|gani|nini|lini|vipi|how much|how many|what|which|when)\b/i;

// Asking FOR the figure, as opposed to merely ending in a question mark.
const ASKING_FOR_THE_FIGURE = /\b(?:ngapi|shingapi|kiasi gani|how much|how many)\b/i;

// Any amount of money at all. "kwa 7500", "TSh 15,000", "15000/=".
const HAS_MONEY = /(?:tshs?|tzs|sh)\s*[0-9]|[0-9][0-9,]{2,}|\b(?:kwa|for|kila moja|each)\s+[0-9]/i;

function looksLikeDailyRecord(text: string): boolean {
  if (RECORD_VERBS.test(text)) {
    // REGRESSION, mine, from yesterday: adding the simple past so "niliuza st
    // rita 3 kwa 13500" would be recorded also caught "Jana niliuza shingapi?"
    // — a question about yesterday's takings — and pushed it into the write
    // chain, which answered "write a positive amount". The verb is the same in
    // both; what differs is that one CARRIES a figure and the other ASKS for
    // one. A tag question ("…ni sawa?") still carries its amount and stays.
    if (ASKING_FOR_THE_FIGURE.test(text) && !HAS_MONEY.test(text)) return false;
    // A selling verb with no number anywhere, asking who or which or what sold
    // most, is a question about the past — not a record of it. Found by running
    // the eval set for the first time: "nani ananidai?" and "wht sold most
    // tday" were both one step from becoming a draft.
    if (!HAS_DIGITS.test(text) && QUESTIONISH.test(text)) return false;
    return true;
  }
  // A bare noun needs a number to be a record. Every real one carries an amount
  // or a quantity, and without that "mauzo ya wiki hii" was answered by asking
  // the shopkeeper to write a positive amount.
  return RECORD_NOUNS.test(text) && HAS_DIGITS.test(text) && !ASKING.test(text);
}

function hasNegativeOrZeroAmount(text: string): boolean {
  if (/[-−]\s*(?:(?:tshs?|tzs|sh)\s*)?[0-9]/i.test(text)) return true;
  return moneyTokens(text).some((token) => token.value <= 0);
}

function question(reason: 'amount' | 'message' | 'ambiguity' | 'limit', lang: Lang): string {
  if (reason === 'ambiguity') {
    return lang === 'sw' ? 'Bei hii ni jumla au bei ya kila moja?' : 'Is this amount the total or the price for each item?';
  }
  if (reason === 'limit') {
    return lang === 'sw'
      ? 'Kiasi hiki ni kikubwa sana kwa rekodi moja. Tafadhali gawa rekodi au hakikisha kiasi ni sahihi.'
      : 'That amount is too large for one record. Split the record or check the amount.';
  }
  if (reason === 'amount') {
    return lang === 'sw'
      ? 'Nimeona ujumbe wa biashara, lakini sijapata kiasi sahihi. Andika kiasi chanya, mfano: *nimeuza bidhaa kwa TSh 15000*.'
      : 'I found a business record, but the amount is unclear. Send a positive amount, for example: *sold goods for TZS 15000*.';
  }
  return lang === 'sw'
    ? 'Sijaelewa vizuri. Andika mauzo, matumizi, mkopo, au malipo pamoja na kiasi, kisha nitakuuliza uthibitisho.'
    : 'I did not understand that clearly. Say sale, expense, debt, or customer payment with an amount, then I will ask you to confirm.';
}

function enforceLimit(parsed: ParsedDailyRecord, lang: Lang): DailyRecordParse {
  if (!validAmount(parsed.amount) || parsed.lines.some((line) => !validAmount(lineTotal(line)))) {
    const isLimit = parsed.amount > MAX_DAILY_RECORD_AMOUNT;
    return { kind: 'clarify', reason: isLimit ? 'limit' : 'amount', question: question(isLimit ? 'limit' : 'amount', lang) };
  }
  return { kind: 'parsed', record: { ...parsed, confidence: parsed.confidence ?? (parsed.lines.length > 0 ? 0.98 : 0.94) } };
}

export function isDailyRecordCandidate(text: string | null | undefined): boolean {
  return looksLikeDailyRecord(clean(String(text ?? '')));
}

export function parseDailyRecord(text: string | null | undefined, lang: Lang = 'sw'): DailyRecordParse {
  const originalText = String(text ?? '').trim();
  const value = normalizeNumberWords(normalizeSpelling(clean(originalText)));
  if (!value || !looksLikeDailyRecord(value)) return { kind: 'none' };
  if (hasNegativeOrZeroAmount(value)) return { kind: 'clarify', reason: 'amount', question: question('amount', lang) };

  let parsed: ParsedDailyRecord | null = null;
  if (/\b(amelipa|kalipa|customer payment|paid me|paid the debt)\b/i.test(value)) {
    parsed = customerPaymentRecord(value);
  } else if (/\b(mkopo|loan|ananidai|owes me|deni)\b/i.test(value)) {
    parsed = debtRecord(value);
  } else if (/\b(nimeuza|uza|sold|mauzo)\b/i.test(value)) {
    parsed = saleRecord(value);
  } else if (/\b(stock|stoo|bidhaa|mzigo)\b/i.test(value)
             && /\b(nimenunua|nimeongeza|nimeingiza|bought|purchased|added)\b/i.test(value)) {
    // Before expense on purpose: "nimenunua stock ya sukari 50000" is an
    // investment in goods, not a running cost.
    parsed = stockPurchaseRecord(value);
  } else if (/\b(nimelipa|nimetumia|expense|paid|spent)\b/i.test(value)) {
    parsed = expenseRecord(value);
  }

  if (parsed) return enforceLimit(parsed, lang);
  const tokens = moneyTokens(value);
  if (/\b(nimeuza|uza|sold|mauzo)\b/i.test(value) && /\bkila moja\b/i.test(value) && tokens.length === 1) {
    return { kind: 'clarify', reason: 'amount', question: question('amount', lang) };
  }
  if (/\b(nimeuza|uza|sold|mauzo)\b/i.test(value) && tokens.length >= 2) {
    const payload = value.replace(/^(?:leo\s+)?(?:nimeuza|uza|sold|mauzo)\s+/i, '');
    const sales = parseAmbiguousSaleLines(payload);
    const draft: DailyRecordClarification | undefined = sales && sales.length > 0
      ? { kind: 'daily_record_clarification' as const, originalText, lang, sale: sales[0] }
      : undefined;
    if (draft && sales) {
      draft.sale = sales[0];
      draft.sales = sales;
    }
    return { kind: 'clarify', reason: 'ambiguity', question: question('ambiguity', lang), draft };
  }
  return { kind: 'clarify', reason: tokens.length ? 'message' : 'amount', question: question(tokens.length ? 'message' : 'amount', lang) };
}

export type DailyRecordPriceChoice = 'unit_price' | 'total';

export function parseDailyRecordPriceChoice(text: string | null | undefined): DailyRecordPriceChoice | null {
  const value = String(text ?? '').toLowerCase().replace(/[.!?]/g, '').replace(/\s+/g, ' ').trim();
  if (/^(?:bei ya kila moja|kila moja|bei kwa kila moja|unit price|per item|each|kwa kila moja)$/.test(value)) return 'unit_price';
  if (/^(?:jumla|bei ya jumla|total|full total|overall)$/.test(value)) return 'total';
  return null;
}

export function resumeDailyRecordClarification(
  clarification: DailyRecordClarification,
  choice: DailyRecordPriceChoice,
): DailyRecordParse {
  const sales = clarification.sales ?? [clarification.sale];
  if (sales.length === 0 || sales.some((sale) => !Number.isFinite(sale.quantity) || sale.quantity <= 0 || !validAmount(sale.amount))) {
    return { kind: 'clarify', reason: 'amount', question: question('amount', clarification.lang) };
  }
  const lines = sales.map(({ description, quantity, amount }) => ({
    description,
    quantity,
    unit_amount: choice === 'unit_price' ? amount : roundMoney(amount / quantity),
  }));
  const total = roundMoney(lines.reduce((sum, line) => sum + lineTotal(line), 0));
  return enforceLimit({
    kind: 'sale', amount: total, partyName: null, description: null,
    lines, confidence: 0.97,
  }, clarification.lang);
}

export type HistoricalDailyRecordPrice = { description: string; unit_amount: number };

/** Compare against confirmed company history only. This helper never rejects or
 * changes a record; callers surface the warning and still require confirmation. */
export function detectDailyRecordPriceAnomalies(
  record: ParsedDailyRecord,
  history: HistoricalDailyRecordPrice[],
  threshold = 0.5,
): string[] {
  const warnings: string[] = [];
  for (const line of record.lines) {
    const matches = history.filter((item) => item.description.trim().toLowerCase() === line.description.trim().toLowerCase() && item.unit_amount > 0);
    if (matches.length < 2) continue;
    const average = matches.reduce((sum, item) => sum + item.unit_amount, 0) / matches.length;
    if (Math.abs(line.unit_amount - average) / average >= threshold) {
      warnings.push(`Unusual price for ${line.description}: ${money(line.unit_amount, 'en')} vs historical average ${money(average, 'en')}.`);
    }
  }
  return warnings;
}

function kindLabel(kind: DailyRecordKind, lang: Lang): string {
  if (lang === 'sw') {
    return ({
      sale: 'Mauzo', expense: 'Matumizi', stock_purchase: 'Ununuzi wa stock',
      debt_issued: 'Mkopo uliotolewa', customer_payment: 'Malipo ya mteja',
    })[kind];
  }
  return ({
    sale: 'Sale', expense: 'Expense', stock_purchase: 'Stock purchase',
    debt_issued: 'Debt issued', customer_payment: 'Customer payment',
  })[kind];
}

function money(amount: number, lang: Lang): string {
  const currency = lang === 'sw' ? 'TSh' : 'TZS';
  return currency + ' ' + amount.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

export function dailyRecordStorageDescription(record: ParsedDailyRecord, lang: Lang = 'en'): string | null {
  if (!record.description && !record.referenceAmount) return null;
  const description = record.description ?? '';
  return record.referenceAmount
    ? description + (description ? '; ' : '') + 'balance reference: ' + money(record.referenceAmount, lang)
    : description;
}

export function buildDailyRecordConfirmation(record: ParsedDailyRecord, lang: Lang): string {
  const lines = [
    lang === 'sw' ? 'Nimeelewa:' : 'I understood:',
    (lang === 'sw' ? 'Aina' : 'Type') + ': ' + kindLabel(record.kind, lang),
  ];
  if (record.partyName) lines.push((lang === 'sw' ? 'Mhusika' : 'Party') + ': ' + record.partyName);
  if (record.lines.length > 0) {
    if (record.kind === 'sale' || record.kind === 'debt_issued') lines.push(lang === 'sw' ? 'Bidhaa:' : 'Items:');
    for (const line of record.lines) {
      const name = record.kind === 'expense' && lang === 'sw' ? titleCase(line.description) : line.description;
      if (line.quantity === 1 && record.kind === 'expense') {
        lines.push('- ' + name + ': ' + money(line.unit_amount, lang));
      } else {
        // The unit is shown so the trader can check the reading before
        // confirming: "2.5 × 3,000" could be kilos or pieces, and only they know.
        const measure = line.unit ? ' ' + line.unit : '';
        lines.push('- ' + name + ': ' + line.quantity + measure + ' × ' + money(line.unit_amount, lang) + ' = ' + money(lineTotal(line), lang));
      }
    }
  } else if (record.description) {
    lines.push((lang === 'sw' ? 'Maelezo' : 'Details') + ': ' + record.description);
  }
  if (record.referenceAmount) {
    const balance = roundMoney(record.referenceAmount - record.amount);
    lines.push((lang === 'sw' ? 'Mabaki ya rejea' : 'Reference balance') + ': ' + money(balance, lang));
  }
  if (record.warnings?.length) {
    lines.push('', lang === 'sw' ? '⚠️ Tahadhari ya bei:' : '⚠️ Price warning:');
    lines.push(...record.warnings.map((warning) => '- ' + warning));
    lines.push(lang === 'sw' ? 'Thibitisha kwa makusudi kwa kujibu NDIYO.' : 'Confirm explicitly by replying YES.');
  }
  lines.push((lang === 'sw' ? 'Jumla' : 'Total') + ': *' + money(record.amount, lang) + '*', '');
  lines.push(lang === 'sw'
    ? 'Jibu *NDIYO* kuthibitisha, au *HAPANA* kughairi.'
    : 'Reply *YES* to confirm, or *NO* to cancel.');
  return lines.join('\n');
}

export function buildDailyRecordConfirmationChunks(
  record: ParsedDailyRecord,
  lang: Lang,
  maxChars = 3200,
): string[] {
  const text = buildDailyRecordConfirmation(record, lang);
  return splitWhatsAppText(text, maxChars);
}

export function splitWhatsAppText(text: string, maxChars = 3200): string[] {
  if (text.length <= maxChars) return [text];

  const chunks: string[] = [];
  let current = '';
  for (const line of text.split('\n')) {
    const next = current ? `${current}\n${line}` : line;
    if (next.length <= maxChars) {
      current = next;
      continue;
    }
    if (current) chunks.push(current);
    current = line;
  }
  if (current) chunks.push(current);
  return chunks;
}

export function isDailyRecordConfirmation(text: string | null | undefined): boolean {
  return /^(yes|ok|okay|confirm|sawa|ndio|ndiyo|thibitisha|hakika)\b/i.test(String(text ?? '').trim());
}

export function isDailyRecordRejection(text: string | null | undefined): boolean {
  return /^(no|hapana|cancel|ghairi|toka|futa|acha|sitisha)\b/i.test(String(text ?? '').trim());
}

export function buildDailyRecordConfirmed(record: ParsedDailyRecord, lang: Lang): string {
  return lang === 'sw'
    ? 'Sawa. ' + kindLabel(record.kind, lang) + ' ya *' + money(record.amount, lang) + '* imethibitishwa.\n\nAngalia rekodi zako: https://risip.online/daily-records'
    : 'Done. The ' + kindLabel(record.kind, lang).toLowerCase() + ' of *' + money(record.amount, lang) + '* is confirmed.\n\nView your records: https://risip.online/daily-records';
}

export function buildDailyRecordPending(record: ParsedDailyRecord, lang: Lang): string {
  return lang === 'sw'
    ? 'Nimehifadhi draft ya ' + kindLabel(record.kind, lang).toLowerCase() + ' ya ' + money(record.amount, lang) + '. Bado inasubiri owner au accountant athibitishe.'
    : 'I saved the ' + kindLabel(record.kind, lang).toLowerCase() + ' draft for ' + money(record.amount, lang) + '. It is waiting for an owner or accountant to confirm.';
}

export function buildDailyRecordCancelled(lang: Lang): string {
  return lang === 'sw' ? 'Sawa. Draft imeghairiwa.' : 'Okay. The draft was cancelled.';
}
