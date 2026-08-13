import type { Lang } from './whatsappIntent.ts';

export type DailyRecordKind = 'sale' | 'expense' | 'debt_issued' | 'customer_payment';

export type DailyRecordLine = {
  description: string;
  quantity: number;
  unit_amount: number;
};

export type ParsedDailyRecord = {
  kind: DailyRecordKind;
  amount: number;
  partyName: string | null;
  description: string | null;
  lines: DailyRecordLine[];
  referenceAmount?: number | null;
};

export type DailyRecordParse =
  | { kind: 'parsed'; record: ParsedDailyRecord }
  | { kind: 'clarify'; reason: 'amount' | 'message' | 'ambiguity' | 'limit'; question: string }
  | { kind: 'none' };

export type DailyRecordConversation = {
  kind: 'daily_record_confirmation';
  dailyRecordId: string;
  sourceMessageId: string;
  record: ParsedDailyRecord;
};

export const MAX_DAILY_RECORD_AMOUNT = 100_000_000;

const MONEY_PATTERN = '(?:(?:tshs?|tzs|sh)\\s*)?[0-9][0-9,]*(?:\\.[0-9]+)?\\s*(?:k\\b)?\\s*(?:/=)?';
const QUANTITY_PATTERN = '[0-9]+(?:\\.[0-9]+)?';

type MoneyToken = { raw: string; value: number; start: number; end: number };

function clean(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function parseMoneyToken(raw: string): number | null {
  let value = raw.toLowerCase().replace(/\s+/g, '').replace(/\/$/, '').replace(/=$/, '').replace(/\/$/, '');
  value = value.replace(/^(?:tshs?|tzs|sh)/, '');
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
  return text.split(/\s+(?:na|and)\s+/i).map((part) => part.trim()).filter(Boolean);
}

function lineTotal(line: DailyRecordLine): number {
  return roundMoney(line.quantity * line.unit_amount);
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
  const lines = parts.map((part) => parseSwahiliUnitLine(part) ?? parseEnglishUnitLine(part));
  return lines.every(Boolean) ? lines as DailyRecordLine[] : null;
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

  const explicitTotal = payload.match(new RegExp('^(.+?)\\s+(?:kwa|for)\\s+(' + MONEY_PATTERN + ')$', 'i'));
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
    const explicitTotalWord = /\b(?:kwa|for)\b/i.test(payload);
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
    const tokens = moneyTokens(part);
    if (tokens.length !== 1 || tokens[0].value <= 0) return null;
    if (part.slice(tokens[0].end).trim()) return null;
    const description = part.slice(0, tokens[0].start).trim().replace(/^(?:ya|for)\s+/i, '');
    if (!description) return null;
    lines.push({ description, quantity: 1, unit_amount: tokens[0].value });
  }
  const amount = roundMoney(lines.reduce((sum, line) => sum + lineTotal(line), 0));
  return validAmount(amount)
    ? { kind: 'expense', amount, partyName: null, description: lines.length === 1 ? lines[0].description : null, lines }
    : null;
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

function looksLikeDailyRecord(text: string): boolean {
  return /\b(nimeuza|uza|sold|mauzo|nimelipa|nimetumia|expense|paid|spent|mkopo|loan|ananidai|deni|amelipa|kalipa|customer payment)\b/i.test(text);
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
  return { kind: 'parsed', record: parsed };
}

export function isDailyRecordCandidate(text: string | null | undefined): boolean {
  return looksLikeDailyRecord(clean(String(text ?? '')));
}

export function parseDailyRecord(text: string | null | undefined, lang: Lang = 'sw'): DailyRecordParse {
  const value = clean(String(text ?? ''));
  if (!value || !looksLikeDailyRecord(value)) return { kind: 'none' };
  if (hasNegativeOrZeroAmount(value)) return { kind: 'clarify', reason: 'amount', question: question('amount', lang) };

  let parsed: ParsedDailyRecord | null = null;
  if (/\b(amelipa|kalipa|customer payment|paid me|paid the debt)\b/i.test(value)) {
    parsed = customerPaymentRecord(value);
  } else if (/\b(mkopo|loan|ananidai|owes me|deni)\b/i.test(value)) {
    parsed = debtRecord(value);
  } else if (/\b(nimeuza|uza|sold|mauzo)\b/i.test(value)) {
    parsed = saleRecord(value);
  } else if (/\b(nimelipa|nimetumia|expense|paid|spent)\b/i.test(value)) {
    parsed = expenseRecord(value);
  }

  if (parsed) return enforceLimit(parsed, lang);
  const tokens = moneyTokens(value);
  if (/\b(nimeuza|uza|sold|mauzo)\b/i.test(value) && /\bkila moja\b/i.test(value) && tokens.length === 1) {
    return { kind: 'clarify', reason: 'amount', question: question('amount', lang) };
  }
  if (/\b(nimeuza|uza|sold|mauzo)\b/i.test(value) && tokens.length >= 2) {
    return { kind: 'clarify', reason: 'ambiguity', question: question('ambiguity', lang) };
  }
  return { kind: 'clarify', reason: tokens.length ? 'message' : 'amount', question: question(tokens.length ? 'message' : 'amount', lang) };
}

function kindLabel(kind: DailyRecordKind, lang: Lang): string {
  if (lang === 'sw') {
    return ({ sale: 'Mauzo', expense: 'Matumizi', debt_issued: 'Mkopo uliotolewa', customer_payment: 'Malipo ya mteja' })[kind];
  }
  return ({ sale: 'Sale', expense: 'Expense', debt_issued: 'Debt issued', customer_payment: 'Customer payment' })[kind];
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
        lines.push('- ' + name + ': ' + line.quantity + ' × ' + money(line.unit_amount, lang) + ' = ' + money(lineTotal(line), lang));
      }
    }
  } else if (record.description) {
    lines.push((lang === 'sw' ? 'Maelezo' : 'Details') + ': ' + record.description);
  }
  if (record.referenceAmount) {
    const balance = roundMoney(record.referenceAmount - record.amount);
    lines.push((lang === 'sw' ? 'Mabaki ya rejea' : 'Reference balance') + ': ' + money(balance, lang));
  }
  lines.push((lang === 'sw' ? 'Jumla' : 'Total') + ': *' + money(record.amount, lang) + '*', '');
  lines.push(lang === 'sw'
    ? 'Jibu *NDIYO* kuthibitisha, au *HAPANA* kughairi.'
    : 'Reply *YES* to confirm, or *NO* to cancel.');
  return lines.join('\n');
}

export function isDailyRecordConfirmation(text: string | null | undefined): boolean {
  return /^(yes|ok|okay|confirm|sawa|ndio|ndiyo|thibitisha|hakika)\b/i.test(String(text ?? '').trim());
}

export function isDailyRecordRejection(text: string | null | undefined): boolean {
  return /^(no|hapana|cancel|ghairi|acha|sitisha)\b/i.test(String(text ?? '').trim());
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
