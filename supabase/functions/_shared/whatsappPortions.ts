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

const clean = (value: string | null | undefined) => String(value ?? '').replace(/\s+/g, ' ').trim();
const key = (value: string) => clean(value).toLocaleLowerCase('sw-TZ').replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');

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
  if (!head) return null;
  const purchaseCost = money(head[3]);
  if (purchaseCost === null) return null;

  const tail = head[4];
  const matches = [...tail.matchAll(/([\p{L}][\p{L}'’\s-]*?)\s+([0-9][0-9,.]*)(?=\s+[\p{L}]|$)/giu)];
  if (matches.length === 0) return null;
  const saleUnits: PortionPriceDraft[] = [];
  for (const match of matches) {
    const unit = clean(match[1]);
    const retail = money(match[2]);
    if (!unit || retail === null) return null;
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

export function portionSizeQuestion(draft: PortionSetupDraft, lang: Lang): string {
  const examples = draft.saleUnits.map((item) => `${item.unit} = 0.25 lita`).join('; ');
  return lang === 'sw'
    ? `Nimeona bei za vipimo vya ${draft.product}, lakini sitakisia ukubwa wake.\n`
      + `${draft.purchaseUnit} moja ina unit ya msingi ngapi? Na kila kipimo ni kiasi gani cha unit hiyo?\n\n`
      + `Jibu kwa muundo huu:\n${draft.purchaseUnit} = 20 lita; ${examples}\n\n`
      + 'Badilisha "lita" na namba hizo ziwe vipimo halisi vya bidhaa yako.'
    : `I found the portion prices for ${draft.product}, but I will not guess their sizes.\n`
      + `How many base units are in one ${draft.purchaseUnit}, and how much of that base unit is each selling portion?\n\n`
      + `Reply like this:\n${draft.purchaseUnit} = 20 litre; ${examples}\n\n`
      + 'Replace "litre" and the numbers with the real measurements for your product.';
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
  const missing = wanted.filter((unit) => !found.has(key(unit)));
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
  return lang === 'sw'
    ? `Nimeelewa ${setup.product}:\n`
      + `• Unit ya stock: ${setup.baseUnit}\n`
      + `• Kununua: ${setup.purchaseUnit} 1 = ${quantity(setup.purchaseSize)} ${setup.baseUnit} @ ${amount(setup.purchaseCost)}\n`
      + `• Bei kwa ${setup.baseUnit}: ${amount(baseCost)}\n\nVipimo vya kuuza:\n${rows}\n\n`
      + 'Nihifadhi mpangilio huu? *NDIYO* / *HAPANA*'
    : `I understood ${setup.product}:\n`
      + `• Stock unit: ${setup.baseUnit}\n`
      + `• Purchase: 1 ${setup.purchaseUnit} = ${quantity(setup.purchaseSize)} ${setup.baseUnit} @ ${amount(setup.purchaseCost)}\n`
      + `• Cost per ${setup.baseUnit}: ${amount(baseCost)}\n\nSelling portions:\n${rows}\n\n`
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

export function portionUnitRequired(product: string, units: string[], lang: Lang): string {
  const choices = units.map((unit) => `• ${unit}`).join('\n');
  return lang === 'sw'
    ? `${product} ina vipimo zaidi ya kimoja. Umeuza kwa kipimo gani?\n${choices}\n\nMfano: "nimeuza ${product} ${units[0]} 3".`
    : `${product} has more than one selling unit. Which unit did you sell?\n${choices}\n\nExample: "sold ${product} ${units[0]} 3".`;
}
