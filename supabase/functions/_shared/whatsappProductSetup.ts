import type { Lang } from './whatsappIntent.ts';
import { UNITS } from './whatsappStock.ts';
import { normalizeNumberWords } from './whatsappDailyRecords.ts';

/**
 * Setting a product up in the words a shop uses to describe its own trade.
 *
 * Nothing here is a new engine. Every one of these sentences is read into the
 * arguments wa_configure_product_units already takes — a base unit, an optional
 * purchase unit with its size and cost, and the units it is sold in. The
 * conversion arithmetic (a box of twelve costing 18,000 makes a packet cost
 * 1,500) happens in SQL exactly as it did before this file existed.
 *
 * The shapes, in the order a butcher tends to use them:
 *
 *   ongeza nyama ya ng'ombe nanunua kilo 9000 nauza 12000
 *   ongeza maini nanunua 7000 nauza 10000 kilo
 *   ongeza chakula cha mbwa nauza kilo 2000
 *   ongeza maziwa box ina packet 12, box nanunua 18000 na packet nauza 2000
 *   ongeza soseji packet ina 24, packet nanunua 18000 na moja nauza 1000
 *   kwetu chakula cha mbwa kinawekwa vifuko vya kilo 1
 */
export type ProductSetup = {
  kind: 'product_setup';
  product: string;
  /** What the shop counts this product in. Stock lives in this unit. */
  baseUnit: string;
  /** What it is bought in, when that differs from the base unit. */
  purchaseUnit: string | null;
  /** How many base units come in one purchase unit. A box of 12 packets. */
  purchaseSize: number | null;
  /** What one purchase unit costs. Never divided here — SQL does that. */
  purchaseCost: number | null;
  /** What it is sold in. */
  saleUnit: string;
  salePrice: number | null;
};

/**
 * A package that holds a known amount, taught on its own.
 *
 * "Kifuko" is the case the brief singled out, and it is emphatically NOT a
 * product alias: a bag is not another name for dog food, it is a quantity of
 * it. It belongs with the other conversions, which is where this puts it.
 */
export type PackagingSetup = {
  kind: 'packaging_setup';
  product: string;
  packageUnit: string;
  baseUnit: string;
  size: number;
};

const clean = (value: string | null | undefined) =>
  String(value ?? '').replace(/\s+/g, ' ').trim();

const unit = `(?:${UNITS}|packet|packets|piece|pieces|box|boxes|kipande|vipande)`;
const num = String.raw`([0-9]+(?:\.[0-9]+)?)`;
const money = String.raw`([0-9][0-9,]*(?:\.[0-9]+)?)`;

const amount = (raw: string): number | null => {
  const value = Number(String(raw).replace(/,/g, ''));
  return Number.isFinite(value) && value > 0 ? value : null;
};

/** A product name, not a fragment of the sentence that follows it. */
function plausible(name: string): boolean {
  const value = clean(name);
  return value.length >= 2 && value.length <= 60
    && /[\p{L}]/u.test(value) && !/[0-9]/.test(value)
    && value.split(' ').length <= 6;
}

/** "moja nauza 1000" means one PIECE sells for 1000. */
const singular = (word: string): string => {
  const value = clean(word).toLocaleLowerCase('sw-TZ');
  if (value === '1' || value === 'moja' || value === 'each') return 'kipande';
  // Plurals a shop writes naturally: vifuko 3, not kifuko 3.
  return ({ vifuko: 'kifuko', mifuko: 'mfuko', boxes: 'box', packets: 'packet', pieces: 'kipande', vipande: 'kipande' })[value] ?? value;
};

export function parseProductSetup(
  text: string | null | undefined,
): ProductSetup | PackagingSetup | null {
  const said = normalizeNumberWords(clean(text)).toLocaleLowerCase('sw-TZ');
  if (!said) return null;

  // ── packaging on its own ─────────────────────────────────────────────────
  // "kwetu chakula cha mbwa kinawekwa vifuko vya kilo 1"
  const packaging = new RegExp(
    String.raw`^(?:kwetu\s+|huku\s+|hapa\s+)?(.+?)\s+(?:kina|ina|hu)?wekwa\s+(${unit})\s+(?:vya|za|ya|la|of)\s+(${unit})\s+${num}\s*$`,
    'iu',
  ).exec(said);
  if (packaging) {
    const size = amount(packaging[4]);
    if (plausible(packaging[1]) && size) {
      return {
        kind: 'packaging_setup',
        product: clean(packaging[1]),
        packageUnit: singular(packaging[2]),
        baseUnit: singular(packaging[3]),
        size,
      };
    }
  }

  const opened = /^(?:ongeza|sajili|weka|naongeza|nimeongeza|add|register)\s+(.+)$/iu.exec(said);
  if (!opened) return null;
  const body = clean(opened[1]);

  // ── a package that is bought whole and sold in pieces ─────────────────────
  // "maziwa box ina packet 12, box nanunua 18000 na packet nauza 2000"
  // "soseji packet ina 24, packet nanunua 18000 na moja nauza 1000"
  const packaged = new RegExp(
    String.raw`^(.+?)\s+(${unit})\s+ina\s+(?:(${unit})\s+)?${num}\s*[,]?\s*`
    + String.raw`(?:${unit})\s+(?:nanunua|ninanunua|nunua)\s+${money}\s*`
    + String.raw`(?:na\s+)?(${unit}|1|moja)\s+(?:nauza|ninauza|uza)\s+${money}\s*$`,
    'iu',
  ).exec(body);
  if (packaged) {
    const size = amount(packaged[4]);
    const cost = amount(packaged[5]);
    const price = amount(packaged[7]);
    const inner = singular(packaged[3] ?? packaged[6]);
    if (plausible(packaged[1]) && size && cost && price) {
      return {
        kind: 'product_setup',
        product: clean(packaged[1]),
        baseUnit: inner,
        purchaseUnit: singular(packaged[2]),
        purchaseSize: size,
        purchaseCost: cost,
        saleUnit: singular(packaged[6]) === 'kipande' ? inner : singular(packaged[6]),
        salePrice: price,
      };
    }
  }

  // ── bought and sold in the same unit ──────────────────────────────────────
  // "nyama ya ng'ombe nanunua kilo 9000 nauza 12000"
  const buyUnitFirst = new RegExp(
    String.raw`^(.+?)\s+(?:nanunua|ninanunua|nunua)\s+(${unit})\s+${money}\s+(?:nauza|ninauza|uza)\s+${money}\s*$`,
    'iu',
  ).exec(body);
  if (buyUnitFirst) {
    const cost = amount(buyUnitFirst[3]);
    const price = amount(buyUnitFirst[4]);
    if (plausible(buyUnitFirst[1]) && cost && price) {
      const measure = singular(buyUnitFirst[2]);
      return {
        kind: 'product_setup',
        product: clean(buyUnitFirst[1]),
        baseUnit: measure,
        purchaseUnit: measure,
        purchaseSize: 1,
        purchaseCost: cost,
        saleUnit: measure,
        salePrice: price,
      };
    }
  }

  // "maini nanunua 7000 nauza 10000 kilo"
  const unitLast = new RegExp(
    String.raw`^(.+?)\s+(?:nanunua|ninanunua|nunua)\s+${money}\s+(?:nauza|ninauza|uza)\s+${money}\s+(${unit})\s*$`,
    'iu',
  ).exec(body);
  if (unitLast) {
    const cost = amount(unitLast[2]);
    const price = amount(unitLast[3]);
    if (plausible(unitLast[1]) && cost && price) {
      const measure = singular(unitLast[4]);
      return {
        kind: 'product_setup',
        product: clean(unitLast[1]),
        baseUnit: measure,
        purchaseUnit: measure,
        purchaseSize: 1,
        purchaseCost: cost,
        saleUnit: measure,
        salePrice: price,
      };
    }
  }

  // ── selling price only ────────────────────────────────────────────────────
  // "chakula cha mbwa nauza kilo 2000"
  const sellOnly = new RegExp(
    String.raw`^(.+?)\s+(?:nauza|ninauza|uza)\s+(${unit})\s+${money}\s*$`, 'iu',
  ).exec(body)
    ?? new RegExp(
      String.raw`^(.+?)\s+(?:nauza|ninauza|uza)\s+${money}\s+(?:kwa\s+)?(${unit})\s*$`, 'iu',
    ).exec(body);
  if (sellOnly) {
    const unitFirst = new RegExp(`^${unit}$`, 'iu').test(sellOnly[2]);
    const price = amount(unitFirst ? sellOnly[3] : sellOnly[2]);
    const measure = singular(unitFirst ? sellOnly[2] : sellOnly[3]);
    if (plausible(sellOnly[1]) && price) {
      return {
        kind: 'product_setup',
        product: clean(sellOnly[1]),
        baseUnit: measure,
        // The shop said what it sells for, not what it paid. Nothing is
        // invented here: cost stays unknown until they say it.
        purchaseUnit: null,
        purchaseSize: null,
        purchaseCost: null,
        saleUnit: measure,
        salePrice: price,
      };
    }
  }

  return null;
}

const shillings = (value: number, lang: Lang) =>
  `${lang === 'sw' ? 'TSh' : 'TZS'} ${value.toLocaleString('en-US', { maximumFractionDigits: 2 })}`;

/**
 * The preview.
 *
 * `derivedUnitCost` is passed in by the caller, which computes it the same way
 * the database will. It is shown so the shop can check the division before it
 * is stored — 18,000 a box of twelve is 1,500 a packet, and a shop that
 * disagrees with that number needs to see it now, not in a margin report next
 * month.
 */
export function productSetupConfirmation(
  setup: ProductSetup,
  derivedUnitCost: number | null,
  lang: Lang,
): string {
  const rows: string[] = [];
  const sw = lang === 'sw';
  rows.push(sw ? `• Kipimo cha msingi: *${setup.baseUnit}*` : `• Base unit: *${setup.baseUnit}*`);
  if (setup.purchaseUnit && setup.purchaseSize !== null && setup.purchaseCost !== null) {
    if (setup.purchaseSize > 1) {
      rows.push(sw
        ? `• Ununuzi: *${setup.purchaseUnit} 1* = ${setup.baseUnit} ${setup.purchaseSize}, kwa ${shillings(setup.purchaseCost, lang)}`
        : `• Buying: *1 ${setup.purchaseUnit}* = ${setup.purchaseSize} ${setup.baseUnit}, at ${shillings(setup.purchaseCost, lang)}`);
      if (derivedUnitCost !== null) {
        rows.push(sw
          ? `• Gharama ya ${setup.baseUnit} 1: *${shillings(derivedUnitCost, lang)}*`
          : `• Cost per ${setup.baseUnit}: *${shillings(derivedUnitCost, lang)}*`);
      }
    } else {
      rows.push(sw
        ? `• Ununuzi: ${shillings(setup.purchaseCost, lang)} kwa ${setup.baseUnit}`
        : `• Buying: ${shillings(setup.purchaseCost, lang)} per ${setup.baseUnit}`);
    }
  } else {
    rows.push(sw
      ? '• Bei ya kununua: *sijui bado* — utaniambia utakaponunua'
      : '• Buying cost: *not yet known* — tell me when you buy');
  }
  if (setup.salePrice !== null) {
    rows.push(sw
      ? `• Mauzo: *${shillings(setup.salePrice, lang)}* kwa ${setup.saleUnit} 1`
      : `• Selling: *${shillings(setup.salePrice, lang)}* per ${setup.saleUnit}`);
  }
  return (sw
    ? `Nimeelewa *${setup.product}*:\n${rows.join('\n')}\n\nNihifadhi? *NDIYO* / *HAPANA*`
    : `Understood, *${setup.product}*:\n${rows.join('\n')}\n\nSave it? *YES* / *NO*`);
}

export function packagingConfirmation(setup: PackagingSetup, lang: Lang): string {
  return lang === 'sw'
    ? `Nimeelewa: *${setup.packageUnit} 1* ya ${setup.product} ni *${setup.baseUnit} ${setup.size}*.\n\n`
      + `Ukiuza ${setup.packageUnit} 3, nitatoa ${setup.baseUnit} ${setup.size * 3} kwenye stock.\n\n`
      + `Nihifadhi? *NDIYO* / *HAPANA*`
    : `Understood: *1 ${setup.packageUnit}* of ${setup.product} is *${setup.size} ${setup.baseUnit}*.\n\n`
      + `Sell 3 ${setup.packageUnit} and I take ${setup.size * 3} ${setup.baseUnit} off the shelf.\n\n`
      + `Save it? *YES* / *NO*`;
}

export function productSetupSaved(product: string, lang: Lang): string {
  return lang === 'sw'
    ? `Sawa. Nimehifadhi mpangilio wa *${product}*.`
    : `Done. I have saved the setup for *${product}*.`;
}

/**
 * Cost per base unit, computed the same way the database computes it.
 *
 * Here so the preview can show the shop the division before it is stored. The
 * stored figure is still the one SQL derives; this never becomes the source of
 * truth, and a division that does not come out evenly returns null rather than
 * a rounded number nobody chose.
 */
export function derivedUnitCost(setup: ProductSetup): number | null {
  if (setup.purchaseCost === null || !setup.purchaseSize || setup.purchaseSize <= 0) return null;
  const perUnit = setup.purchaseCost / setup.purchaseSize;
  return Number.isFinite(perUnit) ? Math.round(perUnit * 1e6) / 1e6 : null;
}

/** Parked while the shop checks the numbers. Nothing is stored until NDIYO. */
export type ProductSetupPending = {
  kind: 'product_setup_pending';
  setup: ProductSetup | PackagingSetup;
  /** The catalogue name, when this product already exists. */
  productName: string | null;
};

/**
 * The sale units wa_configure_product_units expects.
 *
 * base_quantity is 1 for the unit stock is counted in. A package that holds
 * more — a kifuko of one kilo, a box of twelve packets — is declared through
 * the purchase side or through packagingSaleUnits below, never by inventing a
 * second conversion mechanism here.
 */
export function setupSaleUnits(setup: ProductSetup): Array<Record<string, unknown>> {
  return [{
    unit: setup.saleUnit,
    base_quantity: 1,
    retail: setup.salePrice,
    wholesale: null,
    min_qty: null,
  }];
}
