// Reading what somebody meant to type on a phone keyboard.
//
// MEASURED FAILURE, from the owner's own testing:
//
//   "nimueza daftar 8, nguvu ya sala 10, kikombe 6"
//        → not a sale at all. "nimueza" is "nimeuza" with two letters swapped,
//          so no verb was found, the whole phrase fell through to the
//          "is this a sale or a purchase?" path, and when they answered
//          "mauzo" the PRODUCT was recorded as "nimueza daftar".
//   "mdiyo"
//        → not a yes. The confirmation was re-sent and the sale sat unsaved.
//
// A shopkeeper typing one-handed behind a counter transposes letters. That is a
// spelling problem with a small, closed answer: about twenty words in this
// product carry a decision, and each should survive one slip.
//
// MEASURED FAILURE, MINE, from the first version of this file: it corrected
// "Juma" to "jumla" and "nani" to "nane". A customer's name became a price
// band and "who owes me" became "eight". Both were one edit away, and both were
// the kind of word this must never touch. What that taught:
//
//   · A NAME can be anything. There is no list of them, so the protection
//     cannot be a list — it has to be the position. A word standing in front of
//     "amechukua" or "amelipa" is a person, whatever it looks like.
//   · NUMBER WORDS are not worth it. "nane" is one edit from "nani", "tatu" one
//     from "tabu", and a wrong number is money. Only exact, unmistakable
//     misspellings are mapped, and nothing is guessed.
//   · Ordinary Swahili is never rewritten however close it looks: "juma" is a
//     week, "kazi" is work, "gani" is which.

/** Words that carry a decision and must survive one slip. */
const CONTROL_WORDS = [
  // Money moving, and which way.
  'nimeuza', 'niliuza', 'tumeuza', 'nimenunua', 'nilinunua', 'tumenunua',
  'nimelipa', 'nililipa', 'nimetumia', 'nimehesabu', 'nimeongeza', 'naongeza',
  // Counting the shelf. A slip in one of these does not merely fail to count —
  // "kikokotoo zimbeaki 17" is read as a LIST OF GOODS called "kikokotoo
  // zimbeaki", and the shop is then offered the chance to register it as a new
  // product. That is where a catalogue full of nonsense names comes from.
  'zimebaki', 'imebaki', 'zilizobaki', 'zimesalia', 'ninazo',
  // Asking. A slip in one of these does no damage to the ledger, but it sends a
  // question that could have been answered from the database off to the model
  // to be improvised — "stcok yangu ikoje", "nioneshe zilizopo", "mauoz ya leo".
  // MEASURED, MINE: "stock" was in this list for one run, and it rewrote
  // "nimeuza leo Glue stick 1" to "Glue stock" — a product name destroyed by
  // the speller, which is the one thing this file must never do. Product names
  // are an open set and this vocabulary is closed; a word that is one edit from
  // an English noun any shop might stock does not belong here.
  'nionyeshe', 'onyesha', 'zilizopo', 'zilizoisha', 'zimekwisha',
  'nauza', 'ninauza', 'madeni',
  // "zimeisha" and "kimeisha" are one edit apart and BOTH real — plural and
  // singular. Each has to be in the vocabulary so neither is ever rewritten
  // into the other.
  'kimeisha', 'zimeisha', 'kimekwisha',
  // Active and passive of the same verb, one insertion apart and both real:
  // "kimeuza" is it has sold, "kimeuzwa" is it has been sold. Both listed, so
  // neither is ever turned into the other.
  'kimeuzika', 'zimeuzika', 'kimeuzwa', 'zimeuzwa', 'kimeuza', 'zimeuza',
  // Answers.
  'ndiyo', 'hapana', 'ghairi',
  // Which price.
  'rejareja', 'jumla',
  // What a whole message can be.
  'mauzo', 'manunuzi', 'matumizi',
] as const;

/**
 * Exact slips, mapped without guessing.
 *
 * For words where one edit reaches something else real. Nothing here is
 * inferred: each is a spelling seen in the field.
 */
const ALIASES: Record<string, string> = {
  mbii: 'mbili',
  mbil: 'mbili',
  // Too short for the edit-distance floor, and it turned "nna manila 63" — a
  // count — into a goods list with a product called "nna manila".
  nna: 'nina',
  // One edit from "zimeisha" AND from "zimekwisha", so the ambiguity rule
  // refuses it — correctly, except that here the two candidates are synonyms
  // and route to the same answer. Named outright rather than guessed.
  zimekisha: 'zimekwisha',
  ndyo: 'ndiyo',
  ndior: 'ndiyo',
  hapaba: 'hapana',
};

/**
 * Swahili agrees its verbs with the class of the thing doing the acting, and it
 * does it with a SINGLE LETTER at the front. "niliuza" is I sold; "kiliuza" is
 * it sold; "zimeuza" is they sold. One substitution apart, and opposite in
 * meaning.
 *
 * MEASURED FAILURE, MINE: "Nini kiliuza zaidi juzi?" — which product sold most
 * the day before yesterday — was rewritten to "Nini niliuza zaidi juzi", and
 * the product ranking became a question about the owner. Edit distance cannot
 * tell a typo from a grammar, so the grammar has to be stated: two words that
 * differ only in their concord letter are two different words, never a slip.
 */
const CONCORD = /^[kzvinuya]/;

function differsOnlyInConcord(word: string, candidate: string): boolean {
  return word.length === candidate.length
    && word[0] !== candidate[0]
    && CONCORD.test(word) && CONCORD.test(candidate)
    && word.slice(1) === candidate.slice(1);
}

/**
 * The short words a question is built out of.
 *
 * These get their own list because they are shorter than the five-letter floor
 * the rest of this file works to. That floor exists to stop short words being
 * guessed at, and it is right for anything that decides where money went — but
 * "ngap", "ngaip", "fiada", "bidaha" and "dukni" cost a question, not a
 * shilling, and every one of them was measured coming off a real keyboard.
 *
 * Nothing here can change a number or a direction. That is the whole reason the
 * floor may be relaxed for them and for nothing else.
 */
const ASK_WORDS = ['ngapi', 'bidhaa', 'faida', 'dukani', 'kiasi', 'mauzo'] as const;
const ASK_FLOOR = 4;

/**
 * Ordinary Swahili that sits within one edit of a control word.
 *
 * "juma" is a week and half the men in the country. "gani" is which. Rewriting
 * any of these would change what somebody asked, or who they were talking about.
 */
const LEAVE_ALONE = new Set([
  'juma', 'jumaa', 'jumapili', 'jumatatu',
  'nani', 'nini', 'lini', 'wapi', 'gani', 'ngapi', 'kiasi', 'kwanini',
  'tabu', 'kazi', 'kesho', 'leo', 'sasa', 'hapa', 'wewe', 'mimi', 'sana',
  'mia', 'maji', 'moto', 'mama', 'baba', 'jana', 'juzi', 'siku', 'zaidi',
  'mkate', 'mchele', 'maziwa', 'chumvi', 'mafuta', 'nane', 'sabuni',
  'soda', 'sukari', 'nyama', 'samaki', 'ndizi', 'mboga', 'jumla ya',
]);

/**
 * The verbs a person's name stands in front of.
 *
 * "Juma amechukua sukari" — whatever the first word looks like, it is who,
 * not what. This is how a name is protected without a list of names.
 */
const PARTY_VERB = /^(?:a(?:me|li)(?:chukua|lipa|uza)|wamechukua|kachukua|kalipa|ananidai|anadaiwa|owes|paid|took)$/i;

/**
 * The verbs themselves, which also get typed wrong.
 *
 * MEASURED FAILURE: "Juma amleipa deni 10000" was recorded as a DEBT ISSUED —
 * money going out to Juma — when he had just walked in and PAID. Two letters
 * swapped in "amelipa", and the ledger says the opposite of what happened.
 *
 * Corrected only when something already stands in front of them, because that
 * is what tells a verb from a name. "Amelia" is one edit from "amelipa"; at the
 * head of a message it is a person, and this must never touch it. After a name
 * has already been read, a word this close to a party verb is that verb.
 */
const PARTY_VERBS = [
  'amechukua', 'alichukua', 'amelipa', 'alilipa', 'ameuza', 'aliuza',
  'wamechukua', 'wamelipa', 'ananidai', 'anadaiwa',
] as const;

/**
 * Damerau-Levenshtein, capped at one.
 *
 * Capped because one edit is the only answer this file acts on, and stopping
 * early keeps it cheap enough to run over every word of every message.
 */
export function withinOneEdit(a: string, b: string): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  if (Math.abs(a.length - b.length) > 1) return false;

  if (a.length === b.length) {
    let differences = 0;
    let at = -1;
    for (let i = 0; i < a.length; i += 1) {
      if (a[i] === b[i]) continue;
      differences += 1;
      if (differences === 1) at = i;
      if (differences > 2) return false;
    }
    if (differences <= 1) return true;
    // Exactly two: a swap of neighbours, or nothing.
    return differences === 2 && a[at] === b[at + 1] && a[at + 1] === b[at]
      && a.slice(at + 2) === b.slice(at + 2);
  }

  const short = a.length < b.length ? a : b;
  const long = a.length < b.length ? b : a;
  let i = 0;
  let j = 0;
  let skipped = false;
  while (i < short.length && j < long.length) {
    if (short[i] === long[j]) { i += 1; j += 1; continue; }
    if (skipped) return false;
    skipped = true;
    j += 1;
  }
  return true;
}

/**
 * The one control word this token could be, or null.
 *
 * `leading` is true for the first word of the message. The party verbs are
 * refused there, because at the head of a sentence a word that shape is a name.
 */
export function correctWord(token: string, leading = false): string | null {
  const word = token.toLocaleLowerCase('sw-TZ');
  if (ALIASES[word]) return ALIASES[word];
  if (word.length < ASK_FLOOR) return null;
  if (LEAVE_ALONE.has(word)) return null;
  if (word.length < 5) {
    // Below the ordinary floor only the asking words are reachable, and only
    // one of them: two candidates is still not an answer.
    if ((ASK_WORDS as readonly string[]).includes(word)) return null;
    let asked: string | null = null;
    for (const candidate of ASK_WORDS) {
      if (!withinOneEdit(word, candidate) || differsOnlyInConcord(word, candidate)) continue;
      if (asked) return null;
      asked = candidate;
    }
    return asked;
  }
  const vocabulary: string[] = [...new Set<string>(leading
    ? [...CONTROL_WORDS, ...ASK_WORDS]
    : [...CONTROL_WORDS, ...ASK_WORDS, ...PARTY_VERBS])];
  if (vocabulary.includes(word)) return null;

  let found: string | null = null;
  for (const candidate of vocabulary) {
    if (!withinOneEdit(word, candidate) || differsOnlyInConcord(word, candidate)) continue;
    // Two candidates is not an answer: a verb decides which way money moved.
    if (found) return null;
    found = candidate;
  }
  return found;
}

/**
 * Fixes the decision-carrying words in a message and leaves everything else
 * exactly as it was typed — every product name, every person's name, every
 * number, every scrap of punctuation.
 */
export function correctControlWords(text: string | null | undefined): string {
  const said = String(text ?? '');
  if (!said.trim()) return said;

  // Read ahead: the word AFTER this one decides whether this one is a name.
  const words = [...said.matchAll(/[\p{L}]+/gu)];
  const nextWord = new Map<number, string>();
  const previousWord = new Map<number, string>();
  for (let at = 0; at < words.length; at += 1) {
    nextWord.set(words[at].index ?? -1, words[at + 1]?.[0] ?? '');
    previousWord.set(words[at].index ?? -1, words[at - 1]?.[0] ?? '');
  }
  const first = words[0]?.index ?? -1;
  // A capital in the middle of a Swahili sentence is a name, unless the whole
  // message is shouted — and plenty are.
  const shouting = said === said.toLocaleUpperCase('sw-TZ');
  const TITLE = /^(?:mama|baba|mzee|kaka|dada|bwana|bi|ndugu|mr|mrs|miss)$/i;

  return said.replace(/[\p{L}]+/gu, (token, offset: number) => {
    const next = nextWord.get(offset) ?? '';
    // The word in front of a party verb is a person — including when the verb
    // itself was mistyped, which is the case that put a payment in the ledger
    // as a debt.
    if (PARTY_VERB.test(next) || PARTY_VERB.test(correctWord(next) ?? '')) return token;
    const named = offset === first
      || TITLE.test(previousWord.get(offset) ?? '')
      || (!shouting && token[0] !== token[0].toLocaleLowerCase('sw-TZ'));
    const fixed = correctWord(token, named);
    if (!fixed) return token;
    return token[0] === token[0].toLocaleUpperCase('sw-TZ')
      ? fixed[0].toLocaleUpperCase('sw-TZ') + fixed.slice(1)
      : fixed;
  });
}
