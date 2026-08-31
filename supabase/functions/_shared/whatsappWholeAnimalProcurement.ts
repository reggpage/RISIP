import type { Lang } from './whatsappIntent.ts';

export type WholeAnimalPaymentMethod = 'cash' | 'mobile_money' | 'bank' | 'other';

export type WholeAnimalProcurement = {
  animalType: 'ng\'ombe';
  animalCount: number;
  purchaseTotal: number;
  supplierName: string | null;
  paymentMethod: WholeAnimalPaymentMethod | null;
  reference: string | null;
  note: string | null;
};

export type WholeAnimalProcurementReading =
  | { kind: 'parsed'; procurement: WholeAnimalProcurement }
  | { kind: 'missing'; missing: Array<'quantity' | 'cost'>; question: string }
  | { kind: 'none' };

const NUMBER_WORDS: Record<string, number> = {
  moja: 1, mmoja: 1, one: 1,
  mbili: 2, wawili: 2, two: 2,
  tatu: 3, watatu: 3, three: 3,
  nne: 4, wanne: 4, four: 4,
  tano: 5, watano: 5, five: 5,
  sita: 6, six: 6,
  saba: 7, seven: 7,
  nane: 8, eight: 8,
  tisa: 9, nine: 9,
  kumi: 10, ten: 10,
};

function normalise(text: string): string {
  return text
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function parseCount(token: string | undefined): number | null {
  if (!token) return null;
  const cleaned = token.toLowerCase().replace(/[,]/g, '');
  if (/^\d+$/.test(cleaned)) {
    const value = Number(cleaned);
    return Number.isSafeInteger(value) && value > 0 ? value : null;
  }
  return NUMBER_WORDS[cleaned] ?? null;
}

function parseMoney(raw: string | undefined): number | null {
  if (!raw) return null;
  const compact = raw.toLowerCase().replace(/(?:tshs?|tzs|sh)|[,\s]|\/=|\/-/g, '');
  if (!/^\d+(?:\.\d+)?$/.test(compact)) return null;
  const value = Number(compact);
  return Number.isFinite(value) && value > 0 && value <= 100_000_000 ? value : null;
}

function paymentMethod(text: string): WholeAnimalPaymentMethod | null {
  if (/\b(?:cash|taslimu|pesa taslimu)\b/i.test(text)) return 'cash';
  if (/\b(?:bank|benki|bank transfer)\b/i.test(text)) return 'bank';
  if (/\b(?:m-?pesa|mpesa|mobile money|tigo pesa|airtel money|halopesa)\b/i.test(text)) return 'mobile_money';
  if (/\b(?:other|nyingine)\b/i.test(text)) return 'other';
  return null;
}

function supplierName(text: string): string | null {
  const match = text.match(/\b(?:kutoka kwa|from|supplier|muuzaji|kwa)\s+([\p{L}][\p{L}'’-]*(?:\s+[\p{L}][\p{L}'’-]*){0,2}?)(?=\s+kwa\s+(?:deni|mkopo)|\s+(?:on\s+)?credit\b|\s+[0-9]|$)/iu);
  if (!match) return null;
  const name = match[1]
    .replace(/\s+(?:cash|taslimu|bank|benki|mpesa|m-pesa|kwa|for|at|deni|mkopo)$/i, '')
    .trim();
  return /^(?:deni|mkopo|credit)$/i.test(name) ? null : (name || null);
}

export function parseWholeAnimalProcurement(
  input: string | null | undefined,
  lang: Lang = 'sw',
): WholeAnimalProcurementReading {
  const text = normalise(String(input ?? ''));
  if (!text) return { kind: 'none' };
  if (!/\b(?:nimenunua|nilinunua|tumenunua|nimechukua|bought|purchased)\b/.test(text)) return { kind: 'none' };

  // In Bucha vocabulary "mzoga" may mean spoilage. It never enters this path
  // without the actual animal word.
  const animal = /\bng['’]?ombe\b|\b(?:whole\s+)?cow(?:s)?\b/i.test(text);
  if (!animal) return { kind: 'none' };

  const countMatch = text.match(/\b(?:ng['’]?ombe|cows?|whole cow)\s+(?:mzima\s+)?(\d+|moja|mmoja|one|mbili|wawili|two|tatu|watatu|three|nne|wanne|four|tano|watano|five|sita|six|saba|seven|nane|eight|tisa|nine|kumi|ten)\b/i);
  const count = parseCount(countMatch?.[1]);

  // "kwa"/"for"/"@" establishes that this is the transaction total. A bare
  // number is never promoted to money because it may be the animal count.
  const totalMatch = text.match(/(?:\b(?:kwa|for|jumla|total)\b|@)\s*(?:tshs?|tsh|tzs|sh)?\s*([0-9][0-9,]*(?:\.\d+)?\s*(?:\/=|\/-)?)/i);
  const creditTotalMatch = text.match(/\b(?:deni|mkopo)\b\s*[, ]+\s*(?:tshs?|tsh|tzs|sh)?\s*([0-9][0-9,]*(?:\.\d+)?)/i);
  const total = parseMoney(totalMatch?.[1] ?? creditTotalMatch?.[1]);

  const missing: Array<'quantity' | 'cost'> = [];
  if (count === null) missing.push('quantity');
  if (total === null) missing.push('cost');
  if (missing.length > 0) {
    const sw = missing.length === 2
      ? 'Ng\'ombe wangapi, na jumla ya ununuzi ni TSh ngapi?'
      : missing[0] === 'quantity' ? 'Ng\'ombe wangapi?' : 'Jumla ya ununuzi ni TSh ngapi?';
    const en = missing.length === 2
      ? 'How many cows, and what is the total purchase cost?'
      : missing[0] === 'quantity' ? 'How many cows?' : 'What is the total purchase cost?';
    return { kind: 'missing', missing, question: lang === 'sw' ? sw : en };
  }

  return {
    kind: 'parsed',
    procurement: {
      animalType: "ng'ombe",
      animalCount: count!,
      purchaseTotal: total!,
      supplierName: supplierName(text),
      paymentMethod: paymentMethod(text),
      reference: null,
      note: null,
    },
  };
}

function money(amount: number, lang: Lang): string {
  return `${lang === 'sw' ? 'TSh' : 'TZS'} ${amount.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;
}

export function wholeAnimalProcurementConfirmation(
  procurement: WholeAnimalProcurement,
  occurredAt: string | null,
  lang: Lang,
): string {
  const perAnimal = Math.round((procurement.purchaseTotal / procurement.animalCount) * 100) / 100;
  const lines = lang === 'sw'
    ? [
      'Nimeelewa:',
      'Aina: Ununuzi wa ng\'ombe mzima',
      `Idadi: ${procurement.animalCount} ${procurement.animalCount === 1 ? 'ng\'ombe' : 'ng\'ombe'}`,
      `Jumla: *${money(procurement.purchaseTotal, lang)}*`,
      `Gharama kwa ng\'ombe: ${money(perAnimal, lang)}`,
    ]
    : [
      'I understood:',
      'Type: Whole-animal procurement',
      `Count: ${procurement.animalCount} ${procurement.animalCount === 1 ? 'cow' : 'cows'}`,
      `Total: *${money(procurement.purchaseTotal, lang)}*`,
      `Cost per animal: ${money(perAnimal, lang)}`,
    ];
  if (procurement.supplierName) lines.push(`${lang === 'sw' ? 'Supplier' : 'Supplier'}: ${procurement.supplierName}`);
  if (procurement.paymentMethod) lines.push(`${lang === 'sw' ? 'Malipo' : 'Payment'}: ${procurement.paymentMethod}`);
  if (occurredAt) lines.push(`${lang === 'sw' ? 'Tarehe imehifadhiwa' : 'Transaction date preserved'}: ${occurredAt.slice(0, 10)}`);
  lines.push('', lang === 'sw'
    ? 'Hii haijaongeza kilo za nyama au bidhaa nyingine.'
    : 'This has not created meat kilos or any other product stock.');
  lines.push(lang === 'sw'
    ? 'Jibu *1* Ndiyo · *2* Hapana'
    : 'Reply *1* Yes · *2* No');
  return lines.join('\n');
}
