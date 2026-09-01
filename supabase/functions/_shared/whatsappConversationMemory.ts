import type { Lang } from './whatsappIntent.ts';
import type { QuantitySale } from './whatsappQuantitySale.ts';

export type ParkedQuantityMeaning = {
  kind: 'quantity_meaning_clarification';
  sourceMessageId: string;
  originalText: string;
  sale: QuantitySale;
  missingProducts?: string[];
  resolvedProducts?: string[];
};

export type HypotheticalPortionChoice = {
  kind: 'hypothetical_portion_choice';
  productName: string;
  units: string[];
};

const clean = (value: string | null | undefined) => String(value ?? '').trim().toLocaleLowerCase('sw-TZ');

/**
 * The one-word answer, or the number.
 *
 * MEASURED, and it was the same trap twice: the question printed "1. MAUZO
 * 2. STOCK 3. MANUNUZI" while this function rejected "2" outright. Tap the
 * number, nothing happens, and the question comes back — indistinguishable
 * from the service being broken.
 *
 * The words the owner chose, because they are how a shopkeeper says it:
 *
 *   MAUZO   I sold these
 *   ONGEZA  I bought them, or they arrived — add them to what I have
 *   SAJILI  these are new products; put them on my list first
 *
 * "ongeza" used to route to registration. It does not any more: adding stock
 * and adding a PRODUCT are different acts, and the shop that says "ongeza" at
 * a counter means the first one. "ongeza bidhaa" — with the noun — still means
 * registration and is handled by wantsToRegisterNewProducts.
 *
 * Anything longer than this belongs to the model. A person who answers "hizi
 * nimezinunua leo asubuhi" has answered perfectly clearly, and a parser that
 * re-asks them is the robot the owner keeps objecting to.
 */
export function parseQuantityMeaningAnswer(
  text: string | null | undefined,
): 'sale' | 'stock_purchase' | 'stock_count' | null {
  const said = clean(text).replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  if (said === '1') return 'sale';
  if (said === '2') return 'stock_purchase';
  if (/^(?:ni\s+)?(?:mauzo|sale|sales|sold)$/.test(said)) return 'sale';
  if (/^(?:ni\s+)?(?:ongeza|manunuzi|stock purchase|purchase|bought|stock niliyonunua)$/.test(said)) {
    return 'stock_purchase';
  }
  // No longer offered as an option — an absolute shelf count is a deliberate
  // act with its own header word — but still understood when somebody says it,
  // because the vocabulary a shop has learned is not ours to withdraw.
  if (/^(?:ni\s+)?(?:stock|bidhaa|stock iliyopo|bidhaa zilizopo|hesabu(?: ya)? (?:stock|bidhaa)|idadi zilizopo|count|stock count|on hand)$/.test(said)) {
    return 'stock_count';
  }
  return null;
}

export function wantsToRegisterNewProducts(text: string | null | undefined): boolean {
  const said = clean(text).replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  // "3" is SAJILI in the three-way question. Bare "ongeza" is gone from this
  // list: it now means adding STOCK, not adding a product. "ongeza bidhaa" —
  // with the noun — still means registration, because that is what it says.
  if (said === '3') return true;
  return /^(?:ndiyo|dio|yes|yeah|yep|sajili|nisajilie|ongeza bidhaa|weka bidhaa|bidhaa mpya)$/.test(said);
}

/**
 * The question that stops a list of numbers becoming the wrong kind of record.
 *
 * THE OWNER'S IMPROVEMENT, and it is the right one: "nataka ai iwe na akili
 * isiwe tu kama roboti… kama ai imenotice bidhaa ambazo hazipo ndio iseme pia
 * kuna bidhaa naona hazipo kwenye stoo yako hizi ni mpya kama ni mpya chagua
 * manunuzi."
 *
 * The server already knows which of these products the shop sells — it resolves
 * every one of them a moment later. Asking the question without saying so made
 * it read like a form. Saying so turns three equal options into a decision the
 * shopkeeper can already half-answer: nine products he recognises is a sale or
 * a count, and a name he has never registered is almost certainly something he
 * has just bought.
 *
 * It STATES what it found and never decides on it. Recognising a product does
 * not prove a sale, and a new name does not prove a purchase — a shop counting
 * a shelf for the first time meets both. So this leans, and he chooses.
 */
export function quantityMeaningQuestion(
  lang: Lang,
  missingProducts: string[] = [],
  knownProducts: string[] = [],
  /**
   * True when this question comes straight after a registration.
   *
   * The owner read that bubble and said what was wrong with it: it announced
   * "Bidhaa zote 11 zipo kwenye orodha yako" and then "Nimepata idadi za
   * bidhaa ulizotaja" — two lines telling him things he had just been told,
   * before the one line that mattered. Resuming, the question introduces
   * itself in his own words and nothing else.
   */
  resuming = false,
): string {
  const known = resuming || knownProducts.length === 0 ? '' : (missingProducts.length === 0
    ? (lang === 'sw'
      ? `_Bidhaa zote ${knownProducts.length} zipo kwenye orodha yako._\n\n`
      : `_All ${knownProducts.length} are already in your product list._\n\n`)
    : (lang === 'sw'
      ? `_Bidhaa ${knownProducts.length} zipo kwenye orodha yako._\n\n`
      : `_${knownProducts.length} are already in your product list._\n\n`));

  const missing = missingProducts.length === 0 ? '' : lang === 'sw'
    ? `\n\nHizi sijaziona kwenye stoo yako — ni mpya: ${missingProducts.map((name) => `*${name}*`).join(', ')}.\n`
      + 'Zikiwa mpya kweli, chagua *3* — nitakuomba bei ya kununua na bei ya kuuza.'
    : `\n\nI do not see these in your store — they are new: ${missingProducts.map((name) => `*${name}*`).join(', ')}.\n`
      + 'If they really are new, choose *3* — I will ask for buying and selling prices.';
  // THE OWNER'S THREE WORDS, AND WHAT EACH ONE MEANS.
  //
  // His wording: "iwe Mauzo, Ongeza na Sajili… pia mtu apewe maana zake."
  // They map onto how a shopkeeper actually thinks about a list of numbers —
  // did they leave, did they arrive, or are they new to the book — where
  // "STOCK" asked about an absolute shelf count, which is a rarer and more
  // deliberate act. It keeps its own header word and leaves this menu.
  //
  // Each line says what will HAPPEN, not just what it is called. "MANUNUZI"
  // told somebody the category; "nimenunua, ongeza kwenye zilizopo" tells them
  // the consequence.
  const opening = lang === 'sw'
    ? (resuming
      ? 'Sasa turudi kwenye bidhaa ulizonitumia awali — unataka tuzifanye nini?'
      : 'Nimepata idadi za bidhaa ulizotaja. Unataka nizifanye nini?')
    : (resuming
      ? 'Now back to the products you sent me earlier — what should I do with them?'
      : 'I found quantities for the products you named. What should I do with them?');
  const items = lang === 'sw'
    ? `${opening}\n\n`
      + '*1* *MAUZO* — nimeuza bidhaa hizi\n'
      + '*2* *ONGEZA* — nimenunua, ziongezwe kwenye zilizopo\n'
      + '*3* *SAJILI* — hizi ni bidhaa mpya, ziwekwe kwenye orodha kwanza'
    : `${opening}\n\n`
      + '*1* *MAUZO* — I sold these\n'
      + '*2* *ONGEZA* — I bought them, add them to what I have\n'
      + '*3* *SAJILI* — these are new products, put them on my list first';
  // "Or tell me in your own words" is not decoration. A person who answers
  // "hizi nimezinunua leo asubuhi" has answered clearly, and the model reads
  // that; the numbers exist for the person who would rather not type.
  return lang === 'sw'
    ? `${known}${items}${missing}\n\nJibu *1*, *2* au *3* — au niambie kwa maneno yako.\nUkitaka kuacha, andika *GHAIRI*.`
    : `${known}${items}${missing}\n\nReply *1*, *2* or *3* — or just tell me in your own words.\nTo stop, reply *GHAIRI*.`;
}

export function stockPurchaseNeedsPrices(state: ParkedQuantityMeaning, lang: Lang): string {
  const names = state.sale.items.map((item) => `• ${item.product}: ${item.quantity.toLocaleString('en-US')}`).join('\n');
  return lang === 'sw'
    ? `Nimepata bidhaa hizi:\n${names}\n\nNitumie bei uliyonunua kila moja, mstari mmoja kwa kila bidhaa.\nUkitaka kuacha, andika *GHAIRI*.`
    : `I found these products:\n${names}\n\nSend me what you paid for each one, one product per line.\nTo stop, reply *GHAIRI*.`;
}

export function hypotheticalPortionQuestion(state: HypotheticalPortionChoice, lang: Lang): string {
  const choices = state.units.map((unit) => `• ${unit}`).join('\n');
  return lang === 'sw'
    ? `${state.productName} ina bei kwa vipimo tofauti. Unataka makisio ya faida ukiuza kwa kipimo gani?\n${choices}`
    : `${state.productName} has prices for different selling units. Which unit should I use for the profit estimate?\n${choices}`;
}

export function matchHypotheticalPortionAnswer(
  text: string | null | undefined,
  state: HypotheticalPortionChoice,
): string | null {
  const said = clean(text).replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  return state.units.find((unit) => {
    const key = clean(unit).replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
    return said === key || said === `kwa ${key}` || said === `by ${key}` || said === `per ${key}`;
  }) ?? null;
}
