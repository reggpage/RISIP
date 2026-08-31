// "Trei 5" has to become 150 mayai. Nothing converted it before.
//
// VERIFIED GAP, read straight out of whatsappStock.ts: parseStockCount already
// recognises "trei", "gunia", "ndoo" as unit words — the UNITS pattern has
// carried them for a while — but the unit it returns is DECORATIVE ONLY. The
// quantity is stored as typed: "trei 5" becomes a count of 5, not 150. A
// shopkeeper who counts eggs by the tray has no way to tell Risip how many eggs
// that actually is, and nothing downstream — the low-stock warning, the combo
// arithmetic, "mayai ziko ngapi" — can be right about eggs while the base count
// is off by a factor of thirty.
//
// THE CONVERSION IS NEVER A CONSTANT IN THIS FILE. 130 sahani per gunia is one
// kijiwe's number; the one two streets over gets 110 from the same size sack,
// because they cut differently. The only source of a conversion is the shop's
// own DeclaredSaleUnit rows — the exact rows whatsappPortions.ts already
// collects to price a robo against a lita. Selling and stocking share one
// declared fact: how many base units a named measure is worth. This file reuses
// that fact; it does not invent a second one.
//
// So a "chips vendor domain" is not built here, and nothing about eggs or
// potatoes appears in code. Any shop that declares a bulk-to-base conversion
// for any product — sacks of rice, crates of soda, cartons of eggs — gets this
// for free, because the arithmetic never looks at what the product is called.

import { withinOneEdit } from './whatsappSpelling.ts';
import type { DeclaredSaleUnit } from './whatsappPortions.ts';

export type BulkAdditionSegment = {
  /** The unit word as read, or null when the bare product name stood for it. */
  unitName: string | null;
  /** What was typed for the count. */
  stated: number;
  /** stated × the unit's own base quantity. */
  baseUnits: number;
};

export type BulkAddition = {
  productKey: string;
  productName: string;
  baseUnitName: string;
  /** The sum every segment resolved to, in the product's own base unit. */
  totalBaseUnits: number;
  segments: BulkAdditionSegment[];
};

const clean = (s: string | null | undefined) => String(s ?? '').replace(/\s+/g, ' ').trim();
const key = (value: string) =>
  clean(value).toLocaleLowerCase('sw-TZ').replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');

/**
 * A unit word matched against ONE shop's own declared list, one edit of typo
 * allowed — the same closed-vocabulary discipline whatsappSpelling.ts uses for
 * "mbii"→"mbili". Safe here for the reason it is safe there: the vocabulary is
 * small, it is THIS shop's own words, and two candidates within one edit
 * refuses rather than guesses.
 */
function matchUnitWord(word: string, units: DeclaredSaleUnit[]): DeclaredSaleUnit | null {
  const asked = key(word);
  if (!asked) return null;
  const exact = units.find((unit) => key(unit.unitKey) === asked || key(unit.unitName) === asked);
  if (exact) return exact;
  if (asked.length < 4) return null;
  let found: DeclaredSaleUnit | null = null;
  for (const unit of units) {
    if (!withinOneEdit(asked, key(unit.unitName))) continue;
    if (found && found.unitKey !== unit.unitKey) return null;
    found = unit;
  }
  return found;
}

/** "trei 5", "5 trei", "gunia moja" (moja already normalised to 1 upstream). */
const SEGMENT = /^([\p{L}][\p{L}'’]*)\s+([0-9]+(?:\.[0-9]+)?)$|^([0-9]+(?:\.[0-9]+)?)\s+([\p{L}][\p{L}'’]*)$/u;
/** A bare count with no unit word at all: only valid standing next to the
 * product's own name, which is how "mayai 10" means ten base-unit eggs. */
const BARE = /^([0-9]+(?:\.[0-9]+)?)$/;

/**
 * "trei 5", "gunia 1", "ndoo 2", or several joined — "trei 2 na mayai 10".
 *
 * Every segment is about the SAME product; that is what "na" means in this
 * sentence shape ("trei mbili NA mayai kumi" — two trays AND ten more eggs),
 * not two different products. A batch of DIFFERENT products already has its
 * own parser (whatsappStockBatch.ts); this is deliberately narrower.
 *
 * Refuses the whole message if any one segment cannot be read, on the same
 * principle the price-batch fix used this week: saving part of a compound
 * instruction and silently dropping the rest is worse than saving none of it,
 * because the shop would never learn which piece did not take.
 */
export function parseBulkAddition(
  text: string | null | undefined,
  product: { key: string; name: string },
  declaredUnits: DeclaredSaleUnit[],
  baseUnitName: string,
): BulkAddition | null {
  const said = clean(text);
  if (!said) return null;
  const ownUnits = declaredUnits.filter((unit) => unit.productKey === product.key);
  if (ownUnits.length === 0) return null;

  const productWord = key(product.name).split(' ')[0] ?? '';
  const pieces = said.split(/\s*(?:,|\bna\b)\s*/iu).map((piece) => clean(piece)).filter(Boolean);
  if (pieces.length === 0) return null;

  const segments: BulkAdditionSegment[] = [];
  for (const piece of pieces) {
    // The product's own name may open or sit inside a segment — "mayai 10",
    // "mayai trei 5" — and is stripped before the unit/number pattern is read.
    const withoutProduct = clean(piece.replace(new RegExp(`\\b${productWord}\\b`, 'iu'), ''));
    const body = withoutProduct || piece;

    const bare = BARE.exec(body);
    if (bare) {
      // A bare number only means base units when the product was actually
      // named in this segment — otherwise "5" on its own is nothing.
      if (body === piece) return null;
      const stated = Number(bare[1]);
      if (!Number.isFinite(stated) || stated < 0) return null;
      segments.push({ unitName: null, stated, baseUnits: stated });
      continue;
    }

    const match = SEGMENT.exec(body);
    if (!match) return null;
    const word = match[1] ?? match[4];
    const numberText = match[2] ?? match[3];
    const stated = Number(numberText);
    if (!word || !Number.isFinite(stated) || stated < 0) return null;
    const unit = matchUnitWord(word, ownUnits);
    if (!unit) return null;
    segments.push({ unitName: unit.unitName, stated, baseUnits: stated * unit.baseQuantity });
  }

  if (segments.length === 0) return null;
  const totalBaseUnits = Math.round(segments.reduce((sum, s) => sum + s.baseUnits, 0) * 1000) / 1000;
  return { productKey: product.key, productName: product.name, baseUnitName, totalBaseUnits, segments };
}

const qty = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 3 });

/**
 * Shows the multiplication, not just the answer. A shopkeeper who is told
 * "umeongeza mayai 150" with no working has no way to notice that Risip read
 * "trei" as worth the wrong number — this is the one place that arithmetic is
 * visible before it is saved.
 */
export function bulkAdditionConfirmation(addition: BulkAddition, lang: 'sw' | 'en'): string {
  const sw = lang === 'sw';
  const lines = addition.segments.map((segment) => segment.unitName
    ? `${qty(segment.stated)} ${segment.unitName} = ${qty(segment.baseUnits)} ${addition.baseUnitName}`
    : `${qty(segment.stated)} ${addition.baseUnitName}`);
  const total = `${addition.productName}: ${sw ? 'jumla' : 'total'} ${qty(addition.totalBaseUnits)} ${addition.baseUnitName}`;
  return (sw
    ? `${lines.join('\n')}\n${total}\n\nNihifadhi? *1* Ndiyo · *2* Hapana`
    : `${lines.join('\n')}\n${total}\n\nSave this? YES / NO`);
}
