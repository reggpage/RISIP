// Recording without waiting.
//
// The owner's design, and his reason in his own words: "nilikuwa nafikiria
// jinsi ya kutatua tatizo la kusubiri kila unaporekodi au gharama pia za ai".
// Today every line costs a whole turn — Haiku reads it, Sonnet writes a
// confirmation, and the shopkeeper waits six seconds at the counter before
// typing the next one.
//
// MEASURED: the written confirmation is 81% of what a record costs. Haiku
// deciding what the message means is $0.0023; Sonnet writing the reply back is
// $0.0097. A tick costs nothing at all — it is a WhatsApp send, not a model
// call.
//
// So a record is acknowledged instantly and CONFIRMED IN A BATCH. Nothing new
// is stored: a draft was already a daily_records row waiting on
// pending_confirmation, and wa_confirm_daily_record_batch already takes an
// array. What changed is how they are shown.
//
// The queue is not silence. Silence is how a shopkeeper finds out at eight in
// the evening that a message never arrived, and a tick is the cheapest promise
// Risip can make.

import type { Lang } from './whatsappIntent.ts';

export type QueuedLine = { description: string; quantity: number; lineTotal: number };

export type QueuedRecord = {
  id: string;
  kind: string;
  amount: number;
  partyName: string | null;
  description: string | null;
  occurredAt: string;
  lines: QueuedLine[];
};

export type RecordQueuePending = {
  kind: 'record_queue';
  ids: string[];
};

const money = (value: number) => `TSh ${Math.round(value).toLocaleString('en-US')}`;
const qty = (value: number) => value.toLocaleString('en-US', { maximumFractionDigits: 3 });

/**
 * The tick, and how many are waiting.
 *
 * Deliberately one line. Anything longer is a confirmation, and a confirmation
 * is the thing this exists to stop writing four times a minute.
 */
export function queueTickReply(waiting: number, ceiling: number, lang: Lang): string {
  return lang === 'sw'
    ? `✓ Nimepokea. (${waiting}/${ceiling})`
    : `✓ Got it. (${waiting}/${ceiling})`;
}

const KIND_GROUP: Record<string, { sw: string; en: string }> = {
  sale: { sw: 'Mauzo', en: 'Sales' },
  debt_issued: { sw: 'Mkopo', en: 'Credit' },
  stock_purchase: { sw: 'Manunuzi', en: 'Purchases' },
  expense: { sw: 'Matumizi', en: 'Expenses' },
  customer_payment: { sw: 'Malipo ya deni', en: 'Debt repayments' },
  supplier_payment: { sw: 'Malipo kwa muuzaji', en: 'Supplier payments' },
  owner_use: { sw: 'Matumizi ya nyumbani', en: 'Owner use' },
  stock_loss: { sw: 'Hasara', en: 'Spoilage' },
};

function groupLabel(kind: string, lang: Lang): string {
  const label = KIND_GROUP[kind];
  if (!label) return lang === 'sw' ? 'Nyingine' : 'Other';
  return lang === 'sw' ? label.sw : label.en;
}

/**
 * Everything waiting, grouped, with one NDIYO under it.
 *
 * Grouped by kind rather than listed in arrival order: a shopkeeper checking a
 * batch is checking their sales against their memory of the counter, and a
 * purchase sitting between two sales breaks that reading.
 */
export function queueFlushReply(records: QueuedRecord[], lang: Lang): string {
  const sw = lang === 'sw';
  if (records.length === 0) {
    return sw ? 'Hakuna kinachosubiri kuthibitishwa.' : 'Nothing is waiting to be confirmed.';
  }

  const out: string[] = [
    sw ? `Nimepokea vitu *${records.length}*:` : `I have *${records.length}* waiting:`,
  ];

  const order = Object.keys(KIND_GROUP);
  const kinds = [...new Set(records.map((record) => record.kind))]
    .sort((a, b) => (order.indexOf(a) + 1 || 99) - (order.indexOf(b) + 1 || 99));

  for (const kind of kinds) {
    out.push('');
    out.push(`*${groupLabel(kind, lang)}*`);
    for (const record of records.filter((entry) => entry.kind === kind)) {
      const who = record.partyName ? ` — *${record.partyName}*` : '';
      if (record.lines.length === 0) {
        // An amount with no product lines still has to be readable, or the
        // total below will not add up for the person checking it.
        const what = record.description?.trim() || groupLabel(kind, lang);
        out.push(`• ${what}${who} — ${money(record.amount)}`);
        continue;
      }
      for (const line of record.lines) {
        out.push(`• ${line.description} × ${qty(line.quantity)}${who} — ${money(line.lineTotal)}`);
      }
    }
  }

  // One total per kind that has money in it, so the person checking has
  // something to compare against the till rather than a list to add up.
  const totalFor = (kind: string) => records
    .filter((record) => record.kind === kind)
    .reduce((sum, record) => sum + record.amount, 0);
  out.push('');
  out.push(kinds
    .map((kind) => `${groupLabel(kind, lang)}: ${money(totalFor(kind))}`)
    .join(' · '));

  out.push('');
  out.push(sw ? 'Jibu *1* Ndiyo nihifadhi zote.' : 'Reply *1* and I will save them all.');
  return out.join('\n');
}

/** What the shop is told once the batch is on the books. */
export function queueSavedReply(saved: number, lang: Lang): string {
  return lang === 'sw'
    ? `✅ Nimehifadhi vitu *${saved}*.`
    : `✅ Saved *${saved}* records.`;
}

/** And when they say no: nothing is written, and the drafts are dropped. */
export function queueDiscardedReply(dropped: number, lang: Lang): string {
  return lang === 'sw'
    ? `Sawa, sijahifadhi chochote. Vitu *${dropped}* vimeondolewa.`
    : `Fine, nothing was saved. *${dropped}* drafts have been dropped.`;
}
