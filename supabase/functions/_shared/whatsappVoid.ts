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
import { UNITS } from './whatsappStock.ts';

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

// ------------------------------------------------- goods sold by a measure

/**
 * Unga, sukari, mafuta, viazi — things a shop weighs or pours rather than
 * counts, arriving before anybody has said how they are measured.
 *
 * The owner's own words: "kama mtu akiandika bidhaa za kupima kama unga, chips,
 * au mafuta na store yake hakuna usajili wa hizi bidhaa, mwambie kwanza."
 *
 * A sack is not a kilo and a kilo is not a piece. Recording "nimeuza unga 3"
 * against a product nobody has measured means three of something, and three of
 * something is not a number anybody can use later. Better to stop once and ask
 * than to record a unit that will be wrong in every report after it.
 *
 * This list is deliberately of GOODS, not of units: the message that needs
 * catching is the one with no unit in it at all.
 */
const MEASURED_GOODS = [
  'unga', 'sukari', 'mchele', 'maharage', 'mahindi', 'ulezi', 'dengu', 'choroko',
  'mafuta', 'maziwa', 'asali', 'siki', 'mafuta ya kula', 'mafuta ya taa',
  'viazi', 'nyanya', 'vitunguu', 'karoti', 'mboga', 'matunda',
  'nyama', 'samaki', 'kuku', 'dagaa', 'mayai',
  'chumvi', 'mchanga', 'saruji', 'kokoto', 'mkaa', 'chips',
];

export type UnregisteredMeasure = { product: string };

// The one shared list, not a fourth copy. See UNITS in whatsappStock.ts: the
// private copy that used to live here was missing "trei", which is why
// "nimeingiza trei 3 na mayai 15" — a sentence that names its measure in its
// second word — was answered by asking whether "3" meant three kilos of eggs.
const MEASURE_WORDS = new RegExp(`\\b(?:${UNITS})\\b`, 'i');

/**
 * Is this a measured good, named with no measure and no registration?
 *
 * `known` is the shop's own catalogue: a product it already sells has been
 * measured once and never needs asking again.
 */
export function findUnregisteredMeasure(
  text: string | null | undefined,
  known: string[],
): UnregisteredMeasure | null {
  const said = clean(text);
  if (!said) return null;
  // A measure was named, so nothing is missing.
  if (MEASURE_WORDS.test(said)) return null;
  const catalogue = new Set(known.map((name) => clean(name)));
  for (const good of MEASURED_GOODS) {
    if (!new RegExp(`\\b${good}\\b`).test(said)) continue;
    // Already in the catalogue — it has been dealt with before.
    if ([...catalogue].some((name) => name === good || name.startsWith(`${good} `))) continue;
    return { product: good };
  }
  return null;
}

/**
 * Asked once, and it explains what to send back rather than just refusing.
 *
 * MEASURED FAILURE: this used to print the SAME three examples for every
 * product on the list — "Mayai nauza kwa kilo", "Mayai nauza kwa gunia, gunia
 * moja ni kilo 100". Nobody in Tanzania sells eggs by the kilo or by the sack,
 * and being handed two impossible suggestions and one usable one reads as a
 * machine that does not know what an egg is. Suggesting a measure at all was
 * the mistake: the shop is the authority on how it measures its own goods, and
 * an example that is wrong for the product costs more trust than no example.
 *
 * So the shape of the answer is shown WITHOUT asserting a unit, and the
 * trader's own words fill the gap. One example, using their own product name,
 * with the measure left as the thing being asked for.
 */
export function unregisteredMeasureQuestion(product: string, lang: Lang): string {
  const sw = lang === 'sw';
  const name = product.charAt(0).toUpperCase() + product.slice(1);
  if (sw) {
    // "Kipimo chake" rather than an object prefix: Swahili agreement differs
    // by noun class ("unayapima" for mayai, "unaipima" for unga) and getting
    // it wrong on the shop's own product is its own small insult.
    return `Sina rekodi ya *${product}* bado, wala sijui kipimo chake.\n\n`
      + `Niambie kipimo unachotumia na bei yake, mfano:\n`
      + `• ${product} kwa [kipimo chako], bei [shilingi]\n\n`
      + `Kama unanunua kwa wingi, niambie kikubwa kina kiasi gani:\n`
      + `• [kipimo kikubwa] moja ni ${product} [idadi]\n\n`
      + 'Nikishajua, nitarekodi bila kuuliza tena.';
  }
  return `I have no record of *${product}* yet, and I do not know its measure.\n\n`
    + `Tell me the measure you use and its price, for example:\n`
    + `• ${name} by [your measure], price [shillings]\n\n`
    + `If you buy it in bulk, tell me what the big one holds:\n`
    + `• one [big measure] is [how many] ${product}\n\n`
    + 'Once I know, I will record it without asking again.';
}
