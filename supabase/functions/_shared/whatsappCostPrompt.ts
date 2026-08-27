// Asking a trader what a product costs them, right after they sell it.
//
// Production has 37 products and no buying prices at all, so profit could see 0%
// of trade. The prices were not being withheld — the only way in was the web app,
// which meant sitting down and thinking about all 37 at once. Right after
// confirming a sale the product is already in mind and the answer takes seconds.
//
// The question is asked ONCE and then let go. Two refusals end it permanently.
// A prompt that came back after every sale would teach people to stop reading
// confirmations, which costs far more than a late price.

import { pendingEscapeHint, type Lang } from './whatsappIntent.ts';

export type CostPrompt = {
  kind: 'cost_prompt';
  product: string;
  productKey: string;
  /** What it just sold for, so the reply can show the margin immediately. */
  sellingPrice: number | null;
};

const clean = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

/** Reads whatever wa_next_cost_prompt returned, or null when there is nothing to ask. */
export function toCostPrompt(value: unknown): CostPrompt | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  const product = clean(typeof row.product === 'string' ? row.product : '');
  const productKey = clean(typeof row.product_key === 'string' ? row.product_key : '');
  if (!product || !productKey) return null;
  const price = Number(row.selling_price);
  return {
    kind: 'cost_prompt',
    product,
    productKey,
    sellingPrice: Number.isFinite(price) && price > 0 ? price : null,
  };
}

export function isSkip(text: string | null | undefined): boolean {
  return /^(?:ruka|skip|acha|baadaye|later|sijui|hapana|no)\b/i.test(clean(text));
}

/**
 * A bare amount in reply to the question. Only a bare amount: anything with
 * other words in it is more likely to be a new sale than an answer, and
 * misreading it would put a wrong price in the books.
 */
export function parseCostAnswer(text: string | null | undefined): number | null {
  const said = clean(text).replace(/\b(tsh|tshs|shilingi|sh)\b/gi, '').trim();
  const match = /^([\d,. ]+)(?:\/=|\/-)?$/.exec(said);
  if (!match) return null;
  const digits = match[1].replace(/[,\s]/g, '');
  // A trailing ".50" is money; "12.500" written with a dot as a thousands
  // separator is not. Three digits after the dot means it was a separator.
  const normalised = /\.\d{3}$/.test(digits) ? digits.replace('.', '') : digits;
  const value = Number(normalised);
  if (!Number.isFinite(value) || value <= 0 || value > 100_000_000) return null;
  return Math.round(value * 100) / 100;
}

const money = (value: number) => `TSh ${Math.round(value).toLocaleString('en-US')}`;

export function costQuestion(prompt: CostPrompt, lang: Lang): string {
  const sold = prompt.sellingPrice === null ? '' : lang === 'sw'
    ? `Umeiuza kwa ${money(prompt.sellingPrice)}. `
    : `You sold it for ${money(prompt.sellingPrice)}. `;
  return lang === 'sw'
    ? `${sold}Unainunua kwa shingapi ${prompt.product}?\n\n`
      + 'Nikijua hili, nitaweza kukuambia faida yako halisi.\n'
      + `Andika bei tu, mfano 7000 — au andika RUKA. ${pendingEscapeHint(lang)}`
    : `${sold}What do you buy ${prompt.product} for?\n\n`
      + 'Once I know this, I can tell you your real profit.\n'
      + `Just send the price, for example 7000 — or send SKIP. ${pendingEscapeHint(lang)}`;
}

/**
 * Saved, with the margin worked out on the spot. Seeing "faida 500 kwa kimoja"
 * is the payoff that makes the next question worth answering.
 */
export function costAccepted(
  prompt: CostPrompt,
  unitCost: number,
  lang: Lang,
): string {
  const head = lang === 'sw'
    ? `Sawa. ${prompt.product}: kununua ${money(unitCost)}.`
    : `Got it. ${prompt.product}: buying ${money(unitCost)}.`;
  if (prompt.sellingPrice === null) return head;

  const margin = prompt.sellingPrice - unitCost;
  if (margin < 0) {
    return lang === 'sw'
      ? `${head}\n\n⚠️ Unaiuza kwa ${money(prompt.sellingPrice)} — chini ya unavyoinunua, hasara ya ${money(-margin)} kwa kimoja.\n\nHakikisha bei ni sahihi.`
      : `${head}\n\n⚠️ You sell it for ${money(prompt.sellingPrice)} — below what you pay, a loss of ${money(-margin)} each.\n\nCheck that the price is right.`;
  }
  const percent = prompt.sellingPrice > 0 ? Math.round((margin / prompt.sellingPrice) * 100) : 0;
  return lang === 'sw'
    ? `${head}\nUnauza kwa ${money(prompt.sellingPrice)} — faida ${money(margin)} kwa kimoja (${percent}%).`
    : `${head}\nYou sell at ${money(prompt.sellingPrice)} — margin ${money(margin)} each (${percent}%).`;
}

export function costSkipped(lang: Lang): string {
  return lang === 'sw'
    ? 'Sawa, sitakuuliza tena hivi karibuni. Unaweza kuiweka wakati wowote kwenye Bidhaa.'
    : 'Fine, I will not ask again soon. You can set it any time under Products.';
}

/** An answer that was neither a price nor a skip. Asked once more, then dropped. */
export function costUnclear(prompt: CostPrompt, lang: Lang): string {
  return lang === 'sw'
    ? `Sikupata bei. Andika namba tu, mfano 7000, kwa ${prompt.product} — au RUKA. ${pendingEscapeHint(lang)}`
    : `I did not catch a price. Just the number, for example 7000, for ${prompt.product} — or SKIP. ${pendingEscapeHint(lang)}`;
}
