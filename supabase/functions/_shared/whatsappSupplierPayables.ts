import type { Lang } from './whatsappIntent.ts';
import { UNITS } from './whatsappStock.ts';

export type SupplierCreditLine = {
  description: string;
  quantity: number;
  unit: string | null;
};

export type SupplierCreditPurchase = {
  supplierName: string;
  amount: number | null;
  lines: SupplierCreditLine[];
};

export type SupplierPayment = {
  supplierName: string;
  amount: number;
  paymentMethod: 'cash' | 'mobile_money' | 'bank' | 'other';
};

export type SupplierCreditReading =
  | { kind: 'parsed'; purchase: SupplierCreditPurchase }
  | { kind: 'missing_supplier'; question: string }
  | { kind: 'missing_amount'; supplierName: string; question: string }
  | { kind: 'missing_purchase'; question: string }
  | { kind: 'none' };

export type SupplierPaymentReading =
  | { kind: 'parsed'; payment: SupplierPayment }
  | { kind: 'missing_supplier'; amount: number | null; paymentMethod: SupplierPayment['paymentMethod'] | null; question: string }
  | { kind: 'missing_amount'; supplierName: string; paymentMethod: SupplierPayment['paymentMethod'] | null; question: string }
  | { kind: 'none' };

export type SupplierBalanceQuestion = {
  supplierName: string | null;
};

const NUMBER = '[0-9]+(?:[.,][0-9]+)?';
const UNIT = `(?:${UNITS})`;
const CREDIT = /\b(?:kwa\s+deni|kwa\s+mkopo|on\s+credit|supplier\s+credit|credit)\b/i;
const PURCHASE_OPENING = /^(?:nimenunua|nilinunua|tumenunua|nimeongeza|nimeingiza|bought|purchased)\s+/i;
const PAYMENT_OPENING = /^(?:nimemlipa|nilimlipa|nimelipa|tumemlipa|nimewalipa|paid)\s*/i;

function normalise(text: string): string {
  return text.toLowerCase().replace(/[’‘`]/g, "'").replace(/\s+/g, ' ').trim().replace(/[.!?]+$/, '');
}

function money(raw: string | undefined): number | null {
  if (!raw) return null;
  const value = Number(raw.replace(/[.,\s]/g, ''));
  return Number.isSafeInteger(value) && value > 0 && value <= 100_000_000 ? value : null;
}

function supplierFromPurchase(text: string): string | null {
  const match = text.match(/\b(?:kutoka\s+kwa|from|supplier|muuzaji|kwa)\s+([\p{L}][\p{L}'’-]*(?:\s+[\p{L}][\p{L}'’-]*){0,2}?)(?=\s+kwa\s+(?:deni|mkopo)|\s+(?:on\s+)?credit\b|\s+[0-9]|$)/iu);
  const name = match?.[1]?.trim() ?? '';
  return name && !/^(?:deni|mkopo|credit)$/i.test(name) ? name : null;
}

function supplierFromPayment(text: string): string | null {
  const match = text.match(/^(?:nimemlipa|nilimlipa|nimelipa|tumemlipa|nimewalipa|paid)\s+([\p{L}][\p{L}'’-]*(?:\s+[\p{L}][\p{L}'’-]*){0,2}?)(?=\s+[0-9]|\s+(?:cash|mpesa|m-?pesa|bank|benki|tsh|tzs|sh)\b|$)/iu);
  return match?.[1]?.trim() || null;
}

function paymentMethod(text: string): SupplierPayment['paymentMethod'] | null {
  if (/\b(?:cash|taslimu|pesa\s+taslimu)\b/i.test(text)) return 'cash';
  if (/\b(?:mpesa|m-?pesa|mobile\s+money|tigo\s+pesa|airtel\s+money|halopesa)\b/i.test(text)) return 'mobile_money';
  if (/\b(?:bank|benki|bank\s+transfer)\b/i.test(text)) return 'bank';
  if (/\b(?:other|nyingine)\b/i.test(text)) return 'other';
  return null;
}

function parseLines(goods: string): SupplierCreditLine[] {
  return goods
    .split(/\s*(?:,|\bna\b)\s*/i)
    .map((piece) => piece.trim())
    .filter(Boolean)
    .map((piece): SupplierCreditLine | null => {
      const before = piece.match(new RegExp(`^(.+?)\\s+(${UNIT})\\s+(${NUMBER})$`, 'i'));
      const after = piece.match(new RegExp(`^(.+?)\\s+(${NUMBER})\\s+(${UNIT})$`, 'i'));
      if (!before && !after) return null;
      const match = before ?? after!;
      const description = match[1].trim();
      const unit = before ? match[2].toLowerCase() : match[3].toLowerCase();
      const quantity = Number((before ? match[3] : match[2]).replace(',', '.'));
      if (!description || !/[\p{L}]/u.test(description) || !Number.isFinite(quantity) || quantity <= 0) return null;
      return { description, quantity, unit };
    })
    .filter((line): line is SupplierCreditLine => line !== null);
}

function purchaseAmount(text: string, lines: SupplierCreditLine[]): number | null {
  const explicit = text.match(/(?:\b(?:jumla|total|tshs?|tzs|shilingi|sh)\b\s*|\b(?:kwa\s+)?(?:deni|mkopo)\s*[, ]+)([0-9][0-9,.]*)/i);
  const explicitAmount = money(explicit?.[1]);
  if (explicitAmount !== null) return explicitAmount;
  const numbers = [...text.matchAll(new RegExp(NUMBER, 'g'))]
    .map((match) => ({ value: money(match[0]), index: match.index ?? 0 }))
    .filter((item): item is { value: number; index: number } => item.value !== null);
  const quantities = lines.map((line) => line.quantity);
  const remaining = numbers.filter((item) => !quantities.includes(item.value));
  return remaining.length === 1 && remaining[0].value >= 100 ? remaining[0].value : null;
}

export function parseSupplierCreditPurchase(input: string | null | undefined, lang: Lang = 'sw'): SupplierCreditReading {
  const text = normalise(String(input ?? ''));
  if (!text || !PURCHASE_OPENING.test(text) || !CREDIT.test(text)) return { kind: 'none' };
  const supplierName = supplierFromPurchase(text);
  if (!supplierName) {
    return { kind: 'missing_supplier', question: lang === 'sw'
      ? 'Ununuzi huu wa deni ni wa supplier gani? Taja jina, kwa mfano: “kwa Musa kwa deni”.'
      : 'Which supplier is this credit purchase from? State the name, for example: “from Musa on credit”.' };
  }
  const withoutOpening = text.replace(PURCHASE_OPENING, '').trim();
  const withoutSupplier = withoutOpening
    .replace(new RegExp(`\\b(?:kutoka\\s+kwa|from|supplier|muuzaji|kwa)\\s+${supplierName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i'), ' ')
    .replace(new RegExp(`\\b(?:deni|mkopo)\\s*[, ]+${NUMBER}\\b`, 'i'), ' ')
    .replace(CREDIT, ' ')
    .replace(/\b(?:jumla|total|tshs?|tzs|shilingi|sh)\s*[0-9][0-9,.]*/ig, ' ')
    .replace(/\b[0-9][0-9,.]*\s*(?:\/=|\/-)\b/ig, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const lines = parseLines(withoutSupplier);
  if (lines.length === 0) {
    return { kind: 'missing_purchase', question: lang === 'sw'
      ? 'Taja bidhaa na kiasi kilichonunuliwa kwa deni, kwa mfano: “nyama kilo 20 kwa Musa kwa deni”.'
      : 'State the product and quantity bought on credit, for example: “20 kilos of meat from Musa on credit”.' };
  }
  return { kind: 'parsed', purchase: { supplierName, amount: purchaseAmount(text, lines), lines } };
}

export function parseSupplierPayment(input: string | null | undefined, lang: Lang = 'sw'): SupplierPaymentReading {
  const text = normalise(String(input ?? ''));
  if (!text || !PAYMENT_OPENING.test(text)) return { kind: 'none' };
  const supplierName = supplierFromPayment(text);
  const method = paymentMethod(text);
  const amountMatch = text.match(new RegExp(`(?:^|\\s)([0-9][0-9,.]*)(?=\\s|$)`));
  const amount = money(amountMatch?.[1]);
  if (!supplierName) {
    return { kind: 'missing_supplier', amount, paymentMethod: method, question: lang === 'sw'
      ? 'Umemlipa supplier gani? Taja jina, kwa mfano: “nimemlipa Musa 300000 cash”.'
      : 'Which supplier did you pay? State the name, for example: “I paid Musa 300000 cash”.' };
  }
  if (amount === null) {
    return { kind: 'missing_amount', supplierName, paymentMethod: method, question: lang === 'sw'
      ? `Umemlipa ${supplierName} kiasi gani? Taja jumla ya TSh.`
      : `How much did you pay ${supplierName}? State the total amount.` };
  }
  if (!method) {
    return { kind: 'missing_amount', supplierName, paymentMethod: null, question: lang === 'sw'
      ? `Umemlipa ${supplierName} kwa cash, mpesa, bank au njia gani?`
      : `How did you pay ${supplierName}: cash, mobile money, bank, or another method?` };
  }
  return { kind: 'parsed', payment: { supplierName, amount, paymentMethod: method } };
}

export function supplierPaymentConfirmation(payment: SupplierPayment, lang: Lang): string {
  return lang === 'sw'
    ? `Nimeelewa: umemlipa ${payment.supplierName} *TSh ${payment.amount.toLocaleString('en-US')}* kwa ${payment.paymentMethod}.\n\nJibu *NDIYO* kuthibitisha, au *HAPANA* kughairi.`
    : `I understood: you paid ${payment.supplierName} *TZS ${payment.amount.toLocaleString('en-US')}* by ${payment.paymentMethod}.\n\nReply *YES* to confirm, or *NO* to cancel.`;
}

export function parseSupplierBalanceQuestion(input: string | null | undefined): SupplierBalanceQuestion | null {
  const text = normalise(String(input ?? ''));
  const match = text.match(/^nina\s+deni\s+kiasi\s+gani\s+(?:kwa|na)\s+(.+?)[?!.]*$/i);
  if (!match) return null;
  const subject = match[1].trim();
  return {
    supplierName: /^(?:supplier|suppliers|muuzaji|wauzaji)$/i.test(subject) ? null : subject,
  };
}
