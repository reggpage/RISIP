// Two goods sold as one thing: chips yai, chips kuku na mishakaki, zege.
//
// MEASURED FAILURE, and the owner's own list of it. A kijiwe registers "chips
// kavu" at 2,000 and "yai" at 500, and then every real order is written the way
// it is shouted across the counter — "chips yai", "chipssosej", "zege". Every
// one of those was answered "this product is not in your store", because the
// resolver only ever looked for ONE product and text similarity cannot get
// there: chipssosej vs soseji is 0.20, chips yai vs chips kavu is 0.40, and the
// floor is 0.45. zege vs chips mayai is 0.00, because a nickname is not a
// spelling of anything.
//
// So there are two different problems here and they need two different answers:
//
//   SPLITTING   for phrases built out of words the shop already owns. The
//               dictionary is only ever this company's own catalogue, so a
//               split can never invent a product the shop does not sell.
//   NICKNAMES   for names that cannot be split at all. "zege" has to be
//               LEARNED, once, and then it is a single lookup for ever.
//
// Nothing here guesses money. A piece whose measure is unknown, or whose count
// is unknown, is reported back to the caller to be asked about — once — and the
// answer is what gets saved.

import type { Lang } from './whatsappIntent.ts';

/** One product of the company, as the splitter needs to see it. */
export type ComboCandidate = {
  key: string;
  name: string;
  /** Declared portion units (robo, nusu, kilo). Empty for a plain countable. */
  units?: string[];
};

export type ComboPiece = {
  key: string;
  name: string;
  /** How many of this piece per order. */
  quantity: number;
  /** Which declared portion, when the product has more than one. */
  unit: string | null;
  /** True when the person never said, and the caller must ask. */
  unitMissing?: boolean;
  /** True when the count was assumed rather than stated. */
  quantityAssumed?: boolean;
};

export type ComboSplit = {
  /** As typed, so the reply can quote them back their own word. */
  phrase: string;
  pieces: ComboPiece[];
  /** Where the reading came from: a saved nickname, or cutting up the words. */
  source: 'saved' | 'split';
};

/** A nickname the shop has already taught Risip. */
export type SavedCombo = {
  name: string;
  pieces: { key: string; name: string; quantity: number; unit: string | null }[];
};

const JOINERS = new Set(['na', 'and', 'pamoja', 'plus', 'with', 'ya', 'wa', 'za', 'la']);

export const comboKey = (value: string | null | undefined) =>
  String(value ?? '')
    .toLocaleLowerCase('sw-TZ')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

const squash = (value: string) => comboKey(value).replace(/\s+/g, '');

/**
 * Every way this shop might write one product: its full name, and the first
 * word of a multi-word name.
 *
 * "chips kavu" is written "chips" nine times out of ten, and a shop with only
 * one chips product means the same thing by it. Where two products share that
 * first word the short form is ambiguous and is not offered at all — asking is
 * better than picking one, and picking one costs money.
 */
function surfaceForms(catalogue: ComboCandidate[]): Map<string, ComboCandidate | null> {
  const forms = new Map<string, ComboCandidate | null>();
  const put = (form: string, item: ComboCandidate) => {
    if (!form || form.length < 2) return;
    if (!forms.has(form)) { forms.set(form, item); return; }
    const seen = forms.get(form);
    // Same product twice is not ambiguity; two different products is.
    if (seen && seen.key !== item.key) forms.set(form, null);
  };
  for (const item of catalogue) {
    const full = comboKey(item.name);
    put(full, item);
    put(squash(item.name), item);
    const first = full.split(' ')[0];
    if (first !== full) put(first, item);
  }
  return forms;
}

/**
 * Does `piece` name `form`, allowing the shortening people actually type?
 *
 * One direction only: what was TYPED may be a shortening of a registered name
 * ("sosej" for "soseji"), never an extension of one. The other direction is
 * exactly the glued case — "chipssosej" starts with "chips" — and letting it
 * match here would swallow the whole word as a single product and never cut it.
 */
function looksLike(piece: string, form: string): boolean {
  if (piece === form) return true;
  return piece.length >= 4 && form.startsWith(piece);
}

type Resolved = { item: ComboCandidate; quantity: number | null; unit: string | null } | 'ambiguous' | null;

/**
 * Which of the shop's products a word could have meant.
 *
 * Named back, so the question is answerable in one word: "Mishikaki ipi? wa
 * ngombe / wa kuku". A shop that registered only one kind is never asked.
 */
export function candidatesFor(token: string, catalogue: ComboCandidate[]): string[] {
  const wanted = comboKey(token);
  const names = catalogue
    .filter((item) => {
      const full = comboKey(item.name);
      return full === wanted || full.startsWith(`${wanted} `) || squash(item.name).startsWith(wanted);
    })
    .map((item) => item.name);
  return [...new Set(names)].slice(0, 8);
}

function resolveToken(
  token: string,
  forms: Map<string, ComboCandidate | null>,
  catalogue: ComboCandidate[],
): Resolved {
  const exact = forms.get(token);
  if (exact === null) return 'ambiguous';
  if (exact) return { item: exact, quantity: null, unit: null };
  const near = [...forms.entries()].filter(([form, item]) => item && looksLike(token, form));
  const keys = new Set(near.map(([, item]) => item!.key));
  if (keys.size > 1) return 'ambiguous';
  if (keys.size === 1) return { item: near[0][1]!, quantity: null, unit: null };
  // A portion name on its own — "nusu", "robo" — belongs to the piece before it.
  const unitOwner = catalogue.find((item) => (item.units ?? []).some((unit) => comboKey(unit) === token));
  if (unitOwner) return { item: unitOwner, quantity: null, unit: token };
  return null;
}

/**
 * Reads a phrase as several of the shop's own products, or returns null.
 *
 * Returns null rather than guessing whenever any word cannot be accounted for:
 * a phrase that is half understood is not understood, and pricing half of an
 * order is worse than admitting it was not read.
 */
export function splitCombo(
  phrase: string | null | undefined,
  catalogue: ComboCandidate[],
  saved: SavedCombo[] = [],
): ComboSplit | { kind: 'ambiguous'; token: string; candidates: string[] } | null {
  const said = comboKey(phrase);
  if (!said || catalogue.length === 0) return null;

  // 1. A nickname they have already taught us. One lookup, no cutting.
  const nickname = saved.find((combo) => comboKey(combo.name) === said || squash(combo.name) === squash(said));
  if (nickname) {
    return {
      phrase: String(phrase ?? '').trim(),
      source: 'saved',
      pieces: nickname.pieces.map((piece) => ({ ...piece })),
    };
  }

  const forms = surfaceForms(catalogue);
  // A phrase that IS one product is not a combination; the ordinary path owns it.
  if (forms.get(said)) return null;

  // Joiners are NOT dropped before matching. "mishikaki wa kuku" is one
  // product's whole name, and throwing away the "wa" first read it as mishikaki
  // plus kuku — two products, two prices, one of them invented.
  const tokens = said.split(' ').filter(Boolean);
  if (tokens.length === 0) return null;

  const pieces: ComboPiece[] = [];
  const push = (item: ComboCandidate, quantity: number | null, unit: string | null) => {
    const at = pieces.findIndex((piece) => piece.key === item.key);
    if (at >= 0) {
      if (quantity !== null) pieces[at].quantity = quantity;
      if (unit) { pieces[at].unit = unit; pieces[at].unitMissing = false; }
      return;
    }
    const units = item.units ?? [];
    pieces.push({
      key: item.key,
      name: item.name,
      quantity: quantity ?? 1,
      unit: unit ?? (units.length === 1 ? units[0] : null),
      // A product sold in several measures, with none named, cannot be priced:
      // robo and kilo are 3,000 and 10,000 for the same word.
      ...(units.length > 1 && !unit ? { unitMissing: true } : {}),
      // The FIRST piece is the order itself — "chips yai 2" is two orders, and
      // asking how many chips are in one chips would be absurd. Only the pieces
      // that ride along have a count nobody stated.
      ...(quantity === null && pieces.length > 0 ? { quantityAssumed: true } : {}),
    });
  };

  // Longest window first, so a whole registered name beats its first word:
  // "mishikaki wa kuku" is matched before "mishikaki" ever gets a chance to be
  // called ambiguous.
  let at = 0;
  while (at < tokens.length) {
    const token = tokens[at];
    // A number belongs to the piece it follows: "yai mbili", "mishikaki 3".
    if (/^[0-9]+(?:\.[0-9]+)?$/.test(token)) {
      const last = pieces[pieces.length - 1];
      if (!last) return null;
      last.quantity = Number(token);
      delete last.quantityAssumed;
      at += 1;
      continue;
    }

    let taken = 0;
    let ambiguousToken: string | null = null;
    for (let take = Math.min(4, tokens.length - at); take >= 1; take -= 1) {
      const window = tokens.slice(at, at + take).join(' ');
      const resolved = resolveToken(window, forms, catalogue);
      if (resolved === 'ambiguous') {
        // Keep looking: a shorter window is no better, but a LONGER one already
        // failed, so this is the most specific reading available. Remember it in
        // case nothing else matches at all.
        ambiguousToken = window;
        continue;
      }
      if (!resolved) continue;
      if (resolved.unit && pieces.length > 0 && pieces[pieces.length - 1].key === resolved.item.key) {
        pieces[pieces.length - 1].unit = resolved.unit;
        delete pieces[pieces.length - 1].unitMissing;
      } else {
        push(resolved.item, resolved.quantity, resolved.unit);
      }
      taken = take;
      break;
    }
    if (taken > 0) { at += taken; continue; }
    if (ambiguousToken) {
      return { kind: 'ambiguous', token: ambiguousToken, candidates: candidatesFor(ambiguousToken, catalogue) };
    }
    // A joining word that is not part of any name is just glue.
    if (JOINERS.has(token)) { at += 1; continue; }
    // Glued: "chipssosej" is one token holding two products.
    const cut = cutGlued(token, forms);
    if (cut === 'ambiguous') {
      return { kind: 'ambiguous', token, candidates: candidatesFor(token, catalogue) };
    }
    if (!cut) return null;
    for (const item of cut) push(item, null, null);
    at += 1;
  }

  // One product is not a combination.
  return pieces.length >= 2 ? { phrase: String(phrase ?? '').trim(), pieces, source: 'split' } : null;
}

/**
 * "chipssosej" — no space, two products.
 *
 * Only two pieces, and only where both halves are long enough to mean
 * something. Three-way cuts and short fragments produce readings nobody
 * intended, and every wrong reading here is a wrong price.
 */
function cutGlued(
  token: string,
  forms: Map<string, ComboCandidate | null>,
): ComboCandidate[] | 'ambiguous' | null {
  if (token.length < 8) return null;
  const found: ComboCandidate[][] = [];
  for (let at = 4; at <= token.length - 4; at += 1) {
    const left = matchForm(token.slice(0, at), forms);
    const right = matchForm(token.slice(at), forms);
    if (left === 'ambiguous' || right === 'ambiguous') return 'ambiguous';
    if (left && right && left.key !== right.key) found.push([left, right]);
  }
  if (found.length === 0) return null;
  // Every cut that works must agree on WHICH two products, or we have not
  // understood the word at all.
  const signature = (pair: ComboCandidate[]) => pair.map((item) => item.key).sort().join('|');
  const first = signature(found[0]);
  if (found.some((pair) => signature(pair) !== first)) return 'ambiguous';
  return found[0];
}

function matchForm(
  piece: string,
  forms: Map<string, ComboCandidate | null>,
): ComboCandidate | 'ambiguous' | null {
  const exact = forms.get(piece);
  if (exact === null) return 'ambiguous';
  if (exact) return exact;
  const near = [...forms.entries()].filter(([form, item]) => item && looksLike(piece, form));
  const keys = new Set(near.map(([, item]) => item!.key));
  if (keys.size > 1) return 'ambiguous';
  return keys.size === 1 ? near[0][1]! : null;
}

const money = (value: number) => `TSh ${Math.round(value).toLocaleString('en-US')}`;
const qty = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 3 });

/** What is still unclear about a reading, if anything. */
export function comboQuestions(split: ComboSplit): ComboPiece[] {
  return split.pieces.filter((piece) => piece.unitMissing || piece.quantityAssumed);
}

/**
 * One question for the whole order, asked once.
 *
 * Once it is answered the reading is offered for saving, so a kijiwe answers
 * "chips yai" exactly once in its life and never sees this again.
 */
export function comboQuestion(
  split: ComboSplit,
  orders: number,
  units: Map<string, string[]>,
  lang: Lang,
): string {
  const open = comboQuestions(split);
  const rows = open.map((piece, index) => {
    const choices = units.get(piece.key) ?? [];
    if (piece.unitMissing && choices.length > 0) {
      return lang === 'sw'
        ? `${index + 1}. *${piece.name}* — kipimo gani? (${choices.join(' / ')})`
        : `${index + 1}. *${piece.name}* — which measure? (${choices.join(' / ')})`;
    }
    return lang === 'sw'
      ? `${index + 1}. *${piece.name}* — ngapi kwa kila oda?`
      : `${index + 1}. *${piece.name}* — how many per order?`;
  }).join('\n');

  const reading = split.pieces.map((piece) => piece.name).join(' + ');
  return lang === 'sw'
    ? `“${split.phrase}” ${qty(orders)} — nimeisoma kama: *${reading}*.\n\n`
      + `Nieleze haya:\n${rows}\n\n`
      + (open.length === 1
        ? 'Jibu kwa neno moja, mfano: _nusu_ au _2_.'
        : 'Jibu kwa namba, mfano: _1 nusu, 2 2_.')
    : `“${split.phrase}” ${qty(orders)} — I read it as: *${reading}*.\n\n`
      + `Tell me these:\n${rows}\n\n`
      + (open.length === 1
        ? 'One word is enough, e.g. _nusu_ or _2_.'
        : 'Answer by number, e.g. _1 nusu, 2 2_.');
}

/**
 * Reads the answer to comboQuestion, or null when it was not one.
 *
 * The same shapes the price-band question takes, for the same reason: whatever
 * a person types at a counter has to work, and they do not remember which of
 * our questions wanted which format.
 */
export function parseComboAnswer(
  text: string | null | undefined,
  open: ComboPiece[],
  units: Map<string, string[]>,
): (({ unit: string } | { quantity: number }) | null)[] | null {
  const said = comboKey(text);
  if (!said || open.length === 0) return null;
  const answers: (({ unit: string } | { quantity: number }) | null)[] = open.map(() => null);
  let touched = false;

  /**
   * What the piece was ASKED decides what its answer can be.
   *
   * "kuku nusu, mishikaki 3" arrives as one run of words, and without this the
   * 3 landed on kuku and overwrote the measure — the chicken silently became
   * three chickens and the price tripled.
   */
  const assign = (at: number, value: string) => {
    if (at < 0 || at >= open.length || answers[at]) return;
    if (open[at].unitMissing) {
      const choices = (units.get(open[at].key) ?? []).map((unit) => comboKey(unit));
      const unit = choices.find((choice) => choice === value || looksLike(value, choice));
      if (unit) { answers[at] = { unit }; touched = true; }
      return;
    }
    if (/^[0-9]+(?:\.[0-9]+)?$/.test(value) && Number(value) > 0) {
      answers[at] = { quantity: Number(value) };
      touched = true;
    }
  };

  // Segmented on the RAW text: comboKey turns a comma into a space, and one run
  // of words lets every answer land on every piece.
  const segments = String(text ?? '').split(/[,;\n]+|\bna\b/i)
    .map((part) => comboKey(part)).filter(Boolean);

  // By name first — "kuku nusu" points at itself and cannot be misread as a row.
  for (const segment of segments) {
    for (const [at, piece] of open.entries()) {
      if (!segment.includes(comboKey(piece.name).split(' ')[0])) continue;
      for (const word of segment.split(' ')) assign(at, word);
    }
  }
  if (touched) return answers;

  // Then by the row numbers the question printed.
  const words = said.split(' ');
  for (let at = 0; at < words.length - 1; at += 1) {
    const row = Number(words[at]);
    if (!Number.isInteger(row) || row < 1 || row > open.length) continue;
    assign(row - 1, words[at + 1]);
  }
  if (touched) return answers;

  // A single open question takes a bare answer.
  if (open.length === 1) {
    for (const word of words) assign(0, word);
  }
  return touched ? answers : null;
}

/** Shown above the sale, so a wrong reading is visible before it is saved. */
export function comboNotice(splits: ComboSplit[], lang: Lang): string {
  if (splits.length === 0) return '';
  const rows = splits.map((split) =>
    `  • “${split.phrase}” = ${split.pieces.map((piece) =>
      `${piece.name}${piece.unit ? ` ${piece.unit}` : ''}${piece.quantity === 1 ? '' : ` ×${qty(piece.quantity)}`}`)
      .join(' + ')}`).join('\n');
  return lang === 'sw'
    ? `\n_Nimesoma hivi:_\n${rows}\n`
    : `\n_I read these as:_\n${rows}\n`;
}

/** Offered after the sale is confirmed, so the question is asked only once. */
export function comboSaveOffer(split: ComboSplit, lang: Lang): string {
  const reading = split.pieces.map((piece) =>
    `${piece.name}${piece.unit ? ` ${piece.unit}` : ''}${piece.quantity === 1 ? '' : ` ×${qty(piece.quantity)}`}`)
    .join(' + ');
  return lang === 'sw'
    ? `\n\n💾 Nihifadhi *${split.phrase}* = ${reading}?\nUkijibu NDIYO sitakuuliza tena.`
    : `\n\n💾 Save *${split.phrase}* = ${reading}?\nReply YES and I will not ask again.`;
}

export function comboSaved(name: string, lang: Lang): string {
  return lang === 'sw'
    ? `✅ Nimehifadhi *${name}*. Sasa andika tu "${name} 2" na nitajua maana yake.`
    : `✅ Saved *${name}*. Now just write "${name} 2" and I will know what it means.`;
}

export function comboSaveNotAllowed(lang: Lang): string {
  return lang === 'sw'
    ? '\n\n_(Ni owner au accountant pekee anayeweza kuhifadhi jina la mchanganyiko.)_'
    : '\n\n_(Only an owner or accountant can save a combination name.)_';
}

/** The total for one order of a combination, given each piece's unit price. */
export function comboTotal(split: ComboSplit, priceOf: (piece: ComboPiece) => number | null): number | null {
  let total = 0;
  for (const piece of split.pieces) {
    const price = priceOf(piece);
    if (price === null || !(price > 0)) return null;
    total += price * piece.quantity;
  }
  return Math.round(total * 100) / 100;
}

export const comboMoney = money;

/**
 * Said when a word could mean two different products.
 *
 * "chips" in a shop that sells both chips kavu and chips mayai. Picking one
 * would be picking a price, so it asks — naming both, so the answer is one word.
 */
export function comboAmbiguous(phrase: string, token: string, lang: Lang): string {
  return lang === 'sw'
    ? `“${phrase}” — neno *${token}* linaweza kuwa bidhaa zaidi ya moja kwenye duka lako.\n\n`
      + 'Andika jina kamili, mfano: _chips kavu na yai 2_.'
    : `“${phrase}” — the word *${token}* could be more than one of your products.\n\n`
      + 'Write the full name, for example: _chips kavu na yai 2_.';
}

/**
 * Where the number at the end of the phrase belongs.
 *
 * The owner, on how a kijiwe actually counts: "kikawaida wakisema chips yai
 * mbili wanamaanisha chips 2000, yai zinachanganywa mbili kwenye kavu moja
 * jumla 1000, kwa hiyo inakuwa 3000. Sasa wakisema zege mbili wanamaanisha
 * 6000."
 *
 * So the same word "mbili" means two different things, and which one depends on
 * what it is attached to:
 *
 *   SPLIT   "chips yai mbili" — the number counts the LAST THING NAMED. One
 *           plate of chips with two eggs mixed in. 2,000 + 2×500 = 3,000.
 *   SAVED   "zege mbili" — the nickname is a single item, so the number counts
 *           the ORDERS. Two zege. 2 × 3,000 = 6,000.
 *
 * A shop that saves "chips yai" turns the first case into the second, which is
 * exactly what saving it is for.
 */
export function applyOrderQuantity(split: ComboSplit, quantity: number): { orders: number; split: ComboSplit } {
  if (!(quantity > 0)) return { orders: 1, split };
  if (split.source === 'saved') return { orders: quantity, split };
  if (split.pieces.length === 0) return { orders: 1, split };
  const last = split.pieces.length - 1;
  return {
    orders: 1,
    split: {
      ...split,
      pieces: split.pieces.map((piece, at) => {
        if (at !== last) return piece;
        const { quantityAssumed: _stated, ...rest } = piece;
        return { ...rest, quantity };
      }),
    },
  };
}

/** "Mishikaki ipi?" — asked only where the shop registered more than one. */
export function comboVariantQuestion(phrase: string, token: string, candidates: string[], lang: Lang): string {
  const rows = candidates.map((name, index) => `${index + 1}. ${name}`).join('\n');
  return lang === 'sw'
    ? `“${phrase}” — *${token}* ipi?\n${rows}\n\nJibu kwa jina au namba, mfano: _${candidates[0] ?? ''}_.`
    : `“${phrase}” — which *${token}*?\n${rows}\n\nAnswer by name or number, e.g. _${candidates[0] ?? ''}_.`;
}

/** Reads which one they meant, or null. */
export function parseComboVariant(text: string | null | undefined, candidates: string[]): string | null {
  const said = comboKey(text);
  if (!said || candidates.length === 0) return null;
  const row = Number(said);
  if (Number.isInteger(row) && row >= 1 && row <= candidates.length) return candidates[row - 1];
  // The distinguishing words are what people type: "wa kuku", not the whole
  // registered name.
  const scored = candidates
    .map((name) => ({ name, key: comboKey(name) }))
    .filter(({ key }) => key === said || key.includes(said) || said.includes(key));
  return scored.length === 1 ? scored[0].name : null;
}
