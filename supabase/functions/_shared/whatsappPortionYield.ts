import type { Lang } from './whatsappIntent.ts';
import { UNITS } from './whatsappStock.ts';
import { normalizeNumberWords } from './whatsappDailyRecords.ts';

/**
 * How much of a measured good one portion is cut from.
 *
 * A butcher buys beef by the kilo and sells it as skewers. Nothing in the
 * ledger can connect the two until the shop says how many skewers a kilo
 * actually yields — and that number is the SHOP'S, never ours. A kijiwe cutting
 * big skewers gets twelve from a kilo; the one next door gets twenty.
 *
 * It is asked for, and stored, as an AVERAGE. Bone, fat and offcuts mean it
 * never comes out the same twice, and a system that treats an average as a law
 * reports theft every single day until nobody believes it any more.
 */
export type PortionYield = {
  kind: 'portion_yield';
  /** What the customer orders: "mshikaki". */
  portionName: string;
  /** What it is cut from: "nyama ya ngombe". */
  productName: string;
  /** The measure the product is bought in: "kilo". */
  baseUnit: string;
  /** How many portions one baseUnit yields, on average. */
  perBaseUnit: number;
  /** What one portion consumes, in baseUnit. The figure the ledger uses. */
  baseQuantity: number;
};

const clean = (value: string | null | undefined) => String(value ?? '').replace(/\s+/g, ' ').trim();

/** A name, not a fragment of a sentence: no digits, not absurdly long. */
function plausibleName(value: string): boolean {
  const name = clean(value);
  return name.length >= 2 && name.length <= 60 && !/[0-9]/.test(name) && /[\p{L}]/u.test(name);
}

function build(portionName: string, productName: string, baseUnit: string, perBaseUnit: number): PortionYield | null {
  if (!plausibleName(portionName) || !plausibleName(productName)) return null;
  // One portion per kilo is not a portion, and a thousand is a typo.
  if (!Number.isFinite(perBaseUnit) || perBaseUnit < 2 || perBaseUnit > 500) return null;
  return {
    kind: 'portion_yield',
    portionName: clean(portionName),
    productName: clean(productName),
    baseUnit: clean(baseUnit).toLocaleLowerCase('sw-TZ'),
    perBaseUnit,
    baseQuantity: Math.round((1 / perBaseUnit) * 1e6) / 1e6,
  };
}

export function parsePortionYield(text: string | null | undefined): PortionYield | null {
  const said = normalizeNumberWords(clean(text));
  if (!said) return null;
  const unit = `(${UNITS})`;
  const n = String.raw`([0-9]+(?:\.[0-9]+)?)`;
  // "wastani wa" is optional everywhere: it is how the question is phrased, so
  // it is how the answer comes back.
  const avg = String.raw`(?:wastani\s+(?:wa\s+)?)?`;

  // "kilo 1 ya nyama ya ngombe inatoa mishikaki 18"
  const fromBase = new RegExp(
    String.raw`^${unit}\s*1?\s+(?:ya|za|of)\s+(.+?)\s+(?:inatoa|hutoa|natoa|gives|yields)\s+${avg}(.+?)\s+${n}$`, 'iu',
  ).exec(said);
  if (fromBase) return build(fromBase[3], fromBase[2], fromBase[1], Number(fromBase[4]));

  // "mishikaki ni nyama ya ngombe, kilo 1 inatoa 18"
  const fromPortion = new RegExp(
    String.raw`^(.+?)\s+(?:ni|is)\s+(.+?)\s*[,،]?\s*${unit}\s*1?\s+(?:inatoa|hutoa|gives|yields)\s+${avg}${n}$`, 'iu',
  ).exec(said);
  if (fromPortion) return build(fromPortion[1], fromPortion[2], fromPortion[3], Number(fromPortion[4]));

  // "mishikaki 18 kwa kilo ya nyama ya ngombe"
  const perUnit = new RegExp(
    String.raw`^(.+?)\s+${n}\s+(?:kwa|per)\s+${unit}\s+(?:ya|za|of)\s+(.+?)$`, 'iu',
  ).exec(said);
  if (perUnit) return build(perUnit[1], perUnit[4], perUnit[3], Number(perUnit[2]));

  return null;
}

/**
 * Asked in the owner's own words. "Wastani" is doing real work in this
 * sentence: it tells the shopkeeper an approximate answer is not only accepted
 * but expected, so nobody feels they must be exact about something that is not.
 */
export function portionYieldQuestion(portionName: string, productName: string, baseUnit: string, lang: Lang): string {
  return lang === 'sw'
    ? `*${baseUnit} moja* ya ${productName} inatoa wastani wa ${portionName} wangapi?\n\n`
      + `Andika namba tu, mfano: _18_.\n`
      + `Nikijua hii, kila ${portionName} unaouza nitaupunguza kwenye ${productName} iliyopo.`
    : `How many ${portionName} does one ${baseUnit} of ${productName} give, on average?\n\n`
      + `Just the number, for example: _18_.\n`
      + `Once I know, every ${portionName} you sell comes off your ${productName}.`;
}

export function portionYieldConfirmation(reading: PortionYield, lang: Lang): string {
  const each = reading.baseQuantity.toLocaleString('en-US', { maximumFractionDigits: 4 });
  return lang === 'sw'
    ? `Nimeelewa:\n`
      + `• *${reading.portionName}* 1 = ${reading.productName} ${each} ${reading.baseUnit}\n`
      + `• ${reading.baseUnit} 1 = ${reading.portionName} ${reading.perBaseUnit} (wastani)\n\n`
      + `Nihifadhi? *NDIYO* / *HAPANA*`
    : `Understood:\n`
      + `• 1 *${reading.portionName}* = ${each} ${reading.baseUnit} of ${reading.productName}\n`
      + `• 1 ${reading.baseUnit} = ${reading.perBaseUnit} ${reading.portionName} (average)\n\n`
      + `Save this? *YES* / *NO*`;
}

export function portionYieldSaved(reading: PortionYield, lang: Lang): string {
  return lang === 'sw'
    ? `Sawa. *${reading.portionName}* sasa inapunguza ${reading.productName}.\n\n`
      + `Ukiuza ${reading.portionName} ${reading.perBaseUnit}, nitatoa ${reading.baseUnit} 1 kwenye store.`
    : `Done. *${reading.portionName}* now comes off ${reading.productName}.\n\n`
      + `Sell ${reading.perBaseUnit} ${reading.portionName} and I take 1 ${reading.baseUnit} off the shelf.`;
}

/** The pieces payload wa_save_combo expects — a one-piece recipe (see 0119). */
export function portionYieldPieces(reading: PortionYield): Array<Record<string, unknown>> {
  return [{
    key: reading.productName,
    name: reading.productName,
    quantity: reading.baseQuantity,
    unit: reading.baseUnit,
  }];
}
