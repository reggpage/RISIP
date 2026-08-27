import type { DailyRecordPaymentMethod } from './whatsappDailyRecords.ts';

/**
 * How the trader says they were paid.
 *
 * Manually recorded metadata and nothing else. No provider is contacted, no
 * payment is verified, and no gateway exists to contact. Risip is writing down
 * what somebody told it, exactly as a paper daftari would.
 *
 * "Deni" is absent on purpose and is checked for explicitly below. Credit
 * already has an accounting meaning — debt_issued — and letting it in here
 * would give one fact two incompatible representations.
 */
export type PaymentMethodReading = {
  method: DailyRecordPaymentMethod;
  /** The word the trader actually used, for the confirmation to quote back. */
  said: string;
  /** The message with the payment words removed, for the parsers that follow. */
  rest: string;
};

const clean = (value: string | null | undefined) =>
  String(value ?? '').replace(/\s+/g, ' ').trim();

/**
 * Ordered longest-phrase-first, because "mobile money" must win over "mobile"
 * and "kwa simu" must be seen before "simu" could be mistaken for a product.
 */
const PATTERNS: Array<{ re: RegExp; method: DailyRecordPaymentMethod }> = [
  { re: /\b(?:mobile\s*money|pesa\s+ya\s+simu|kwa\s+simu|nimetumiwa\s+kwa\s+simu|nimelipwa\s+kwa\s+simu)\b/iu, method: 'mobile_money' },
  { re: /\b(?:m\s*-?\s*pesa|mpesa|tigopesa|tigo\s*pesa|airtel\s*money|airtelmoney|halopesa|halo\s*pesa|mixx|ezypesa|mobile)\b/iu, method: 'mobile_money' },
  { re: /\b(?:bank\s*transfer|benki|bank|nimelipwa\s+benki)\b/iu, method: 'bank' },
  { re: /\b(?:cash|taslimu|fedha\s+taslimu|noti|mkononi)\b/iu, method: 'cash' },
];

/**
 * Credit, which is NOT a way of being paid. Seen here only so that a message
 * about credit can never be read as a cash sale on its way past.
 */
const CREDIT = /\b(?:deni|mkopo|hajalipa|atalipa|kwa\s+mkopo|hakulipa|bado\s+hajalipa)\b/iu;

export function statesCredit(text: string | null | undefined): boolean {
  return CREDIT.test(clean(text));
}

/**
 * Reads a payment method out of a message, or returns null.
 *
 * Null means the trader did not say, and null is what gets stored. Nothing here
 * ever defaults to cash: a shop that writes "nimeuza nyama kilo 2" has said
 * what it sold and not how it was paid, and filling that in would be inventing
 * the one fact the trader chose to leave out.
 */
export function extractPaymentMethod(text: string | null | undefined): PaymentMethodReading | null {
  const said = clean(text);
  if (!said) return null;
  // A sale on credit is not a sale paid by any method. It is left entirely
  // alone so the debt parsers see the sentence as written.
  if (statesCredit(said)) return null;

  for (const { re, method } of PATTERNS) {
    const match = re.exec(said);
    if (!match) continue;
    const rest = clean(said.replace(re, ' '));
    // Removing the word must leave a sentence behind. "cash" on its own is an
    // answer to a question, not a sale, and the flow that asked owns it.
    if (!rest) return null;
    return { method, said: clean(match[0]), rest };
  }
  return null;
}

/** How the method reads back to the shop, in its own language. */
export function paymentMethodLabel(
  method: DailyRecordPaymentMethod | null | undefined,
  lang: 'sw' | 'en',
): string {
  if (!method) return '';
  const labels: Record<'sw' | 'en', Record<DailyRecordPaymentMethod, string>> = {
    sw: { cash: 'cash', mobile_money: 'simu', bank: 'benki', other: 'njia nyingine' },
    en: { cash: 'cash', mobile_money: 'mobile money', bank: 'bank', other: 'other' },
  };
  return labels[lang][method];
}

/**
 * A bare answer to "ulilipwaje?" — "cash", "mpesa", "benki".
 *
 * Deliberately separate from extractPaymentMethod, which refuses a message that
 * is nothing but a payment word. Here that IS the whole message, because a
 * question was asked and this is the reply to it.
 */
export function parsePaymentMethodAnswer(
  text: string | null | undefined,
): DailyRecordPaymentMethod | null {
  const said = clean(text);
  if (!said || said.split(' ').length > 3) return null;
  if (statesCredit(said)) return null;
  for (const { re, method } of PATTERNS) {
    if (re.test(said)) return method;
  }
  return null;
}

/**
 * STAGE B — canonicalize a payment phrase the model already extracted.
 *
 * MEASURED FAILURE. Stage A.1, case 9180: "nimeuza soseji 12 kwa tigopesa"
 * arrived as payment_method = "cash". The model had been handed a four-value
 * enum and no field for the word, so it collapsed a Tanzanian mobile-money
 * brand into physical cash — and because nothing kept "tigopesa", no report,
 * no reconciliation and no human reading the ledger could ever have caught it.
 *
 * The table above has known tigopesa the whole time. The word simply never
 * reached it. So the model now sends payment_wording and this decides.
 *
 * Different from extractPaymentMethod, which pulls a method OUT of a whole
 * sentence and requires a sentence to be left behind. This receives a phrase
 * that is already only about payment, so "cash" alone is a valid input here
 * where it is deliberately not there.
 */
export type PaymentWordingReading =
  | { kind: 'method'; method: DailyRecordPaymentMethod; said: string }
  | { kind: 'credit' }
  | { kind: 'ask'; said: string }
  | { kind: 'absent' };

export function canonicalPaymentWording(wording: string | null | undefined): PaymentWordingReading {
  const said = clean(wording);
  if (!said) return { kind: 'absent' };
  // Credit is not a way of being paid. It has its own accounting meaning and
  // must leave payment_method NULL rather than pick a channel.
  if (statesCredit(said)) return { kind: 'credit' };

  for (const { re, method } of PATTERNS) {
    const match = re.exec(said);
    if (match) return { kind: 'method', method, said: clean(match[0]) };
  }
  // An unrecognised word never becomes cash. A shop paid through something
  // this table has not learned yet gets asked, and the answer is a word worth
  // adding — deliberately, once, not guessed every time it appears.
  return { kind: 'ask', said };
}

/** What to ask when a payment word is not recognised. */
export function paymentWordingQuestion(said: string, lang: 'sw' | 'en'): string {
  return lang === 'sw'
    ? `Sijaelewa *${said}* ni njia gani ya malipo. Ni *cash*, *mpesa/tigopesa/airtel*, au *benki*?`
    : `I do not recognise *${said}* as a payment method. Was it *cash*, *mobile money*, or *bank*?`;
}
