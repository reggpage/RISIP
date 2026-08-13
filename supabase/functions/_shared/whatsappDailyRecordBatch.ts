import type { Lang } from './whatsappIntent.ts';
import {
  MAX_DAILY_RECORD_AMOUNT,
  buildDailyRecordConfirmation,
  parseDailyRecord,
  type DailyRecordLine,
  type DailyRecordPriceChoice,
  type ParsedDailyRecord,
} from './whatsappDailyRecords.ts';

export type MixedDebtDirection = 'owed_to_business' | 'business_owes';

export type DailyRecordBatchClarification = {
  kind: 'daily_record_batch_clarification';
  sourceMessageId?: string;
  lang: Lang;
  records: ParsedDailyRecord[];
  debt: {
    originalLine: string;
    partyName: string;
    itemDescription: string;
    quantity: number;
    quotedAmount: number;
    direction: MixedDebtDirection | null;
    priceChoice: DailyRecordPriceChoice | null;
  };
};

export type DailyRecordBatchConversation = {
  kind: 'daily_record_batch_confirmation';
  sourceMessageId: string;
  dailyRecordIds: string[];
  records: ParsedDailyRecord[];
};

export type DailyRecordBatchParse =
  | { kind: 'parsed'; records: ParsedDailyRecord[] }
  | { kind: 'clarify'; state: DailyRecordBatchClarification; question: string }
  | { kind: 'none' };

export type DailyRecordBatchResolution =
  | { kind: 'resolved'; records: ParsedDailyRecord[] }
  | { kind: 'clarify'; state: DailyRecordBatchClarification; question: string }
  | { kind: 'unsupported_payable'; state: DailyRecordBatchClarification; message: string };

const MONEY = /(?:@\s*)?(?:(?:tshs?|tzs|sh)\s*)?[0-9][0-9,]*(?:\.[0-9]+)?\s*(?:k\b)?\s*(?:\/=)?/gi;

function parseMoney(raw: string): number | null {
  let value = raw.toLowerCase().replace(/\s+/g, '').replace(/\/=\s*$/, '');
  value = value.replace(/^@/, '').replace(/^(?:tshs?|tzs|sh)/, '');
  const thousands = value.endsWith('k');
  if (thousands) value = value.slice(0, -1);
  const parsed = Number(value.replace(/,/g, ''));
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return thousands ? parsed * 1000 : parsed;
}

function money(amount: number, lang: Lang): string {
  return `${lang === 'sw' ? 'TSh' : 'TZS'} ${amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

function titleCase(value: string): string {
  return value.split(/\s+/u).filter(Boolean)
    .map((word) => word.charAt(0).toLocaleUpperCase() + word.slice(1))
    .join(' ');
}

function expenseLine(raw: string): DailyRecordLine | null {
  const matches = [...raw.matchAll(MONEY)];
  if (matches.length !== 1) return null;
  const match = matches[0];
  const amount = parseMoney(match[0]);
  if (!amount || amount > MAX_DAILY_RECORD_AMOUNT) return null;
  const start = match.index ?? 0;
  const before = raw.slice(0, start).replace(/^[-–—:\s]+|[-–—:\s]+$/g, '').trim();
  const after = raw.slice(start + match[0].length).replace(/^[-–—:\s]+|[-–—:\s]+$/g, '').trim();
  const description = [before, after].filter(Boolean).join(' ').replace(/\s+/g, ' ').trim();
  return description ? { description, quantity: 1, unit_amount: amount } : null;
}

function borrowingClarification(raw: string): DailyRecordBatchClarification['debt'] | null {
  const normalized = raw.trim().replace(/\s+/g, ' ');
  const match = normalized.match(
    /^nimemkopa\s+([\p{L}][\p{L}'’-]*)\s+(.+?)\s+([0-9]+(?:\.[0-9]+)?)\s+bei(?:\s+yake)?\s+(?:ni\s+)?(.+)$/iu,
  );
  if (!match) return null;
  const quantity = Number(match[3]);
  const quotedAmount = parseMoney(match[4]);
  if (!Number.isFinite(quantity) || quantity <= 0 || !quotedAmount || quotedAmount > MAX_DAILY_RECORD_AMOUNT) return null;
  return {
    originalLine: raw,
    partyName: titleCase(match[1]),
    itemDescription: match[2].trim(),
    quantity,
    quotedAmount,
    direction: null,
    priceChoice: null,
  };
}

function summarizeKnown(records: ParsedDailyRecord[], lang: Lang): string[] {
  return records.map((record) => {
    const label = lang === 'sw'
      ? record.kind === 'sale' ? 'Mauzo'
        : record.kind === 'expense' ? 'Matumizi'
          : record.kind === 'debt_issued' ? 'Deni lililotolewa'
            : record.kind === 'customer_payment' ? 'Malipo ya mteja' : 'Ununuzi wa stock'
      : record.kind === 'sale' ? 'Sales'
        : record.kind === 'expense' ? 'Expenses'
          : record.kind === 'debt_issued' ? 'Debt issued'
            : record.kind === 'customer_payment' ? 'Customer payment' : 'Stock purchase';
    return `- ${label}: *${money(record.amount, lang)}*`;
  });
}

export function buildBatchDebtClarification(state: DailyRecordBatchClarification): string {
  const sw = state.lang === 'sw';
  const known = summarizeKnown(state.records, state.lang).join('\n');
  const missingDirection = !state.debt.direction;
  const missingPrice = !state.debt.priceChoice;
  const questions = [
    missingDirection
      ? (sw
        ? `1. Je ${state.debt.partyName} amechukua bidhaa kwako kwa mkopo, au wewe umechukua kwa ${state.debt.partyName}?`
        : `1. Did ${state.debt.partyName} take the goods from you on credit, or did you take them from ${state.debt.partyName}?`)
      : null,
    missingPrice
      ? (sw
        ? `2. ${money(state.debt.quotedAmount, state.lang)} ni bei ya kila ${state.debt.itemDescription} au jumla ya ${state.debt.quantity}?`
        : `2. Is ${money(state.debt.quotedAmount, state.lang)} the price for each ${state.debt.itemDescription}, or the total for ${state.debt.quantity}?`)
      : null,
  ].filter(Boolean).join('\n');
  const example = sw
    ? `Jibu mfano: “${state.debt.partyName} amenikopa; bei ya kila moja.”`
    : `For example: “${state.debt.partyName} borrowed from me; unit price.”`;
  return sw
    ? `Nimeelewa sehemu hizi:\n${known}\n\nSehemu ya mkopo inahitaji ufafanuzi:\n${questions}\n\n${example}\nHakuna rekodi mpya iliyohifadhiwa bado.`
    : `I understood these sections:\n${known}\n\nThe credit section needs clarification:\n${questions}\n\n${example}\nNo new record has been saved yet.`;
}

export function parseDailyRecordBatch(text: string | null | undefined, lang: Lang): DailyRecordBatchParse {
  const rawLines = String(text ?? '').split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  if (rawLines.length < 2) return { kind: 'none' };

  const saleLines: string[] = [];
  const expenseLines: DailyRecordLine[] = [];
  let section: 'expense' | null = null;
  let debt: DailyRecordBatchClarification['debt'] | null = null;
  const unknown: string[] = [];

  for (const line of rawLines) {
    if (/^(?:matumizi|expenses?)\s*:?$/i.test(line)) {
      section = 'expense';
      continue;
    }
    if (/^(?:mauzo|sales?)\s*:?$/i.test(line)) {
      section = null;
      continue;
    }
    if (/^(?:leo\s+)?nimeuza\b|^(?:today\s+)?(?:i\s+)?sold\b/i.test(line)) {
      saleLines.push(line);
      continue;
    }
    if (/\bnimemkopa\b/i.test(line)) {
      debt = borrowingClarification(line);
      if (!debt) unknown.push(line);
      continue;
    }
    if (section === 'expense') {
      const parsed = expenseLine(line);
      if (parsed) expenseLines.push(parsed);
      else unknown.push(line);
      continue;
    }
    unknown.push(line);
  }

  if (saleLines.length === 0 || (expenseLines.length === 0 && !debt)) return { kind: 'none' };
  if (unknown.length > 0) return { kind: 'none' };

  const records: ParsedDailyRecord[] = [];
  const sale = parseDailyRecord(saleLines.join('\n'), lang);
  if (sale.kind !== 'parsed') return { kind: 'none' };
  records.push(sale.record);
  if (expenseLines.length > 0) {
    const amount = expenseLines.reduce((sum, line) => sum + line.quantity * line.unit_amount, 0);
    if (amount <= 0 || amount > MAX_DAILY_RECORD_AMOUNT) return { kind: 'none' };
    records.push({ kind: 'expense', amount, partyName: null, description: null, lines: expenseLines, confidence: 0.98 });
  }
  if (!debt) return records.length > 1 ? { kind: 'parsed', records } : { kind: 'none' };

  const state: DailyRecordBatchClarification = {
    kind: 'daily_record_batch_clarification', lang, records, debt,
  };
  return { kind: 'clarify', state, question: buildBatchDebtClarification(state) };
}

function replyDirection(text: string): MixedDebtDirection | null {
  const value = text.toLocaleLowerCase('sw').replace(/\s+/g, ' ').trim();
  if (/\b(?:amenikopa|amechukua\s+(?:kwangu|kwetu)|nimemkopesha|ananidai)\b/u.test(value)) return 'owed_to_business';
  if (/\b(?:amenikopesha|nimekopa\s+(?:kwa|kutoka|kwake)|namdaiwa|tunadaiwa)\b/u.test(value)) return 'business_owes';
  return null;
}

function replyPriceChoice(text: string): DailyRecordPriceChoice | null {
  const value = text.toLocaleLowerCase('sw');
  if (/\b(?:bei\s+(?:ya\s+)?kila\s+moja|kila\s+moja|unit\s+price|per\s+item|each)\b/u.test(value)) return 'unit_price';
  if (/\b(?:jumla|total|overall)\b/u.test(value)) return 'total';
  return null;
}

export function resumeDailyRecordBatchClarification(
  previous: DailyRecordBatchClarification,
  text: string,
): DailyRecordBatchResolution {
  if (/^(?:endelea\s+bila\s+mkopo|continue\s+without\s+(?:the\s+)?debt)\b/i.test(text.trim())) {
    return { kind: 'resolved', records: previous.records };
  }
  const state: DailyRecordBatchClarification = {
    ...previous,
    debt: {
      ...previous.debt,
      direction: previous.debt.direction ?? replyDirection(text),
      priceChoice: previous.debt.priceChoice ?? replyPriceChoice(text),
    },
  };
  if (state.debt.direction === 'business_owes') {
    return {
      kind: 'unsupported_payable',
      state,
      message: state.lang === 'sw'
        ? `Nimeelewa kuwa biashara yako ndiyo inamdaiwa ${state.debt.partyName}. Risip bado haina supplier-payable record kwenye Rekodi za Siku, kwa hiyo sitaiandikisha kimakosa kama matumizi au deni la mteja. Jibu *ENDELEA BILA MKOPO* kuhifadhi mauzo na matumizi pekee, au *HAPANA* kughairi yote.`
        : `I understand that your business owes ${state.debt.partyName}. Daily Records does not yet support supplier payables, so I will not misclassify it as an expense or customer debt. Reply *CONTINUE WITHOUT THE DEBT* to save only sales and expenses, or *NO* to cancel everything.`,
    };
  }
  if (!state.debt.direction || !state.debt.priceChoice) {
    return { kind: 'clarify', state, question: buildBatchDebtClarification(state) };
  }

  const unitAmount = state.debt.priceChoice === 'unit_price'
    ? state.debt.quotedAmount
    : Math.round((state.debt.quotedAmount / state.debt.quantity) * 100) / 100;
  const amount = Math.round(state.debt.quantity * unitAmount * 100) / 100;
  if (amount <= 0 || amount > MAX_DAILY_RECORD_AMOUNT) {
    return { kind: 'clarify', state: { ...state, debt: { ...state.debt, priceChoice: null } }, question: buildBatchDebtClarification({ ...state, debt: { ...state.debt, priceChoice: null } }) };
  }
  const debtRecord: ParsedDailyRecord = {
    kind: 'debt_issued',
    amount,
    partyName: state.debt.partyName,
    description: null,
    lines: [{ description: state.debt.itemDescription, quantity: state.debt.quantity, unit_amount: unitAmount }],
    confidence: 0.98,
  };
  return { kind: 'resolved', records: [...state.records, debtRecord] };
}

function withoutConfirmationPrompt(record: ParsedDailyRecord, lang: Lang): string {
  const lines = buildDailyRecordConfirmation(record, lang).split('\n');
  lines.pop();
  while (lines.at(-1) === '') lines.pop();
  return lines.join('\n');
}

export function buildDailyRecordBatchConfirmation(records: ParsedDailyRecord[], lang: Lang): string {
  const intro = lang === 'sw'
    ? `Nimeelewa rekodi ${records.length} tofauti. Kila moja itahifadhiwa kando:`
    : `I understood ${records.length} separate records. Each will be saved separately:`;
  const summaries = records.map((record, index) => `${index + 1}. ${withoutConfirmationPrompt(record, lang)}`);
  const confirm = lang === 'sw'
    ? `Jibu *NDIYO* kuthibitisha rekodi zote ${records.length}, au *HAPANA* kughairi zote.`
    : `Reply *YES* to confirm all ${records.length} records, or *NO* to cancel all of them.`;
  return [intro, ...summaries, confirm].join('\n\n');
}

export function buildDailyRecordBatchConfirmed(records: ParsedDailyRecord[], lang: Lang): string {
  const totals = summarizeKnown(records, lang).join('\n');
  return lang === 'sw'
    ? `Sawa. Rekodi ${records.length} zimethibitishwa kando:\n${totals}\n\nAngalia rekodi zako: https://risip.online/daily-records`
    : `Done. ${records.length} separate records were confirmed:\n${totals}\n\nView your records: https://risip.online/daily-records`;
}

export function buildDailyRecordBatchPending(records: ParsedDailyRecord[], lang: Lang): string {
  const totals = summarizeKnown(records, lang).join('\n');
  return lang === 'sw'
    ? `Rekodi ${records.length} zimebaki pending kwa owner/accountant kuthibitisha:\n${totals}`
    : `${records.length} records remain pending for an owner/accountant to confirm:\n${totals}`;
}
