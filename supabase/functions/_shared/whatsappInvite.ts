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
  return /\b(?:ku|ni|tu|a)?(?:mw|mu|m|wa|w)?(?:alika|alike)\b|\b(?:invite|inviting)\b|\bku(?:mu|wa)?invite\b|\bkuongeza mtu\b|\badd (?:a )?(?:user|worker|staff|member)\b|\b(?:mfanyakazi|staff|mtumiaji) mpya\b/
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

/**
 * What the owner gets back: the code, and the message to forward.
 *
 * The forwardable part is written in the second person and carries everything
 * the newcomer needs in one block, because it will be pasted into a chat with
 * somebody who has never heard of Risip.
 */
export function inviteReady(
  code: string,
  role: InviteRole,
  businessName: string,
  risipNumber: string | null,
  lang: Lang,
): string {
  // Meta is asked for the display number, and can fail to give it. An invite
  // without it is still worth sending — the owner knows the number, it is the
  // one they are reading this on — so the sentence just changes shape.
  const where = risipNumber
    ? (lang === 'sw' ? `WhatsApp namba ${risipNumber}` : `WhatsApp on ${risipNumber}`)
    : (lang === 'sw' ? 'namba hii ya Risip' : 'this Risip number');
  const forward = lang === 'sw'
    ? `Karibu ${businessName}. Tuma neno *${code}* kwenye ${where}, `
      + 'kisha fuata maswali mawili. Ndipo utaweza kurekodi mauzo kwa simu yako.'
    : `Welcome to ${businessName}. Send *${code}* to ${where}, `
      + 'then answer two short questions. That is all you need to start recording sales.';

  return lang === 'sw'
    ? `✅ Mwaliko wa *${roleName(role, lang)}* uko tayari.\n\n`
      + `Namba ya siri: *${code}*\n`
      + '_Inatumika mara moja tu, na inaisha baada ya siku 3._\n\n'
      + '── Nakala ya kutuma kwake ──\n'
      + forward
      + '\n──\n\n'
      + 'Mtumie wewe mwenyewe kutoka kwenye contacts zako. Situmi mimi — '
      + 'namba ikikosewa hata tarakimu moja, mwaliko unaenda kwa mtu usiyemjua.'
    : `✅ *${roleName(role, lang)}* invite is ready.\n\n`
      + `Code: *${code}*\n`
      + '_Single use, expires in 3 days._\n\n'
      + '── Forward this to them ──\n'
      + forward
      + '\n──\n\n'
      + 'Send it yourself from your own contacts. I do not send it — '
      + 'one wrong digit and the invite reaches somebody you do not know.';
}

/**
 * What the owner is handing over, said before the person joins rather than after.
 *
 * The owner asked for it: "atapofanya ualiko apate bulets za majukumu ya
 * mfanyakazi wake." He is giving somebody a way into his books. The list of
 * what they will NOT see matters as much as the list of what they will —
 * without it, "mfanyakazi" is a word he has to trust rather than a boundary he
 * can read.
 *
 * Sent as its own message, after the code. Kanuni 3: the invite is the thing
 * he asked for and it ends where it ends; this is the explanation behind it.
 */
export function workerCanDo(lang: Lang): string {
  return lang === 'sw'
    ? '*Mfanyakazi wako ataweza:*\n'
      + '• Kurekodi mauzo na manunuzi\n'
      + '• Kuhesabu bidhaa zilizopo\n'
      + '• Kutuma picha ya rekodi\n\n'
      + '*Hataona:*\n'
      + '• Faida ya biashara\n'
      + '• Madeni ya wateja wote\n'
      + '• Ripoti za fedha\n\n'
      + '_Ukibadilisha mawazo, tuma *ondoa* na jina lake._'
    : '*Your worker will be able to:*\n'
      + '• Record sales and purchases\n'
      + '• Count stock on hand\n'
      + '• Send a photo of a record\n\n'
      + '*They will not see:*\n'
      + '• The business profit\n'
      + '• Every customer’s debt\n'
      + '• Financial reports\n\n'
      + '_If you change your mind, send *ondoa* and their name._';
}

export function inviteCancelled(lang: Lang): string {
  return lang === 'sw' ? 'Sawa, sijatengeneza mwaliko.' : 'Fine, no invite was created.';
}

export function inviteNotAllowed(lang: Lang): string {
  return lang === 'sw'
    ? 'Ni mmiliki wa biashara pekee anayeweza kualika mtu mpya.'
    : 'Only the business owner can invite somebody new.';
}
