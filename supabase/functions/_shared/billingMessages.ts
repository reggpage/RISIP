// What Risip says about money.
//
// A bill is the one message where a shopkeeper is being asked to give
// something rather than told something, so it has to be shorter and plainer
// than anything else the product sends. Four facts, one instruction, a way out.
//
// NO NUMBER IS FORMATTED HERE THAT DID NOT COME FROM AN INVOICE. Every figure
// below is passed in from a row that was written before the message existed.
// A billing message that computes its own total is a billing message that can
// disagree with the ledger.

import type { Lang } from './whatsappIntent.ts';

const money = (tzs: number) => `TSh ${Math.round(tzs).toLocaleString('en-US')}`;

/** "3 Oktoba 2026" from "2026-10-03", without pulling in a date library. */
export function billingDateLabel(iso: string, lang: Lang): string {
  const [y, m, d] = String(iso).split('-').map(Number);
  if (!y || !m || !d) return String(iso);
  return new Intl.DateTimeFormat(lang === 'sw' ? 'sw-TZ' : 'en-GB', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Africa/Dar_es_Salaam',
  }).format(new Date(Date.UTC(y, m - 1, d, 12)));
}

export type BillingNotice = {
  businessName: string;
  planName: string;
  amountTzs: number;
  periodStart: string;
  /** Days left before writing stops. Null while the period has not ended. */
  graceDaysLeft?: number | null;
};

/**
 * Three days before the period turns over. Nothing has been charged and
 * nothing will be until he answers.
 */
export function billingDueSoon(notice: BillingNotice, lang: Lang): string {
  const when = billingDateLabel(notice.periodStart, lang);
  return lang === 'sw'
    ? `*Bili ya Risip*\n\n`
      + `Duka: ${notice.businessName}\n`
      + `Plan: ${notice.planName}\n`
      + `Kiasi: *${money(notice.amountTzs)}*\n`
      + `Mwezi mpya unaanza: ${when}\n\n`
      + `Jibu *1* kulipa sasa. Ombi la malipo litafika kwenye simu yako.\n`
      + `Ukitaka kubadilisha plan, andika *PLAN*.`
    : `*Your Risip bill*\n\n`
      + `Shop: ${notice.businessName}\n`
      + `Plan: ${notice.planName}\n`
      + `Amount: *${money(notice.amountTzs)}*\n`
      + `New month starts: ${when}\n\n`
      + `Reply *1* to pay now. A payment request will reach your phone.\n`
      + `To change plan, reply *PLAN*.`;
}

/**
 * The period has ended unpaid and the grace days are running.
 *
 * It says how many days are left, because "soon" is not a number a shopkeeper
 * can plan around, and it says plainly that nothing has stopped yet.
 */
export function billingOverdue(notice: BillingNotice, lang: Lang): string {
  const days = Math.max(0, Math.round(notice.graceDaysLeft ?? 0));
  return lang === 'sw'
    ? `*Bili ya Risip haijalipwa*\n\n`
      + `Kiasi: *${money(notice.amountTzs)}*\n`
      + (days > 0
        ? `Unaendelea kuandika kwa siku *${days}* zaidi.\n\n`
        : `Leo ni siku ya mwisho ya kuandika.\n\n`)
      + `Jibu *1* kulipa sasa.`
    : `*Your Risip bill is unpaid*\n\n`
      + `Amount: *${money(notice.amountTzs)}*\n`
      + (days > 0
        ? `You can keep recording for *${days}* more day(s).\n\n`
        : `Today is the last day you can record.\n\n`)
      + `Reply *1* to pay now.`;
}

/**
 * Grace is spent. This is the only message that says something has stopped,
 * so it says what has NOT stopped first.
 */
export function billingSuspended(notice: BillingNotice, lang: Lang): string {
  return lang === 'sw'
    ? `*Risip imesimama*\n\n`
      + `Rekodi zako zote zipo salama, na unaweza kuziona wakati wowote.\n`
      + `Kilichosimama ni kuandika mpya tu.\n\n`
      + `Kiasi: *${money(notice.amountTzs)}*\n`
      + `Jibu *1* kulipa, na unaendelea papo hapo.`
    : `*Risip has paused*\n\n`
      + `All your records are safe and you can still read them any time.\n`
      + `Only adding new ones has stopped.\n\n`
      + `Amount: *${money(notice.amountTzs)}*\n`
      + `Reply *1* to pay and carry on straight away.`;
}

/** After a signed webhook has confirmed the money, never before. */
export function billingPaid(notice: BillingNotice, paidUntil: string, lang: Lang): string {
  return lang === 'sw'
    ? `✅ Asante. Umelipia ${money(notice.amountTzs)}.\n\n`
      + `Risip yako inaendelea hadi *${billingDateLabel(paidUntil, lang)}*.`
    : `✅ Thank you. ${money(notice.amountTzs)} received.\n\n`
      + `Your Risip runs until *${billingDateLabel(paidUntil, lang)}*.`;
}

/** Sent the moment the USSD prompt is on its way, so silence is never a mystery. */
export function billingPushSent(lang: Lang): string {
  return lang === 'sw'
    ? 'Nimekutumia ombi la malipo. Weka namba yako ya siri kwenye simu ili kukamilisha.\n'
      + 'Likikosa kufika ndani ya dakika mbili, jibu *1* tena.'
    : 'A payment request is on its way. Enter your PIN on the handset to finish.\n'
      + 'If nothing arrives within two minutes, reply *1* again.';
}

export function billingPushFailed(lang: Lang): string {
  return lang === 'sw'
    ? 'Sijaweza kutuma ombi la malipo sasa hivi. Jaribu tena baada ya dakika chache, '
      + 'au lipa kupitia dashboard.'
    : 'I could not send the payment request just now. Try again in a few minutes, '
      + 'or pay from the dashboard.';
}

export type BillingAnswer = 'pay' | 'plan' | 'cancel' | null;

/**
 * The reply to a bill.
 *
 * A ONE-WORD COMMAND, WHICH MEANS A PARSER. The owner's standing rule is that
 * the model reads sentences and nothing else, and "1" against a bill is as far
 * from a sentence as this product gets. Anything that is not one of these three
 * answers returns null and travels on as an ordinary message, so asking "kwa
 * nini bili ni kubwa hivi?" reaches the model rather than being read as a
 * refusal to pay.
 */
export function parseBillingAnswer(text: string | null | undefined): BillingAnswer {
  const said = String(text ?? '').toLocaleLowerCase('sw-TZ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  if (!said) return null;
  if (/^(1|ndiyo|ndio|lipa|nalipa|pay|yes)$/.test(said)) return 'pay';
  if (/^(2|plan|plani|badilisha plan|change plan)$/.test(said)) return 'plan';
  if (/^(ghairi|acha|cancel|stop|hapana|no)$/.test(said)) return 'cancel';
  return null;
}

/**
 * When the phone number's network cannot be told from its prefix.
 *
 * Asking beats guessing here: a push sent to the wrong network is silence, and
 * silence in a payment flow reads as a broken product rather than as a wrong
 * guess. Numbered, because that is how every other choice in Risip is made.
 */
export function billingAskProvider(lang: Lang): string {
  return lang === 'sw'
    ? 'Kabla sijatuma ombi la malipo, niambie mtandao wa namba hii:\n\n'
      + '*1* M-Pesa\n*2* Airtel Money\n*3* Mixx by Yas\n*4* Halopesa\n\n'
      + 'Jibu kwa namba. Ukitaka kuacha, andika *GHAIRI*.'
    : 'Before I send the payment request, which network is this number on?\n\n'
      + '*1* M-Pesa\n*2* Airtel Money\n*3* Mixx by Yas\n*4* Halopesa\n\n'
      + 'Reply with the number. To stop, reply *GHAIRI*.';
}
