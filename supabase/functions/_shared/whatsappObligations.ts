// Rent, and everything else that arrives whether you sold anything or not.
//
// The owner's words: "tumesahau swala la kodi ni lazima system imuulize mteja
// gharama za jengo kila mwezi ni shingapi". He was right, and it was a real
// hole: a shop could be told its profit every day for a month and never be
// told that the rent falls due on Friday.
//
// Every figure here is handed in by the database. Nothing in this module reads
// the trader's wording and nothing derives money.

import type { Lang } from './whatsappIntent.ts';

export type Obligation = {
  id: string;
  kind: string;
  label: string | null;
  amount: number;
  periodMonths: number;
  nextDueOn: string;
  daysUntilDue: number;
  paidForCurrentPeriod: number;
  outstanding: number;
  lastPaidOn: string | null;
  /** What it used to be, when the landlord has raised it. */
  previousAmount: number | null;
};

const money = (value: number) => `TSh ${Math.round(value).toLocaleString('en-US')}`;

const KIND: Record<string, { sw: string; en: string }> = {
  rent: { sw: 'Kodi ya jengo', en: 'Rent' },
  licence: { sw: 'Leseni', en: 'Licence' },
  electricity: { sw: 'Umeme', en: 'Electricity' },
  water: { sw: 'Maji', en: 'Water' },
  security: { sw: 'Ulinzi', en: 'Security' },
  other: { sw: 'Gharama nyingine', en: 'Other cost' },
};

export function obligationName(one: Obligation, lang: Lang): string {
  const base = KIND[one.kind] ?? KIND.other;
  const name = lang === 'sw' ? base.sw : base.en;
  return one.label ? `${name} (${one.label})` : name;
}

const PERIOD: Record<number, { sw: string; en: string }> = {
  1: { sw: 'kila mwezi', en: 'monthly' },
  2: { sw: 'kila miezi 2', en: 'every 2 months' },
  3: { sw: 'kila miezi 3', en: 'quarterly' },
  4: { sw: 'kila miezi 4', en: 'every 4 months' },
  6: { sw: 'kila miezi 6', en: 'twice a year' },
  12: { sw: 'kila mwaka', en: 'yearly' },
};

export function periodName(months: number, lang: Lang): string {
  const found = PERIOD[months] ?? PERIOD[1];
  return lang === 'sw' ? found.sw : found.en;
}

/** Evidence for the model: dates and figures, no prose and no opinion. */
export function obligationFacts(list: Obligation[], today: string): string {
  if (list.length === 0) return 'recurring_costs=none_recorded';
  const rows = [`today=${today}`, `recurring_costs=${list.length}`];
  for (const one of list) {
    rows.push(`cost=${one.kind}${one.label ? `|${one.label}` : ''}`
      + `|amount=${Math.round(one.amount)}`
      + `|every_months=${one.periodMonths}`
      + `|next_due=${one.nextDueOn}`
      + `|days_until_due=${one.daysUntilDue}`
      + `|paid_this_period=${Math.round(one.paidForCurrentPeriod)}`
      + `|outstanding=${Math.round(one.outstanding)}`
      + `|last_paid=${one.lastPaidOn ?? 'never'}`
      + (one.previousAmount === null ? '' : `|was=${Math.round(one.previousAmount)}`));
  }
  return rows.join('\n');
}

/**
 * The rendered fallback: what is owed, when, and what is short.
 *
 * Ordered by due date, because the only useful order for a bill is the one
 * that says which comes first.
 */
export function obligationListReply(list: Obligation[], lang: Lang): string {
  const sw = lang === 'sw';
  if (list.length === 0) {
    return sw
      ? 'Hujaniambia gharama zozote za kila mwezi bado.\n\n'
        + 'Niambie kwa maneno, mfano: _"kodi ya jengo ni 200000 kila mwezi"_.'
      : 'You have not told me about any recurring costs yet.\n\n'
        + 'Tell me in words, for example: _"kodi ya jengo ni 200000 kila mwezi"_.';
  }

  const out = [sw ? '*Gharama za kila mara*' : '*Recurring costs*', ''];
  for (const one of list) {
    out.push(`*${obligationName(one, lang)}* — ${money(one.amount)} ${periodName(one.periodMonths, lang)}`);

    // Overdue is stated as overdue. "Due in -3 days" is a number nobody reads.
    if (one.daysUntilDue < 0) {
      out.push(sw
        ? `⚠️ Ilipaswa kulipwa siku ${Math.abs(one.daysUntilDue)} zilizopita (${one.nextDueOn})`
        : `⚠️ Was due ${Math.abs(one.daysUntilDue)} days ago (${one.nextDueOn})`);
    } else if (one.daysUntilDue === 0) {
      out.push(sw ? `📅 Inalipwa *leo*` : `📅 Due *today*`);
    } else {
      out.push(sw
        ? `📅 Inalipwa ${one.nextDueOn} — siku ${one.daysUntilDue}`
        : `📅 Due ${one.nextDueOn} — ${one.daysUntilDue} days`);
    }

    // A half payment is not a status, it is a subtraction, and both halves of
    // it matter: what went in, and what is still short.
    if (one.paidForCurrentPeriod > 0 && one.outstanding > 0) {
      out.push(sw
        ? `Umelipa ${money(one.paidForCurrentPeriod)} · imebaki *${money(one.outstanding)}*`
        : `Paid ${money(one.paidForCurrentPeriod)} · *${money(one.outstanding)}* still owed`);
    } else if (one.outstanding <= 0) {
      out.push(sw ? '✅ Imelipwa' : '✅ Paid');
    }

    if (one.previousAmount !== null && one.previousAmount !== one.amount) {
      const up = one.amount > one.previousAmount;
      out.push(sw
        ? `_Ilikuwa ${money(one.previousAmount)} — ime${up ? 'pandishwa' : 'punguzwa'}._`
        : `_Was ${money(one.previousAmount)} — ${up ? 'raised' : 'lowered'}._`);
    }
    out.push('');
  }

  const owed = list.reduce((sum, one) => sum + one.outstanding, 0);
  if (owed > 0) {
    out.push(sw ? `*Jumla inayodaiwa sasa: ${money(owed)}*` : `*Owed right now: ${money(owed)}*`);
  }
  return out.join('\n').trimEnd();
}

/** What the shop is told once a recurring cost is recorded or changed. */
export function obligationSetReply(
  name: string,
  amount: number,
  periodMonths: number,
  nextDueOn: string,
  previousAmount: number | null,
  lang: Lang,
): string {
  const sw = lang === 'sw';
  const head = sw
    ? `✅ *${name}* — ${money(amount)} ${periodName(periodMonths, lang)}`
    : `✅ *${name}* — ${money(amount)} ${periodName(periodMonths, lang)}`;
  const when = sw ? `Malipo yanayofuata: ${nextDueOn}` : `Next due: ${nextDueOn}`;
  if (previousAmount === null || previousAmount === amount) return `${head}\n${when}`;
  // Raised or lowered, said plainly. A landlord dropping the rent is rare and
  // worth naming; calling it a "change" would hide which way it went.
  const direction = amount > previousAmount
    ? (sw ? 'imepandishwa' : 'raised')
    : (sw ? 'imepunguzwa' : 'lowered');
  return sw
    ? `${head}\n${when}\n\n_Ilikuwa ${money(previousAmount)} — ${direction}. Nimeihifadhi ya zamani — kodi ya mwaka jana bado inajulikana._`
    : `${head}\n${when}\n\n_It was ${money(previousAmount)} — ${direction}. The old figure is kept — last year's rent is still answerable._`;
}

/**
 * The reminder, five days out and again on the day.
 *
 * MEASURED nothing here — this is a judgement, and it is the owner's: a
 * shopkeeper who is told a week early forgets, and one told on the day has no
 * time to find the money.
 */
export function obligationReminderReply(one: Obligation, lang: Lang): string {
  const sw = lang === 'sw';
  const name = obligationName(one, lang);
  const owed = one.outstanding > 0 ? one.outstanding : one.amount;
  if (one.daysUntilDue <= 0) {
    return sw
      ? `📅 *${name}* inalipwa *leo* — ${money(owed)}.`
      : `📅 *${name}* is due *today* — ${money(owed)}.`;
  }
  return sw
    ? `📅 *${name}* inalipwa baada ya siku *${one.daysUntilDue}* (${one.nextDueOn}) — ${money(owed)}.`
    : `📅 *${name}* is due in *${one.daysUntilDue}* days (${one.nextDueOn}) — ${money(owed)}.`;
}
