import type { Lang } from './whatsappIntent.ts';

/**
 * Teaching Risip how THIS shop talks.
 *
 * A butcher says "za mbwa" and means Chakula cha mbwa. Nothing about that is
 * general knowledge — the shop across the road may use the same words for
 * something else — so it is learned from the trader, confirmed before it is
 * kept, and stored against their company alone.
 *
 * Two things can be taught, and they are not the same thing:
 *
 *   product_alias   another name for a product this shop already sells
 *   semantic_term   a word that describes an EVENT, such as "mzoga" meaning
 *                   meat that has spoiled
 *
 * A third — "kifuko is one kilo" — is a unit conversion, not vocabulary, and
 * is deliberately not read here. It belongs where conversions already live.
 */
export type VocabularyTeaching =
  | { kind: 'product_alias'; term: string; product: string }
  | { kind: 'semantic_term'; term: string; meaning: 'stock_loss'; product: string | null }
  | { kind: 'forget'; term: string };

const clean = (value: string | null | undefined) =>
  String(value ?? '').replace(/\s+/g, ' ').trim();

/** Quotes a shop might put around the word it is teaching. */
const unquote = (value: string) =>
  clean(value).replace(/^["'“”‘’«»]+|["'“”‘’«»]+$/gu, '').trim();

/**
 * A name, not a sentence. Long phrases here are almost always the parser having
 * swallowed the rest of the message, and saving one would poison every future
 * reading of that word.
 */
function plausible(value: string): boolean {
  const name = unquote(value);
  return name.length >= 2 && name.length <= 60 && /[\p{L}]/u.test(name)
    && name.split(' ').length <= 6;
}

/** Words that describe spoilage rather than a product. */
const SPOILED = /\b(?:imeharibika|iliyoharibika|zilizoharibika|kuharibika|imeoza|iliyooza|zilizooza|kuoza|mbovu|spoiled|rotten)\b/iu;

export function parseVocabularyTeaching(text: string | null | undefined): VocabularyTeaching | null {
  const said = clean(text);
  if (!said) return null;

  // "ondoa jina za mbwa" / "sahau neno za mbwa"
  const forget = /^(?:ondoa|futa|sahau)\s+(?:jina|neno)\s+(.+)$/iu.exec(said);
  if (forget && plausible(forget[1])) {
    return { kind: 'forget', term: unquote(forget[1]) };
  }

  // The shapes a trader actually uses to explain their own words.
  //   "nikisema za mbwa namaanisha chakula cha mbwa"
  //   "kwetu za mbwa ni chakula cha mbwa"
  //   "huku tunaita maini liver"          (target first, then the nickname)
  const patterns: Array<{ re: RegExp; term: 1 | 2; target: 1 | 2 }> = [
    { re: /^(?:(?:kwetu|huku|hapa)\s+)?(?:nikisema|ni?kiandika|nikitaja)\s+(.+?)\s+(?:namaanisha|nina\s*maanisha|maana\s+yake\s+ni|ninamaanisha)\s+(.+)$/iu, term: 1, target: 2 },
    { re: /^(?:kwetu|huku|hapa|kwenye\s+duka\s+langu)\s+(.+?)\s+(?:ni|ndio|ndiyo|inamaanisha|humaanisha)\s+(.+)$/iu, term: 1, target: 2 },
    { re: /^(?:huku\s+|kwetu\s+)?tuna(?:ita|iita)\s+(.+?)\s+(.+)$/iu, term: 2, target: 1 },
  ];

  for (const { re, term, target } of patterns) {
    const match = re.exec(said);
    if (!match) continue;
    const word = unquote(match[term]);
    const meansRaw = clean(match[target]);
    const means = unquote(meansRaw);
    if (!plausible(word) || !plausible(means)) continue;
    // A word explained as "meat that spoiled" is describing an event, not
    // naming a product. It is stored as a meaning, with the product left open
    // unless the shop actually named one.
    if (SPOILED.test(meansRaw)) {
      const product = clean(meansRaw.replace(SPOILED, ' '))
        .replace(/^(?:nyama\s+)?(?:ambayo|iliyo|zilizo)\s+/iu, '')
        .trim();
      return {
        kind: 'semantic_term',
        term: word,
        meaning: 'stock_loss',
        product: plausible(product) ? unquote(product) : null,
      };
    }
    return { kind: 'product_alias', term: word, product: means };
  }

  return null;
}

export function aliasConfirmation(term: string, productName: string, lang: Lang): string {
  return lang === 'sw'
    ? `Nimeelewa. Unataka *${term}* iwe jina jingine la *${productName}* kwenye biashara hii.\n\n`
      + `Nihifadhi? *1* Ndiyo · *2* Hapana`
    : `Understood. You want *${term}* to be another name for *${productName}* in this business.\n\n`
      + `Save it? *YES* / *NO*`;
}

export function semanticConfirmation(term: string, productName: string | null, lang: Lang): string {
  if (lang === 'sw') {
    return `Nimeelewa. Kwenye biashara hii, *${term}* inamaanisha bidhaa iliyoharibika.\n`
      + (productName
        ? `Nitachukua kuwa unamaanisha *${productName}* isipokuwa ukitaja nyingine.\n`
        : `Sitajua ni bidhaa gani mpaka uniambie kila mara.\n`)
      + `\nNihifadhi? *1* Ndiyo · *2* Hapana`;
  }
  return `Understood. In this business, *${term}* means goods that spoiled.\n`
    + (productName
      ? `I will assume you mean *${productName}* unless you name another.\n`
      : `I will not know which product until you tell me each time.\n`)
    + `\nSave it? *YES* / *NO*`;
}

export function forgetConfirmation(term: string, lang: Lang): string {
  return lang === 'sw'
    ? `Unataka nisahau neno *${term}* kwenye biashara hii?\n\n*1* Ndiyo · *2* Hapana`
    : `Do you want me to forget the word *${term}* in this business?\n\n*YES* / *NO*`;
}

/**
 * A word already means something else here. It is never silently remapped: the
 * shop is told what it currently means and has to say so again.
 */
export function vocabularyConflict(
  term: string,
  existing: { kind: string; productName: string | null; meaning: string | null },
  lang: Lang,
): string {
  const current = existing.kind === 'product_alias'
    ? (lang === 'sw' ? `jina jingine la *${existing.productName}*` : `another name for *${existing.productName}*`)
    : (lang === 'sw' ? 'bidhaa iliyoharibika' : 'goods that spoiled');
  return lang === 'sw'
    ? `*${term}* tayari inatumika kama ${current}.\n\n`
      + `Sitabadilisha kimya. Ukitaka kubadilisha, andika: _ondoa jina ${term}_ kisha uniambie maana mpya.`
    : `*${term}* already means ${current}.\n\n`
      + `I will not change that silently. To change it, send: _ondoa jina ${term}_ and then tell me the new meaning.`;
}

export function vocabularySaved(term: string, lang: Lang): string {
  return lang === 'sw'
    ? `Sawa. Nimehifadhi *${term}* kwa biashara hii.`
    : `Done. I have saved *${term}* for this business.`;
}

export function vocabularyForgotten(term: string, removed: boolean, lang: Lang): string {
  if (lang === 'sw') {
    return removed
      ? `Sawa. Nimesahau neno *${term}*.`
      : `Sikuwa na neno *${term}* kwenye biashara hii.`;
  }
  return removed
    ? `Done. I have forgotten the word *${term}*.`
    : `I had no word *${term}* in this business.`;
}

export function vocabularyNotAllowed(lang: Lang): string {
  return lang === 'sw'
    ? 'Ni owner au accountant pekee anayeweza kubadilisha maneno ya biashara.'
    : 'Only an owner or accountant can change the words this business uses.';
}

/**
 * The vocabulary block the assistant is given.
 *
 * Words only. No prices, no stock figures, no customer names — those are
 * retrieved through tools that read the ledger, where they can be checked. A
 * price in a prompt is a price the model can restate wrongly; a word cannot be
 * misquoted into a ledger.
 */
export function vocabularyContext(
  rows: Array<{ kind: string; term: string; productName: string | null; meaning: string | null }>,
  limit = 60,
): string {
  const aliases = rows
    .filter((row) => row.kind === 'product_alias' && row.productName)
    .slice(0, limit)
    .map((row) => `  ${row.term} = ${row.productName}`);
  const semantics = rows
    .filter((row) => row.kind === 'semantic_term')
    .slice(0, limit)
    .map((row) => `  ${row.term} = ${row.meaning}${row.productName ? ` (${row.productName})` : ''}`);
  if (aliases.length === 0 && semantics.length === 0) return '';
  return [
    'THIS SHOP’S OWN WORDS. Use them to understand the message. They are not',
    'prices and not stock; every figure still comes from a tool.',
    ...(aliases.length > 0 ? ['Other names for products:', ...aliases] : []),
    ...(semantics.length > 0 ? ['Words that describe an event:', ...semantics] : []),
  ].join('\n');
}

/** Parked while the shop confirms. Vocabulary is a setting, not a message. */
export type VocabularyPending = {
  kind: 'vocabulary_teaching';
  teaching: VocabularyTeaching;
  /** The canonical product the preview named, so the save cannot drift from it. */
  productName: string | null;
};
