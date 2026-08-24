// "Vitu vikikaribia kuisha" — say so before the shelf is empty.
//
// A shopkeeper finds out they have run out when a customer asks for the thing
// and it is not there. By then the sale is gone and so is the customer. The one
// moment they are certainly looking at their phone is when Risip confirms a
// sale, so that is where the warning belongs — appended, never a message of its
// own, because an unprompted message costs money and interrupts.
//
// Only products the sale actually touched. A warning listing everything low in
// the shop, every time, is a warning nobody reads by the third day.

import type { Lang } from './whatsappIntent.ts';

export type StockLevel = {
  productName: string;
  onHand: number;
  unit: string | null;
  /** False when the product has never been counted — then nothing is known. */
  hasCount: boolean;
};

/**
 * What counts as nearly gone.
 *
 * Pieces and measures behave differently: five pens left is a nuisance, five
 * kilos of sugar is most of a sack. The threshold is deliberately blunt because
 * a precise one would need reorder history nobody has entered yet — and a blunt
 * warning that arrives is worth more than an exact one that does not.
 */
const LOW_PIECES = 5;
const LOW_MEASURE = 2;

export function lowStock(levels: StockLevel[]): StockLevel[] {
  return levels.filter((level) => {
    // Never counted means unknown, not zero. Guessing here would cry wolf on
    // every product the shop has not got round to counting.
    if (!level.hasCount) return false;
    const threshold = level.unit ? LOW_MEASURE : LOW_PIECES;
    return level.onHand <= threshold;
  });
}

const amount = (level: StockLevel) =>
  `${level.onHand.toLocaleString('en-US', { maximumFractionDigits: 3 })}${level.unit ? ` ${level.unit}` : ''}`;

/**
 * One line, at the foot of a reply that was going out anyway.
 *
 * Empty string when nothing is low — the caller appends unconditionally, so
 * this is what keeps a quiet day quiet.
 */
export function lowStockNotice(levels: StockLevel[], lang: Lang): string {
  const low = lowStock(levels);
  if (low.length === 0) return '';
  const out = low.filter((level) => level.onHand <= 0);
  const nearly = low.filter((level) => level.onHand > 0);

  const parts: string[] = [];
  if (out.length > 0) {
    parts.push(lang === 'sw'
      ? `*Zimeisha:* ${out.map((level) => level.productName).join(', ')}`
      : `*Out of stock:* ${out.map((level) => level.productName).join(', ')}`);
  }
  if (nearly.length > 0) {
    parts.push(lang === 'sw'
      ? `*Zinakaribia kuisha:* ${nearly.map((level) => `${level.productName} (${amount(level)})`).join(', ')}`
      : `*Running low:* ${nearly.map((level) => `${level.productName} (${amount(level)})`).join(', ')}`);
  }
  return `\n\n⚠️ ${parts.join('\n⚠️ ')}`;
}

/**
 * A threshold expressed the way a shopkeeper actually thinks about it — not
 * "≤15" but "half a tray, enough for seven plates of zege."
 *
 * VERIFIED GAP: the blunt LOW_PIECES/LOW_MEASURE constants above are a
 * platform-wide guess and stay exactly as they are for every product that has
 * not said otherwise — this is additive, not a replacement. What was missing
 * is a way for ONE product's threshold to be the shop's own number: an egg
 * seller cares about eggs at fifteen because that is half a tray, and nothing
 * about that fifteen is true for a shop selling pens.
 *
 * `perSale` is optional and purely descriptive — "enough for N more sales of
 * X" — computed from whatever the caller already knows about consumption per
 * sale (a combo's declared piece quantity, a portion's base quantity). This
 * function does no arithmetic about what a zege or a chips plate costs in
 * eggs; it only turns a count and a threshold into a sentence.
 */
export function customStockWarning(
  level: { productName: string; onHand: number; unit: string | null },
  threshold: number,
  lang: Lang,
  perSale?: { label: string; remaining: number },
): string | null {
  if (level.onHand > threshold) return null;
  const sw = lang === 'sw';
  const amountText = amount(level);
  if (level.onHand <= 0) {
    return sw ? `⚠️ ${level.productName} zimeisha.` : `⚠️ ${level.productName} is out of stock.`;
  }
  const coverage = perSale
    ? (sw
      ? ` — inatosha ${perSale.remaining} za ${perSale.label} tu`
      : ` — enough for only ${perSale.remaining} more ${perSale.label}`)
    : '';
  return sw
    ? `⚠️ ${level.productName} zinakaribia kuisha: ${amountText}${coverage}.`
    : `⚠️ ${level.productName} is running low: ${amountText}${coverage}.`;
}
