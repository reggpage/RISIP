// How OLD a debt is, which Risip could not say at all.
//
// get_open_debts gives a balance: issued, paid, what is left. That is a number
// with no time in it, and a debt with no age is not a debt anybody can chase.
// The shopkeeper's real questions are all about time — "nani amekaa na deni
// muda mrefu zaidi", "Mama Anna alilipa lini mara ya mwisho", "deni hili ni la
// lini" — and none of them had anywhere to land.
//
// Payments are settled against the OLDEST debt first, which is both how a
// shopkeeper thinks about it and the only way "how long has this been owed"
// has an answer. A customer who owes 50,000 across four purchases and pays
// 10,000 has cleared the first one, not a tenth of each.

import type { Lang } from './whatsappIntent.ts';

export type DebtRow = {
  kind: string;
  status: string;
  amount: number;
  partyName?: string | null;
  occurredAt?: string | null;
};

export type DebtEntry = {
  kind: 'debt_issued' | 'customer_payment';
  /** Local calendar date, YYYY-MM-DD. */
  date: string;
  amount: number;
};

export type DebtorHistory = {
  partyName: string;
  issued: number;
  paid: number;
  balance: number;
  /** The date of the oldest debt still unpaid after settling oldest-first. */
  oldestUnpaidDate: string | null;
  oldestUnpaidDays: number | null;
  lastPaymentDate: string | null;
  lastPaymentDays: number | null;
  lastDebtDate: string | null;
  entries: DebtEntry[];
};

const localDate = (iso: string) => new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Africa/Dar_es_Salaam', year: 'numeric', month: '2-digit', day: '2-digit',
}).format(new Date(iso));

/** Whole days between two local calendar dates. */
function daysBetween(from: string, to: string): number {
  const at = (date: string) => {
    const [year, month, day] = date.split('-').map(Number);
    return Date.UTC(year, month - 1, day);
  };
  return Math.max(0, Math.round((at(to) - at(from)) / 86_400_000));
}

export function todayInShop(now = new Date()): string {
  return localDate(new Date(now.getTime()).toISOString());
}

/**
 * Every customer who has ever been given credit, with the age of what is left.
 *
 * Confirmed rows only, all-time: a debt does not stop being owed because a
 * month ended, and an unconfirmed draft is not a debt at all.
 */
export function calculateDebtorHistories(rows: DebtRow[], now = new Date()): DebtorHistory[] {
  const today = todayInShop(now);
  const byParty = new Map<string, { name: string; entries: DebtEntry[] }>();

  for (const row of rows) {
    if (row.status !== 'confirmed') continue;
    if (row.kind !== 'debt_issued' && row.kind !== 'customer_payment') continue;
    const name = String(row.partyName ?? '').trim();
    if (!name || !row.occurredAt) continue;
    const amount = Math.max(0, Number(row.amount) || 0);
    if (amount <= 0) continue;
    const key = name.toLocaleLowerCase('sw-TZ');
    const bucket = byParty.get(key) ?? { name, entries: [] };
    bucket.entries.push({
      kind: row.kind as DebtEntry['kind'],
      date: localDate(row.occurredAt),
      amount,
    });
    byParty.set(key, bucket);
  }

  const histories: DebtorHistory[] = [];
  for (const { name, entries } of byParty.values()) {
    entries.sort((a, b) => a.date.localeCompare(b.date));

    const issued = entries.filter((e) => e.kind === 'debt_issued')
      .reduce((sum, e) => sum + e.amount, 0);
    const paid = entries.filter((e) => e.kind === 'customer_payment')
      .reduce((sum, e) => sum + e.amount, 0);

    // Settle oldest-first. What survives is the debt that has actually been
    // outstanding longest, which is the only thing "how long" can mean.
    const open: Array<{ date: string; left: number }> = [];
    for (const entry of entries) {
      if (entry.kind === 'debt_issued') {
        open.push({ date: entry.date, left: entry.amount });
        continue;
      }
      let toApply = entry.amount;
      for (const debt of open) {
        if (toApply <= 0) break;
        const taken = Math.min(debt.left, toApply);
        debt.left -= taken;
        toApply -= taken;
      }
    }
    const oldest = open.find((debt) => debt.left > 0.005) ?? null;

    const payments = entries.filter((e) => e.kind === 'customer_payment');
    const debts = entries.filter((e) => e.kind === 'debt_issued');
    const lastPayment = payments.length > 0 ? payments[payments.length - 1].date : null;
    const lastDebt = debts.length > 0 ? debts[debts.length - 1].date : null;

    histories.push({
      partyName: name,
      issued: Math.round(issued * 100) / 100,
      paid: Math.round(paid * 100) / 100,
      balance: Math.round((issued - paid) * 100) / 100,
      oldestUnpaidDate: oldest?.date ?? null,
      oldestUnpaidDays: oldest ? daysBetween(oldest.date, today) : null,
      lastPaymentDate: lastPayment,
      lastPaymentDays: lastPayment ? daysBetween(lastPayment, today) : null,
      lastDebtDate: lastDebt,
      entries,
    });
  }

  // Oldest debt first: that is the order a shopkeeper wants to make calls in.
  return histories.sort((a, b) => {
    if (a.balance <= 0 && b.balance > 0) return 1;
    if (b.balance <= 0 && a.balance > 0) return -1;
    return (b.oldestUnpaidDays ?? -1) - (a.oldestUnpaidDays ?? -1)
      || b.balance - a.balance;
  });
}

const money = (value: number) => `TSh ${Math.round(value).toLocaleString('en-US')}`;

/** Evidence for the model: no prose, no rendered money, no opinion. */
export function debtorAgeingFacts(histories: DebtorHistory[]): string {
  const owing = histories.filter((one) => one.balance > 0);
  const rows = [
    `open_debtors=${owing.length}`,
    `total_owed=${Math.round(owing.reduce((sum, one) => sum + one.balance, 0))}`,
    `today=${todayInShop()}`,
  ];
  for (const one of owing) {
    rows.push(`debtor=${one.partyName}|balance=${Math.round(one.balance)}`
      + `|oldest_unpaid=${one.oldestUnpaidDate ?? 'unknown'}`
      + `|days_outstanding=${one.oldestUnpaidDays ?? 'unknown'}`
      + `|last_payment=${one.lastPaymentDate ?? 'never'}`
      + `|days_since_payment=${one.lastPaymentDays ?? 'never'}`
      + `|total_issued=${Math.round(one.issued)}|total_paid=${Math.round(one.paid)}`);
  }
  const settled = histories.filter((one) => one.balance <= 0);
  if (settled.length > 0) rows.push(`settled_customers=${settled.length}`);
  return rows.join('\n');
}

export function debtorHistoryFacts(one: DebtorHistory): string {
  const rows = [
    `debtor=${one.partyName}`,
    `balance=${Math.round(one.balance)}`,
    `total_issued=${Math.round(one.issued)}`,
    `total_paid=${Math.round(one.paid)}`,
    `oldest_unpaid=${one.oldestUnpaidDate ?? 'none'}`,
    `days_outstanding=${one.oldestUnpaidDays ?? 'none'}`,
    `last_payment=${one.lastPaymentDate ?? 'never'}`,
    `days_since_payment=${one.lastPaymentDays ?? 'never'}`,
    `today=${todayInShop()}`,
  ];
  for (const entry of one.entries) {
    rows.push(`${entry.kind === 'debt_issued' ? 'took' : 'paid'}=${entry.date}|${Math.round(entry.amount)}`);
  }
  return rows.join('\n');
}

/**
 * The rendered fallback, for when the model cannot answer at all.
 *
 * Ordered by age rather than by size on purpose. The biggest debt is usually
 * the best customer; the oldest one is the problem.
 */
export function debtorAgeingReply(histories: DebtorHistory[], lang: Lang): string {
  const sw = lang === 'sw';
  const owing = histories.filter((one) => one.balance > 0);
  if (owing.length === 0) {
    return sw ? 'Hakuna mtu anayekudai kwa sasa.' : 'Nobody owes the shop anything right now.';
  }
  const total = owing.reduce((sum, one) => sum + one.balance, 0);
  const out = [
    sw ? `*Madeni kwa umri* — jumla ${money(total)}` : `*Debts by age* — ${money(total)} total`,
    '',
  ];
  for (const one of owing) {
    const age = one.oldestUnpaidDays === null
      ? (sw ? 'umri haujulikani' : 'age unknown')
      : (sw ? `siku ${one.oldestUnpaidDays}` : `${one.oldestUnpaidDays} days`);
    const paid = one.lastPaymentDate === null
      ? (sw ? 'hajawahi kulipa' : 'never paid')
      : (sw ? `alilipa mwisho siku ${one.lastPaymentDays} zilizopita` : `last paid ${one.lastPaymentDays} days ago`);
    out.push(`*${one.partyName}* — ${money(one.balance)} · ${age} · ${paid}`);
  }
  return out.join('\n');
}

export function debtorHistoryReply(
  one: DebtorHistory | null,
  asked: string,
  lang: Lang,
): string {
  const sw = lang === 'sw';
  if (!one) {
    return sw ? `Sina rekodi ya deni la ${asked}.` : `I have no debt records for ${asked}.`;
  }
  const out = [
    sw ? `*${one.partyName}*` : `*${one.partyName}*`,
    one.balance > 0
      ? (sw ? `Anadaiwa *${money(one.balance)}*` : `Owes *${money(one.balance)}*`)
      : (sw ? 'Hana deni lililo wazi.' : 'Has no open balance.'),
  ];
  if (one.balance > 0 && one.oldestUnpaidDays !== null) {
    out.push(sw
      ? `Deni la zamani zaidi ni la ${one.oldestUnpaidDate} — siku ${one.oldestUnpaidDays}.`
      : `The oldest unpaid debt is from ${one.oldestUnpaidDate} — ${one.oldestUnpaidDays} days.`);
  }
  out.push(one.lastPaymentDate
    ? (sw ? `Alilipa mwisho ${one.lastPaymentDate}.` : `Last paid on ${one.lastPaymentDate}.`)
    : (sw ? 'Hajawahi kulipa chochote.' : 'Has never made a payment.'));

  out.push('');
  out.push(sw ? 'Historia:' : 'History:');
  for (const entry of one.entries) {
    const label = entry.kind === 'debt_issued'
      ? (sw ? 'alichukua' : 'took')
      : (sw ? 'alilipa' : 'paid');
    out.push(`${entry.date} · ${label} ${money(entry.amount)}`);
  }
  out.push('');
  out.push(sw
    ? `Jumla alichochukua ${money(one.issued)} · amelipa ${money(one.paid)}`
    : `Total taken ${money(one.issued)} · paid ${money(one.paid)}`);
  return out.join('\n');
}
