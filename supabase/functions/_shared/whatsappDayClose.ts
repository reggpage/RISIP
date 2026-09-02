// Closing the day: the draft, the confirmation, and the owner's list.
//
// The owner's design, and the reason for the shape of it: "ili system ijue mtu
// anafunga duka lazima mtu huyo aseme nafunga au funga hata akitumia lugha ya
// kiingereza". The WORD is understood by Claude, not matched here — this module
// never reads the trader's wording. It is handed facts and turns them into the
// four messages a closing produces.
//
// Every figure comes from the caller, which computes it with the same tested
// helpers the rest of Risip uses. Nothing here derives money.

import type { Lang } from './whatsappIntent.ts';

export type CloseLine = {
  /** What was recorded, as the shop's own catalogue names it. */
  description: string;
  quantity: number;
  lineTotal: number;
  kind: string;
  /** The customer, when this was a credit sale or a repayment. */
  partyName?: string | null;
};

export type CloseWorker = {
  name: string;
  /** 'whatsapp', 'web' — how it reached Risip. */
  source: string;
  /** Local HH:MM of their first record that day. */
  firstAt: string;
  lines: CloseLine[];
};

export type CloseDebtor = { name: string; amount: number };

export type DayCloseFacts = {
  businessName: string;
  /** Local calendar date, YYYY-MM-DD. */
  businessDate: string;
  /** "Ijumaa, 28 Agosti 2026" — already rendered by the caller. */
  dateLabel: string;
  sales: number;
  cogs: number;
  /** Sales minus COGS; this is not net profit. */
  grossProfit?: number;
  /** Expenses recorded for the day, kept separate from COGS. */
  expenses?: number;
  profit: number;
  purchases: number;
  newDebt: number;
  debtPaid: number;
  saleCount: number;
  purchaseCount: number;
  newDebtCount: number;
  debtPaidCount: number;
  recordCount: number;
  workers: CloseWorker[];
  /** New debts raised today, by customer. */
  newDebtors: CloseDebtor[];
  /** Everything owed to the shop right now, all-time. */
  outstandingDebt: number;
  outstandingDebtors: number;
  outOfStock: string[];
  /** True when the profit figure covers only part of the catalogue. */
  profitCoveragePct: number;
  /** Products with a counted shelf quantity at or below the low-stock guard. */
  lowStock?: Array<{ name: string; quantity: number }>;
};

const money = (value: number) => `TSh ${Math.round(value).toLocaleString('en-US')}`;
const qty = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 3 });

/**
 * Nothing recorded is not a day to close.
 *
 * Closing an empty day would write a closure saying the shop sold nothing,
 * queue the owner a report of zeros, and lock the date — all from somebody
 * typing "nafunga" out of habit before they had entered anything.
 */
export function nothingToCloseReply(facts: DayCloseFacts, lang: Lang): string {
  return lang === 'sw'
    ? `Hakuna kilichorekodiwa leo, ${facts.dateLabel}.\n\n`
      + 'Niambie yaliyotokea kwanza — mfano: _"nimeuza birika 3, daftari 5"_ — '
      + 'kisha useme *nafunga*.'
    : `Nothing has been recorded today, ${facts.dateLabel}.\n\n`
      + 'Tell me what happened first — for example _"nimeuza birika 3, daftari 5"_ — '
      + 'then say *nafunga*.';
}

/**
 * What the shop is asked to agree to before the day is closed.
 *
 * Closing a day without showing what is in it is asking somebody to sign a page
 * they have not read. This minute is the only one where the person still
 * remembers what is missing.
 */
export function dayDraftReply(facts: DayCloseFacts, lang: Lang): string {
  const sw = lang === 'sw';
  const lines: string[] = [
    sw ? `🔒 *Kufunga duka — ${facts.dateLabel}*` : `🔒 *Closing the day — ${facts.dateLabel}*`,
    '',
    sw ? 'Umerekodi leo:' : 'Recorded today:',
  ];

  if (facts.saleCount > 0) {
    lines.push(sw
      ? `• Mauzo ${facts.saleCount} — ${money(facts.sales)}`
      : `• Sales ${facts.saleCount} — ${money(facts.sales)}`);
  }
  if (facts.purchaseCount > 0) {
    lines.push(sw
      ? `• Manunuzi ${facts.purchaseCount} — ${money(facts.purchases)}`
      : `• Purchases ${facts.purchaseCount} — ${money(facts.purchases)}`);
  }
  if (facts.newDebtCount > 0) {
    // The debtor is named here, not just counted. "Deni jipya 1" tells nobody
    // who owes it, and that is the whole reason the record exists.
    const who = facts.newDebtors.slice(0, 3).map((debtor) => debtor.name).join(', ');
    lines.push(sw
      ? `• Deni jipya ${facts.newDebtCount} — ${money(facts.newDebt)}${who ? ` (${who})` : ''}`
      : `• New credit ${facts.newDebtCount} — ${money(facts.newDebt)}${who ? ` (${who})` : ''}`);
  }
  if (facts.debtPaidCount > 0) {
    lines.push(sw
      ? `• Malipo ya deni ${facts.debtPaidCount} — ${money(facts.debtPaid)}`
      : `• Debt repayments ${facts.debtPaidCount} — ${money(facts.debtPaid)}`);
  }

  lines.push('');
  lines.push(sw ? `Faida ghafi: *${money(facts.grossProfit ?? facts.sales - facts.cogs)}*` : `Gross profit: *${money(facts.grossProfit ?? facts.sales - facts.cogs)}*`);
  if ((facts.expenses ?? 0) > 0) {
    lines.push(sw
      ? `Matumizi yaliyorekodiwa: ${money(facts.expenses ?? 0)}`
      : `Recorded expenses: ${money(facts.expenses ?? 0)}`);
  }
  lines.push(sw
    ? `Faida baada ya matumizi yaliyorekodiwa: *${money(facts.profit)}*`
    : `Profit after recorded expenses: *${money(facts.profit)}*`);
  if (facts.profitCoveragePct > 0 && facts.profitCoveragePct < 80) {
    lines.push(sw
      ? `_Faida inagusa ${facts.profitCoveragePct}% ya mauzo — bidhaa nyingine hazina gharama ya kununua._`
      : `_Profit covers ${facts.profitCoveragePct}% of sales — the rest have no buying cost recorded._`);
  }

  lines.push('');
  lines.push(sw ? 'Kuna kitu hakijaingia? Niambie sasa.' : 'Anything missing? Tell me now.');
  lines.push(sw ? 'Yote yakiwa sawa, jibu *1* Ndiyo.' : 'If it is all correct, reply *1* YesIYO*.');
  return lines.join('\n');
}

/** What the person who closed the day is told. */
export function dayClosedReply(facts: DayCloseFacts, closedAtLabel: string, lang: Lang): string {
  const sw = lang === 'sw';
  const lines: string[] = [
    sw ? '✅ *Siku imefungwa*' : '✅ *Day closed*',
    `${facts.dateLabel} · ${closedAtLabel}`,
    '',
    sw ? `Mauzo: ${money(facts.sales)}` : `Sales: ${money(facts.sales)}`,
    sw ? `Gharama za bidhaa zilizouzwa (COGS): ${money(facts.cogs)}` : `Cost of goods sold (COGS): ${money(facts.cogs)}`,
    sw ? `Faida ghafi: *${money(facts.grossProfit ?? facts.sales - facts.cogs)}*` : `Gross profit: *${money(facts.grossProfit ?? facts.sales - facts.cogs)}*`,
  ];
  if ((facts.expenses ?? 0) > 0) {
    lines.push(sw ? `Matumizi yaliyorekodiwa: ${money(facts.expenses ?? 0)}` : `Recorded expenses: ${money(facts.expenses ?? 0)}`);
    lines.push(sw ? `Faida baada ya matumizi: *${money(facts.profit)}*` : `Profit after expenses: *${money(facts.profit)}*`);
  }

  if (facts.outOfStock.length > 0) {
    lines.push('');
    lines.push(sw
      ? `⚠️ Bidhaa ${facts.outOfStock.length} zimeisha kabisa`
      : `⚠️ ${facts.outOfStock.length} products are out of stock`);
  }
  if (facts.outstandingDebtors > 0) {
    lines.push(sw
      ? `💰 Watu ${facts.outstandingDebtors} wanadaiwa ${money(facts.outstandingDebt)}`
      : `💰 ${facts.outstandingDebtors} people owe ${money(facts.outstandingDebt)}`);
  }
  return lines.join('\n');
}

/**
 * The owner's full list, sent free-form after they ask for it.
 *
 * The template that reaches them first is a knock: fixed text, short values,
 * no room for a list. Their reply opens the 24-hour window, and everything
 * below arrives with no format limit and at no cost.
 *
 * The owner asked for three things here by name: the totals, the profit, and
 * the debtor's name against the line they were written on.
 */
export function ownerDayListReply(facts: DayCloseFacts, lang: Lang): string {
  const sw = lang === 'sw';
  const out: string[] = [
    sw ? '*Muhtasiri wa leo*' : '*Today’s summary*',
    sw ? 'Hii ni taarifa ya leo katika biashara yako.' : 'This is today’s report for your business.',
    '',
    '━━━━━━━━━━━━━━━━━━',
    sw ? `🏪 *Biashara:* ${facts.businessName}` : `🏪 *Business:* ${facts.businessName}`,
    sw ? `📅 *Tarehe:* ${facts.dateLabel}` : `📅 *Date:* ${facts.dateLabel}`,
    '━━━━━━━━━━━━━━━━━━',
  ];

  for (const worker of facts.workers) {
    out.push('');
    out.push(`*${worker.name}* · ${worker.firstAt}`);
    for (const line of worker.lines) {
      const tail = line.partyName ? ` — *${line.partyName}*` : '';
      const label = kindSuffix(line.kind, lang);
      out.push(`• ${line.description} × ${qty(line.quantity)}${tail}`
        + `${label} — ${money(line.lineTotal)}`);
    }
  }

  out.push('');
  out.push('━━━━━━━━━━━━━━');
  out.push(sw ? '*JUMLA YA SIKU*' : '*DAY TOTAL*');
  out.push(sw ? `Mauzo: ${money(facts.sales)}` : `Sales: ${money(facts.sales)}`);
  out.push(sw ? `Gharama za bidhaa zilizouzwa (COGS): ${money(facts.cogs)}` : `Cost of goods sold (COGS): ${money(facts.cogs)}`);
  out.push(sw ? `*Faida ghafi: ${money(facts.grossProfit ?? facts.sales - facts.cogs)}*` : `*Gross profit: ${money(facts.grossProfit ?? facts.sales - facts.cogs)}*`);
  if ((facts.expenses ?? 0) > 0) {
    out.push(sw ? `Matumizi yaliyorekodiwa: ${money(facts.expenses ?? 0)}` : `Recorded expenses: ${money(facts.expenses ?? 0)}`);
    out.push(sw ? `*Faida baada ya matumizi: ${money(facts.profit)}*` : `*Profit after expenses: ${money(facts.profit)}*`);
  }

  if (facts.purchases > 0) {
    out.push('');
    out.push(sw ? `Manunuzi: ${money(facts.purchases)}` : `Purchases: ${money(facts.purchases)}`);
  }
  if (facts.newDebtors.length > 0) {
    out.push(sw ? `Madeni mapya: ${money(facts.newDebt)}` : `New credit: ${money(facts.newDebt)}`);
    for (const debtor of facts.newDebtors) {
      out.push(`• *${debtor.name}* — ${money(debtor.amount)}`);
    }
  }

  if (facts.outOfStock.length > 0 || (facts.lowStock?.length ?? 0) > 0) {
    out.push('', sw ? '*⚠️ Bidhaa za kuangalia*' : '*⚠️ Stock to watch*');
    for (const name of facts.outOfStock) out.push(sw ? `• *${name}* — imeisha` : `• *${name}* — out of stock`);
    for (const item of facts.lowStock ?? []) {
      out.push(sw ? `• *${item.name}* — inakaribia kuisha (${qty(item.quantity)})` : `• *${item.name}* — running low (${qty(item.quantity)})`);
    }
  }

  out.push('', sw ? '*🤖 Uchambuzi wa siku*' : '*🤖 Day analysis*');
  out.push(facts.profit > 0
    ? (sw ? '• Biashara imefanya faida baada ya gharama na matumizi yaliyorekodiwa.' : '• The business made a profit after recorded costs and expenses.')
    : facts.profit < 0
      ? (sw ? '• Siku imefungwa kwa hasara; kagua gharama na matumizi.' : '• The day ended at a loss; review costs and expenses.')
      : (sw ? '• Mauzo na gharama vimekaribiana; endelea kufuatilia margin.' : '• Sales and costs were close; keep watching margins.'));

  out.push('');
  out.push(sw
    ? `Miamala ${facts.recordCount} · watu ${facts.workers.length}`
    : `${facts.recordCount} records · ${facts.workers.length} people`);
  return out.join('\n');
}

function kindSuffix(kind: string, lang: Lang): string {
  const sw = lang === 'sw';
  switch (kind) {
    case 'stock_purchase': return sw ? ' (manunuzi)' : ' (purchase)';
    case 'debt_issued': return sw ? ' (deni)' : ' (credit)';
    case 'customer_payment': return sw ? ' (malipo ya deni)' : ' (repayment)';
    case 'expense': return sw ? ' (matumizi)' : ' (expense)';
    case 'owner_use': return sw ? ' (matumizi ya nyumbani)' : ' (owner use)';
    case 'spoilage': return sw ? ' (hasara)' : ' (spoilage)';
    default: return '';
  }
}

/**
 * The hint that one message can carry the whole till roll.
 *
 * MEASURED, and it is the largest cost lever Risip has: the cached prefix is
 * paid per MESSAGE, not per item, so twenty items in one message cost 9.6x less
 * than twenty messages. The shopkeeper has no way to know that, so Risip says
 * it — once a day, when the pattern is already visible, and never again that
 * day. A hint that arrives every time is one people stop reading.
 */
export function batchHintReply(
  soFarToday: number,
  remaining: number | null,
  monthlyLimit: number | null,
  lang: Lang,
): string {
  const sw = lang === 'sw';
  const head = sw
    ? `💡 Umetuma mauzo *${soFarToday}* kimoja kimoja leo.\nUnaweza kutuma yote kwa mara moja:`
    : `💡 You have sent *${soFarToday}* sales one at a time today.\nYou can send them all at once:`;
  const example = sw
    ? '\n\n_"nimeuza sodaa 3, birika 2, daftari 5"_'
    : '\n\n_"nimeuza sodaa 3, birika 2, daftari 5"_';
  if (remaining === null || monthlyLimit === null) return head + example;
  return `${head}${example}\n\n`
    + (sw
      ? `Umebakiwa na ujumbe *${remaining}* kati ya ${monthlyLimit} mwezi huu.`
      : `You have *${remaining}* of ${monthlyLimit} messages left this month.`);
}

/**
 * The evening reminder, for somebody who has not closed.
 *
 * Two versions, and the difference is not tone — it is whether Risip is allowed
 * to write freely at all. Somebody who recorded anything today has an open
 * 24-hour window, so this goes as an ordinary reply: free, and as long as it
 * needs to be. Somebody who recorded NOTHING has no window, and their reminder
 * must be a template — which is the one that has to be created, and the one
 * that matters most, because a shopkeeper who wrote nothing down is exactly the
 * shopkeeper losing money.
 */
export function closeReminderReply(
  name: string | null,
  recordedToday: number,
  lang: Lang,
): string {
  const sw = lang === 'sw';
  const greet = name ? (sw ? `Habari za jioni ${name}.` : `Good evening ${name}.`) : (sw ? 'Habari za jioni.' : 'Good evening.');
  return sw
    ? `🌙 ${greet}\n\n`
      + `Umerekodi miamala ${recordedToday} leo lakini hujafunga siku.\n\n`
      + 'Jibu *NAFUNGA* nikuonyeshe kila kitu, au niambie kilichobaki.'
    : `🌙 ${greet}\n\n`
      + `You recorded ${recordedToday} entries today but have not closed the day.\n\n`
      + 'Reply *NAFUNGA* and I will show you everything, or tell me what is left.';
}

/** One trading day, reduced to what a shopkeeper compares days by. */
export type DayFigures = {
  /** Local calendar date, YYYY-MM-DD. */
  date: string;
  /** "Ijumaa 28" — short, because these come in lists of thirty. */
  label: string;
  sales: number;
  profit: number;
  recordCount: number;
  /** True when no product sold that day had a buying cost recorded. */
  profitUnknown: boolean;
};

/**
 * WHICH DAY, which Risip could not answer at all until now.
 *
 * MEASURED, and the owner found it twice in one morning. He asked "lini
 * biashara ilifanya vizuri" and then "niambie siku gani biashara ilifanya
 * vizuri" — when did the business do well, which DAY did it do well. Risip has
 * period totals and a this-period-against-last comparison, and nothing in
 * between, so the honest answer was "I don't have a day-by-day breakdown" and
 * the dishonest one was today's summary, all zeros.
 *
 * A total hides the shape. Two shops with the same month can be a steady one
 * and a shop that made everything on four market days, and only one of those
 * should be buying stock on a Tuesday.
 */
export function dailyBreakdownReply(
  days: DayFigures[],
  periodLabel: string,
  lang: Lang,
): string {
  const sw = lang === 'sw';
  const traded = days.filter((day) => day.recordCount > 0);
  if (traded.length === 0) {
    return sw
      ? `Hakuna mauzo yaliyorekodiwa ${periodLabel}.`
      : `No sales were recorded ${periodLabel}.`;
  }

  const best = traded.reduce((top, day) => (day.sales > top.sales ? day : top), traded[0]);
  const worst = traded.reduce((low, day) => (day.sales < low.sales ? day : low), traded[0]);
  const totalSales = traded.reduce((sum, day) => sum + day.sales, 0);
  const totalProfit = traded.reduce((sum, day) => sum + day.profit, 0);
  const average = totalSales / traded.length;

  const out: string[] = [
    sw ? `*Siku kwa siku — ${periodLabel}*` : `*Day by day — ${periodLabel}*`,
    '',
  ];
  for (const day of traded) {
    // The best day is marked rather than described, so a list of thirty stays
    // readable on a phone.
    const mark = day.date === best.date ? ' 🏆' : '';
    const profit = day.profitUnknown
      ? (sw ? 'faida haijulikani' : 'profit unknown')
      : `${sw ? 'faida' : 'profit'} ${money(day.profit)}`;
    out.push(`${day.label}: ${money(day.sales)} · ${profit}${mark}`);
  }

  out.push('');
  out.push(sw
    ? `*Siku bora:* ${best.label} — ${money(best.sales)}`
    : `*Best day:* ${best.label} — ${money(best.sales)}`);
  if (traded.length > 2 && worst.date !== best.date) {
    out.push(sw
      ? `*Siku dhaifu:* ${worst.label} — ${money(worst.sales)}`
      : `*Weakest day:* ${worst.label} — ${money(worst.sales)}`);
  }
  out.push(sw
    ? `Wastani kwa siku ya biashara: ${money(average)} (siku ${traded.length})`
    : `Average trading day: ${money(average)} (${traded.length} days)`);
  out.push(sw
    ? `Jumla: ${money(totalSales)} · faida ${money(totalProfit)}`
    : `Total: ${money(totalSales)} · profit ${money(totalProfit)}`);

  const quiet = days.length - traded.length;
  if (quiet > 0) {
    // Days with nothing recorded are not days with no sales, and saying so is
    // the difference between a real pattern and a gap in the bookkeeping.
    out.push('');
    out.push(sw
      ? `_Siku ${quiet} hazina rekodi yoyote — huenda duka lilifungwa, au haikuandikwa._`
      : `_${quiet} days have no records at all — the shop may have been closed, or it was not written down._`);
  }
  return out.join('\n');
}

/**
 * The same days, as evidence rather than as a table.
 *
 * STAGE D, and the test that caught me shipping it the other way. "Onyesha
 * kila siku ya wiki hii" wants thirty rows; "siku gani ilikuwa bora" wants one
 * sentence naming a day. Handing back a rendered table answers the first
 * question whatever was asked, which is the machine-sounding reply the owner
 * objected to in the first place.
 *
 * So the model gets the figures and decides the shape. The table survives as
 * the fallback, for when the model cannot answer at all.
 */
export function dailyBreakdownFacts(days: DayFigures[], periodLabel: string): string {
  const traded = days.filter((day) => day.recordCount > 0);
  const rows = [
    `period=${periodLabel}`,
    `trading_days=${traded.length}`,
    `days_with_no_records=${days.length - traded.length}`,
  ];
  for (const day of days) {
    if (day.recordCount === 0) {
      rows.push(`day=${day.date}|${day.label}|no_records`);
      continue;
    }
    rows.push(`day=${day.date}|${day.label}|sales=${Math.round(day.sales)}`
      + `|profit=${day.profitUnknown ? 'unknown' : Math.round(day.profit)}`
      + `|records=${day.recordCount}`);
  }
  if (traded.length > 0) {
    const best = traded.reduce((top, day) => (day.sales > top.sales ? day : top), traded[0]);
    const worst = traded.reduce((low, day) => (day.sales < low.sales ? day : low), traded[0]);
    const total = traded.reduce((sum, day) => sum + day.sales, 0);
    rows.push(`best_day=${best.date}|${best.label}|${Math.round(best.sales)}`);
    rows.push(`weakest_day=${worst.date}|${worst.label}|${Math.round(worst.sales)}`);
    rows.push(`total_sales=${Math.round(total)}`);
    rows.push(`average_trading_day=${Math.round(total / traded.length)}`);
  }
  return rows.join('\n');
}

/**
 * The SHAPE of the line, which the model could not see.
 *
 * The owner asked whether Risip understands the trend, and the honest answer
 * was: it sees the day figures and nothing else. It could name the best day
 * because that is a maximum, but not "sales have fallen three weeks running"
 * or "Sunday is your day" — those are properties of the SEQUENCE, and nobody
 * had computed them.
 *
 * All of it is arithmetic over figures the ledger already holds. Nothing here
 * predicts: a run of three falls is a fact about the past, and saying what
 * comes next remains something Risip refuses to do.
 */
export function trendShapeFacts(days: DayFigures[]): string {
  const traded = days.filter((day) => day.recordCount > 0);
  if (traded.length < 2) return 'trend=too_few_trading_days';

  const rows: string[] = [];

  // How the last stretch has moved, one step at a time.
  let rising = 0;
  let falling = 0;
  for (let at = traded.length - 1; at > 0; at -= 1) {
    const step = traded[at].sales - traded[at - 1].sales;
    if (step > 0 && falling === 0) rising += 1;
    else if (step < 0 && rising === 0) falling += 1;
    else break;
  }
  if (rising > 0) rows.push(`consecutive_rises=${rising}`);
  if (falling > 0) rows.push(`consecutive_falls=${falling}`);

  // The two halves of the period against each other. A direction that survives
  // being split in half is a direction; one that does not is noise.
  const half = Math.floor(traded.length / 2);
  const early = traded.slice(0, half);
  const late = traded.slice(traded.length - half);
  const mean = (list: DayFigures[]) =>
    list.reduce((sum, day) => sum + day.sales, 0) / Math.max(1, list.length);
  const earlyMean = mean(early);
  const lateMean = mean(late);
  rows.push(`first_half_average=${Math.round(earlyMean)}`);
  rows.push(`second_half_average=${Math.round(lateMean)}`);
  if (earlyMean > 0) {
    rows.push(`half_over_half_change_pct=${Math.round(((lateMean - earlyMean) / earlyMean) * 100)}`);
  }

  // Which weekday actually earns. Only said when there is more than one week
  // of it, because one good Sunday is a Sunday, not a pattern.
  const byWeekday = new Map<number, { total: number; days: number }>();
  for (const day of traded) {
    const [year, month, date] = day.date.split('-').map(Number);
    const weekday = new Date(Date.UTC(year, month - 1, date)).getUTCDay();
    const seen = byWeekday.get(weekday) ?? { total: 0, days: 0 };
    seen.total += day.sales;
    seen.days += 1;
    byWeekday.set(weekday, seen);
  }
  const repeated = [...byWeekday.entries()].filter(([, seen]) => seen.days >= 2);
  if (repeated.length >= 2) {
    const ranked = repeated
      .map(([weekday, seen]) => ({ weekday, average: seen.total / seen.days, days: seen.days }))
      .sort((a, b) => b.average - a.average);
    const names = ['Jumapili', 'Jumatatu', 'Jumanne', 'Jumatano', 'Alhamisi', 'Ijumaa', 'Jumamosi'];
    rows.push(`best_weekday=${names[ranked[0].weekday]}|${Math.round(ranked[0].average)}|weeks=${ranked[0].days}`);
    rows.push(`weakest_weekday=${names[ranked[ranked.length - 1].weekday]}`
      + `|${Math.round(ranked[ranked.length - 1].average)}|weeks=${ranked[ranked.length - 1].days}`);
  }

  // How lumpy the period is. One enormous day inside a flat month is a
  // different business from a steady one, and the average hides it entirely.
  const values = traded.map((day) => day.sales).sort((a, b) => a - b);
  const middle = values.length % 2 === 1
    ? values[(values.length - 1) / 2]
    : (values[values.length / 2 - 1] + values[values.length / 2]) / 2;
  const total = traded.reduce((sum, day) => sum + day.sales, 0);
  rows.push(`median_trading_day=${Math.round(middle)}`);
  if (total > 0) {
    const best = Math.max(...traded.map((day) => day.sales));
    rows.push(`best_day_share_of_total_pct=${Math.round((best / total) * 100)}`);
  }
  return rows.join('\n');
}
