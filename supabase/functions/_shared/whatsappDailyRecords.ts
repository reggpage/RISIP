import { pendingEscapeHint, type Lang } from './whatsappIntent.ts';
import { correctControlWords } from './whatsappSpelling.ts';
import { UNITS } from './whatsappStock.ts';


/**
 * Manually recorded by the trader, never verified against any provider — Risip
 * integrates with no payment gateway. Null means they did not say, and null is
 * never guessed. "Deni" is deliberately absent: credit is debt_issued.
 */
export type DailyRecordPaymentMethod = 'cash' | 'mobile_money' | 'bank' | 'other';
export type DailyRecordKind =
  | 'sale' | 'expense' | 'debt_issued' | 'customer_payment' | 'stock_purchase'
  // Bucha, phase 1. Each is a distinct accounting fact that must never be
  // folded into one above it: a spoiled kilo is not an expense, goods taken
  // home are not a sale, and money owed TO a supplier is not money owed BY a
  // customer.
  | 'stock_loss' | 'owner_use' | 'supplier_payable' | 'supplier_payment'
  | 'whole_animal_procurement' | 'whole_animal_breakdown';

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
  /**
   * How the trader said they were paid. Manually recorded metadata, never
   * verified against any provider. Undefined and null both mean unstated, and
   * unstated is never filled in with a guess. "Deni" is not a value here:
   * credit is a kind of its own.
   */
  paymentMethod?: DailyRecordPaymentMethod | null;
  /** The trader's own word for why stock was lost. Only for kind 'stock_loss'. */
  lossReason?: string | null;
  /** Validated transaction time. Null/undefined preserves today's behaviour. */
  occurredAt?: string | null;
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
  /**
   * Phrases this sale was read out of — "chips yai" = chips kavu + yai.
   *
   * Carried through to the confirmation so the reading can be offered for
   * saving the moment the sale is safely recorded, and never before it.
   */
  combos?: unknown[];
};

export const MAX_DAILY_RECORD_AMOUNT = 100_000_000;

// "/=" and "/-" both mean shillings on a Tanzanian receipt, and both get typed.
// MEASURED (scripts/interrogate.ts): "nimelipa umeme 20000/=" recorded twenty
// thousand; "nimelipa umeme 20000/-" recorded nothing and asked what the amount
// was, because only one of the two suffixes was here.
const MONEY_PATTERN = '(?:@\\s*)?(?:(?:tshs?|tzs|sh)\\s*)?[0-9][0-9,]*(?:\\.[0-9]+)?\\s*(?:k\\b)?\\s*(?:/[=-])?';
const QUANTITY_PATTERN = '[0-9]+(?:\\.[0-9]+)?';

type MoneyToken = { raw: string; value: number; start: number; end: number };

function clean(text: string): string {
  // One slip in a decision-carrying word is corrected here, at the single point
  // every reader of this file passes through — including isDailyRecordCandidate,
  // which decides whether a message is a record at all. "nimueza" is a sale.
  // See whatsappSpelling.ts for what may and may not be rewritten.
  return correctControlWords(text)
    .toLowerCase().replace(/\r?\n/g, ' - ').replace(/\s+/g, ' ').trim();
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

/** A fraction of whatever measure it qualifies. Shop-independent arithmetic. */
const FRACTIONS: Record<string, number> = { nusu: 0.5, robo: 0.25, theluthi: 0.333333 };

const NUMBER_WORDS: Record<string, string> = {
  sifuri: '0', zero: '0', moja: '1', mmoja: '1', mbili: '2', tatu: '3', nne: '4', tano: '5',
  sita: '6', saba: '7', nane: '8', tisa: '9', kumi: '10', kuminamoja: '11', kuminambili: '12',
  kuminatatu: '13', kuminanne: '14', kuminatano: '15', kuminasita: '16', kuminasaba: '17',
  kuminanane: '18', kuminatisa: '19', ishirini: '20',
  // The tens. Without them "hamsini" was not a number at all, so "nimelipa
  // mshahara hamsini elfu" had no amount in it.
  thelathini: '30', arobaini: '40', hamsini: '50', sitini: '60',
  sabini: '70', themanini: '80', tisini: '90',
};

/**
 * The words that make a number BIG.
 *
 * MEASURED FAILURE (scripts/interrogate.ts, chaos templates): "nimelipa umeme
 * elfu ishirini" — twenty thousand shillings — was recorded as **TSh 20**.
 * "laki mbili" became 2. The digit table above turned "ishirini" into 20 and
 * then nothing multiplied it, so the message parsed cleanly, confirmed cleanly,
 * and put a number three orders of magnitude too small into the ledger. A
 * failure that parses is worse than one that does not: nobody is asked to check
 * it.
 *
 * This is how money is said out loud in Tanzania. "Elfu tano" is not slang and
 * not an edge case; it is the default.
 */
const MULTIPLIER_WORDS: Record<string, number> = {
  mia: 100, elfu: 1000, elf: 1000, laki: 100_000, milioni: 1_000_000, milion: 1_000_000,
};
const MULTIPLIERS = Object.keys(MULTIPLIER_WORDS).join('|');

/**
 * Collapses "elfu 7 na mia 5" into 7500.
 *
 * Each resolved chunk is wrapped in a sentinel so the final pass can tell a
 * number that CAME FROM a multiplier from an ordinary number standing next to
 * one. Without that, "nimeuza daftari 5 na elfu 2" would add the five notebooks
 * to the two thousand shillings.
 *
 * A multiplier absorbs the compound that follows it — "elfu ishirini na tano"
 * is twenty-five thousand, not twenty thousand and five — but stops at the next
 * multiplier, because "elfu saba na mia tano" is seven thousand five hundred.
 */
function collapseMultipliers(text: string): string {
  const open = '⸢';
  const close = '⸣';
  let out = text;

  // <multiplier> <number> [na <number>]
  out = out.replace(
    new RegExp(`\\b(${MULTIPLIERS})\\s+([0-9]+(?:\\.[0-9]+)?)(?:\\s+na\\s+([0-9]+(?:\\.[0-9]+)?))?(?!\\s*(?:${MULTIPLIERS})\\b)`, 'gi'),
    (_all, word: string, first: string, second: string | undefined) => {
      const scale = MULTIPLIER_WORDS[word.toLowerCase()];
      const value = (Number(first) + (second === undefined ? 0 : Number(second))) * scale;
      return `${open}${value}${close}`;
    },
  );
  // <number> <multiplier> — "5 elfu", the order English speakers reach for.
  out = out.replace(
    new RegExp(`\\b([0-9]+(?:\\.[0-9]+)?)\\s+(${MULTIPLIERS})\\b`, 'gi'),
    (_all, first: string, word: string) =>
      `${open}${Number(first) * MULTIPLIER_WORDS[word.toLowerCase()]}${close}`,
  );
  // Two resolved chunks joined by "na" are one amount: 7000 na 500 → 7500.
  const joined = new RegExp(`${open}([0-9.]+)${close}\\s+na\\s+${open}([0-9.]+)${close}`, 'g');
  while (joined.test(out)) {
    out = out.replace(joined, (_all, a: string, b: string) => `${open}${Number(a) + Number(b)}${close}`);
  }
  return out.replace(new RegExp(`[${open}${close}]`, 'g'), '');
}

export function normalizeNumberWords(text: string): string {
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
  // "nyama kilo moja na nusu" is one and a half kilos, not one kilo and a
  // separate thing called nusu. Only a fraction directly after a number counts:
  // a bare "nusu" or "robo" is left alone, because for a shop that sells oil
  // those are the names of its measures, not halves of anything.
  normalized = normalized
    .replace(/\b([0-9]+)\s+na\s+nusu\b/gi, (_all, whole: string) => `${Number(whole) + 0.5}`)
    .replace(/\b([0-9]+)\s+na\s+robo\b/gi, (_all, whole: string) => `${Number(whole) + 0.25}`)
    .replace(/\b([0-9]+)\s+na\s+theluthi\b/gi, (_all, whole: string) => `${Number(whole) + 0.33}`);

  // MEASURED FAILURE, on the butcher's most ordinary sentence:
  //
  //   "nimeuza nyama nusu kilo kwa 12000"  -> 12,000 recorded, NO product line
  //   "nimeuza nyama robo kwa 6000"        ->  6,000 recorded, NO product line
  //
  // The money went in and the meat never left the shelf. A shop cannot be
  // robbed of something its own records say it never sold, so every fraction
  // sale was invisible to the very count meant to catch theft.
  //
  // "kilo moja na nusu" already worked, because a fraction AFTER a digit was
  // handled. A fraction standing IN a digit's place was not.
  //
  // The note above still holds: for an oil shop "robo" and "nusu" are the names
  // of its measures. That is precisely why a bare one becomes a COUNT OF THAT
  // MEASURE ("robo 1") — the same shape "robo 2" already produces — instead of
  // 0.25 of something unnamed. Only when a real unit follows does the fraction
  // resolve into it, where its meaning is beyond doubt.
  normalized = normalized
    // "nusu na robo kilo" -> kilo 0.75, before the list splitter can read that
    // "na" as a separator between two different goods.
    .replace(new RegExp(String.raw`\bnusu\s+na\s+robo\s+(${UNITS})\b`, 'gi'), (_all, unit: string) => `${unit} 0.75`)
    .replace(/\bnusu\s+na\s+robo\b/gi, 'robo 3')
    // "nusu kilo" -> kilo 0.5   |   "kilo nusu" -> kilo 0.5
    .replace(
      new RegExp(String.raw`\b(nusu|robo|theluthi)\s+(${UNITS})\b`, 'gi'),
      (_all, fraction: string, unit: string) => `${unit} ${FRACTIONS[fraction.toLowerCase()]}`,
    )
    .replace(
      new RegExp(String.raw`\b(${UNITS})\s+(nusu|robo|theluthi)\b`, 'gi'),
      (_all, unit: string, fraction: string) => `${unit} ${FRACTIONS[fraction.toLowerCase()]}`,
    )
    // A bare fraction closing the phrase — "nyama robo kwa 6000" — is one of
    // that measure. Guarded so "robo 700" in a price list is never touched.
    .replace(/\b(nusu|robo|theluthi)(?=\s+(?:kwa|@)\b|\s*$)/gi, '$1 1');
  // Last, so "elfu moja na nusu" is one and a half thousand and not one
  // thousand plus a half of something.
  normalized = collapseMultipliers(normalized);
  return normalized.replace(/__KILA_MOJA_\d+__/g, 'kila moja');
}

function parseMoneyToken(raw: string): number | null {
  let value = raw.toLowerCase().replace(/\s+/g, '')
    .replace(/\/[=-]$/, '').replace(/\/$/, '').replace(/=$/, '').replace(/\/$/, '');
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
  return text.replace(SALE_OPENING, '').trim();
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
/*
 * MEASURED FAILURE, and the fourth time this same vocabulary has drifted in a
 * private copy. This list had no trei, dumu, kreti or tenga, so of twelve real
 * restock lines from a chips vendor —
 *
 *   nimenunua viazi gunia 2 kwa 90000   -> viazi, 2 gunia at 45,000   ✓
 *   nimenunua mayai trei 5 kwa 60000    -> 60,000, product unknown    ✗
 *
 * — the shillings were right every time but eggs, cooking oil, soda and water
 * recorded no product and no quantity. The money balanced, so nothing looked
 * broken; the shop simply could not tell you what it had bought.
 *
 * So it is now derived from the one shared list rather than restated. Adding a
 * unit in whatsappStock.ts reaches this parser by construction.
 */
const MEASURE_UNITS = [
  ...UNITS.split('|'),
  // Plurals and English forms the shared list has no reason to carry, since it
  // exists to RECOGNISE a measure the trader typed, not to inflect one.
  'kgs', 'gram', 'grams', 'litres', 'liters', 'metre', 'metres', 'meter', 'meters',
  'magunia', 'sack', 'sacks', 'madebe', 'packet', 'packets', 'box', 'boxes',
  'reams', 'bando', 'dozen', 'matenga', 'tenga', 'madumu', 'ream',
];
// Longest first: alternation is first-match, so "kilo" ahead of "kilos" would
// claim the stem and leave a stray "s" for the product name to inherit.
const UNIT_PATTERN = `(?:${[...new Set(MEASURE_UNITS)].sort((a, b) => b.length - a.length).join('|')})`;

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
  const swahili = text.match(/^(?:leo\s+)?(?:ni(?:me|li)uza|tu(?:me|li)uza)\s+(.+)$/i);
  const english = text.match(/^(?:today\s+)?(?:i\s+|we\s+)?sold\s+(.+)$/i);
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
  const payload = stripPrefix(text, EXPENSE_OPENING);
  if (!payload || !moneyTokens(payload).length) return null;

  const parts = splitParts(payload);
  const lines: DailyRecordLine[] = [];
  for (const part of parts) {
    const lineText = part.replace(EXPENSE_OPENING, '').trim();
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
/**
 * The verbs that open a message about goods COMING IN.
 *
 * Exported for the same reason UNITS and PRICE_TALK are: the bare-quantity
 * sale parser has to refuse exactly the sentences this one claims, and every
 * time the two lists were maintained separately they drifted and a stock
 * arrival was recorded as a sale. Twice now, with two different words —
 * "mzigo" last time, "nimeingiza" this time. One list, imported.
 */
export const STOCK_ARRIVAL_VERBS = 'nimenunua|nilinunua|tumenunua|nimeongeza|naongeza|nimeingiza|nimeweka|bought|purchased|added';

function stockPurchaseRecord(text: string): ParsedDailyRecord | null {
  const payload = stripPrefix(
    text,
    new RegExp(`^(?:${STOCK_ARRIVAL_VERBS})\\s+`, 'i'),
  );
  if (!payload) return null;
  // The explicit signal — "nimenunua STOCK ya sukari" — or an unmistakable one:
  // goods, a quantity and a price.
  //
  // MEASURED FAILURE: "nimenunua vitabu 10 kila moja 7000" was answered
  // "Sijaelewa vizuri", while the identical sentence with "nimeuza" recorded
  // perfectly. Restocking is half the ledger and half the stock count, and a
  // shopkeeper does not say the word "stock" when they say what they bought.
  //
  // A purchase with no quantity is still not claimed here: "nimenunua chakula
  // 5000" is as likely to be lunch as goods, and guessing turns a running cost
  // into an investment in stock that will never be sold.
  const declared = /\b(stock|stoo|bidhaa|mzigo)\b/i.test(payload);

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
  // Without the word, a quantity has to stand in its place.
  const quantified = Boolean(stockLines?.every((line) => (line.quantity ?? 0) > 0));
  if (stockLines && (declared || quantified)) {
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
  const chosen = tokens[tokens.length - 1];
  const amount = chosen.value;
  if (!validAmount(amount)) return null;

  // MEASURED FAILURE: "nimeingiza mzigo mpya wa mayai trei 3" — three TRAYS
  // arriving — was recorded as a stock purchase of TSh 3. parseSaleLines could
  // not read "mayai trei 3" as a quantity line (the unit word sits between the
  // product and its number), so control fell to here, where moneyTokens has no
  // concept of a unit and simply took the last bare number in the sentence.
  //
  // MEASURED FAILURE, MINE, from the first attempt at this guard: it refused
  // any payload containing a unit word followed by a digit ANYWHERE, which also
  // threw away "nimenunua mayai trei 5 kwa 60000" — a fully priced restock
  // whose amount is plainly the 60,000 after "kwa". Four of a chips vendor's
  // main goods (mayai, mafuta, soda, maji) stopped recording entirely.
  //
  // The question was never "does a unit word appear" but "is the number I am
  // about to call money actually a COUNT".
  //
  // Two facts together settle it. A sentence that attaches a number to a MEASURE
  // ("trei 3", "gunia 2") is enumerating quantities. In such a sentence, a final
  // number carrying no money marker is one more quantity, not the price:
  //
  //   "mayai trei 5 kwa 60000"      -> enumerates, but 60,000 follows "kwa". Money.
  //   "trei 3 na mayai 15 leo"      -> enumerates, 15 follows a PRODUCT. A count.
  //   "stock ya sukari 130000"      -> enumerates nothing. Untouched, still money.
  //
  // Checking only the token before the amount was not enough: in the bug the
  // amount followed "mayai", a product, so a unit-word test right there saw
  // nothing wrong.
  const enumeratesQuantities = new RegExp(`\\b(?:${UNITS})\\s+[0-9]`, 'i').test(payload);
  const amountLooksLikeMoney =
    /(?:\b(?:kwa|bei|jumla|total|for|at|each)\b|\bkila\s+moja\b|@)\s*(?:tshs?|tzs|sh)?\s*$/i
      .test(payload.slice(0, chosen.start))
    || /(?:tshs?|tzs|sh)\s*[0-9]|[0-9]\s*(?:\/=|\/-|k\b)/i.test(chosen.raw);
  if (enumeratesQuantities && !amountLooksLikeMoney) return null;

  // No quantity anywhere in the message. The purchase is still recorded — the
  // money is real — but it cannot contribute to stock counts, and the reply
  // says so rather than leaving the trader to wonder why the count did not move.
  const description = stripMoney(payload)
    .replace(/^(?:ya|za|wa|of|for)\s+/i, '')
    // The preposition the price was hanging off, now dangling: "daftari kwa".
    .replace(/\s+(?:kwa|for|at|ya|za|wa|of)\s*$/i, '')
    .replace(/[:]+$/, '')
    .trim() || null;
  // Undeclared and unquantified: two numbers — a count and a price — are what
  // separate goods from lunch. "nimenunua daftari 100 kwa 120000" is a restock
  // whose quantity could not be read cleanly; "nimenunua chakula 5000" is not a
  // restock at all, and turning it into one would put a lunch on the shelf.
  if (!declared && (payload.match(/[0-9][0-9,.]*/g) ?? []).length < 2) return null;
  return { kind: 'stock_purchase', amount, partyName: null, description, lines: [] };
}

/**
 * Everything before the verb, which is more of the name than the first word.
 *
 * "Mama Asha amechukua sukari 12000" recorded a debt against "Mama" — and so
 * did Mama Neema's, and Mama Rehema's. Three customers, one debtor, and no way
 * to tell whose money it was. Titles are how most customers in a duka are
 * named, so the whole run of words up to the verb is the name.
 */
const PARTY_VERB = /\s+(?:a(?:me|li)(?:chukua|lipa|uza)|wamechukua|kachukua|kalipa|ananidai|anadaiwa|owes|paid|took)\b/iu;

function partyName(text: string): string | null {
  const upToVerb = text.match(/^((?:[\p{L}][\p{L}'’-]*)(?:\s+[\p{L}][\p{L}'’-]*){0,2})(?=\s)/u)?.[1];
  const verbAt = text.search(PARTY_VERB);
  if (upToVerb && verbAt > 0) {
    const before = text.slice(0, verbAt).trim();
    // Only when the whole run before the verb is short and word-shaped: a
    // sentence with numbers or six words in front of the verb is not a name.
    const words = before.split(/\s+/);
    if (words.length <= 3 && words.every((word) => /^[\p{L}][\p{L}'’-]*$/u.test(word))) {
      return titleCase(before);
    }
  }
  return titleCase(text.match(/^([\p{L}][\p{L}'-]*)\s+/u)?.[1] ?? null);
}

function debtRecord(text: string): ParsedDailyRecord | null {
  // MEASURED (scripts/interrogate.ts, chaos templates): "nimeuza daftari 3
  // mkopo" — three notebooks sold on credit — was recorded as a DEBT OF THREE
  // SHILLINGS. partyName read "nimeuza" as a customer, and the quantity was
  // then the only number left to be the amount.
  //
  // A debt is money owed BY SOMEBODY. The shopkeeper writing about their own
  // selling is not that somebody, and a sentence that opens in the first person
  // has no customer in it at all.
  if (/^(?:leo\s+|today\s+)?(?:ni|tu)(?:me|li)\w+/i.test(text.trim())) return null;
  const party = partyName(text);
  if (!party) return null;
  // As many words as the name took, not one: "Mama Asha amechukua sukari" left
  // "asha amechukua sukari" behind as the description of what she took.
  const body = text.split(/\s+/).slice(party.split(' ').length).join(' ');
  const took = body
    .replace(/^(?:a(?:me|li)chukua|wamechukua|kachukua)\s+/i, '')
    .replace(/\bkwa\s+(?:mkopo|deni)\b/ig, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const unitLine = parseSwahiliUnitLine(took);
  if (unitLine) {
    const amount = lineTotal(unitLine);
    return validAmount(amount)
      ? { kind: 'debt_issued', amount, partyName: party, description: unitLine.description, lines: [unitLine] }
      : null;
  }
  const tokens = moneyTokens(took);
  if (tokens.length === 0) return null;
  const amount = tokens[tokens.length - 1].value;
  if (!validAmount(amount)) return null;
  // A bare number under a hundred, with nothing in the sentence saying it is
  // money, is a QUANTITY. "Juma amechukua daftari 3" is three notebooks, not
  // three shillings, and the cheapest thing on this shelf is two hundred.
  // Asking is the only honest answer; guessing here writes a debt that is wrong
  // by three orders of magnitude and looks perfectly ordinary in the ledger.
  const saysMoney = /\b(?:kwa|tshs?|tzs|sh|shilingi|elfu|laki|milioni|mia)\b|[0-9]\s*(?:\/[=-]|k\b)|[0-9],[0-9]{3}/i
    .test(took);
  if (!saysMoney && amount < 100) return null;
  const description = stripMoney(took)
    .replace(/\bkwa\s+mkopo\b.*$/i, '')
    .replace(/\s+/g, ' ')
    .trim() || null;
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
  + '|ni(?:me|li)lipa|tu(?:me|li)lipa|a(?:me|li)lipa|kalipa|ni(?:me|li)tumia|tu(?:me|li)tumia|paid|spent|expense'
  + '|ni(?:me|li)nunua|tu(?:me|li)nunua|bought|purchased'
  + '|ni(?:me|li)ongeza|ni(?:me|li)ingiza'
  + '|mkopo|loan|ananidai|customer payment'
  // Third person only. "amechukua" is how credit is described in a duka — a
  // named person TOOK goods — while "nimechukua" is the shopkeeper moving their
  // own stock and is nobody's debt.
  + '|a(?:me|li)chukua|wamechukua|kachukua'
  + ')\\b', 'i');

// MEASURED (scripts/interrogate.ts): "tumeuza daftari 5 kwa 7500" — WE sold —
// reached RECORD_VERBS, which knows the plural, and then fell through every
// branch below, which did not. Any shop with a second person behind the counter
// writes this. One definition each, used everywhere.
const SAYS_SALE = /\b(?:ni(?:me|li)uza|tu(?:me|li)uza|uza|sold|mauzo)\b/i;
const SAYS_PURCHASE = /\b(?:ni(?:me|li)nunua|tu(?:me|li)nunua|ni(?:me|li)ongeza|ni(?:me|li)ingiza|bought|purchased|added)\b/i;
const SAYS_EXPENSE = /\b(?:ni(?:me|li)lipa|tu(?:me|li)lipa|ni(?:me|li)tumia|tu(?:me|li)tumia|expense|paid|spent)\b/i;
const EXPENSE_OPENING = /^(?:ni(?:me|li)lipa|tu(?:me|li)lipa|ni(?:me|li)tumia|tu(?:me|li)tumia|expense\s+(?:ya|for)|paid|spent(?:\s+on)?)\s+/i;
const SALE_OPENING = /^(?:leo\s+|today\s+)?(?:ni(?:me|li)uza|tu(?:me|li)uza|uza|sold|mauzo)\s+/i;

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
    ? 'Sijaelewa vizuri. Andika mauzo, matumizi, mkopo, deni, malipo, bidhaa mpya pamoja na kiasi, kisha nitakuuliza uthibitisho.'
    : 'I did not understand that clearly. Say sale, expense, credit, debt, payment or new stock with an amount, then I will ask you to confirm.';
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
  } else if (/\b(mkopo|loan|ananidai|owes me|deni)\b/i.test(value)
    // "Mama Asha amechukua sukari 12000". A named person TAKING goods is credit
    // in every duka — a cash sale is written "nimeuza" and needs no name. The
    // word "mkopo" was required before, so this went to the model, which is not
    // where a debt should be decided. The payment branch above still wins, so
    // "Asha amechukua sukari 12000 amelipa" is a payment, not a debt.
    || /^[\p{L}][\p{L}'’-]*(?:\s+[\p{L}][\p{L}'’-]*){0,2}\s+(?:amechukua|alichukua|kachukua|wamechukua)\b/iu
      .test(value)) {
    parsed = debtRecord(value);
  } else if (SAYS_SALE.test(value)) {
    parsed = saleRecord(value);
  } else if (SAYS_PURCHASE.test(value)) {
    // Before expense on purpose: "nimenunua stock ya sukari 50000" is an
    // investment in goods, not a running cost.
    parsed = stockPurchaseRecord(value);
    // Goods it would not claim can still be an ordinary cost, as long as the
    // sentence says so itself. Nothing is guessed from "nimenunua" alone.
    if (!parsed && SAYS_EXPENSE.test(value)) parsed = expenseRecord(value);
  } else if (SAYS_EXPENSE.test(value)) {
    parsed = expenseRecord(value);
  }

  if (parsed) return enforceLimit(parsed, lang);
  const tokens = moneyTokens(value);
  if (SAYS_SALE.test(value) && /\bkila moja\b/i.test(value) && tokens.length === 1) {
    return { kind: 'clarify', reason: 'amount', question: question('amount', lang) };
  }
  if (SAYS_SALE.test(value) && tokens.length >= 2) {
    const payload = value.replace(SALE_OPENING, '');
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
      sale: 'Mauzo', expense: 'Matumizi', stock_purchase: 'Ununuzi wa bidhaa',
      debt_issued: 'Mkopo uliotolewa', customer_payment: 'Malipo ya mteja',
      stock_loss: 'Upotevu wa bidhaa', owner_use: 'Bidhaa zilizochukuliwa nyumbani',
      supplier_payable: 'Deni la muuzaji', supplier_payment: 'Malipo kwa muuzaji',
      whole_animal_procurement: 'Ununuzi wa ng\'ombe mzima',
      whole_animal_breakdown: 'Breakdown ya ng\'ombe mzima',
    })[kind];
  }
  return ({
    sale: 'Sale', expense: 'Expense', stock_purchase: 'Stock purchase',
    debt_issued: 'Debt issued', customer_payment: 'Customer payment',
    stock_loss: 'Stock loss', owner_use: 'Taken by owner',
    supplier_payable: 'Owed to supplier', supplier_payment: 'Paid to supplier',
    whole_animal_procurement: 'Whole-animal procurement',
    whole_animal_breakdown: 'Whole-animal breakdown',
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
    lines.push(lang === 'sw' ? 'Thibitisha kwa kujibu *1*.' : 'Confirm explicitly by replying YES.');
  }
  lines.push((lang === 'sw' ? 'Jumla' : 'Total') + ': *' + money(record.amount, lang) + '*', '');
  lines.push(lang === 'sw'
    ? `Jibu *1* Ndiyo · *2* Hapana ${pendingEscapeHint(lang)}`
    : `Reply *1* Yes · *2* No ${pendingEscapeHint(lang)}`);
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

/**
 * A BARE "1" IS YES, AND A BARE "2" IS NO.
 *
 * The owner's rule: "kwenye commands words ziwe na number mtu achague… ili
 * kuepusha kukosea kwa spellings." He is right about the cost. Every control
 * word in this product has needed a spelling parser, and every one of those
 * parsers has been a source of bugs — "mdiyo" was not a yes, and a confirmed
 * sale sat unsaved because of it. A digit cannot be misspelled.
 *
 * Safe because of WHERE these are asked. Both are only ever consulted while a
 * specific question is parked: twenty-two branches behind their own pending
 * state, plus releasesParkedQuestion, which by definition runs only when
 * something is waiting. A "1" with nothing pending never reaches here.
 *
 * GHAIRI stays a word, deliberately. isCancel is used by the general intent
 * router, with no parked question above it, so a bare "3" there would cancel
 * whatever somebody happened to be doing — and "3" is one of the commonest
 * quantities a shop types. Rejection already covers ghairi, so 1 and 2 are the
 * whole vocabulary a confirmation needs.
 */
export function isDailyRecordConfirmation(text: string | null | undefined): boolean {
  text = correctControlWords(text);
  const said = String(text ?? '').trim();
  if (said === '1') return true;
  return /^(yes|ok|okay|confirm|sawa|ndio|ndiyo|thibitisha|hakika)\b/i.test(said);
}

export function isDailyRecordRejection(text: string | null | undefined): boolean {
  text = correctControlWords(text);
  const said = String(text ?? '').trim();
  if (said === '2') return true;
  return /^(no|hapana|cancel|ghairi|toka|futa|acha|sitisha)\b/i.test(said);
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
