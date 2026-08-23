// Counting stock, and asking what is left.
//
// "Bibilia ndogo ninazo ngapi?" was answered "siwezi kuangalia idadi ya bidhaa
// zilizopo dukani" — honest, because nothing could count. Now it can, but only
// from a physical count forward, and the difference matters enormously:
//
//   counted    "Uliza ulipohesabu 90, tangu hapo umeuza 10 — zimebaki 80."
//   uncounted  "Sijawahi kuhesabu. Tangu nianze, umeuza 48." — NOT "-48 zipo."
//
// A number presented as stock when nobody ever counted the shelf is worse than
// no number: it will be believed, and it will be wrong.

import type { Lang } from './whatsappIntent.ts';
import { correctControlWords } from './whatsappSpelling.ts';

export type StockRow = {
  productName: string;
  unit: string | null;
  measured: boolean;
  onHand: number;
  hasCount: boolean;
  countedAt: string | null;
  boughtSince: number;
  soldSince: number;
  incompletePurchases: boolean;
};

export type StockCount = {
  product: string;
  quantity: number;
  unit: string | null;
};

export type AmbiguousStockChange = {
  product: string;
  quantity: number;
  unit: string | null;
  wording: 'add' | 'stock';
};

const clean = (s: string | null | undefined) => String(s ?? '').replace(/\s+/g, ' ').trim();

// "treya" and "katoni" come from the street corpus: a genge counts eggs by the
// tray and nothing else, and without the word the tray became part of the
// product name.
const UNITS = 'kilo|kilos|kg|gramu|lita|litre|liter|ml|mita|futi|gunia|debe|ndoo|pakiti|boksi|rimu|dazeni|robo|nusu|theluthi|kipande|mche|chupa|mfuko|kifurushi|treya|trei|tray|katoni|carton|kreti|crate';
const NUMBER = '[0-9]+(?:\\.[0-9]+)?';

/**
 * "Nina daftari 90", "nimehesabu sukari kilo 12.5", "daftari zimebaki 90".
 *
 * Deliberately narrow. A count overwrites what Risip believed, so a sentence
 * that merely mentions a product and a number must not become one — "nimeuza
 * daftari 90" is a sale and would wipe the shelf if misread.
 */
export function parseStockCount(text: string | null | undefined): StockCount | null {
  // MEASURED FAILURE: "kikokotoo zimbeaki 17" — one transposition in "zimebaki"
  // — was not a count at all. It fell through to the bare goods list, where
  // "kikokotoo zimbeaki" became a PRODUCT NAME the shop was then invited to
  // register. That is how a catalogue fills up with names nobody sells.
  //
  // "…5 storini" names the place, not the goods, and left the whole line
  // unreadable because the pattern ends at the number.
  const said = clean(correctControlWords(text)).replace(PLACE, '').trim();
  if (!said) return null;
  // Anything that is plainly a movement is not a count.
  if (/^(?:nimeuza|niliuza|uza|sold|nimenunua|nimelipa|nimetumia|amechukua|amelipa)\b/i.test(said)) return null;

  const patterns = [
    // An explicit shelf anchor, including the owner's portion example:
    // "store mafuta ndoo 2". This is a count, not a purchase movement.
    // Words meaning ADD are deliberately absent. "naongeza sukari 20" does
    // not say whether twenty arrived on top of the old stock or whether twenty
    // is the new physical count. Overwriting the shelf is not a clarification.
    new RegExp(`^(?:store|stoo|nimeweka)`
      + `\\s+(?:(?:bidhaa|bidhaa\\s+mpya|stock|store|mzigo|product|products)\\s+)?`
      + `(.+?)\\s+(?:(${UNITS})\\s+)?(${NUMBER})\\s*(${UNITS})?$`, 'i'),
    // nina daftari 90 [kipimo]
    new RegExp(`^(?:nina|ninazo|ninavyo|nimebakiwa na|nimebakisha)\\s+(.+?)\\s+(?:(${UNITS})\\s+)?(${NUMBER})\\s*(${UNITS})?$`, 'i'),
    // nimehesabu daftari 90
    new RegExp(`^(?:nimehesabu|hesabu ya|nimehesabia|counted|stock ya)\\s+(.+?)\\s+(?:(${UNITS})\\s+)?(${NUMBER})\\s*(${UNITS})?$`, 'i'),
    // daftari zimebaki 90
    new RegExp(`^(.+?)\\s+(?:zimebaki|imebaki|zilizobaki|zipo|ipo|remaining|left)\\s+(?:(${UNITS})\\s+)?(${NUMBER})\\s*(${UNITS})?$`, 'i'),
    // "zimebaki manila 63" — the same sentence with the verb in front, which is
    // how it gets said when the goods are what the sentence is about.
    new RegExp(`^(?:zimebaki|imebaki|zilizobaki|zimesalia)\\s+(.+?)\\s+(?:(${UNITS})\\s+)?(${NUMBER})\\s*(${UNITS})?$`, 'i'),
    // "Daftari ziwe 400", and "jaza birika ziwe 100" — the shelf being SET.
    // Neither a sale nor a purchase: "ziwe" is "let them be", which is what a
    // count says. One of these on its own belongs here; several in one message
    // are read by parseStockCountBatch.
    new RegExp(`^(?:jaza|weka|wekea|sahihisha)?\\s*(.+?)\\s+(?:ziwe|iwe|zibaki|ibaki)\\s+(?:(${UNITS})\\s+)?(${NUMBER})\\s*(${UNITS})?$`, 'i'),
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(said);
    if (!match) continue;
    const product = clean(match[1]).replace(/^(?:ya|za|wa|of)\s+/i, '');
    const quantity = Number(match[3]);
    const unit = (match[2] ?? match[4] ?? '').toLowerCase() || null;
    if (!product || product.length < 2 || !Number.isFinite(quantity) || quantity < 0) continue;
    // A name made only of digits is a parse gone wrong, not a product.
    if (!/[\p{L}]/u.test(product)) continue;
    return { product, quantity, unit };
  }
  return null;
}

/**
 * A stock phrase that contains a quantity but not enough meaning to move it.
 * This parser exists only to stop and ask; it never writes.
 */
export function parseAmbiguousStockChange(
  text: string | null | undefined,
): AmbiguousStockChange | null {
  const said = clean(correctControlWords(text));
  if (!said) return null;
  const pattern = new RegExp(
    `^(naongeza|ninaongeza|nimeongeza|ongeza|add|stock|stoo)`
      + `\\s+(?:(?:bidhaa|stock|store|stoo|mzigo|product|products)\\s+)?`
      + `(.+?)\\s+(?:(${UNITS})\\s+)?(${NUMBER})\\s*(${UNITS})?$`,
    'i',
  );
  const match = pattern.exec(said);
  if (!match) return null;
  const product = clean(match[2]).replace(/^(?:ya|za|wa|of)\s+/i, '');
  const quantity = Number(match[4]);
  const unit = (match[3] ?? match[5] ?? '').toLowerCase() || null;
  if (!product || !/[\p{L}]/u.test(product) || !Number.isFinite(quantity) || quantity <= 0) return null;
  return {
    product,
    quantity,
    unit,
    wording: /^(?:stock|stoo)$/i.test(match[1]) ? 'stock' : 'add',
  };
}

export function ambiguousStockChangeReply(change: AmbiguousStockChange, lang: Lang): string {
  const quantity = change.quantity.toLocaleString('en-US', { maximumFractionDigits: 3 });
  const unit = change.unit ? ` ${change.unit}` : '';
  if (lang === 'sw') {
    return `Sijaelewa kama ${quantity}${unit} ni bidhaa ulizoongeza, au ndiyo stock yote iliyopo sasa.\n\n`
      + `• Kuongeza ${quantity}${unit} ulizonunua, andika bei ya moja: `
      + `“Nimenunua ${change.product} ${quantity}${unit} kila moja TSh [bei ya moja]”.\n`
      + `• Kuweka hesabu ya stock yote kuwa ${quantity}${unit}, andika: `
      + `“Nina ${change.product} ${quantity}${unit}”.\n\n`
      + 'Sitaandika chochote mpaka uchague maana moja.';
  }
  return `I could not tell whether ${quantity}${unit} was added to the old stock, or is the full stock on hand now.\n\n`
    + `• To add ${quantity}${unit} purchased, include the unit cost: `
    + `“I bought ${change.product} ${quantity}${unit} each TSh [unit cost]”.\n`
    + `• To set the full stock count to ${quantity}${unit}, send: `
    + `“I have ${change.product} ${quantity}${unit}”.\n\n`
    + 'I will not write anything until you choose one meaning.';
}

/**
 * "Bibilia ndogo ninazo ngapi?", "stock ya daftari", "atlas ziko ngapi stoo".
 *
 * A product name followed by "ziko/zipo/zimebaki … ngapi" is the commonest way
 * the question is actually typed, and none of those words were here — so these
 * went to the model, which cannot count and had to be told to call a tool.
 *
 * `product: null` means the whole shelf: "bidhaa ziko ngapi store" is asking
 * what is in the shop, not about a product called "bidhaa".
 */
const STOCK_VERBS = 'ninazo|ninavyo|nina|nazo|zimebaki|imebaki|zilizobaki|zilizopo|zipo|ziko|ipo|iko|kuna|zimesalia';
/** Words that name the place, not the goods: "…ngapi store". */
const PLACE = /\s*(?:kwenye\s+|kwa\s+|katika\s+)?(?:stor(?:e|ini|eni)|stoo?(?:ni)?|ghala(?:ni)?|duka(?:ni)?|shopu?|hapa)\s*$/i;
/** The whole shelf, not a product with that name. */
const EVERYTHING = /^(?:bidhaa|bidha|vitu|vitu\s+vyangu|bidhaa\s+zangu|mzigo|stock|products?|items?|goods)$/i;
/** Questions that belong to another tool entirely and must not be claimed here. */
const NOT_STOCK = /\b(?:mauzo|faida|hasara|madeni|deni|wadeni|wateja|risiti|pesa|matumizi|gharama|wafanyakazi|invoice|sales|profit|customers?|expenses?)\b/i;

/**
 * "sotck ya jalada", "stcok yangu ikoje".
 *
 * The general speller cannot hold the word "stock": it is one edit from "stick"
 * and would have rewritten a real product name (see whatsappSpelling.ts). Here
 * it is safe, because only the FIRST word is touched and only when the word
 * that follows is "ya" or "yangu" — a position where a product name can never
 * stand.
 */
function fixLeadingStock(said: string): string {
  return said.replace(/^([\p{L}]{4,6})(\s+(?:ya|za|yangu|zangu)\b)/iu, (whole, word: string, tail: string) =>
    word.toLowerCase() !== 'stock' && [...word.toLowerCase()].sort().join('') === 'ckost'
      ? 'stock' + tail
      : whole);
}

export function parseStockQuestion(text: string | null | undefined): { product: string | null } | null {
  const said = fixLeadingStock(clean(correctControlWords(text)).replace(/\?+\s*$/, '').replace(PLACE, '').trim());
  if (!said || NOT_STOCK.test(said)) return null;

  const named = said.match(new RegExp(`^(.+?)\\s+(?:${STOCK_VERBS})\\s+ngapi\\b`, 'i'))
    ?? said.match(/^(?:nina|ninazo|kuna|zipo|ziko)\s+(.+?)\s+ngapi\b/i)
    // "zimebaki atlasi ngapi" — the same question with the verb in front.
    ?? said.match(new RegExp(`^(?:${STOCK_VERBS})\\s+(.+?)\\s+ngapi\\b`, 'i'))
    ?? said.match(/^(?:stock|hisa)\s+(?:ya|za|of)\s+(.+?)\s*$/i)
    ?? said.match(/^how many\s+(.+?)\s+(?:do i have|are left|remain|in stock)/i);
  if (named) {
    const product = clean(named[1]).replace(/^(?:ya|za|wa|of)\s+/i, '');
    if (EVERYTHING.test(product)) return { product: null };
    if (product.length >= 2 && /[\p{L}]/u.test(product)) return { product };
  }

  if (/^(?:stock|hisa)$/i.test(said) || /^(?:nionyeshe|onyesha)\s+stock\b/i.test(said)) {
    return { product: null };
  }
  // MEASURED (scripts/interrogate.ts): "stock yangu ikoje", "nina nini dukani"
  // and "nionyeshe zilizopo" all went to the model. Every one of them is the
  // whole shelf, asked the way somebody standing in their own shop asks it.
  // ("dukani" is already gone by here — PLACE strips it.)
  if (/^(?:stock|hisa|bidhaa|vitu|mzigo)\s+(?:yangu|zangu|langu)\s*(?:ikoje|zikoje|iko\s*je|ziko\s*je|vipi)?$/i.test(said)
    || /^(?:nina|kuna)\s+nini$/i.test(said)
    || /^(?:zilizopo|zilizobaki|vilivyopo)$/i.test(said)
    || /^(?:nionyeshe|onyesha|nipe|niambie)\s+(?:zilizopo|zilizobaki|vilivyopo|bidhaa zilizopo|orodha ya bidhaa|stock yangu|bidhaa zangu)$/i.test(said)) {
    return { product: null };
  }
  // "bidhaa ngapi ziko store", "nina bidhaa ngapi" — the shelf, counted whole.
  if (new RegExp(`^(?:nina\\s+)?(?:bidhaa|vitu|mzigo|products?|items?)\\s+ngapi(?:\\s+(?:${STOCK_VERBS}))?$`, 'i').test(said)) {
    return { product: null };
  }
  return null;
}

/** “Bidhaa gani zimeisha?” asks for counted products at zero, not the whole shelf. */
export function parseOutOfStockQuestion(text: string | null | undefined): boolean {
  // "nini kimeisha dukani" names the place, and the place is not part of the
  // question — without stripping it the whole sentence went to the model.
  const said = clean(correctControlWords(text)).replace(/\?+\s*$/, '').replace(PLACE, '').trim();
  if (!said) return false;
  return /^(?:(?:nipe|onyesha|nionyeshe|orodha ya|list)\s+)?(?:bidhaa|vitu|products?|items?)\s+(?:gani\s+|zipi\s+)?(?:zimeisha|zilizoisha|zimekwisha|zenye\s+stock\s+0|out\s+of\s+stock)$/iu.test(said)
    || /^(?:nini|kitu gani|what)\s+(?:kimeisha|zimeisha|kimekwisha|zimekwisha|is\s+out\s+of\s+stock)$/iu.test(said)
    || /^(?:zipi|vipi|ipi)\s+(?:zimeisha|zilizoisha|zimekwisha|zimekwishaisha)$/iu.test(said);
}

export function outOfStockReply(rows: StockRow[], lang: Lang): string {
  const out = rows.filter((row) => row.hasCount && row.onHand <= 0);
  const uncounted = rows.filter((row) => !row.hasCount).length;
  const unknown = uncounted === 0 ? '' : (lang === 'sw'
    ? `\n\nBidhaa ${uncounted} bado hazijahesabiwa, kwa hiyo hazipo kwenye orodha hii.`
    : `\n\n${uncounted} products have not been counted yet, so they are not included here.`);
  if (out.length === 0) {
    return (lang === 'sw'
      ? 'Hakuna bidhaa iliyohesabiwa yenye stock 0.'
      : 'No counted product currently has zero stock.') + unknown;
  }
  const names = out.map((row) => `• ${row.productName}`).join('\n');
  return (lang === 'sw'
    ? `Bidhaa zenye stock 0:\n${names}`
    : `Products with zero stock:\n${names}`) + unknown;
}

/**
 * How far the books have gone below zero, which is not the same as stock.
 *
 * MEASURED FAILURE: daftari was reported as "-8". A shelf cannot hold minus
 * eight of anything, so that number is never an answer to "how many do I have"
 * — it is a report that something is missing from the records. Counted 240,
 * sold 248, bought nothing: either a restock was never written down, or a sale
 * was recorded twice.
 *
 * Shown as zero, with the shortfall named separately and a way to fix it. A
 * negative presented as stock is worse than no number, because it will be read
 * as stock and it cannot be.
 */
export function stockShortfall(row: StockRow): number {
  return row.onHand < 0 ? -row.onHand : 0;
}

function amount(row: StockRow): string {
  const decimals = row.measured ? 2 : 0;
  // Clamped: see stockShortfall. Every caller that prints a quantity prints it
  // through here, so there is no path left that can show a negative shelf.
  const value = Math.max(0, row.onHand)
    .toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: decimals });
  if (row.unit) return `${value} ${row.unit}`;
  return row.measured ? value : value;
}

/** Said whenever the books have gone below zero for one product. */
function shortfallNotice(row: StockRow, lang: Lang): string {
  const short = stockShortfall(row);
  if (short === 0) return '';
  const shown = short.toLocaleString('en-US', { maximumFractionDigits: row.measured ? 2 : 0 });
  return lang === 'sw'
    ? `\n\n⚠️ Mauzo yamezidi kwa ${shown}. Ama umeingiza stock bila kuirekodi, ama mauzo yamerudiwa mara mbili.`
      + `\nHesabu upya ili kurekebisha: "nina ${row.productName} 20".`
    : `\n\n⚠️ Sales exceed the count by ${shown}. Either a restock was never recorded, or a sale was recorded twice.`
      + `\nCount it again to fix it: "nina ${row.productName} 20".`;
}

const countedOn = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

/**
 * One product. The uncounted case never states a stock figure, because the
 * arithmetic has no starting point — it reports the movements instead and says
 * plainly what is missing.
 */
export function stockReply(row: StockRow | null, asked: string, lang: Lang): string {
  if (!row) {
    return lang === 'sw'
      ? `Sina rekodi ya ${asked}. Ukishaiuza au kuiingiza kama stock, nitaweza kuihesabu.`
      : `I have no record of ${asked}. Once you sell it or record it as stock, I can count it.`;
  }

  if (!row.hasCount) {
    const moved = lang === 'sw'
      ? `Tangu nianze kurekodi: umeingiza ${row.boughtSince}, umeuza ${row.soldSince}.`
      : `Since I started recording: ${row.boughtSince} in, ${row.soldSince} out.`;
    return lang === 'sw'
      ? `Sijawahi kuhesabu ${row.productName}, kwa hiyo siwezi kusema zilizopo.\n${moved}\n\n`
        + `Ukinihesabia mara moja — mfano "nina ${row.productName} 90" — nitaendelea kuhesabu mwenyewe.`
      : `I have never counted ${row.productName}, so I cannot say what is on the shelf.\n${moved}\n\n`
        + `Count it once — for example "nina ${row.productName} 90" — and I will keep count from there.`;
  }

  const since = lang === 'sw'
    ? `Tangu ulipohesabu ${countedOn(row.countedAt)}: umeingiza ${row.boughtSince}, umeuza ${row.soldSince}.`
    : `Since your count on ${countedOn(row.countedAt)}: ${row.boughtSince} in, ${row.soldSince} out.`;
  const caveat = row.incompletePurchases
    ? (lang === 'sw'
      ? '\n\n⚠️ Baadhi ya manunuzi ya stock hayakutaja idadi, kwa hiyo hayakuhesabika.'
      : '\n\n⚠️ Some stock purchases named no quantity, so they are not in this count.')
    : '';

  const head = lang === 'sw'
    ? `${row.productName}: zimebaki ${amount(row)}.`
    : `${row.productName}: ${amount(row)} left.`;
  return `${head}\n${since}${caveat}${shortfallNotice(row, lang)}`;
}

export function stockListReply(rows: StockRow[], lang: Lang): string {
  if (rows.length === 0) {
    return lang === 'sw'
      ? 'Sijahesabu bidhaa yoyote bado. Anza na moja: "nina daftari 90".'
      : 'Nothing has been counted yet. Start with one: "nina daftari 90".';
  }
  const counted = rows.filter((row) => row.hasCount);
  if (counted.length === 0) {
    const names = rows.map((row) => row.productName).join(', ');
    return lang === 'sw'
      ? `Sijawahi kuhesabu bidhaa yoyote, kwa hiyo siwezi kusema kiasi kilichopo.\nBidhaa zilizosajiliwa: ${names}.\n\nAnza na moja: "nina daftari 90".`
      : `I have never counted anything, so I cannot say how much is on the shelf.\nRegistered products: ${names}.\n\nStart with one: "nina daftari 90".`;
  }
  // WhatsApp allows 4,096 characters. Build within a conservative budget, but
  // never silently pretend the first 15 products are the whole catalogue.
  const budget = 3_200;
  const shown: string[] = [];
  for (const row of counted) {
    const line = `${shown.length + 1}. ${row.productName} — ${amount(row)}`;
    if (shown.join('\n').length + line.length + 1 > budget) break;
    shown.push(line);
  }
  const omitted = counted.length - shown.length;
  const omittedText = omitted > 0
    ? (lang === 'sw'
      ? `\n\nNimeonyesha ${shown.length} kati ya bidhaa ${counted.length} zilizohesabiwa.`
      : `\n\nShowing ${shown.length} of ${counted.length} counted products.`)
    : '';
  const uncountedRows = rows.filter((row) => !row.hasCount);
  const uncountedText = uncountedRows.length > 0
    ? (lang === 'sw'
      ? `\n\nBidhaa ${uncountedRows.length} bado hazijahesabiwa: ${uncountedRows.map((row) => row.productName).join(', ')}.`
      : `\n\n${uncountedRows.length} products have not been counted yet: ${uncountedRows.map((row) => row.productName).join(', ')}.`)
    : '';
  // Named, not hidden. A product showing zero because its books went below zero
  // is a different problem from one that simply sold out, and the shopkeeper is
  // the only person who can tell which of the two it is.
  const short = counted.filter((row) => stockShortfall(row) > 0);
  const shortText = short.length === 0 ? '' : (lang === 'sw'
    ? `\n\n⚠️ Hizi mauzo yamezidi hesabu, kwa hiyo nimeonyesha 0: ${short.map((row) => row.productName).join(', ')}.`
      + '\nHesabu upya, mfano: "nina daftari 20".'
    : `\n\n⚠️ For these, sales exceed the count, so I show 0: ${short.map((row) => row.productName).join(', ')}.`
      + '\nCount them again, e.g. "nina daftari 20".');
  const lines = shown.join('\n');
  return lang === 'sw'
    ? `Zilizopo (${counted.length} zilizohesabiwa):\n${lines}${omittedText}${uncountedText}${shortText}`
    : `On hand (${counted.length} counted):\n${lines}${omittedText}${uncountedText}${shortText}`;
}

export function stockCountConfirmation(count: StockCount, previous: number | null, lang: Lang): string {
  const unit = count.unit ? ` ${count.unit}` : '';
  const drift = previous === null || previous === count.quantity ? '' : (lang === 'sw'
    ? `\nNilikuwa nadhani zipo ${previous}. Hesabu yako ndiyo sahihi.`
    : `\nI believed there were ${previous}. Your count is the one that counts.`);
  return lang === 'sw'
    ? `✅ Nimehesabu ${count.product}: ${count.quantity}${unit}.${drift}\n\nKuanzia sasa nitafuatilia mwenyewe kadri unavyouza na kuingiza.`
    : `✅ Counted ${count.product}: ${count.quantity}${unit}.${drift}\n\nFrom here I will keep track as you sell and restock.`;
}
