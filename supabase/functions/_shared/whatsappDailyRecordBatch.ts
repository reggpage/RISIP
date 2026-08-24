import type { Lang } from './whatsappIntent.ts';
import {
  MAX_DAILY_RECORD_AMOUNT,
  STOCK_ARRIVAL_VERBS,
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
  | { kind: 'unreadable'; unreadable: string[]; message: string }
  | { kind: 'none' };

export type DailyRecordBatchResolution =
  | { kind: 'resolved'; records: ParsedDailyRecord[] }
  | { kind: 'clarify'; state: DailyRecordBatchClarification; question: string }
  | { kind: 'unsupported_payable'; state: DailyRecordBatchClarification; message: string };

const MONEY = /(?:@\s*)?(?:(?:tshs?|tzs|sh)\s*)?[0-9][0-9,]*(?:\.[0-9]+)?\s*(?:k\b)?\s*(?:\/=)?/gi;
const QUANTITY = '[0-9]+(?:\\.[0-9]+)?';

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

function stripSalePrefix(value: string): string {
  return value.replace(/^(?:leo\s+|today\s+)?(?:nimeuza|uza|mauzo|(?:i\s+)?sold)\s+/iu, '').trim();
}

/**
 * A single-line list such as:
 *
 *   nimeuza daftari 5 kwa 7500, kalamu 3 kwa 1500
 *
 * states a total for each item, not a unit price. This parser is intentionally
 * strict: every segment must account for its product, quantity and stated
 * total. A partial parse is returned as unreadable rather than allowing the
 * generic single-record parser to treat the final amount as the whole sale.
 */
function inlineSaleTotalLine(raw: string): DailyRecordLine | null {
  const value = stripSalePrefix(raw);
  const match = value.match(new RegExp(
    '^(.+?)\\s+(' + QUANTITY + ')\\s+(?:kwa|for)\\s+(' + MONEY.source + ')$',
    'iu',
  ));
  if (!match) return null;

  const quantity = Number(match[2]);
  const total = parseMoney(match[3]);
  if (!Number.isFinite(quantity) || quantity <= 0 || !total || total > MAX_DAILY_RECORD_AMOUNT) return null;

  const unitAmount = Math.round((total / quantity) * 100) / 100;
  if (Math.abs(Math.round((quantity * unitAmount - total) * 100) / 100) > 0.01) return null;
  return { description: match[1].trim(), quantity, unit_amount: unitAmount };
}

function inlineSaleList(
  text: string,
  lang: Lang,
): Exclude<DailyRecordBatchParse, { kind: 'clarify' | 'none' }> | null {
  if (/\r?\n/u.test(text)) return null;
  if (!/^(?:leo\s+|today\s+)?(?:nimeuza|uza|mauzo|(?:i\s+)?sold)\b/iu.test(text.trim())) return null;

  const payload = stripSalePrefix(text.trim());
  // A comma inside 7,500 is not a separator because the lookahead requires a
  // letter. "na/and" is considered only in a message containing at least two
  // quantity/amount pairs; this avoids splitting a single product name.
  const parts = payload
    .split(/,\s*(?=[\p{L}])|\s+(?:na|and)\s+/iu)
    .map((part) => part.trim())
    .filter(Boolean);
  const numericTokens = [...payload.matchAll(new RegExp(MONEY.source, 'gi'))];
  if (parts.length < 2 || numericTokens.length < 4) return null;

  const lines = parts.map(inlineSaleTotalLine);
  const unreadable = parts.filter((_, index) => !lines[index]);
  if (unreadable.length > 0) {
    const listed = unreadable.map((line) => `• ${line}`).join('\n');
    return {
      kind: 'unreadable',
      unreadable,
      message: lang === 'sw'
        ? `Sijaweza kusoma sehemu hizi za mauzo kwa uhakika:\n${listed}\n\nHakuna rekodi mpya iliyohifadhiwa. Tuma orodha tena ukitaja bidhaa, idadi na jumla ya kila bidhaa.`
        : `I could not read these sale items with confidence:\n${listed}\n\nNo new record was saved. Send the list again with each product, quantity and item total.`,
    };
  }

  const parsedLines = lines as DailyRecordLine[];
  const amount = Math.round(parsedLines.reduce((sum, line) => sum + line.quantity * line.unit_amount, 0) * 100) / 100;
  if (amount <= 0 || amount > MAX_DAILY_RECORD_AMOUNT) {
    return {
      kind: 'unreadable',
      unreadable: parts,
      message: lang === 'sw'
        ? 'Jumla ya orodha hii haiko ndani ya kiwango salama. Hakuna rekodi mpya iliyohifadhiwa.'
        : 'This list total is outside the safe range. No new record was saved.',
    };
  }
  return {
    kind: 'parsed',
    records: [{ kind: 'sale', amount, partyName: null, description: null, lines: parsedLines, confidence: 0.99 }],
  };
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
  const inline = inlineSaleList(String(text ?? ''), lang);
  if (inline) return inline;

  const rawLines = String(text ?? '').split(/\r?\n/u).map((line) => line.trim()).filter(Boolean);
  if (rawLines.length < 2) return { kind: 'none' };

  const saleLines: string[] = [];
  const purchaseLines: string[] = [];
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
    // A bare heading over a restock list. Anchored at both ends so a real
    // sentence that merely opens with "mzigo" is never swallowed as a heading.
    if (/^(?:mzigo|manunuzi|stock|purchases?)(?:\s+(?:wa|ya|za|of)\s+leo|\s+leo|\s+today)?\s*:?$/i.test(line)) {
      section = null;
      continue;
    }
    if (/^(?:leo\s+)?nimeuza\b|^(?:today\s+)?(?:i\s+)?sold\b/i.test(line)) {
      saleLines.push(line);
      continue;
    }
    if (new RegExp(`^(?:leo\\s+)?(?:${STOCK_ARRIVAL_VERBS})\\b`, 'i').test(line)) {
      purchaseLines.push(line);
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

  // MEASURED FAILURE. A three-line restock —
  //
  //   Mzigo wa leo:
  //   nimenunua viazi gunia 2 kwa 90000
  //   nimenunua mayai trei 5 kwa 60000
  //   nimenunua mafuta dumu 1 kwa 78000
  //
  // matched no branch here, so the batch declined, the single-record parser ran
  // on the whole blob, and 228,000 of stock was written as ONE purchase of
  // 78,000 — the last figure — under a description stitched out of the wreckage
  // of all three lines. Silent, and wrong in the shop's favour by 150,000.
  const hasSaleGroup = saleLines.length > 0 && (expenseLines.length > 0 || Boolean(debt));
  const otherSections = saleLines.length > 0 || expenseLines.length > 0 || Boolean(debt);
  const hasPurchaseGroup = purchaseLines.length > 0 && (purchaseLines.length > 1 || otherSections);
  if (!hasSaleGroup && !hasPurchaseGroup) return { kind: 'none' };

  // Declining on an unreadable line is safe for a sale list, whose fallback is
  // the single-record parser. For purchases that same fallback is the mangling
  // above, so name the line instead and save nothing.
  if (unknown.length > 0) {
    if (!hasPurchaseGroup) return { kind: 'none' };
    const listed = unknown.map((line) => `• ${line}`).join('\n');
    return {
      kind: 'unreadable',
      unreadable: unknown,
      message: lang === 'sw'
        ? `Sijaweza kusoma mistari hii kwa uhakika:\n${listed}\n\nHakuna rekodi iliyohifadhiwa. Andika kila bidhaa na jumla yake, mfano: nimenunua viazi gunia 2 kwa 90000.`
        : `I could not read these lines with confidence:\n${listed}\n\nNothing was saved. Write each item with its total, for example: nimenunua viazi gunia 2 kwa 90000.`,
    };
  }

  const records: ParsedDailyRecord[] = [];
  if (saleLines.length > 0) {
    const sale = parseDailyRecord(saleLines.join('\n'), lang);
    if (sale.kind !== 'parsed') return { kind: 'none' };
    records.push(sale.record);
  }
  for (const line of purchaseLines) {
    const purchase = parseDailyRecord(line, lang);
    if (purchase.kind !== 'parsed' || purchase.record.kind !== 'stock_purchase') {
      const listed = `• ${line}`;
      return {
        kind: 'unreadable',
        unreadable: [line],
        message: lang === 'sw'
          ? `Sijaweza kusoma mstari huu kwa uhakika:\n${listed}\n\nHakuna rekodi iliyohifadhiwa. Andika bidhaa, kipimo na jumla, mfano: nimenunua viazi gunia 2 kwa 90000.`
          : `I could not read this line with confidence:\n${listed}\n\nNothing was saved. Write the item, its measure and the total, for example: nimenunua viazi gunia 2 kwa 90000.`,
      };
    }
    records.push(purchase.record);
  }
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
