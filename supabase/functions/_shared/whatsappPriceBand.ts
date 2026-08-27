// Which of the two prices was this sold at?
//
// A shop that registered only one price has nothing to ask about, and a line
// that says "rejareja" or "jumla" has already answered. The question exists for
// exactly one case: BOTH prices are registered, the line says neither, and the
// quantity does not settle it either.
//
// The owner's rule, in their words: "kama ameandika viberiti 2 bila kuandika
// reja reja au jumla ai iulize kwa bidhaa hiyo, lakini pia swali hili litakuja
// pale ambapo user alisajili kwa reja reja na jumla."
//
// And the counter-rule, from the same owner two days earlier: "its insane to
// ask if this is reja reja or jumla for ugali". So a shop that registered a
// wholesale threshold has ALREADY answered this for every quantity under it —
// that is what a threshold is — and gets asked nothing. One question per
// message, listing only the lines that are genuinely open, because a
// thirty-line till roll must never become thirty questions.

import { pendingEscapeHint, type Lang } from './whatsappIntent.ts';

export type PriceBandChoice = {
  /** Index into the sale's items, so the answer lands on the right line. */
  index: number;
  product: string;
  quantity: number;
  retail: number;
  wholesale: number;
  unit?: string | null;
};

export type Band = 'retail' | 'wholesale';

/**
 * Is this line genuinely open?
 *
 * Open when the shop registered two different prices and the message picked
 * neither. Nothing else: not the quantity, and not the wholesale threshold.
 *
 * The threshold deliberately does NOT settle it. The owner's example was
 * "viberiti 2", a quantity below every threshold in their own price list, and
 * they still want to be asked — because the threshold is a rule about when
 * wholesale STARTS, not a promise about who the buyer was. Applying it silently
 * is how five Biblia at retail get booked at wholesale and thirty-five thousand
 * shillings of takings disappear without a line anywhere saying so.
 *
 * The "insane to ask" case — ugali at a mama lishe, one price, one answer — is
 * shut out by the two-price condition, not by arithmetic on the quantity.
 */
export function needsBandChoice(
  band: Band | null,
  pricing: { retail: number | null; wholesale: number | null; wholesaleMinQty?: number | null },
  _quantity?: number,
): boolean {
  if (band !== null) return false;
  const { retail, wholesale } = pricing;
  if (retail === null || wholesale === null) return false;
  if (!(retail > 0) || !(wholesale > 0) || retail === wholesale) return false;
  return true;
}

const money = (value: number) => `TSh ${Math.round(value).toLocaleString('en-US')}`;
const qty = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 3 });

export function priceBandQuestion(choices: PriceBandChoice[], lang: Lang): string {
  if (choices.length === 0) return '';
  const unit = (choice: PriceBandChoice) => (choice.unit ? ` ${choice.unit}` : '');

  if (choices.length === 1) {
    const one = choices[0];
    return lang === 'sw'
      ? `*${one.product}* ${qty(one.quantity)}${unit(one)} — umeuza kwa bei gani?\n\n`
        + `• rejareja ${money(one.retail)} = ${money(one.quantity * one.retail)}\n`
        + `• jumla ${money(one.wholesale)} = ${money(one.quantity * one.wholesale)}\n\n`
        + `Jibu *REJAREJA* au *JUMLA*. ${pendingEscapeHint(lang)}`
      : `*${one.product}* ${qty(one.quantity)}${unit(one)} — which price did you sell at?\n\n`
        + `• retail ${money(one.retail)} = ${money(one.quantity * one.retail)}\n`
        + `• wholesale ${money(one.wholesale)} = ${money(one.quantity * one.wholesale)}\n\n`
        + `Reply *REJAREJA* or *JUMLA*. ${pendingEscapeHint(lang)}`;
  }

  const rows = choices.map((choice, index) => (lang === 'sw'
    ? `${index + 1}. *${choice.product}* ${qty(choice.quantity)}${unit(choice)}`
      + ` — rejareja ${money(choice.retail)} · jumla ${money(choice.wholesale)}`
    : `${index + 1}. *${choice.product}* ${qty(choice.quantity)}${unit(choice)}`
      + ` — retail ${money(choice.retail)} · wholesale ${money(choice.wholesale)}`)).join('\n');

  // The way out of ever seeing this again is one word at the top of the list,
  // so it is taught here rather than left to be discovered.
  return lang === 'sw'
    ? `Hizi zina bei mbili, na hujasema uliyotumia:\n${rows}\n\n`
      + 'Kama zote ni bei moja, jibu *REJAREJA* au *JUMLA*.\n'
      + 'Kama zimechanganyika, andika namba: _1 rejareja, 2 jumla_\n\n'
      + `_Ukiandika "Mauzo ya leo rejareja" juu ya orodha, sitauliza tena._\n${pendingEscapeHint(lang)}`
    : `These have two prices, and the message did not say which:\n${rows}\n\n`
      + 'If they are all the same, reply *REJAREJA* or *JUMLA*.\n'
      + 'If they are mixed, use the numbers: _1 rejareja, 2 jumla_\n\n'
      + `_Head the list "Mauzo ya leo rejareja" and I will not ask again._\n${pendingEscapeHint(lang)}`;
}

const normalize = (value: string | null | undefined) =>
  String(value ?? '').toLocaleLowerCase('sw-TZ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .replace(/\s+/g, ' ').trim();

const BAND_ALIASES: { band: Band; values: string[] }[] = [
  { band: 'retail', values: ['rejareja', 'reja reja', 'reja', 'rejarej', 'retail', 'kawaida'] },
  { band: 'wholesale', values: ['jumla', 'wholesale', 'bulk'] },
];

function editDistanceAtMostOne(a: string, b: string): boolean {
  if (a === b) return true;
  if (Math.abs(a.length - b.length) > 1) return false;
  let left = 0;
  let right = 0;
  let edits = 0;
  while (left < a.length && right < b.length) {
    if (a[left] === b[right]) { left += 1; right += 1; continue; }
    edits += 1;
    if (edits > 1) return false;
    if (a.length > b.length) left += 1;
    else if (b.length > a.length) right += 1;
    else { left += 1; right += 1; }
  }
  return edits + (a.length - left) + (b.length - right) <= 1;
}

/** Resolve only against the two small enums represented by the open question. */
function resolveBandWord(value: string): Band | null {
  const said = normalize(value);
  if (!said) return null;
  const compact = said.replace(/\s/g, '');
  for (const group of BAND_ALIASES) {
    if (group.values.includes(said)) return group.band;
  }
  // Fuzzy matching is limited to the canonical long words. Short aliases are
  // exact-only so a product/person name cannot be silently turned into a band.
  for (const group of BAND_ALIASES) {
    for (const alias of group.values.filter((word) => word.length >= 5 && !word.includes(' '))) {
      if (editDistanceAtMostOne(compact, alias)) return group.band;
    }
  }
  return null;
}

function bandWords(text: string): Band[] {
  const words = normalize(text).split(' ').filter(Boolean);
  const found: Band[] = [];
  for (let at = 0; at < words.length; at += 1) {
    const pair = at + 1 < words.length ? resolveBandWord(`${words[at]} ${words[at + 1]}`) : null;
    if (pair) { found.push(pair); at += 1; continue; }
    const single = resolveBandWord(words[at]);
    if (single) found.push(single);
  }
  return found;
}

/**
 * Reads the answer, or null when the message was not one.
 *
 * Three shapes, all of which a shopkeeper actually types:
 *   "jumla"                     — one band for every open line
 *   "1 rejareja, 2 jumla"       — by the row numbers in the question
 *   "viberiti jumla"            — by name
 *
 * Names are read before numbers on purpose. Somebody answering "viberiti 2
 * jumla" is repeating the line, not pointing at row two, and reading that 2 as
 * a row number would band the wrong product.
 *
 * A partial answer is allowed and returns nulls for the rest, so the caller can
 * ask again for those alone rather than throwing away what was already said.
 */
export function parsePriceBandAnswer(
  text: string | null | undefined,
  choices: PriceBandChoice[],
): (Band | null)[] | null {
  const said = normalize(text);
  if (!said || choices.length === 0) return null;
  if (bandWords(said).length === 0) return null;
  const answers: (Band | null)[] = choices.map(() => null);
  let touched = false;

  // 1. By name. Segmented, so "viberiti jumla, daftari rejareja" is two
  // statements rather than one holding two contradictory words.
  for (const segment of said.split(/[,;\n]+|\bna\b|\band\b/).map((part) => part.trim())) {
    const found = bandWords(segment);
    if (found.length === 0) continue;
    for (const [at, choice] of choices.entries()) {
      if (!segment.includes(normalize(choice.product))) continue;
      answers[at] = found[0];
      touched = true;
    }
  }

  // 2. By the row numbers in the question. Read as a token stream: a band word
  // takes the number just before it, or failing that the one just after, so
  // both "1 rejareja 2 jumla" and "rejareja 1, jumla 2" come out the same.
  if (!touched) {
    type Token = { row: number; band: null } | { row: null; band: Band };
    const tokens: Token[] = [];
    for (const word of said.split(' ')) {
      if (/^[0-9]{1,2}$/.test(word)) tokens.push({ row: Number(word), band: null });
      else {
        const band = resolveBandWord(word);
        if (band) tokens.push({ row: null, band });
      }
    }
    for (const [at, token] of tokens.entries()) {
      if (token.band === null) continue;
      const near = [tokens[at - 1], tokens[at + 1]]
        .find((other) => other !== undefined && other.row !== null);
      if (!near || near.row === null) continue;
      const row = near.row - 1;
      if (row < 0 || row >= choices.length) continue;
      answers[row] = token.band;
      touched = true;
    }
  }

  // 3. One band word with nothing to attach it to: it covers everything open.
  if (!touched) {
    const found = bandWords(said);
    if (found.length === 0) return null;
    const band = found[0];
    for (const [at] of choices.entries()) answers[at] = band;
    touched = true;
  }

  return touched ? answers : null;
}

/** The follow-up when only some of the lines were answered. */
export function priceBandStillOpen(remaining: PriceBandChoice[], lang: Lang): string {
  return (lang === 'sw'
    ? 'Sawa. Bado hizi:\n\n'
    : 'Fine. Still open:\n\n') + priceBandQuestion(remaining, lang);
}

/**
 * Puts the answer back on the sale, which then goes through pricing again.
 *
 * Lines the question never asked about are untouched — including the ones that
 * already said "jumla" — so an answer can only ever narrow what was open.
 */
export function applyPriceBands<T extends { band: Band | null }>(
  items: T[],
  choices: PriceBandChoice[],
  settled: (Band | null)[],
): T[] {
  return items.map((item, at) => {
    const row = choices.findIndex((choice) => choice.index === at);
    const band = row < 0 ? null : settled[row] ?? null;
    return band === null ? item : { ...item, band };
  });
}
