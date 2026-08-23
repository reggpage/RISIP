// Undoing a record that was already confirmed.
//
// MEASURED FAILURE, the owner's own thread: a price change was misread as a
// stock count, the confirmation looked exactly like every other confirmation,
// they answered NDIYO, and four thousand phantom napkins went onto the shelf.
// There was no way to take it back from WhatsApp. The rows had to be deleted by
// somebody with database access — which is not a feature, it is a phone call.
//
// NOTHING IS DELETED HERE. The record is marked voided, with who and when and
// why, and every total stops counting it because every total reads
// status='confirmed'. The history stays readable. That matters more than it
// sounds: a shopkeeper who can make a number disappear without trace has a tool
// for hiding money from themselves.
//
// One confirmation, always. Removing money is as consequential as recording it.

import type { Lang } from './whatsappIntent.ts';
import { correctControlWords } from './whatsappSpelling.ts';

export type VoidTarget = {
  id: string;
  kind: string;
  amount: number;
  partyName: string | null;
  description: string | null;
  occurredAt: string;
  lines: Array<{ description: string; quantity: number }>;
};

export type VoidPending = {
  kind: 'void_record';
  target: VoidTarget;
};

const clean = (s: string | null | undefined) =>
  correctControlWords(String(s ?? '')).toLowerCase()
    .replace(/[^\p{L}\p{N} ]/gu, ' ').replace(/\s+/g, ' ').trim();

/**
 * "Futa ile", "ghairi rekodi ya mwisho", "ondoa mauzo ya mwisho".
 *
 * Deliberately narrow, and deliberately NOT the word "ghairi" on its own —
 * that already cancels a draft that is waiting, and a shopkeeper who types it
 * mid-confirmation means the draft, not the last thing they saved.
 */
export function parseVoidRequest(text: string | null | undefined): boolean {
  const said = clean(text);
  if (!said || said.length > 100) return false;
  const undo = /\b(?:futa|ondoa|batilisha|ghairi|rudisha|undo|delete|remove|cancel|void|reverse)\b/;
  if (!undo.test(said)) return false;
  // It has to be about a RECORD, and about the last one. "Futa daftari" is not
  // a request this can serve — it is ambiguous between the product, the price
  // and the count, and guessing would be the worst possible answer.
  return /\b(?:ya\s+mwisho|iliyopita|ile|hiyo|hii|rekodi|mauzo|manunuzi|matumizi|deni|record|entry|last|previous|that)\b/
    .test(said);
}

const money = (value: number) => `TSh ${Math.round(value).toLocaleString('en-US')}`;

const KIND_LABEL: Record<string, { sw: string; en: string }> = {
  sale: { sw: 'Mauzo', en: 'Sale' },
  expense: { sw: 'Matumizi', en: 'Expense' },
  stock_purchase: { sw: 'Manunuzi', en: 'Purchase' },
  debt_issued: { sw: 'Deni', en: 'Debt' },
  customer_payment: { sw: 'Malipo ya deni', en: 'Debt payment' },
};

function describe(target: VoidTarget, lang: Lang): string {
  const sw = lang === 'sw';
  const label = KIND_LABEL[target.kind] ?? { sw: 'Rekodi', en: 'Record' };
  const when = new Date(target.occurredAt).toLocaleDateString(sw ? 'sw-TZ' : 'en-GB', {
    timeZone: 'Africa/Dar_es_Salaam', day: 'numeric', month: 'short',
  });
  const head = `${sw ? label.sw : label.en} — ${money(target.amount)} · ${when}`;
  const who = target.partyName ? `\n${sw ? 'Mteja' : 'Customer'}: ${target.partyName}` : '';
  const what = target.lines.length > 0
    ? '\n' + target.lines.slice(0, 6)
      .map((line) => `• ${line.description} ${line.quantity}`).join('\n')
    : target.description ? `\n${target.description}` : '';
  return head + who + what;
}

/** Shown before anything changes, naming exactly what is about to go. */
export function voidConfirmation(target: VoidTarget, lang: Lang): string {
  const sw = lang === 'sw';
  return (sw
    ? `Nitaondoa hii kwenye hesabu zako:\n\n${describe(target, lang)}\n\n`
      + 'Haitafutwa kabisa — itabaki kwenye historia ikiwa imefutwa, na haitahesabika tena.\n\nNiondoe? NDIYO / HAPANA'
    : `I will take this out of your figures:\n\n${describe(target, lang)}\n\n`
      + 'It is not deleted — it stays in history marked voided, and stops counting.\n\nRemove it? YES / NO');
}

export function voidDone(target: VoidTarget, lang: Lang): string {
  const sw = lang === 'sw';
  return (sw
    ? `✅ Imeondolewa kwenye hesabu:\n\n${describe(target, lang)}\n\n`
      + 'Kama ilikuwa sahihi, iandike upya.'
    : `✅ Taken out of your figures:\n\n${describe(target, lang)}\n\n`
      + 'If it was right after all, record it again.');
}

export function voidNothingFound(lang: Lang): string {
  return lang === 'sw'
    ? 'Sina rekodi iliyothibitishwa ya kuondoa.'
    : 'I have no confirmed record to remove.';
}

export function voidCancelled(lang: Lang): string {
  return lang === 'sw' ? 'Sawa, sijaondoa chochote.' : 'Fine — nothing was removed.';
}

export function voidNotAllowed(lang: Lang): string {
  return lang === 'sw'
    ? 'Kuondoa rekodi kunafanywa na owner au accountant tu.'
    : 'Only an owner or accountant can remove a record.';
}

/** The shape the RPC returns, checked rather than trusted. */
export function normalizeVoidTarget(data: unknown): VoidTarget | null {
  if (!data || typeof data !== 'object') return null;
  const value = data as Record<string, unknown>;
  const id = typeof value.id === 'string' ? value.id : '';
  const amount = Number(value.amount);
  if (!id || !Number.isFinite(amount)) return null;
  const lines = Array.isArray(value.lines)
    ? value.lines
      .filter((line): line is Record<string, unknown> => Boolean(line) && typeof line === 'object')
      .map((line) => ({
        description: String(line.description ?? '').trim(),
        quantity: Number(line.quantity) || 0,
      }))
      .filter((line) => line.description)
    : [];
  return {
    id,
    kind: String(value.kind ?? 'sale'),
    amount,
    partyName: typeof value.party_name === 'string' ? value.party_name : null,
    description: typeof value.description === 'string' ? value.description : null,
    occurredAt: String(value.occurred_at ?? new Date().toISOString()),
    lines,
  };
}
