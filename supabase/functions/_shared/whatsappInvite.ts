// Bringing somebody into the business, from WhatsApp.
//
// The owner asked for this: "nataka kumuinvite mtu", Risip asks for the person's
// number, and Risip sends them the invite. The middle half of that is right and
// the last part is not, for three reasons that all cost real money:
//
//   Meta will not deliver a free-form message to a number that has not written
//   to you first. It needs an approved template and a fee per message.
//
//   An unsolicited invite from the one Risip number damages that number's
//   standing — and every business on the platform shares it.
//
//   A single mistyped digit hands a stranger a way into the owner's books.
//
// So Risip writes the invite out, ready to forward, and the owner picks the
// person from their own contacts. One extra tap; the owner sees exactly who
// they are sending it to, which Risip never could.

import type { Lang } from './whatsappIntent.ts';

export type InviteRole = 'worker' | 'accountant';

/** "nataka kumuinvite mtu", "invite someone", "mualike mfanyakazi" */
export function parseInviteRequest(text: string | null | undefined): boolean {
  const said = String(text ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!said) return false;
  // MEASURED FAILURE: the owner wrote "nataka kumualika mtu nafanyaje" and this
  // knew "kualika" and "kumuinvite" but not "kumualika". Swahili puts the object
  // inside the verb — ku-M-ualika, ku-WA-alika, ni-M-ualike — so the stem is
  // what to match on, with the infix optional.
  // "mw" is the same infix written the way people type it — mwalike, mwalika.
  // Accept the forms people actually type in WhatsApp: "mualiko", doubled
  // vowels in "kumaalika", and a small typo in the lead-in such as
  // "nayaka kumaalika mtu". The invite verb plus a person word is enough;
  // it does not depend on the exact spelling of "nataka".
  return /\b(?:ku|ni|tu|a)?(?:mw|mu|m|wa|w)?a{0,2}lik(?:a|e|o)\b|\b(?:invite|inviting)\b|\bku(?:mu|wa)?invite\b|\bkuongeza mtu\b|\badd (?:a )?(?:user|worker|staff|member)\b|\b(?:mfanyakazi|staff|mtumiaji) mpya\b/
    .test(said);
}

/**
 * Which role the invite is for.
 *
 * Asked, never guessed, and never offered as a dropdown after the fact: an
 * invite code carries its role, so the answer decides what the person can see
 * from the moment they join. "Owner" is not on the list — a business has one.
 */
export function parseInviteRole(text: string | null | undefined): InviteRole | null {
  const said = String(text ?? '').toLowerCase().replace(/\s+/g, ' ').trim();
  if (!said) return null;
  if (/\b(?:mhasibu|accountant|hesabu|finance|fedha)\b/.test(said)) return 'accountant';
  if (/\b(?:mfanyakazi|worker|staff|muuzaji|kaunta|counter)\b/.test(said)) return 'worker';
  if (/^1$/.test(said)) return 'worker';
  if (/^2$/.test(said)) return 'accountant';
  return null;
}

/**
 * Kept for anyone mid-flow when the second role was removed, and for nothing
 * else. Nothing asks this any more.
 *
 * The owner: "hii risip haitaji tena muhasibu ni mfanyakazi tu sasa hivi
 * kwasaabu kazi yake ni kuripot na risip yenye ni mhasibu." He is right about
 * his own product — the accountant was a role from a contracting tool, and a
 * shop that has Risip does not need a second person reading its ledger.
 *
 * A question with one answer is not a question. It is a tap the person has to
 * make before the thing they asked for happens.
 */
export function inviteRoleQuestion(lang: Lang): string {
  return lang === 'sw'
    ? 'Namuandaa mfanyakazi. Subiri kidogo…'
    : 'Preparing a worker invite. One moment…';
}

const roleName = (role: InviteRole, lang: Lang) => lang === 'sw'
  ? (role === 'accountant' ? 'Mhasibu' : 'Mfanyakazi')
  : (role === 'accountant' ? 'Accountant' : 'Worker');

function inviterLabel(name: string, lang: Lang): string {
  const cleanName = name.trim() || (lang === 'sw' ? 'mmiliki wa biashara' : 'the business owner');
  return /^(?:boss|bosi|owner|mmiliki)\b/i.test(cleanName)
    ? cleanName
    : `${lang === 'sw' ? 'Boss' : 'Boss'} ${cleanName}`;
}

/** The first screen for a new number that pasted a valid invite code. */
export function inviteLanguageQuestion(
  businessName: string,
  inviterName: string,
  role: InviteRole,
): string {
  return 'Mambo vip Mdau! Karibu Risip 👋\n\n'
    + `Umealikwa na *${inviterLabel(inviterName, 'sw')}* kama *${roleName(role, 'sw')}* wa *${businessName}*.\n\n`
    + 'Chagua lugha:\n1. Kiswahili\n2. English';
}

/** The one clean bubble the owner can forward to the invited person. */
export function inviteForwardMessage(
  code: string,
  businessName: string,
  risipNumber: string | null,
  lang: Lang,
): string {
  const where = risipNumber
    ? (lang === 'sw' ? `WhatsApp namba ${risipNumber}` : `WhatsApp number ${risipNumber}`)
    : (lang === 'sw' ? 'WhatsApp namba hii ya Risip' : 'this Risip WhatsApp number');
  return lang === 'sw'
    ? `Karibu ${businessName}. Tuma neno ${code} kwenye ${where}, kisha fuata maswali mawili. Ndipo utaweza kurekodi mauzo kwa simu yako.`
    : `Welcome to ${businessName}. Send the word ${code} to ${where}, then answer two questions. That is when you can start recording sales on your phone.`;
}

function inviteResponsibilities(role: InviteRole, lang: Lang): string {
  if (role === 'worker') return workerCanDo(lang);
  return lang === 'sw'
    ? '*Mhasibu wako ataweza:*\n'
      + '• Kusimamia kumbukumbu za fedha\n'
      + '• Kuona faida, madeni na ripoti za fedha'
    : '*Your accountant will be able to:*\n'
      + '• Manage financial records\n'
      + '• View profit, debts and financial reports';
}

/** The first bubble shown to the owner after the invite code is created. */
export function inviteReady(
  code: string,
  role: InviteRole,
  lang: Lang,
): string {
  return lang === 'sw'
    ? `✅ Mwaliko wa *${roleName(role, lang)}* uko tayari.\n\n`
      + `Namba ya siri: *${code}*\n`
      + '_Inatumika mara moja tu, na inaisha baada ya siku 3._\n\n'
      + inviteResponsibilities(role, lang)
      + '\n\n────────\n'
      + '👇 Mtumie ujumbe huu hapo chini:'
    : `✅ *${roleName(role, lang)}* invite is ready.\n\n`
      + `Code: *${code}*\n`
      + '_Single use, expires in 3 days._\n\n'
      + inviteResponsibilities(role, lang)
      + '\n\n────────\n'
      + '👇 Send the message below:';
}

/**
 * What the owner is handing over, said before the person joins rather than after.
 *
 * The owner asked for the worker's duties in the first bubble. Workers may
 * read the company's profit, customer debts and financial reports; the server
 * still enforces the separate read-only/write boundaries.
 */
export function workerCanDo(lang: Lang): string {
  return lang === 'sw'
    ? '*Mfanyakazi wako ataweza:*\n'
      + '• Kurekodi mauzo na manunuzi\n'
      + '• Kuhesabu bidhaa zilizopo\n'
      + '• Kuona faida ya biashara\n'
      + '• Kuona madeni ya wateja wote\n'
      + '• Kuona ripoti za fedha'
    : '*Your worker will be able to:*\n'
      + '• Record sales and purchases\n'
      + '• Count stock on hand\n'
      + '• View the business profit\n'
      + '• View every customer’s debt\n'
      + '• View financial reports';
}

export function inviteCancelled(lang: Lang): string {
  return lang === 'sw' ? 'Sawa, sijatengeneza mwaliko.' : 'Fine, no invite was created.';
}

export function inviteNotAllowed(lang: Lang): string {
  return lang === 'sw'
    ? 'Ni mmiliki wa biashara pekee anayeweza kualika mtu mpya.'
    : 'Only the business owner can invite somebody new.';
}
