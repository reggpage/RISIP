// What a statement SAYS, decided apart from how it is drawn.
//
// The pdf-lib half of this is layout: fonts, coordinates, page breaks. None of
// that can be wrong in a way that costs anybody money. The half below can: a
// total that counts a voided record, or a row filed on the wrong day because
// the clock was read in UTC, is a figure the shopkeeper will act on and the
// dashboard will contradict.
//
// So the arithmetic lives here, where a test can hold it to account, and the
// function only draws what this returns.

import { pdfClip, pdfSafe } from './pdfText.ts';

export type StatementRecord = {
  kind: string;
  status: string;
  amount: number;
  party_name: string | null;
  description: string | null;
  occurred_at: string;
};

export type StatementRow = {
  day: string;
  kind: string;
  detail: string;
  amount: number;
  /** False for pending and voided rows, which are shown but never counted. */
  counted: boolean;
  /** The word printed under a row that is not counted, or null. */
  note: string | null;
};

export type StatementTotal = { kind: string; count: number; amount: number };

export type Statement = {
  rows: StatementRow[];
  totals: StatementTotal[];
  /** Rows shown but left out of the totals. */
  excluded: number;
};

/**
 * How many characters of detail fit before the amount column.
 *
 * The column runs from x=230 to x=555, which is 325pt; at 9pt Helvetica a
 * character averages under 5pt, so 46 sits well inside the width even for
 * all-capitals. Text running under the amount is a statement nobody can read,
 * so the margin is deliberate.
 */
export const DETAIL_CHARS = 46;

export const KIND_LABELS: Record<'sw' | 'en', Record<string, string>> = {
  sw: {
    sale: 'Mauzo', expense: 'Matumizi', stock_purchase: 'Ununuzi wa bidhaa',
    debt_issued: 'Mkopo uliotolewa', customer_payment: 'Malipo ya mteja',
    stock_loss: 'Upotevu', owner_use: 'Zimechukuliwa', supplier_payable: 'Deni la muuzaji',
    supplier_payment: 'Malipo kwa muuzaji', whole_animal_procurement: 'Ununuzi wa mnyama',
    whole_animal_breakdown: 'Mgawanyo wa mnyama',
  },
  en: {
    sale: 'Sale', expense: 'Expense', stock_purchase: 'Stock purchase',
    debt_issued: 'Debt issued', customer_payment: 'Customer payment',
    stock_loss: 'Stock loss', owner_use: 'Owner use', supplier_payable: 'Owed to supplier',
    supplier_payment: 'Paid to supplier', whole_animal_procurement: 'Animal purchase',
    whole_animal_breakdown: 'Animal breakdown',
  },
};

/**
 * The day a record belongs to, in East Africa time.
 *
 * A sale rung up at half past nine on a Tuesday evening is 18:30 UTC and still
 * Tuesday; one rung up at midnight is 21:00 UTC on MONDAY. Reading these in UTC
 * moves a shop's late trade onto the wrong day and makes every daily figure
 * disagree with what the shopkeeper remembers.
 */
export function statementDay(iso: string): string {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  return new Intl.DateTimeFormat('en-CA', {
    year: 'numeric', month: '2-digit', day: '2-digit', timeZone: 'Africa/Dar_es_Salaam',
  }).format(at);
}

export function buildStatement(records: StatementRecord[], lang: 'sw' | 'en'): Statement {
  const labels = KIND_LABELS[lang];
  const totals = new Map<string, StatementTotal>();
  let excluded = 0;

  const rows: StatementRow[] = records.map((record) => {
    const counted = record.status === 'confirmed';
    if (!counted) excluded += 1;

    // ONLY CONFIRMED MONEY IS TOTALLED. A pending draft has not moved and a
    // voided record has un-moved; either one inside a total produces a figure
    // the dashboard denies and the shopkeeper cannot reconcile.
    if (counted) {
      const at = totals.get(record.kind) ?? { kind: record.kind, count: 0, amount: 0 };
      at.count += 1;
      const amount = Number(record.amount);
      at.amount += Number.isFinite(amount) ? amount : 0;
      totals.set(record.kind, at);
    }

    const detail = [record.party_name, record.description]
      .map((part) => pdfSafe(part).trim())
      .filter(Boolean)
      .join(' - ');

    const note = counted ? null : (lang === 'sw'
      ? (record.status === 'voided' ? 'imeghairiwa' : 'inasubiri')
      : (record.status === 'voided' ? 'voided' : 'pending'));

    return {
      day: statementDay(record.occurred_at),
      kind: pdfClip(labels[record.kind] ?? record.kind, 20),
      // The note goes INSIDE the detail, not beside it. Drawn as its own piece
      // of text it landed on the same baseline and printed over the words.
      detail: pdfClip(note ? `(${note}) ${detail}` : detail, DETAIL_CHARS),
      amount: Number.isFinite(Number(record.amount)) ? Number(record.amount) : 0,
      counted,
      note,
    };
  });

  return {
    rows,
    // Biggest first: a shopkeeper reads the top of a totals block and stops.
    totals: [...totals.values()].sort((a, b) => b.amount - a.amount),
    excluded,
  };
}
