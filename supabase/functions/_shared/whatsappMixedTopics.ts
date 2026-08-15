// Two things in one message.
//
// People do not write one topic per message. "Nimeuza daftari 5 kwa 7500, faida
// ya leo ni ngapi?" is one perfectly normal WhatsApp message, and until now the
// router claimed it with the first parser that matched and the question simply
// vanished. Nothing told the sender it had been dropped, which is the worst
// possible outcome: they think they asked.
//
// The rule here is deliberately lopsided:
//
//   • ONE write per message, never two. Recording a sale and changing a price
//     off the same sentence doubles the blast radius of a single mis-read, and a
//     mis-read is the failure mode that actually happens. A second write is
//     NAMED back to the sender, not performed.
//   • A QUESTION riding along is answered, because answering costs nothing and
//     cannot corrupt anything.
//
// So the splitting only has to be trustworthy in one direction: it may fail to
// notice a rider and lose nothing that is not already lost, but it must never
// tear a single instruction in half.

import type { Lang } from './whatsappIntent.ts';

export type MixedMessage = {
  /** The part the write parsers should see, exactly as it was typed. */
  action: string;
  /** The part to answer once the action is dealt with. */
  question: string;
};

const clean = (s: string | null | undefined) => String(s ?? '').replace(/\s+/g, ' ').trim();

/**
 * Where one thought can end and another begin.
 *
 * Captured, not consumed: the separators are kept so the action half can be put
 * back together EXACTLY as it was typed. That matters more than it looks — a
 * bulk stock count is recognised by its line breaks, so rejoining its lines
 * with ", " would hand the parser something it can no longer read.
 *
 * A comma is a cut point here, which seems reckless until you see the rejoin: a
 * piece that is not a question is glued straight back onto its neighbour, so a
 * list of goods comes out untouched. The comma only ever matters when there is
 * a question on the other side of it, and that is the commonest way somebody
 * writes two topics at once.
 *
 * "na" is not a separator at any strength — "daftari na kalamu" is one sale.
 * A full stop only cuts between words: the three-character lookbehind leaves
 * "St. Rita" alone, and requiring whitespace after it leaves "2.5 kilo" alone.
 */
const SPLIT = /(\?+|\n+|;|(?<=[\p{L}\p{N}]{3})\.\s+(?=[\p{L}])|,\s*|\s+(?:pia|kisha|halafu|and\s+also)\s+)/giu;

// A segment is a question if it asks like one. The mark alone is not enough —
// people put "?" on statements — and the words alone are not enough either.
const INTERROGATIVE = /^(?:je\b|nani\b|lini\b|kwa\s*nini\b|vipi\b|nionyeshe\b|niambie\b|onyesha\b|orodha\b|how\b|what\b|when\b|who\b|why\b|show\b|tell\b)/i;
const ASKS = /(?:\bngapi\b|\bkiasi\s+gani\b|\bgani\b|\bhow\s+much\b|\bhow\s+many\b)/i;

/** Anything that reports a movement is an instruction, whatever else it holds. */
const REPORTS = /^(?:nimeuza|niliuza|uza|nimenunua|nimelipa|nimetumia|amechukua|amelipa|nimehesabu|nina)\b/i;

/** A word count, not a character count — "faida?" is short but complete. */
const words = (s: string) => (s.match(/[\p{L}\p{N}]+/gu) ?? []).length;

function isQuestion(segment: string, hadMark: boolean): boolean {
  const said = clean(segment);
  if (!said || REPORTS.test(said)) return false;
  if (INTERROGATIVE.test(said)) return true;
  if (ASKS.test(said)) return true;
  // A bare "?" only counts on a short piece that is not doing anything itself.
  return hadMark && words(said) <= 6;
}

/**
 * Pulls a rider question off a message that is mostly an instruction.
 *
 * Returns null unless BOTH halves are substantial: a message that is only a
 * question is not mixed (the read path already owns it), and a message that is
 * only an instruction has nothing to answer.
 */
export function splitRiderQuestion(text: string | null | undefined): MixedMessage | null {
  // NOT cleaned first: clean() collapses newlines, and a line break is the most
  // common separator of all. The pieces are cleaned individually instead.
  const said = String(text ?? '');
  if (!said.trim() || said.length > 2000) return null;

  // split() with a capturing group gives [piece, separator, piece, separator …].
  const tokens = said.split(SPLIT);
  if (tokens.length < 3) return null;

  const questions: string[] = [];
  let action = '';
  for (let i = 0; i < tokens.length; i += 2) {
    const piece = tokens[i] ?? '';
    const separator = tokens[i + 1] ?? '';
    if (!clean(piece)) continue;
    if (isQuestion(piece, separator.startsWith('?'))) questions.push(clean(piece));
    else action += piece + separator;
  }

  // Whatever separator the question was hanging off is now dangling.
  action = action.replace(/(?:[\s,;.]|\bpia\b|\bkisha\b|\bhalafu\b)+$/i, '').trim();
  const question = questions.join(' ');

  if (questions.length === 0 || !action) return null;
  // A one-word leftover on either side is a fragment of the other half, not a
  // topic. Tearing an instruction in half is the one thing this must not do.
  if (words(action) < 3 || words(question) < 2) return null;

  return { action, question };
}

/**
 * Said with the instruction's own reply, so the sender knows the question was
 * seen — and knows what the answer does NOT yet include.
 *
 * The answer follows immediately rather than waiting for the confirmation,
 * because a read cannot hurt anything and making somebody confirm before they
 * are told anything is how questions get forgotten. But the figure will not
 * count whatever is still sitting unconfirmed, and saying so is the difference
 * between an answer and a wrong answer.
 */
export function riderQuestionNotice(question: string, lang: Lang): string {
  return lang === 'sw'
    ? `\n\n💬 Umeuliza pia: "${question}" — najibu hapa chini.`
      + '\n(Jibu halihesabu kile kinachosubiri uthibitisho hapo juu.)'
    : `\n\n💬 You also asked: "${question}" — answering below.`
      + '\n(The answer does not count what is still awaiting your confirmation above.)';
}

/**
 * Said when the leftover is a second INSTRUCTION rather than a question.
 *
 * It is named and refused in the same breath. Doing both writes would mean one
 * mis-read message could move money and rewrite a price at once, and a person
 * who sees only one confirmation would never know the second happened.
 */
export function secondInstructionNotice(leftover: string, lang: Lang): string {
  const shown = leftover.length > 120 ? `${leftover.slice(0, 117)}…` : leftover;
  return lang === 'sw'
    ? `\n\n📌 Sijashughulikia: "${shown}". Tuma peke yake ili nikuthibitishie vizuri.`
    : `\n\n📌 Not handled: "${shown}". Send it on its own so I can confirm it properly.`;
}
