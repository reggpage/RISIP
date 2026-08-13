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
};

export type DailyRecordParse =
  | { kind: 'parsed'; record: ParsedDailyRecord }
  | { kind: 'clarify'; reason: 'amount' | 'message'; question: string }
  | { kind: 'none' };

export type DailyRecordConversation = {
  kind: 'daily_record_confirmation';
  dailyRecordId: string;
  sourceMessageId: string;
  record: ParsedDailyRecord;
};

const NUMBER = '[0-9][0-9,]*(?:\\.[0-9]+)?';
const NUMBER_RE = new RegExp(`\\b${NUMBER}\\b`, 'g');

function clean(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

function numberValue(value: string): number {
  return Number(value.replace(/,/g, ''));
}

function lastAmount(text: string): number | null {
  const matches = [...text.matchAll(NUMBER_RE)];
  if (matches.length === 0) return null;
  const amount = numberValue(matches[matches.length - 1][0]);
  return Number.isFinite(amount) && amount > 0 ? amount : null;
}

function stripAmount(text: string): string {
  return text
    .replace(new RegExp(`(?:tsh|tzs|sh)?\\s*${NUMBER}`, 'gi'), ' ')
    .replace(/\s+/g, ' ')
    .replace(/[.,;:]+$/g, '')
    .trim();
}

function titleCase(value: string | null): string | null {
  if (!value) return null;
  return value
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function saleRecord(text: string): ParsedDailyRecord | null {
  const unitSw = text.match(new RegExp(
    `^(?:leo\\s+)?nimeuza\\s+(.+?)\\s+(${NUMBER})\\s+kila moja\\s+(?:tsh|tzs)?\\s*(${NUMBER})$`,
    'i',
  ));
  if (unitSw) {
    const quantity = numberValue(unitSw[2]);
    const unitAmount = numberValue(unitSw[3]);
    return {
      kind: 'sale', amount: Math.round(quantity * unitAmount * 100) / 100,
      partyName: null, description: unitSw[1].trim(),
      lines: [{ description: unitSw[1].trim(), quantity, unit_amount: unitAmount }],
    };
  }

  const unitEn = text.match(new RegExp(
    `^(?:today\\s+)?(?:i\\s+)?sold\\s+(${NUMBER})\\s+(.+?)\\s+(?:each|per\\s+item)\\s+(?:tsh|tzs)?\\s*(${NUMBER})$`,
    'i',
  ));
  if (unitEn) {
    const quantity = numberValue(unitEn[1]);
    const unitAmount = numberValue(unitEn[3]);
    return {
      kind: 'sale', amount: Math.round(quantity * unitAmount * 100) / 100,
      partyName: null, description: unitEn[2].trim(),
      lines: [{ description: unitEn[2].trim(), quantity, unit_amount: unitAmount }],
    };
  }

  const total = text.match(new RegExp(
    `^(?:leo\\s+)?nimeuza\\s+(.+?)\\s+(?:kwa|for)\\s+(?:tsh|tzs)?\\s*(${NUMBER})$`, 'i',
  )) ?? text.match(new RegExp(
    `^(?:today\\s+)?(?:i\\s+)?sold\\s+(.+?)\\s+for\\s+(?:tsh|tzs)?\\s*(${NUMBER})$`, 'i',
  ));
  if (total) {
    return { kind: 'sale', amount: numberValue(total[2]), partyName: null, description: total[1].trim(), lines: [] };
  }

  const bare = text.match(new RegExp(
    `^(?:leo\\s+)?nimeuza\\s+(.+?)\\s+(?:tsh|tzs)?\\s*(${NUMBER})$`, 'i',
  )) ?? text.match(new RegExp(
    `^(?:today\\s+)?(?:i\\s+)?sold\\s+(.+?)\\s+(?:tsh|tzs)?\\s*(${NUMBER})$`, 'i',
  ));
  if (bare) {
    return { kind: 'sale', amount: numberValue(bare[2]), partyName: null, description: bare[1].trim(), lines: [] };
  }
  return null;
}

function expenseRecord(text: string): ParsedDailyRecord | null {
  const match = text.match(new RegExp(
    `^(?:nimelipa|nimetumia|expense\\s+(?:ya|for)|paid|spent(?:\\s+on)?)\\s+(.+?)\\s+(?:tsh|tzs)?\\s*(${NUMBER})$`, 'i',
  ));
  if (!match) return null;
  return {
    kind: 'expense', amount: numberValue(match[2]), partyName: null,
    description: match[1].replace(/^(?:ya|for)\s+/i, '').trim(), lines: [],
  };
}

function namedRecord(text: string, kind: 'debt_issued' | 'customer_payment'): ParsedDailyRecord | null {
  const amount = lastAmount(text);
  if (!amount) return null;
  const party = text.match(/^([\p{L}][\p{L}'-]*)\s+/u)?.[1] ?? null;
  if (!party) return null;
  return { kind, amount, partyName: titleCase(party), description: stripAmount(text), lines: [] };
}

function looksLikeDailyRecord(text: string): boolean {
  return /\b(nimeuza|uza|sold|mauzo|nimelipa|nimetumia|expense|paid|spent|mkopo|loan|ananidai|deni|amelipa|kalipa|customer payment)\b/i.test(text);
}

function question(reason: 'amount' | 'message', lang: Lang): string {
  if (reason === 'amount') {
    return lang === 'sw'
      ? 'Nimeona ujumbe wa biashara, lakini sijapata kiasi wazi. Andika kiasi, mfano: *nimeuza bidhaa kwa TSh 15000*.'
      : 'I found a business record, but the amount is unclear. Send the amount, for example: *sold goods for TZS 15000*.';
  }
  return lang === 'sw'
    ? 'Sijaelewa vizuri. Andika mauzo, matumizi, mkopo, au malipo pamoja na kiasi, kisha nitakuuliza uthibitisho.'
    : 'I did not understand that clearly. Say sale, expense, debt, or customer payment with an amount, then I will ask you to confirm.';
}

export function isDailyRecordCandidate(text: string | null | undefined): boolean {
  return looksLikeDailyRecord(clean(String(text ?? '')));
}

export function parseDailyRecord(text: string | null | undefined, lang: Lang = 'sw'): DailyRecordParse {
  const value = clean(String(text ?? ''));
  if (!value || !looksLikeDailyRecord(value)) return { kind: 'none' };

  if (/\b(amelipa|kalipa|customer payment|paid me|paid the debt)\b/i.test(value)) {
    const record = namedRecord(value, 'customer_payment');
    return record ? { kind: 'parsed', record } : { kind: 'clarify', reason: 'amount', question: question('amount', lang) };
  }
  if (/\b(mkopo|loan|ananidai|owes me|deni)\b/i.test(value)) {
    const record = namedRecord(value, 'debt_issued');
    return record ? { kind: 'parsed', record } : { kind: 'clarify', reason: 'amount', question: question('amount', lang) };
  }
  if (/\b(nimeuza|uza|sold|mauzo)\b/i.test(value)) {
    const record = saleRecord(value);
    return record ? { kind: 'parsed', record } : {
      kind: 'clarify', reason: value.match(new RegExp(NUMBER)) ? 'message' : 'amount',
      question: question(value.match(new RegExp(NUMBER)) ? 'message' : 'amount', lang),
    };
  }
  if (/\b(nimelipa|nimetumia|expense|paid|spent)\b/i.test(value)) {
    const record = expenseRecord(value);
    return record ? { kind: 'parsed', record } : {
      kind: 'clarify', reason: value.match(new RegExp(NUMBER)) ? 'message' : 'amount',
      question: question(value.match(new RegExp(NUMBER)) ? 'message' : 'amount', lang),
    };
  }
  return { kind: 'clarify', reason: 'message', question: question('message', lang) };
}

function kindLabel(kind: DailyRecordKind, lang: Lang): string {
  if (lang === 'sw') {
    return ({ sale: 'Mauzo', expense: 'Matumizi', debt_issued: 'Mkopo uliotolewa', customer_payment: 'Malipo ya mteja' })[kind];
  }
  return ({ sale: 'Sale', expense: 'Expense', debt_issued: 'Debt issued', customer_payment: 'Customer payment' })[kind];
}

function money(amount: number, lang: Lang): string {
  const currency = lang === 'sw' ? 'TSh' : 'TZS';
  return `${currency} ${amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

export function buildDailyRecordConfirmation(record: ParsedDailyRecord, lang: Lang): string {
  const lines = [
    lang === 'sw' ? 'Nimeelewa:' : 'I understood:',
    `${lang === 'sw' ? 'Aina' : 'Type'}: ${kindLabel(record.kind, lang)}`,
  ];
  if (record.description) lines.push(`${lang === 'sw' ? 'Maelezo' : 'Details'}: ${record.description}`);
  if (record.partyName) lines.push(`${lang === 'sw' ? 'Mhusika' : 'Party'}: ${record.partyName}`);
  lines.push(`${lang === 'sw' ? 'Kiasi' : 'Amount'}: ${money(record.amount, lang)}`, '');
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
    ? `Sawa. ${kindLabel(record.kind, lang)} ya ${money(record.amount, lang)} imethibitishwa.`
    : `Done. The ${kindLabel(record.kind, lang).toLowerCase()} of ${money(record.amount, lang)} is confirmed.`;
}

export function buildDailyRecordPending(record: ParsedDailyRecord, lang: Lang): string {
  return lang === 'sw'
    ? `Nimehifadhi draft ya ${kindLabel(record.kind, lang).toLowerCase()} ya ${money(record.amount, lang)}. Bado inasubiri owner au accountant athibitishe.`
    : `I saved the ${kindLabel(record.kind, lang).toLowerCase()} draft for ${money(record.amount, lang)}. It is waiting for an owner or accountant to confirm.`;
}

export function buildDailyRecordCancelled(lang: Lang): string {
  return lang === 'sw' ? 'Sawa. Draft imeghairiwa.' : 'Okay. The draft was cancelled.';
}

