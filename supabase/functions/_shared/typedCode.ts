// Typing the code, when the square will not read.
//
// MEASURED LIMIT, on a real close-up the owner sent: WhatsApp compressed it to
// 742x609 and the square came out soft. Every preprocessing combination was
// tried against that actual file — luma, blue, green, min and max channels, five
// threshold windows, three threshold factors, at native size and doubled — and
// none of the ninety decoded it. Blur plus TRA's watermark printed over the
// finder patterns is past what jsQR can recover.
//
// The code is printed in plain text directly above that square. Typing twelve
// characters is faster than a third photo and works every time, so that is the
// fallback rather than more photo gymnastics.
//
// It is still verified, never trusted: the typed code goes to TRA with the
// receipt's own printed time, and only an answer from TRA changes anything.

import type { Lang } from './whatsappIntent.ts';

const clean = (s: string | null | undefined) => String(s ?? '').replace(/\s+/g, ' ').trim();

/**
 * A verification code somebody typed, or null.
 *
 * Strict on shape because a wrong code here is worse than none: it would send
 * the lookup to a different receipt entirely. TRA codes are mixed alphanumeric,
 * so a run of only digits is refused — that is a receipt number, and the two sit
 * inches apart on the paper.
 */
export function parseTypedVerificationCode(text: string | null | undefined): string | null {
  const said = clean(text);
  if (!said) return null;

  const labelled = /(?:kodi|code|verification\s*code|namba\s*ya\s*uthibitisho)\s*(?:ni|is|:)?\s*([A-Za-z0-9]{6,20})\b/i
    .exec(said);
  const bare = /^([A-Za-z0-9]{8,20})$/.exec(said);
  const candidate = labelled?.[1] ?? bare?.[1];
  if (!candidate) return null;

  const code = candidate.toUpperCase();
  if (!/[A-Z]/.test(code) || !/[0-9]/.test(code)) return null;
  return code;
}

export function askForTypedCode(lang: Lang): string {
  return lang === 'sw'
    ? '\n\nAu andika kodi iliyoandikwa juu ya mraba — mfano: kodi ni 18935E214576.'
    : '\n\nOr type the code printed above the square — for example: code 18935E214576.';
}

export function typedCodeRejected(code: string, lang: Lang): string {
  return lang === 'sw'
    ? `TRA haijui kodi ${code}. Angalia herufi zinazofanana: 0 na O, 1 na I, 5 na S, 8 na B, 2 na Z.`
    : `TRA does not know the code ${code}. Check the look-alike characters: 0 and O, 1 and I, 5 and S, 8 and B, 2 and Z.`;
}
