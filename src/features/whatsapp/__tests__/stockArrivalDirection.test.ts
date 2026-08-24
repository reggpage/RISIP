import { describe, expect, it } from 'vitest';
import { parseDailyRecordBatch } from '../../../../supabase/functions/_shared/whatsappDailyRecordBatch';
import { validateAiCandidate } from '../../../../supabase/functions/_shared/whatsappDailyRecordsAi';

// MEASURED FAILURE, from a shopkeeper's own screen, 16:18:
//
//   "nimeingiza trei 3 28500 na mayai 15 leo 4500"
//   -> "Aina: MAUZO / Trei: 3 x 28,500 / Mayai: 15 x 4,500 / Jumla: TSh 153,000"
//
// He answered NDIYO. Stock arriving was posted as 153,000 of revenue: profit
// invented, stock never added, the day overstated by the whole amount. The same
// sentence fifteen minutes earlier had been read as a purchase, so it was not
// even consistently wrong.
//
// Two independent holes let it through, and both are closed here.

describe('the deterministic path owns a priced arrival', () => {
  it.each([
    ['nimeingiza trei 3 60000 na mayai 15 leo 15000', 75000],
    ['nimeingiza trei 3 28500 na mayai 15 leo 4500', 33000],
    ['nimeingiza trei 3 kwa 60000 na mayai 15 kwa 15000', 75000],
  ])('reads %s as goods coming in', (said, total) => {
    const parse = parseDailyRecordBatch(said, 'sw');
    expect(parse.kind).toBe('parsed');
    if (parse.kind !== 'parsed') return;
    expect(parse.records).toHaveLength(1);
    expect(parse.records[0].kind).toBe('stock_purchase');
    // Never a sale, whatever else happens.
    expect(parse.records[0].kind).not.toBe('sale');
    expect(parse.records[0].amount).toBe(total);
  });

  // A figure after a count is that item's TOTAL. The two screenshots disagreed
  // with each other about this — 60,000 became 3 x 20,000, but 28,500 became
  // 3 x 28,500 — because a guess was making the call each time.
  it('treats the figure after a count as that item total', () => {
    const parse = parseDailyRecordBatch('nimeingiza trei 3 60000 na mayai 15 leo 15000', 'sw');
    expect(parse.kind).toBe('parsed');
    if (parse.kind !== 'parsed') return;
    expect(parse.records[0].lines).toEqual([
      { description: 'trei', quantity: 3, unit_amount: 20000 },
      { description: 'mayai', quantity: 15, unit_amount: 1000 },
    ]);
  });

  it('still reads a sale list as a sale', () => {
    const parse = parseDailyRecordBatch('nimeuza daftari 5 kwa 7500, kalamu 3 kwa 1500', 'sw');
    expect(parse.kind).toBe('parsed');
    if (parse.kind !== 'parsed') return;
    expect(parse.records[0].kind).toBe('sale');
    expect(parse.records[0].amount).toBe(9000);
  });
});

describe('the model does not get to choose which way the money moved', () => {
  const proposal = {
    kind: 'sale',
    amount: 153000,
    lines: [
      { description: 'Trei', quantity: 3, unit_amount: 28500 },
      { description: 'Mayai', quantity: 15, unit_amount: 4500 },
    ],
  };

  it('overrules a sale the trader called an arrival', () => {
    expect(validateAiCandidate(proposal, 'nimeingiza trei 3 28500 na mayai 15 leo 4500')?.kind)
      .toBe('stock_purchase');
  });

  it('overrules an arrival the trader called a sale', () => {
    expect(validateAiCandidate({ ...proposal, kind: 'stock_purchase' }, 'nimeuza vitu 3 kwa 153000')?.kind)
      .toBe('sale');
  });

  // "nimenunua chakula 5000" is as likely to be lunch as goods for resale. The
  // prompt delegates that call on purpose, so the guard must not seize it.
  it('leaves expense-versus-purchase to the model', () => {
    expect(validateAiCandidate({ kind: 'expense', amount: 5000, lines: [] }, 'nimenunua chakula 5000')?.kind)
      .toBe('expense');
  });

  it('does not invent a direction where the trader stated none', () => {
    expect(validateAiCandidate({ kind: 'sale', amount: 5000, lines: [] }, 'mambo fulani 5000')?.kind)
      .toBe('sale');
  });

  it('keeps validating the arithmetic it always did', () => {
    expect(validateAiCandidate({ kind: 'sale', amount: 999, lines: [{ description: 'x', quantity: 2, unit_amount: 100 }] }, 'nimeuza x 2 kwa 999'))
      .toBeNull();
  });
});
