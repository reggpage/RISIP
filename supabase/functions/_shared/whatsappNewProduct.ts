// A product the shop sells that Risip has never heard of.
//
// MEASURED FAILURE. A forty-eight-line till roll contained "nimeuza biblia 2".
// The shelf calls it "Bibilia ndogo", so the resolver found nothing, and the
// best Risip could do was name it and move on — leaving the shopkeeper to work
// out, on their own, that they now had to go and invent a price somewhere else
// before that sale could ever be recorded.
//
// The right answer is the one the owner asked for: notice it, say plainly that
// it is not in the store yet, and offer to add it. Adding a product needs three
// numbers and it may as well ask for all three at once — the buying cost,
// because without it every profit figure is blind, and both selling prices,
// because this shop trades at two.
//
// Nothing here guesses. A name that is a misspelling of something on the shelf
// would be created as a second product, so the offer says so out loud and leaves
// the choice where it belongs.

import type { Lang } from './whatsappIntent.ts';

export type NewProductPricing = {
  product: string;
  unitCost: number;
  retail: number;
  wholesale: number | null;
  wholesaleMinQty: number | null;
};

const clean = (s: string | null | undefined) => String(s ?? '').replace(/\s+/g, ' ').trim();

const NUMBER = '([0-9][0-9,. ]*)';

function money(raw: string | undefined): number | null {
  if (!raw) return null;
  const digits = raw.replace(/[,\s]/g, '');
  // "12.500" is twelve and a half thousand written with a dot; "12.50" is cents.
  const normalised = /\.\d{3}$/.test(digits) ? digits.replace('.', '') : digits;
  const value = Number(normalised);
  return Number.isFinite(value) && value > 0 && value < 100_000_000
    ? Math.round(value * 100) / 100
    : null;
}

const BUY = /(?:kununua|ninanunua|gharama|buying|cost)/i;
const RETAIL = /(?:rejareja|reja\s*reja|retail)/i;
const WHOLESALE = /(?:jumla|wholesale)/i;

/**
 * Reads one line of "<name> kununua X rejareja Y jumla Z kuanzia N".
 *
 * The buying cost and the retail price are both required: a product added with
 * neither is a name and nothing else, and the next sale of it fails in exactly
 * the same way that started this.
 */
export function parseNewProductLine(text: string | null | undefined): NewProductPricing | null {
  const said = clean(text).replace(/^[-•*\d.)\s]+/, '');
  if (!said) return null;

  const cost = money(new RegExp(`${BUY.source}\\s*(?:ni|is|:)?\\s*${NUMBER}`, 'i').exec(said)?.[1]);
  const retail = money(new RegExp(`${RETAIL.source}\\s*(?:ni|is|:)?\\s*${NUMBER}`, 'i').exec(said)?.[1]);
  const wholesale = money(new RegExp(`${WHOLESALE.source}\\s*(?:ni|is|:)?\\s*${NUMBER}`, 'i').exec(said)?.[1]);
  if (cost === null || retail === null) return null;

  const minMatch = /(?:kuanzia|from|starting(?:\s+at)?)\s*(?:pcs|vipande)?\s*([0-9]+(?:\.[0-9]+)?)/i.exec(said);
  const minQty = minMatch ? Number(minMatch[1]) : null;

  // The name is what is left once every label and every number is removed. The
  // connecting words are stripped only where they connect: "ya" is part of half
  // the names in this shop — nguvu ya sala, rosali ya maria, kalamu za rangi.
  const product = said
    .replace(new RegExp(`${BUY.source}\\s*(?:ni|is|:)?\\s*${NUMBER}`, 'gi'), ' ')
    .replace(new RegExp(`${RETAIL.source}\\s*(?:ni|is|:)?\\s*${NUMBER}`, 'gi'), ' ')
    .replace(new RegExp(`${WHOLESALE.source}\\s*(?:ni|is|:)?\\s*${NUMBER}`, 'gi'), ' ')
    .replace(/(?:kuanzia|from|starting(?:\s+at)?)\s*(?:pcs|vipande)?\s*[0-9]+(?:\.[0-9]+)?/gi, ' ')
    .replace(/\b(?:bei|price|ongeza|weka|bidhaa|product|add)\b/gi, ' ')
    // Standalone numbers only. A digit welded to letters is part of the name —
    // "karatasi A4 rimu" is a real product, and stripping every digit turned it
    // into "karatasi A rimu", a product that does not exist.
    .replace(/(?<![\p{L}])[0-9]+(?![\p{L}])/gu, ' ')
    .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^(?:ya|za|wa|kwa|of|for|ni|is)\s+/i, '')
    .replace(/\s+(?:na|and|ni|is|kwa|for)$/i, '')
    .trim();

  if (product.length < 2 || !/[\p{L}]/u.test(product)) return null;
  if (wholesale !== null && wholesale > retail) return null;
  if (minQty !== null && wholesale === null) return null;
  return {
    product,
    unitCost: cost,
    retail,
    wholesale,
    wholesaleMinQty: minQty && minQty > 0 ? minQty : null,
  };
}

/** Several new products in one message, which is how a restock arrives. */
export function parseNewProductPricing(text: string | null | undefined): NewProductPricing[] {
  const lines = String(text ?? '').split(/\r?\n/).map(clean).filter(Boolean);
  const priced: NewProductPricing[] = [];
  for (const line of lines) {
    const one = parseNewProductLine(line);
    if (!one) continue;
    const at = priced.findIndex((seen) => seen.product.toLowerCase() === one.product.toLowerCase());
    if (at >= 0) priced[at] = one; else priced.push(one);
  }
  return priced;
}

const shillings = (value: number) => `TSh ${Math.round(value).toLocaleString('en-US')}`;

/**
 * Said when a sale names something the shop's catalogue has never carried.
 *
 * Deliberately not a yes/no question. "Ulitaka kuziweka? NDIYO" would need a
 * second round trip to collect the prices anyway, and a shopkeeper standing at a
 * counter should be able to finish this in one message.
 */
export function newProductOffer(names: string[], lang: Lang): string {
  const rows = names.map((name) => `  • ${name}`).join('\n');
  const example = names[0] ?? 'biblia';
  return lang === 'sw'
    ? `\n❓ Hizi hazipo kwenye store yako:\n${rows}\n`
      + 'Ulitaka kuziweka? Tuma bei zake, mstari mmoja kwa kila bidhaa:\n'
      + `_${example} kununua 9000 rejareja 12000 jumla 11000 kuanzia 3_\n`
      + 'Ukiacha "jumla" nitatumia bei moja tu. Ukiona jina limekosewa, rekebisha badala ya kuliweka upya.'
    : `\n❓ These are not in your store yet:\n${rows}\n`
      + 'Add them? Send their prices, one line per product:\n'
      + `_${example} kununua 9000 rejareja 12000 jumla 11000 kuanzia 3_\n`
      + 'Leave out "jumla" for a single price. If a name is mistyped, fix it rather than adding it twice.';
}

export function newProductConfirmation(products: NewProductPricing[], lang: Lang): string {
  const rows = products.map((product, index) => {
    const trade = product.wholesale === null
      ? ''
      : product.wholesaleMinQty === null
        ? (lang === 'sw' ? ` · jumla ${shillings(product.wholesale)}` : ` · wholesale ${shillings(product.wholesale)}`)
        : (lang === 'sw'
          ? ` · jumla ${shillings(product.wholesale)} (kuanzia ${product.wholesaleMinQty})`
          : ` · wholesale ${shillings(product.wholesale)} (from ${product.wholesaleMinQty})`);
    const margin = product.retail - product.unitCost;
    const perPiece = lang === 'sw'
      ? `\n     faida kwa kimoja: ${shillings(margin)}`
      : `\n     margin each: ${shillings(margin)}`;
    return `${index + 1}. ${product.product}\n`
      + `     ${lang === 'sw' ? 'kununua' : 'buying'} ${shillings(product.unitCost)}`
      + ` · ${lang === 'sw' ? 'rejareja' : 'retail'} ${shillings(product.retail)}${trade}${perPiece}`;
  }).join('\n');

  // The loss case is worth interrupting for. It reads and saves perfectly and
  // turns every future sale of the product into a loss.
  const losing = products.filter((product) => (product.wholesale ?? product.retail) <= product.unitCost);
  const warning = losing.length === 0 ? '' : (lang === 'sw'
    ? `\n\n⚠️ Hizi zinauzwa chini ya bei ya kununua — kila mauzo ni hasara:\n`
      + losing.map((product) => `  • ${product.product}`).join('\n')
    : `\n\n⚠️ These sell at or under what you pay — every sale is a loss:\n`
      + losing.map((product) => `  • ${product.product}`).join('\n'));

  return lang === 'sw'
    ? `Bidhaa mpya — ${products.length}:\n${rows}${warning}\n\nNiziweke kwenye store? NDIYO / HAPANA`
    : `New products — ${products.length}:\n${rows}${warning}\n\nAdd them to the store? YES / NO`;
}

export function newProductSaved(products: NewProductPricing[], lang: Lang): string {
  const first = products[0]?.product ?? '';
  return lang === 'sw'
    ? `✅ Nimeweka bidhaa ${products.length} kwenye store.\n\n`
      + `Sasa andika mauzo yake kawaida: "nimeuza ${first} 2".`
    : `✅ Added ${products.length} product(s) to the store.\n\n`
      + `Now record their sales as usual: "nimeuza ${first} 2".`;
}

export function newProductCancelled(lang: Lang): string {
  return lang === 'sw'
    ? 'Sawa, sijaweka bidhaa yoyote.'
    : 'Fine, nothing was added.';
}
