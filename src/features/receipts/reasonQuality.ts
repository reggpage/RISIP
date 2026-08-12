// Mirrors private.is_meaningful_reason (migration 0067), which is what actually
// enforces this. Duplicated here only so the button can be disabled and the rule
// explained before a round trip — a client that skips this still gets refused.
//
// The rule exists because "10 characters" was a length check, not a meaning
// check: production already holds `rgdrhthtrhtjyyrjyt` as the recorded reason for
// a real reversal. A reason is read months later by someone reconstructing where
// money went.

export const MIN_REASON_CHARS = 20;
export const MIN_REASON_WORDS = 3;

/** The single sentence shown wherever a reason is refused. */
export const REASON_HELP =
  `Please write a clear reason with at least ${MIN_REASON_WORDS} meaningful words (${MIN_REASON_CHARS} characters or more).`;

const REPEATED_RUN = /(.)\1{3,}/;          // aaaa, !!!!
const ALNUM = /[\p{L}\p{N}]/u;
const VOWEL = /[aeiou]/;
const ALL_ONE_CHAR = /^(.)\1+$/;

/**
 * A word counts as meaningful when it is at least two characters, contains a
 * vowel, and is not one character repeated. Swahili is vowel-rich, so ordinary
 * Swahili and English pass while keyboard mashing ("sdfg hjkl qwrt") does not.
 * Repeats are ignored, which is what rejects "test test test".
 */
export function meaningfulWords(reason: string): string[] {
  const words = reason.toLowerCase().split(/[^\p{L}\p{N}]+/u);
  const seen: string[] = [];
  for (const w of words) {
    if (w.length >= 2 && VOWEL.test(w) && !ALL_ONE_CHAR.test(w) && !seen.includes(w)) {
      seen.push(w);
    }
  }
  return seen;
}

export function isMeaningfulReason(reason: string): boolean {
  const t = (reason ?? '').replace(/\s+/g, ' ').trim();
  if (t.length < MIN_REASON_CHARS) return false;
  if (REPEATED_RUN.test(t)) return false;

  const distinct = new Set(
    [...t.toLowerCase()].filter((ch) => ALNUM.test(ch)),
  );
  if (distinct.size < 8) return false;

  return meaningfulWords(t).length >= MIN_REASON_WORDS;
}

/** What to tell someone whose reason was refused, in the order they will hit it. */
export function reasonProblem(reason: string): string | null {
  const t = (reason ?? '').replace(/\s+/g, ' ').trim();
  if (t.length === 0) return null;                       // nothing typed yet: stay quiet
  if (t.length < MIN_REASON_CHARS) return `${MIN_REASON_CHARS - t.length} more characters.`;
  if (isMeaningfulReason(t)) return null;
  return REASON_HELP;
}
