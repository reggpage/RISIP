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
  ndyo: 'ndiyo',
  ndior: 'ndiyo',
  hapaba: 'hapana',
};

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

/** The one control word this token could be, or null. */
export function correctWord(token: string): string | null {
  const word = token.toLocaleLowerCase('sw-TZ');
  if (ALIASES[word]) return ALIASES[word];
  if (word.length < 5) return null;
  if (LEAVE_ALONE.has(word)) return null;
  if ((CONTROL_WORDS as readonly string[]).includes(word)) return null;

  let found: string | null = null;
  for (const candidate of CONTROL_WORDS) {
    if (!withinOneEdit(word, candidate)) continue;
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
  for (let at = 0; at < words.length; at += 1) {
    nextWord.set(words[at].index ?? -1, words[at + 1]?.[0] ?? '');
  }

  return said.replace(/[\p{L}]+/gu, (token, offset: number) => {
    if (PARTY_VERB.test(nextWord.get(offset) ?? '')) return token;
    const fixed = correctWord(token);
    if (!fixed) return token;
    return token[0] === token[0].toLocaleUpperCase('sw-TZ')
      ? fixed[0].toLocaleUpperCase('sw-TZ') + fixed.slice(1)
      : fixed;
  });
}
