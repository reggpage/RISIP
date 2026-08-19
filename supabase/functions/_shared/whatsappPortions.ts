import type { Lang } from './whatsappIntent.ts';

export type PortionPriceDraft = {
  unit: string;
  retail: number;
  wholesale: number | null;
  minQty: number | null;
  baseQuantity?: number;
};

export type PortionSetupDraft = {
  kind: 'portion_setup_sizes';
  product: string;
  purchaseUnit: string;
  purchaseCost: number;
  saleUnits: PortionPriceDraft[];
};

export type PortionSetupReady = {
  kind: 'portion_setup_confirmation';
  product: string;
  baseUnit: string;
  purchaseUnit: string;
  purchaseSize: number;
  purchaseCost: number;
  saleUnits: Required<Pick<PortionPriceDraft, 'unit' | 'retail' | 'wholesale' | 'minQty' | 'baseQuantity'>>[];
};

export type DeclaredSaleUnit = {
  productKey: string;
  productName: string;
  unitKey: string;
  unitName: string;
  baseQuantity: number;
  retail: number | null;
  wholesale: number | null;
  wholesaleMinQty: number | null;
};

export type DeclaredSaleUnitMatch =
  | { kind: 'none' }
  | { kind: 'unit_required'; productName: string; units: string[] }
  | { kind: 'matched'; unit: DeclaredSaleUnit };

export type PortionQuantityPrompt = {
  kind: 'portion_quantity_prompt';
  productName: string;
  unitName: string;
};

const clean = (value: string | null | undefined) => String(value ?? '').replace(/\s+/g, ' ').trim();
const key = (value: string) => clean(value).toLocaleLowerCase('sw-TZ').replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');

/**
 * Does this look like the name of a measure, rather than a piece of a sentence?
 *
 * MEASURED FAILURE: the sale-unit patterns let a name run across spaces, so
 * "mafuta ndoo @20000 nauza ndoo ni lita 20 robo 700 nusu 1200" produced a unit
 * literally called "ndoo ni lita", and the template that came back read
 * "ndoo ni lita = 0.25 lita". The shopkeeper was then asked to fill in a form
 * built out of their own broken sentence.
 *
 * Two words at most, no digits, and no joining words. A name that fails this is
 * not trimmed into shape — the whole offer is refused, because a portion setup
 * built on a misread name would price every future sale of it wrongly.
 */
const CONNECTIVE = /^(?:ni|na|ya|wa|za|la|cha|vya|kwa|kila|ndio|is|are|of|the|and|to|per)$/i;

function isUnitName(value: string | null | undefined): boolean {
  const said = clean(value);
  if (!said || said.length > 24) return false;
  if (/[0-9]/.test(said)) return false;
  const parts = said.split(' ');
  if (parts.length > 2) return false;
  return !parts.some((word) => CONNECTIVE.test(key(word)));
}

function money(raw: string | undefined): number | null {
  if (!raw) return null;
  const value = Number(raw.replace(/[^0-9.]/g, ''));
  return Number.isFinite(value) && value > 0 && value <= 1_000_000_000 ? value : null;
}

/**
 * The compact form a shopkeeper proposed:
 *   mafuta ndoo @20000 nauza robo 700 nusu 1200 lita 2500
 *
 * It deliberately does NOT invent sizes. It only parks the names and prices;
 * the next message must state how every named unit converts to one base unit.
 */
export function parsePortionSetupOffer(text: string | null | undefined): PortionSetupDraft | null {
  const said = clean(text);
  const head = /^(.+?)\s+([\p{L}][\p{L}'’-]{0,39})\s+@\s*([0-9][0-9,.]*)\s+(?:nauza|ninauza|sell(?:ing)?|sold\s+at)\s+(.+)$/iu.exec(said);
  if (head) {
    const purchaseCost = money(head[3]);
    if (purchaseCost === null) return null;

    const tail = head[4];
    const matches = [...tail.matchAll(/([\p{L}][\p{L}'’\s-]*?)\s+([0-9][0-9,.]*)(?=\s+[\p{L}]|$)/giu)];
    if (matches.length === 0) return null;
    const saleUnits: PortionPriceDraft[] = [];
    for (const match of matches) {
      const unit = clean(match[1]);
      const retail = money(match[2]);
      if (!unit || retail === null || !isUnitName(unit)) return null;
      if (saleUnits.some((seen) => key(seen.unit) === key(unit))) return null;
      saleUnits.push({ unit, retail, wholesale: null, minQty: null });
    }
    const consumed = matches.map((match) => clean(match[0])).join(' ');
    if (key(consumed).replace(/\s/g, '') !== key(tail).replace(/\s/g, '')) return null;

    const product = clean(head[1]);
    const purchaseUnit = clean(head[2]);
    if (product.length < 2 || !/[\p{L}]/u.test(product)) return null;
    return { kind: 'portion_setup_sizes', product, purchaseUnit, purchaseCost, saleUnits };
  }

  // A more natural stock-entry form:
  //   store nyama ya ngombe kilo 10 nimenunua kwa 100,000,
  //   robo nauza 6,000, nusu nauza 12,000, kilo nauza 22,000
  // The stated batch cost is divided by its stated quantity. This is arithmetic,
  // not a guessed conversion: 10 kilo for 100,000 means cost per kilo is 10,000.
  const narrated = /^(?:(?:store|stock|hifadhi|weka)\s+)?(.+?)\s+(kilo|kg|lita|litre|liter)\s+([0-9]+(?:\.[0-9]+)?)\s+(?:nimenunua|nilinunua|nimechukua|bought)\s+(?:kwa|for|at)\s*(?:tshs?|tzs)?\s*([0-9]+(?:,[0-9]{3})*(?:\.[0-9]+)?)\s*[,;]?\s*(.+)$/iu.exec(said);
  if (!narrated) return null;
  const purchaseQuantity = Number(narrated[3]);
  const purchaseTotal = money(narrated[4]);
  if (!Number.isFinite(purchaseQuantity) || purchaseQuantity <= 0 || purchaseQuantity > 1_000_000
    || purchaseTotal === null) return null;

  const saleUnits: PortionPriceDraft[] = [];
  // A comma inside 12,000 is money; a comma followed by whitespace and the
  // next word separates two portion statements.
  const parts = narrated[5].split(
    /(?:[,;]\s*(?=[\p{L}])|\n+|\s+(?=[\p{L}][\p{L}'’-]*\s+(?:nauza|ninauza|sell(?:ing)?(?:\s+at)?)\b))/iu,
  ).map(clean).filter(Boolean);
  for (const part of parts) {
    const sale = /^([\p{L}][\p{L}'’\s-]{0,39}?)\s+(?:nauza|ninauza|sell(?:ing)?(?:\s+at)?)\s*(?:tshs?|tzs)?\s*([0-9][0-9,.]*)$/iu.exec(part);
    const retail = money(sale?.[2]);
    const unit = clean(sale?.[1]);
    if (!unit || retail === null || !isUnitName(unit)
      || saleUnits.some((seen) => key(seen.unit) === key(unit))) return null;
    saleUnits.push({ unit, retail, wholesale: null, minQty: null });
  }
  if (saleUnits.length === 0) return null;

  const product = clean(narrated[1]);
  const rawUnit = key(narrated[2]);
  const purchaseUnit = rawUnit === 'kg' ? 'kilo'
    : rawUnit === 'litre' || rawUnit === 'liter' ? 'lita' : clean(narrated[2]);
  const purchaseCost = purchaseTotal / purchaseQuantity;
  if (product.length < 2 || !/[\p{L}]/u.test(product) || purchaseCost <= 0) return null;
  return { kind: 'portion_setup_sizes', product, purchaseUnit, purchaseCost, saleUnits };
}

export function portionSizeQuestion(draft: PortionSetupDraft, lang: Lang): string {
  const namedBase = draft.saleUnits.find((item) => ['kilo', 'kg', 'lita', 'litre', 'liter'].includes(key(item.unit)))?.unit;
  const base = namedBase
    ? (['litre', 'liter'].includes(key(namedBase)) ? 'lita' : key(namedBase) === 'kg' ? 'kilo' : namedBase)
    : 'lita';
  const exampleSize = (unit: string) => key(unit) === 'robo' ? 0.25
    : key(unit) === 'nusu' || key(unit) === 'half' ? 0.5
    : key(unit) === key(base) ? 1 : 0.25;
  const examples = draft.saleUnits
    .filter((item) => key(item.unit) !== key(draft.purchaseUnit))
    .map((item) => `${item.unit} = ${exampleSize(item.unit)} ${base}`)
    .join('; ');
  // When the shop BUYS in the base unit, "kilo = 1 kilo" is a tautology — and a
  // question asking how many kilos are in a kilo reads like a broken form. Only
  // the portions are genuinely unknown, so only those are asked for.
  const buysInBase = key(draft.purchaseUnit) === key(base);
  if (buysInBase) {
    return lang === 'sw'
      ? `Nimeona bei za vipimo vya ${draft.product}, lakini sitakisia ukubwa wake.\n`
        + `Kila kipimo ni ${base} kiasi gani?\n\n`
        + `Jibu kwa muundo huu:\n${examples}\n\n`
        + 'Huu ni mfano tu. Weka namba halisi za bidhaa yako.'
      : `I found the portion prices for ${draft.product}, but I will not guess their sizes.\n`
        + `How much of a ${base} is each portion?\n\n`
        + `Reply like this:\n${examples}\n\n`
        + 'This is only an example. Put in the real numbers for your product.';
  }
  const purchaseExample = 20;
  const exampleTail = examples ? `; ${examples}` : '';
  return lang === 'sw'
    ? `Nimeona bei za vipimo vya ${draft.product}, lakini sitakisia ukubwa wake.\n`
      + `${draft.purchaseUnit} moja ina unit ya msingi ngapi? Na kila kipimo ni kiasi gani cha unit hiyo?\n\n`
      + `Jibu kwa muundo huu:\n${draft.purchaseUnit} = ${purchaseExample} ${base}${exampleTail}\n\n`
      + `Huu ni mfano tu. Badilisha "${base}" na namba hizo ziwe vipimo halisi vya bidhaa yako.`
    : `I found the portion prices for ${draft.product}, but I will not guess their sizes.\n`
      + `How many base units are in one ${draft.purchaseUnit}, and how much of that base unit is each selling portion?\n\n`
      + `Reply like this:\n${draft.purchaseUnit} = ${purchaseExample} ${base}${exampleTail}\n\n`
      + `This is only an example. Replace "${base}" and the numbers with the real measurements for your product.`;
}

type SizeStatement = { unit: string; quantity: number; baseUnit: string };

function parseSizeStatement(value: string): SizeStatement | null {
  const said = clean(value).replace(/^(?:na|and)\s+/i, '');
  const match = /^([\p{L}][\p{L}'’\s-]{0,39}?)\s*(?:moja\s*)?(?:ni|=|is|ina)?\s*(?:([0-9]+(?:\.[0-9]+)?)\s+([\p{L}][\p{L}'’-]{0,39})|([\p{L}][\p{L}'’-]{0,39})\s+([0-9]+(?:\.[0-9]+)?))$/iu.exec(said);
  if (!match) return null;
  const quantity = Number(match[2] ?? match[5]);
  const baseUnit = clean(match[3] ?? match[4]);
  if (!Number.isFinite(quantity) || quantity <= 0 || quantity > 1_000_000 || !baseUnit) return null;
  return { unit: clean(match[1]), quantity, baseUnit };
}

export function resumePortionSetup(
  draft: PortionSetupDraft,
  answer: string | null | undefined,
): { kind: 'ready'; setup: PortionSetupReady } | { kind: 'missing'; units: string[] } | { kind: 'invalid' } {
  const parts = String(answer ?? '').split(/[;,\n]+/).map(clean).filter(Boolean);
  const statements = parts.map(parseSizeStatement);
  if (statements.some((item) => item === null)) return { kind: 'invalid' };
  const read = statements as SizeStatement[];
  const wanted = [draft.purchaseUnit, ...draft.saleUnits.map((item) => item.unit)];
  const found = new Map<string, SizeStatement>();
  for (const item of read) found.set(key(item.unit), item);
  let missing = wanted.filter((unit) => !found.has(key(unit)));
  // The purchase unit needs no statement when it IS the base unit: somebody who
  // buys by the kilo and answers "robo = 0.25 kilo" has already said everything
  // there is to say, and the question never asked them for "kilo = 1 kilo".
  const answeredBase = read.length > 0 ? key(read[0].baseUnit) : '';
  if (missing.length > 0 && answeredBase === key(draft.purchaseUnit)
    && missing.every((unit) => key(unit) === key(draft.purchaseUnit))) {
    found.set(key(draft.purchaseUnit), {
      unit: draft.purchaseUnit, quantity: 1, baseUnit: read[0].baseUnit,
    });
    missing = [];
  }
  if (missing.length > 0) return { kind: 'missing', units: missing };

  const purchase = found.get(key(draft.purchaseUnit))!;
  const baseKey = key(purchase.baseUnit);
  if (read.some((item) => key(item.baseUnit) !== baseKey)) return { kind: 'invalid' };
  return {
    kind: 'ready',
    setup: {
      kind: 'portion_setup_confirmation',
      product: draft.product,
      baseUnit: purchase.baseUnit,
      purchaseUnit: draft.purchaseUnit,
      purchaseSize: purchase.quantity,
      purchaseCost: draft.purchaseCost,
      saleUnits: draft.saleUnits.map((item) => ({
        ...item,
        baseQuantity: found.get(key(item.unit))!.quantity,
      })),
    },
  };
}

const amount = (value: number) => `TSh ${Math.round(value).toLocaleString('en-US')}`;
const quantity = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 6 });

export function portionSetupConfirmation(setup: PortionSetupReady, lang: Lang): string {
  const baseCost = setup.purchaseCost / setup.purchaseSize;
  const rows = setup.saleUnits.map((item) => {
    const cost = baseCost * item.baseQuantity;
    const margin = item.retail - cost;
    return `• ${item.unit}: ${quantity(item.baseQuantity)} ${setup.baseUnit} · ${amount(item.retail)}`
      + ` · ${lang === 'sw' ? 'gharama' : 'cost'} ${amount(cost)}`
      + ` · ${lang === 'sw' ? 'faida' : 'margin'} ${amount(margin)}`;
  }).join('\n');
  // "kilo 1 = 1 kilo" says nothing, and a confirmation that reads like a broken
  // form is one people stop reading. Buying by the base unit is just a price.
  const buysInBase = key(setup.purchaseUnit) === key(setup.baseUnit) && setup.purchaseSize === 1;
  const purchase = lang === 'sw'
    ? (buysInBase
      ? `• Kununua: ${amount(setup.purchaseCost)} kwa ${setup.baseUnit}\n`
      : `• Kununua: ${setup.purchaseUnit} 1 = ${quantity(setup.purchaseSize)} ${setup.baseUnit} @ ${amount(setup.purchaseCost)}\n`
        + `• Bei kwa ${setup.baseUnit}: ${amount(baseCost)}\n`)
    : (buysInBase
      ? `• Purchase: ${amount(setup.purchaseCost)} per ${setup.baseUnit}\n`
      : `• Purchase: 1 ${setup.purchaseUnit} = ${quantity(setup.purchaseSize)} ${setup.baseUnit} @ ${amount(setup.purchaseCost)}\n`
        + `• Cost per ${setup.baseUnit}: ${amount(baseCost)}\n`);
  return lang === 'sw'
    ? `Nimeelewa ${setup.product}:\n`
      + `• Unit ya stock: ${setup.baseUnit}\n${purchase}`
      + `\nVipimo vya kuuza:\n${rows}\n\n`
      + 'Nihifadhi mpangilio huu? *NDIYO* / *HAPANA*'
    : `I understood ${setup.product}:\n`
      + `• Stock unit: ${setup.baseUnit}\n${purchase}`
      + `\nSelling portions:\n${rows}\n\n`
      + 'Save this setup? *YES* / *NO*';
}

export function portionSetupSaved(setup: PortionSetupReady, lang: Lang): string {
  const example = setup.saleUnits[0];
  return lang === 'sw'
    ? `✅ Nimeweka vipimo vya ${setup.product}. Sasa unaweza kuandika: "nimeuza ${setup.product} ${example.unit} 3".`
    : `✅ Saved the units for ${setup.product}. You can now write: "sold ${setup.product} ${example.unit} 3".`;
}

export function portionSetupCancelled(lang: Lang): string {
  return lang === 'sw' ? 'Sawa, sijaweka vipimo hivyo.' : 'Okay, I did not save those units.';
}

/** Exact on writes: declared portions never use fuzzy matching. */
export function matchDeclaredSaleUnit(asked: string, units: DeclaredSaleUnit[]): DeclaredSaleUnitMatch {
  const askedKey = key(asked);
  const byProduct = new Map<string, DeclaredSaleUnit[]>();
  for (const unit of units) {
    const list = byProduct.get(unit.productKey) ?? [];
    list.push(unit);
    byProduct.set(unit.productKey, list);
    if (askedKey === `${key(unit.productName)} ${key(unit.unitName)}`
      || askedKey === `${unit.productKey} ${unit.unitKey}`) {
      return { kind: 'matched', unit };
    }
  }
  for (const [productKey, choices] of byProduct) {
    if (askedKey !== productKey && askedKey !== key(choices[0]?.productName ?? '')) continue;
    if (choices.length === 1) return { kind: 'matched', unit: choices[0] };
    return {
      kind: 'unit_required',
      productName: choices[0]?.productName ?? asked,
      units: choices.map((item) => item.unitName),
    };
  }
  return { kind: 'none' };
}

/**
 * Finds a complete product + declared portion whose only missing fact is the
 * quantity. Exact matching is intentional: this state will become a money
 * record after confirmation, so a typo must not choose a different product.
 */
export function matchPortionMissingQuantity(
  text: string | null | undefined,
  units: DeclaredSaleUnit[],
): PortionQuantityPrompt | null {
  const said = clean(text);
  if (!said || /\d/.test(said)) return null;
  const asked = said
    .replace(/^(?:nimeuza|nauza|ninauza|sold|i\s+sold|sell)\s+/iu, '')
    .replace(/[?.!,]+$/g, '')
    .trim();
  const matched = matchDeclaredSaleUnit(asked, units);
  if (matched.kind !== 'matched') return null;
  return {
    kind: 'portion_quantity_prompt',
    productName: matched.unit.productName,
    unitName: matched.unit.unitName,
  };
}

export function parsePortionQuantityAnswer(text: string | null | undefined): number | null {
  const said = clean(text).toLocaleLowerCase('sw-TZ');
  const match = /^(?:nimeuza\s+)?(?:robo|nusu|lita|kilo|quarter|half|litre|liter|kilogram|kg)?\s*([0-9]+(?:\.[0-9]+)?)\s*(?:robo|nusu|lita|kilo|quarter|half|litre|liter|kilogram|kg)?$/iu.exec(said);
  const value = Number(match?.[1]);
  return Number.isFinite(value) && value > 0 && value <= 100_000 ? value : null;
}

export function portionQuantityQuestion(prompt: PortionQuantityPrompt, lang: Lang): string {
  return lang === 'sw'
    ? `Umeuza ${prompt.unitName} ngapi za ${prompt.productName}?\nMfano: "nimeuza ${prompt.productName} ${prompt.unitName} 3".`
    : `How many ${prompt.unitName} portions of ${prompt.productName} did you sell?\nExample: "sold ${prompt.productName} ${prompt.unitName} 3".`;
}

export function portionUnitRequired(product: string, units: string[], lang: Lang): string {
  const choices = units.map((unit) => `• ${unit}`).join('\n');
  return lang === 'sw'
    ? `${product} ina vipimo zaidi ya kimoja. Umeuza kwa kipimo gani?\n${choices}\n\nMfano: "nimeuza ${product} ${units[0]} 3".`
    : `${product} has more than one selling unit. Which unit did you sell?\n${choices}\n\nExample: "sold ${product} ${units[0]} 3".`;
}
