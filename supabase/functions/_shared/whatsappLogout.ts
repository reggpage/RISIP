// Signing out of WhatsApp.
//
// The phone number is the credential, so signing out means UNLINKING it. The two
// real reasons somebody asks are "my phone was stolen" and "this employee has
// left"; clearing a chat session would answer neither, because the number could
// still record sales the next morning.
//
// THE "TOKA" PROBLEM. In Swahili "toka" is both "cancel this" and "let me out".
// It already matched isStopCommand, so a person typing it to leave was told
// their draft was cancelled and stayed fully linked. Guessing either way is
// wrong, so:
//
//   toka + a pending draft   → cancel        (unchanged behaviour)
//   toka + nothing pending   → ASK which one they meant
//   "logout" / "ondoa namba" → unlink, with confirmation
//
// A word that genuinely means two things gets one short question, not a guess.

import type { Lang } from './whatsappIntent.ts';

export type LogoutIntent = 'explicit' | 'ambiguous' | null;

/**
 * Parked in the ordinary conversation slot, so an unfinished logout expires the
 * same way every other pending question does. Nobody is left half-signed-out.
 */
export type LogoutState = {
  kind: 'logout';
  step: 'disambiguate' | 'confirm';
  businessName: string;
};

const clean = (s: string | null | undefined) => (s ?? '').replace(/\s+/g, ' ').trim();

// Unmistakable: these can only mean "take this number off the account".
const EXPLICIT = new RegExp([
  'log\\s*out', 'logout', 'sign\\s*out',
  'ondoa\\s+(?:hii\\s+)?namba', 'ondoa\\s+muunganisho', 'toa\\s+namba',
  'jiondoe', 'nitoke\\s+(?:kwenye\\s+)?risip', 'niondoe',
  'unlink', 'disconnect',
].join('|'), 'i');

// "toka" or "nataka kutoka" alone. Could be cancel, could be leave.
const AMBIGUOUS = /^(?:nataka\s+ku)?toka\b|^nataka\s+kuondoka\b/i;

export function parseLogoutIntent(text: string | null | undefined): LogoutIntent {
  const said = clean(text);
  if (!said) return null;
  if (EXPLICIT.test(said)) return 'explicit';
  if (AMBIGUOUS.test(said)) return 'ambiguous';
  return null;
}

/** Asked when "toka" could mean either thing and nothing is pending. */
export function logoutDisambiguation(lang: Lang): string {
  return lang === 'sw'
    ? 'Unamaanisha nini?\n\n1. Ghairi kilichopo\n2. Ondoa namba hii kwenye Risip\n\nJibu 1 au 2.'
    : 'Which do you mean?\n\n1. Cancel what is pending\n2. Remove this number from Risip\n\nReply 1 or 2.';
}

export function parseDisambiguationChoice(text: string | null | undefined): 'cancel' | 'logout' | null {
  const said = clean(text);
  if (/^1\b/.test(said)) return 'cancel';
  if (/^2\b/.test(said)) return 'logout';
  return null;
}

/**
 * Says plainly what will stop working and what will not. Somebody unlinking a
 * stolen phone needs to know their records survive; somebody doing it by
 * accident needs to know it is not free to undo.
 */
export function logoutConfirmation(businessName: string, lang: Lang): string {
  return lang === 'sw'
    ? `Ukiondoa namba hii kwenye ${businessName}:\n`
      + '• Hutaweza kurekodi wala kuuliza chochote hapa WhatsApp\n'
      + '• Link zako za kuingia zitakufa\n'
      + '• Rekodi na historia yako yote **zitabaki salama**\n\n'
      + 'Kuunganisha tena utahitaji kodi mpya kutoka kwa owner.\n\n'
      + 'Uhakika? NDIYO / HAPANA'
    : `If you remove this number from ${businessName}:\n`
      + '• You will not be able to record or ask anything here on WhatsApp\n'
      + '• Your login links will stop working\n'
      + '• Your records, receipts and history all **stay safe**\n\n'
      + 'To connect again you will need a fresh code from the owner.\n\n'
      + 'Are you sure? YES / NO';
}

export function logoutDone(businessName: string, lang: Lang): string {
  return lang === 'sw'
    ? `Nimeondoa namba hii kwenye ${businessName}. Kwaheri 👋\n\n`
      + 'Rekodi zako zote zipo salama. Ukitaka kurudi, omba kodi kwa owner kisha tuma "Hi".'
    : `This number has been removed from ${businessName}. Goodbye 👋\n\n`
      + 'All your records are safe. To come back, ask the owner for a code then send "Hi".';
}

export function logoutCancelled(lang: Lang): string {
  return lang === 'sw'
    ? 'Sawa, sijaondoa chochote. Namba yako bado imeunganishwa.'
    : 'Fine, nothing was removed. Your number is still connected.';
}

/**
 * Unlinking cannot be guessed at, so an unclear answer asks again instead of
 * picking a side. Repeats the options rather than scolding.
 */
export function logoutReask(step: LogoutState['step'], lang: Lang): string {
  if (step === 'disambiguate') {
    return lang === 'sw'
      ? 'Sikuelewa. Jibu 1 kughairi kilichopo, au 2 kuondoa namba hii kwenye Risip.'
      : 'I did not catch that. Reply 1 to cancel what is pending, or 2 to remove this number from Risip.';
  }
  return lang === 'sw'
    ? 'Sijaondoa chochote bado. Jibu NDIYO kuondoa namba hii, au HAPANA kuacha ilivyo.'
    : 'Nothing has been removed yet. Reply YES to remove this number, or NO to leave it as it is.';
}

/** Shown when wa_logout says the number was already unlinked. */
export function logoutNotLinked(lang: Lang): string {
  return lang === 'sw'
    ? 'Namba hii haijaunganishwa na biashara yoyote kwa sasa.'
    : 'This number is not connected to any business right now.';
}

export function logoutFailed(lang: Lang): string {
  return lang === 'sw'
    ? 'Sikuweza kuondoa namba hii sasa hivi. Namba yako bado imeunganishwa; tafadhali jaribu tena.'
    : 'I could not remove this number just now. Your number is still connected; please try again.';
}
