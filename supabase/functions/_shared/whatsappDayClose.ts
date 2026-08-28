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
  lines.push(sw ? `Faida ya leo: *${money(facts.profit)}*` : `Profit today: *${money(facts.profit)}*`);
  if (facts.profitCoveragePct > 0 && facts.profitCoveragePct < 80) {
    lines.push(sw
      ? `_Faida inagusa ${facts.profitCoveragePct}% ya mauzo — bidhaa nyingine hazina gharama ya kununua._`
      : `_Profit covers ${facts.profitCoveragePct}% of sales — the rest have no buying cost recorded._`);
  }

  lines.push('');
  lines.push(sw ? 'Kuna kitu hakijaingia? Niambie sasa.' : 'Anything missing? Tell me now.');
  lines.push(sw ? 'Yote yakiwa sawa, jibu *NDIYO*.' : 'If it is all correct, reply *NDIYO*.');
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
    sw ? `Gharama ya bidhaa: ${money(facts.cogs)}` : `Cost of goods: ${money(facts.cogs)}`,
    sw ? `Faida: *${money(facts.profit)}*` : `Profit: *${money(facts.profit)}*`,
  ];

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
    sw ? `Miamala ya *${facts.dateLabel}*` : `Records for *${facts.dateLabel}*`,
  ];

  for (const worker of facts.workers) {
    out.push('');
    out.push(`*${worker.name}* · ${worker.source} · ${worker.firstAt}`);
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
  out.push(sw ? `Gharama ya bidhaa: ${money(facts.cogs)}` : `Cost of goods: ${money(facts.cogs)}`);
  out.push(sw ? `*Faida: ${money(facts.profit)}*` : `*Profit: ${money(facts.profit)}*`);

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
