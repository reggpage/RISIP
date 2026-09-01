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
  /** "kwa kilo", "kwa lita" — kept off the NAME, where it does not belong. */
  unit: string | null;
};

export type NewProductStock = {
  product: string;
  quantity: number;
  unit: string | null;
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

// "@" is how a trader writes a buying price, and "nauza" is how they say the
// selling one. The owner's own example: "Kamusi @5000 nauza 10,000". Shorter
// than the laboured form and far more likely to actually be typed.
const BUY = /(?:kununua|nimenunua|nilinunua|nimechukua|ninanunua|nanunua|gharama|buying|cost|@)/i;
const RETAIL = /(?:rejareja|reja\s*reja|retail|nauza|ninauza|nauzia|kuuza|kuuzia|selling)/i;
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
  // "sukari @2500 nauza 3500 kwa kilo" — the measure belongs to the product,
  // not inside its name. Left in, the shop ends up with a product called
  // "sukari kwa kilo" that no sale will ever match.
  const unitMatch = /\s(?:kwa|per|kila)\s+(kilo|kilos|kg|gramu|lita|litre|liter|ml|mita|futi|gunia|debe|ndoo|pakiti|boksi|rimu|dazeni)\s*$/i
    .exec(said);

  // The name is what is left once every label and every number is removed. The
  // connecting words are stripped only where they connect: "ya" is part of half
  // the names in this shop — nguvu ya sala, rosali ya maria, kalamu za rangi.
  const product = said
    .replace(new RegExp(`${BUY.source}\\s*(?:ni|is|:)?\\s*${NUMBER}`, 'gi'), ' ')
    .replace(new RegExp(`${RETAIL.source}\\s*(?:ni|is|:)?\\s*${NUMBER}`, 'gi'), ' ')
    .replace(new RegExp(`${WHOLESALE.source}\\s*(?:ni|is|:)?\\s*${NUMBER}`, 'gi'), ' ')
    .replace(/(?:kuanzia|from|starting(?:\s+at)?)\s*(?:pcs|vipande)?\s*[0-9]+(?:\.[0-9]+)?/gi, ' ')
    .replace(/\s(?:kwa|per|kila)\s+(?:kilo|kilos|kg|gramu|lita|litre|liter|ml|mita|futi|gunia|debe|ndoo|pakiti|boksi|rimu|dazeni)\s*$/i, ' ')
    .replace(/\b(?:bei|price)\s+(?:ya|of)\b/gi, ' ')
    .replace(/\b(?:bei|price|ongeza|weka|bidhaa|product|add|nasajili|sajili|register)\b/gi, ' ')
    // A label left standing because a LATER label matched the number first:
    // "Soda @700 nauza rejareja 1000" strips "rejareja 1000" and leaves the
    // shop with a product called "Soda nauza". The welcome now teaches exactly
    // this line, so it has to read cleanly.
    .replace(/\b(?:nauza|ninauza|nauzia|kuuza|kuuzia|selling|sell|rejareja|reja\s*reja|retail|jumla|wholesale|kununua|nimenunua|nilinunua|nimechukua|nanunua|ninanunua|gharama|buying|cost)\b/gi, ' ')
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
    unit: unitMatch ? unitMatch[1].toLowerCase() : null,
  };
}

/**
 * A registration line that is trying, and missing one half.
 *
 * MEASURED, and it is the same route that once wrote the wrong product to the
 * owner's books: parseNewProductLine requires BOTH a buying price and a selling
 * price, and returns null without either. So "kofia @4000" — a person who
 * genuinely means to register a product and simply has not typed the second
 * number — reads as nothing at all, falls past every deterministic branch, and
 * lands on the model, which had already proved what it does with a line shaped
 * like that.
 *
 * The owner asked for it directly: "bidhaa mpya ikiingia bila bei za kununua na
 * kuuza ai inotice mapema na kumsaidia mtu."
 *
 * Deliberately narrow. It only fires on a line that already carries ONE of the
 * two price markers, so an ordinary sentence with a number in it is not dragged
 * into a registration it never asked for.
 */
export type IncompletePriceLine = { product: string; hasCost: boolean; hasRetail: boolean };

export function readIncompletePriceLines(text: string | null | undefined): IncompletePriceLine[] {
  const found: IncompletePriceLine[] = [];
  const raws = String(text ?? '').split(/\r?\n/)
    .map((one) => clean(one).replace(/^[-•*\d.)\s]+/, ''))
    .flatMap(splitProductPriceSegments);
  for (const raw of raws) {
    const line = raw;
    if (!line || parseNewProductLine(line)) continue;
    const hasCost = new RegExp(`${BUY.source}\\s*(?:ni|is|:)?\\s*${NUMBER}`, 'i').test(line);
    const hasRetail = new RegExp(`${RETAIL.source}\\s*(?:ni|is|:)?\\s*${NUMBER}`, 'i').test(line);
    // One marker and not the other. Both means parseNewProductLine already had
    // it; neither means this is not a registration line at all.
    if (hasCost === hasRetail) continue;
    const product = line
      .replace(new RegExp(`${BUY.source}\\s*(?:ni|is|:)?\\s*${NUMBER}`, 'gi'), ' ')
      .replace(new RegExp(`${RETAIL.source}\\s*(?:ni|is|:)?\\s*${NUMBER}`, 'gi'), ' ')
      .replace(/(?<![\p{L}])[0-9]+(?![\p{L}])/gu, ' ')
      .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (product.length < 2 || !/[\p{L}]/u.test(product)) continue;
    found.push({ product, hasCost, hasRetail });
  }
  return found;
}

/** What is missing, said as the shopkeeper would say it. */
export function incompletePriceReply(lines: IncompletePriceLine[], lang: Lang): string {
  const rows = lines.map((line) => {
    const missing = line.hasCost
      ? (lang === 'sw' ? 'bei ya kuuza' : 'the selling price')
      : (lang === 'sw' ? 'bei ya kununua' : 'the buying price');
    return lang === 'sw'
      ? `• *${line.product}* — imebaki ${missing}`
      : `• *${line.product}* — still needs ${missing}`;
  }).join('\n');
  const example = lines[0]?.product ?? 'kofia';
  return lang === 'sw'
    ? `Karibu tumemaliza — kila bidhaa inahitaji bei mbili.\n\n${rows}\n\n`
      + `Mfano: _${example} @4000 nauza 7000_\n`
      + '_@_ ni uliyonunua, _nauza_ ni unayouza.\n'
      + 'Ukitaka kuacha, andika *GHAIRI*.'
    : `Almost there — each product needs both prices.\n\n${rows}\n\n`
      + `For example: _${example} @4000 nauza 7000_\n`
      + '_@_ is what you paid, _nauza_ is what you sell for.\n'
      + 'To stop, reply *GHAIRI*.';
}

/** Several new products in one message, which is how a restock arrives. */
/**
 * Two products, one line.
 *
 * MEASURED, and the reply it produced was nonsense. He sent:
 *
 *   handbag @1000 kuuza 5000 jumla 4500 vikoi @ 10000 kuuza 18000 jumla 15000
 *
 * The form asks for one product per line, and he answered on one line — which
 * is what people do. Everything downstream split on newlines only, so this was
 * read as a single product literally named "handbag kuuza jumla vikoi kuuza
 * jumla", and Risip asked him for a price he had already given twice.
 *
 * The shape of a registration line is fixed: a name, then labels and numbers.
 * So once the numbers have started, the next word that is neither a label nor
 * a number begins the NEXT product. Nothing here guesses at a name — it only
 * decides where one line stops being about one thing.
 */
const SEGMENT_LABEL = new RegExp(
  `^(?:${BUY.source}|${RETAIL.source}|${WHOLESALE.source}|bei|price|ya|ni|is|kuanzia|from|starting|at|pcs|vipande)$`,
  'i',
);

export function splitProductPriceSegments(line: string): string[] {
  const words = clean(line).split(' ').filter(Boolean);
  const segments: string[] = [];
  let current: string[] = [];
  let pricing = false;
  for (const word of words) {
    // "@1000" is a label welded to its number, and so is a bare "@".
    const label = /^@/.test(word) || SEGMENT_LABEL.test(word);
    const number = /^[0-9][0-9,.]*$/.test(word);
    if (pricing && !label && !number) {
      segments.push(current.join(' '));
      current = [];
      pricing = false;
    }
    if (label || number) pricing = true;
    current.push(word);
  }
  if (current.length > 0) segments.push(current.join(' '));
  return segments.filter((segment) => segment.trim().length > 0);
}

export function parseNewProductPricing(text: string | null | undefined): NewProductPricing[] {
  const lines = String(text ?? '').split(/\r?\n/).map(clean).filter(Boolean)
    .flatMap(splitProductPriceSegments);
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
export function newProductOffer(names: string[], lang: Lang, alreadyKnown = 0): string {
  const one = names.length === 1;
  const only = names[0] ?? 'biblia';
  // One product is named in the sentence itself. Listing a single bullet under
  // "these are not in your store" reads like a form, and the owner said so:
  // "kama ni bidhaa moja mtu ameulizia, ai ijibu kwa kutaja hiyo bidhaa".
  const heading = one
    ? (lang === 'sw'
      ? `\n❓ *${only}* haipo kwenye store yako.\n`
      : `\n❓ *${only}* is not in your store yet.\n`)
    : (lang === 'sw'
      ? `\n❓ Hizi hazipo kwenye store yako:\n${names.map((name) => `  • ${name}`).join('\n')}\n`
      : `\n❓ These are not in your store yet:\n${names.map((name) => `  • ${name}`).join('\n')}\n`);

  // Placeholders, not invented figures. The old example priced ugali at 9,000 a
  // plate because the numbers were hard-coded and the same for everything — a
  // guess dressed up as advice. The shape is what the person needs; the numbers
  // are the one thing only they know.
  const template = lang === 'sw'
    ? `_${only} @<bei uliyonunua> nauza <bei unayouza>_`
    : `_${only} @<buying price> nauza <selling price>_`;

  // WHAT IS ALREADY DONE, SAID BEFORE WHAT IS MISSING.
  //
  // The owner's rule, twice: "isikatishe bidhaa nyingine ifanye mahesabu then
  // ndio isime hizi bidhaa zina bei mbili." Nothing here is lost — a catalogue
  // miss holds the sale, registration follows, and the whole sale resumes
  // afterwards. But a person who types eleven products and is asked about two
  // has no way to know the other nine survived, and being asked about a
  // fraction of your work reads exactly like losing the rest of it.
  const done = alreadyKnown <= 0 ? '' : (lang === 'sw'
    ? `_Bidhaa ${alreadyKnown} zipo tayari kwenye stoo yako — nazipumzisha pembeni kwanza, tusajili hizi ambazo hazipo._\n`
    : `_The other ${alreadyKnown} are already in your store — I have set them aside while we register these._\n`);

  return lang === 'sw'
    ? `${done}${heading}${one ? 'Nitumie bei zake:\n' : 'Nitumie bei zake, mstari mmoja kwa kila bidhaa:\n'}`
      + `${template}\n`
      + 'Ukiuza pia kwa jumla, ongeza: _jumla <bei> kuanzia <idadi>_.\n'
      + 'Ukiona jina limekosewa, liandike upya sahihi.\n'
      + 'Ukitaka kuacha, andika *GHAIRI*.'
    : `${done}${heading}${one ? 'Send me its prices:\n' : 'Send me their prices, one line per product:\n'}`
      + `${template}\n`
      + 'If you also sell in bulk, add: _jumla <price> kuanzia <quantity>_.\n'
      + 'If a name is mistyped, write it again correctly.\n'
      + 'To stop, reply *GHAIRI*.';
}

/**
 * A quantity-only sale cannot be priced safely until every product exists in
 * the company's catalogue. Keep that distinction explicit: the sale has not
 * been recorded, and registering the product is the next step.
 */
export function newProductSaleOffer(names: string[], lang: Lang): string {
  const next = lang === 'sw'
    ? '\n\nNimehifadhi maelezo ya mauzo haya kwa muda. Ukimaliza kusajili bidhaa, nitakuonyesha mauzo hayo tena uyathibitishe kwa *1*.'
    : '\n\nI have kept this sale temporarily. After you register the product, I will show the sale again for a separate YES confirmation.';
  return newProductOffer(names, lang) + next;
}

export function newProductSaleWorkerBlocked(names: string[], lang: Lang): string {
  const rows = names.map((name) => `  • ${name}`).join('\n');
  return lang === 'sw'
    ? `Bidhaa hizi hazipo kwenye store ya kampuni:\n${rows}\n\n`
      + 'Sijaandika mauzo haya. Muombe owner au accountant azisajili kwanza; baada ya hapo utaweza kurekodi mauzo yake.'
    : `These products are not in the company store:\n${rows}\n\n`
      + 'I did not record this sale. Ask an owner or accountant to register them first; then you can record their sales.';
}

export function newProductPricingIncomplete(names: string[], lang: Lang): string {
  const rows = names.map((name) => `  • ${name}`).join('\n');
  return lang === 'sw'
    ? `Bado sijapata bei za bidhaa hizi:\n${rows}\n\nTuma bei ya kununua na ya kuuza kwa kila moja.`
    : `I still need prices for these products:\n${rows}\n\nSend the buying and selling price for each one.`;
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
    ? `Bidhaa mpya — ${products.length}:\n${rows}${warning}\n\nBei hizi ni sahihi? *1* Ndiyo · *2* Hapana · *GHAIRI* kuacha\n_Nitakuuliza stock iliyopo kabla ya kukamilisha usajili._`
    : `New products — ${products.length}:\n${rows}${warning}\n\nAre these prices correct? *1* Yes · *2* No · *CANCEL* to stop\n_I will ask for current stock before finishing registration._`;
}

function isMeasureAmbiguous(product: string): boolean {
  return /(?:^|\s)(?:mafuta|oil|lotion|cream|vaseline|gel)(?:\s|$)/iu.test(product);
}

function stockUnitLabel(product: NewProductPricing, lang: Lang): string {
  if (product.unit) return lang === 'sw' ? `kipimo: ${product.unit}` : `measure: ${product.unit}`;
  if (isMeasureAmbiguous(product.product)) {
    return lang === 'sw'
      ? 'kipimo hakijatajwa — taja kilo, lita, ml au vipande'
      : 'measure not stated — say kilos, litres, ml or pieces';
  }
  return lang === 'sw' ? 'idadi/vipande' : 'pieces/count';
}

/** Ask for the opening stock before a newly registered product becomes usable. */
export function newProductQuantityQuestion(products: NewProductPricing[], lang: Lang): string {
  const rows = products.map((product, index) =>
    `${index + 1}. *${product.product}* — ${stockUnitLabel(product, lang)}`).join('\n');
  return lang === 'sw'
    ? `Bei zimepokelewa. Kabla sijamaliza kusajili bidhaa, niambie *stock iliyopo sasa* kwa kila bidhaa:\n${rows}\n\n`
      + 'Andika bidhaa na kiasi chake, mfano: _vest vipande 10, belt vipande 5_. '
      + 'Kwa bidhaa za kupimwa unaweza kuandika _mafuta lita 5_, _mafuta ml 500_, _sukari kilo 2.5_.'
      + '\nUsipotaja kipimo cha mafuta/lotion/cream, nitauliza kwanza — sitakisia.\n'
      + 'Ukitaka kuacha, andika *GHAIRI*.'
    : `Prices received. Before I finish registering the products, tell me the *current stock* for each:\n${rows}\n\n`
      + 'Write each product and quantity, for example: _vest 10, belt 5_. '
      + 'For measured goods write _oil 5 litres_, _oil 500 ml_ or _sugar 2.5 kilos_.\n'
      + 'If oil/lotion/cream has no measure, I will ask instead of guessing.\n'
      + 'To stop, reply *GHAIRI*.';
}

export function newProductRegistrationConfirmation(
  products: NewProductPricing[],
  stock: NewProductStock[],
  lang: Lang,
): string {
  const rows = products.map((product, index) => {
    const found = stock[index];
    const quantity = found?.quantity.toLocaleString('en-US', { maximumFractionDigits: 3 }) ?? '?';
    const unit = found?.unit ?? product.unit;
    return `${index + 1}. *${product.product}* — stock *${quantity}${unit ? ` ${unit}` : ''}*`;
  }).join('\n');
  return lang === 'sw'
    ? `Uthibitisho wa mwisho wa usajili:\n${rows}\n\nBei na stock hizi ni sahihi? *1* Ndiyo · *2* Hapana · *GHAIRI* kuacha`
    : `Final registration confirmation:\n${rows}\n\nAre these prices and stock levels correct? *1* Yes · *2* No · *GHAIRI* to stop`;
}

export function newProductQuantityIncomplete(products: NewProductPricing[], completed: string[], lang: Lang): string {
  const missing = products.filter((product) => !completed.some((name) => name.toLowerCase() === product.product.toLowerCase()));
  const rows = missing.map((product) => `• *${product.product}* — ${stockUnitLabel(product, lang)}`).join('\n');
  return lang === 'sw'
    ? `Bado sijapata stock ya bidhaa hizi:\n${rows}\n\nTaja quantity ya kila moja. Usikisie kipimo; kwa mafuta/lotion/cream taja kilo, lita, ml au vipande.`
    : `I still need stock for these products:\n${rows}\n\nState the quantity for each. Do not guess the measure; for oil/lotion/cream state kilos, litres, ml or pieces.`;
}

/**
 * @param resume  false — nothing was waiting, so teach the next step.
 *                'sale' — a parked sale follows, and it is shown below.
 *                'question' — the direction question follows, and IT carries
 *                the "now back to your products" line. Repeating it here gave
 *                the owner the same sentence twice in one bubble.
 */
export function newProductSaved(
  products: NewProductPricing[],
  lang: Lang,
  resume: boolean | 'sale' | 'question' = false,
): string {
  const first = products[0]?.product ?? '';
  if (resume === 'question') {
    return lang === 'sw'
      ? `✅ Nimesajili bidhaa ${products.length}.`
      : `✅ Registered ${products.length} product(s).`;
  }
  if (resume) {
    return lang === 'sw'
      ? `✅ Nimesajili bidhaa ${products.length}.\n\nSasa turudi kwenye bidhaa ulizonitumia awali.`
      : `✅ Registered ${products.length} product(s).\n\nNow back to the products you sent me earlier.`;
  }
  return lang === 'sw'
    ? `✅ Nimesajili bidhaa ${products.length} na stock yake kwenye orodha ya bidhaa.\n\n`
      + `Sasa andika mauzo yake kawaida: "nimeuza ${first} 2".`
    : `✅ Registered ${products.length} product(s) and their stock.\n\n`
      + `Now record their sales as usual: "nimeuza ${first} 2".`;
}

export function newProductCancelled(lang: Lang): string {
  return lang === 'sw'
    ? 'Sawa, sijaweka bidhaa yoyote.'
    : 'Fine, nothing was added.';
}
