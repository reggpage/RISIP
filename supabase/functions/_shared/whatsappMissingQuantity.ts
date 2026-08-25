import type { Lang } from './whatsappIntent.ts';
import type { DailyRecordPaymentMethod } from './whatsappDailyRecords.ts';
import { normalizeNumberWords } from './whatsappDailyRecords.ts';
import { canonicalUnitWord, isUnitWord, UNITS } from './whatsappStock.ts';
import { extractPaymentMethod, statesCredit } from './whatsappPaymentMethod.ts';

/**
 * A sale that named the goods and not how many.
 *
 *   nimeuza soseji
 *   nimeuza soseji cash
 *   Juma kachukua nyama hajalipa
 *
 * All three used to reach the record parser, which asked for the AMOUNT — the
 * money — because that is the field it knew was missing. A shopkeeper who
 * answers "5" to "how much?" has said five shillings, and the sale that
 * followed was for five shillings.
 *
 * What is remembered while the question is out is deliberately thin: the
 * INTENT, the wording of the goods, the customer if there was one, and the
 * payment method if they already said it. No price, no total, no stock effect.
 * When the number arrives everything is resolved and priced again from the
 * company's own current data, exactly as if it had all been one message.
 */
export type QuantityWanted = {
  kind: 'quantity_wanted';
  /** Sale or credit sale. Decided by the first message and never re-guessed. */
  ledger: 'sale' | 'debt_issued';
  /** Canonical product name after a safe match; revalidated when the answer arrives. */
  product: string;
  party: string | null;
  paymentMethod: DailyRecordPaymentMethod | null;
  /** Safe context only; prices and totals are recalculated when quantity arrives. */
  occurredAt?: string | null;
};

/** The answer: "5", "kilo mbili", "mbili", "2 kilo". */
export type QuantityAnswer = {
  quantity: number;
  /** Present only when the trader said a measure. Never invented here. */
  unit: string | null;
};

const clean = (value: string | null | undefined) =>
  String(value ?? '').replace(/\s+/g, ' ').trim();

const TOOK = 'kachukua|amechukua|alichukua|anachukua|kakopa|amekopa|alikopa';
const UNPAID = /\b(?:hajalipa|hakulipa|bado\s+hajalipa|atalipa(?:\s+\w+)?|kwa\s+deni|kwa\s+mkopo|deni)\s*$/iu;

/**
 * Goods, not a sentence and not a number.
 *
 * A digit anywhere means the trader DID say how many and some other parser owns
 * the message. That is the whole guard against this path stealing an ordinary
 * sale.
 */
function plausibleGoods(value: string): boolean {
  const goods = clean(value);
  return goods.length >= 2 && goods.length <= 60
    && !/[0-9]/.test(goods)
    && /[\p{L}]/u.test(goods)
    && goods.split(' ').length <= 5
    // A business question is a new topic, not a product called "kiasi gani".
    && !/\b(?:gani|ngapi|how\s+much|what)\b/iu.test(goods)
    // A bare measure is not goods. "nimeuza kilo" says nothing about what.
    && !isUnitWord(goods);
}

function plausibleParty(value: string): boolean {
  const name = clean(value);
  return name.length >= 2 && name.length <= 40
    && /^[\p{L}][\p{L}'’.\- ]*$/u.test(name)
    && name.split(' ').length <= 2;
}

const titleCase = (value: string) =>
  clean(value).split(' ').filter(Boolean)
    .map((word) => word.charAt(0).toLocaleUpperCase('sw-TZ') + word.slice(1))
    .join(' ');

export function parseSaleMissingQuantity(
  text: string | null | undefined,
): QuantityWanted | null {
  const original = clean(text);
  if (!original) return null;

  // The method is read and removed first, so "nimeuza soseji cash" is goods
  // "soseji" and not goods "soseji cash".
  const paid = extractPaymentMethod(original);
  const said = paid ? paid.rest : original;

  // Credit: somebody took goods and has not paid.
  const took = new RegExp(`^(.+?)\\s+(?:${TOOK})\\s+(.+)$`, 'iu').exec(said);
  if (took && plausibleParty(took[1])) {
    const tail = UNPAID.exec(took[2]);
    if (tail) {
      const goods = clean(took[2].slice(0, tail.index));
      if (plausibleGoods(goods)) {
        return {
          kind: 'quantity_wanted',
          ledger: 'debt_issued',
          product: goods,
          party: titleCase(took[1]),
          // Credit is never a payment method, whatever else the message said.
          paymentMethod: null,
        };
      }
    }
    return null;
  }

  // A plain sale with no number in it.
  const sold = /^(?:leo\s+)?(?:nimeuza|niliuza|tumeuza|nauza|uza|sold)\s+(.+)$/iu.exec(said);
  if (!sold || statesCredit(said)) return null;
  const goods = clean(sold[1]);
  if (!plausibleGoods(goods)) return null;

  return {
    kind: 'quantity_wanted',
    ledger: 'sale',
    product: goods,
    party: null,
    paymentMethod: paid?.method ?? null,
  };
}

/**
 * The reply to "how many?".
 *
 * Only ever read while that question is actually outstanding — a bare "5" on
 * its own is not a transaction and this function is not consulted unless a live
 * quantity-awaiting conversation says it should be.
 */
export function parseQuantityAnswer(
  text: string | null | undefined,
): QuantityAnswer | null {
  const said = normalizeNumberWords(clean(text)).toLocaleLowerCase('sw-TZ');
  if (!said || said.split(' ').length > 4) return null;

  const shapes = [
    // "kilo mbili" -> "kilo 2"
    new RegExp(`^(${UNITS})\\s+([0-9]+(?:\\.[0-9]+)?)$`, 'iu'),
    // "2 kilo"
    new RegExp(`^([0-9]+(?:\\.[0-9]+)?)\\s+(${UNITS})$`, 'iu'),
  ];
  for (const [index, shape] of shapes.entries()) {
    const match = shape.exec(said);
    if (!match) continue;
    const quantity = Number(index === 0 ? match[2] : match[1]);
    const unit = canonicalUnitWord(index === 0 ? match[1] : match[2]);
    if (Number.isFinite(quantity) && quantity > 0 && quantity <= 100_000) {
      return { quantity, unit };
    }
  }

  const bare = /^([0-9]+(?:\.[0-9]+)?)$/.exec(said);
  if (bare) {
    const quantity = Number(bare[1]);
    if (Number.isFinite(quantity) && quantity > 0 && quantity <= 100_000) {
      return { quantity, unit: null };
    }
  }
  return null;
}

export function quantityQuestion(
  productName: string,
  unit: string | null,
  lang: Lang,
): string {
  if (lang === 'sw') {
    return unit
      ? `*${productName}* ${unit} ngapi?`
      : `*${productName}* ngapi?`;
  }
  return unit ? `How many ${unit} of *${productName}*?` : `How many *${productName}*?`;
}

/** The shop sells this in several ways and the message named none of them. */
export function quantityUnitQuestion(
  productName: string,
  units: string[],
  lang: Lang,
): string {
  const list = units.join(', ');
  return lang === 'sw'
    ? `*${productName}* unauza kwa ${list}. Umeuza kiasi gani, na kwa kipimo kipi?\n\nMfano: _${units[0]} 2_`
    : `You sell *${productName}* by ${list}. How much, and in which measure?\n\nFor example: _${units[0]} 2_`;
}

export function quantityNotUnderstood(productName: string, lang: Lang): string {
  return lang === 'sw'
    ? `Sijapata idadi ya *${productName}*. Andika namba tu, mfano: _5_.`
    : `I did not get the quantity for *${productName}*. Just the number, for example: _5_.`;
}
