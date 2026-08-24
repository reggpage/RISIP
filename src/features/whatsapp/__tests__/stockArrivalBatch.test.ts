import { describe, expect, it } from 'vitest';
import { parseDailyRecord } from '../../../../supabase/functions/_shared/whatsappDailyRecords';
import { parseDailyRecordBatch } from '../../../../supabase/functions/_shared/whatsappDailyRecordBatch';

// A chips vendor's real restock, one line per item. Everything here was
// measured against the parsers, not imagined.
const RESTOCK = [
  ['nimenunua viazi gunia 2 kwa 90000', 'viazi', 2, 'gunia', 45000],
  ['nimenunua mayai trei 5 kwa 60000', 'mayai', 5, 'trei', 12000],
  ['nimenunua soseji pakiti 4 kwa 32000', 'soseji', 4, 'pakiti', 8000],
  ['nimenunua kuku kilo 6 kwa 42000', 'kuku', 6, 'kilo', 7000],
  ['nimenunua soda kreti 2 kwa 24000', 'soda', 2, 'kreti', 12000],
  ['nimenunua maji kreti 1 kwa 9000', 'maji', 1, 'kreti', 9000],
  ['nimenunua vitunguu kilo 3 kwa 9000', 'vitunguu', 3, 'kilo', 3000],
  ['nimenunua nyanya tenga 1 kwa 15000', 'nyanya', 1, 'tenga', 15000],
  ['nimenunua chumvi kilo 2 kwa 3000', 'chumvi', 2, 'kilo', 1500],
  ['nimenunua mkaa gunia 1 kwa 45000', 'mkaa', 1, 'gunia', 45000],
  ['nimenunua mifuko pakiti 2 kwa 6000', 'mifuko', 2, 'pakiti', 3000],
] as const;

describe('a priced restock line', () => {
  // MEASURED FAILURE, mine. A guard meant to stop a COUNT being read as money
  // refused any sentence containing a measure followed by a digit — which is
  // every restock line there is. Eggs, cooking oil, soda and water stopped
  // recording entirely.
  it.each(RESTOCK)('reads %s', (said, description, quantity, unit, unitAmount) => {
    const reading = parseDailyRecord(said, 'sw');
    expect(reading.kind).toBe('parsed');
    if (reading.kind !== 'parsed') return;
    expect(reading.record.kind).toBe('stock_purchase');
    expect(reading.record.amount).toBe(quantity * unitAmount);
    // MEASURED FAILURE, the fourth private copy of the measure vocabulary: the
    // shillings were right for all eleven but trei, dumu, kreti and tenga were
    // unknown words here, so four items recorded an amount with NO product.
    expect(reading.record.lines).toEqual([{ description, quantity, unit_amount: unitAmount, unit }]);
  });

  // The sentence this all started from. Quantities, no price anywhere: the
  // final 15 is eggs, not fifteen shillings. It must reach the model instead.
  it.each([
    'nimeingiza trei 3 na mayai 15 leo',
    'Mzigo mpya nimeingiza trei 3 na mayai 15 leo',
  ])('still refuses %s, which states no price', (said) => {
    const reading = parseDailyRecord(said, 'sw');
    expect(reading.kind).toBe('clarify');
    if (reading.kind === 'clarify') expect(reading.reason).toBe('message');
  });
});

describe('a multi-line restock', () => {
  // MEASURED FAILURE: no branch here matched a purchase list, so the batch
  // declined and the single-record parser ran on the whole blob — writing
  // 228,000 of stock as one purchase of 78,000, the last figure on the page.
  it('records every line rather than the last figure', () => {
    const parse = parseDailyRecordBatch([
      'Mzigo wa leo:',
      'nimenunua viazi gunia 2 kwa 90000',
      'nimenunua mayai trei 5 kwa 60000',
      'nimenunua soda kreti 2 kwa 24000',
    ].join('\n'), 'sw');

    expect(parse.kind).toBe('parsed');
    if (parse.kind !== 'parsed') return;
    expect(parse.records).toHaveLength(3);
    expect(parse.records.every((record) => record.kind === 'stock_purchase')).toBe(true);
    expect(parse.records.reduce((sum, record) => sum + record.amount, 0)).toBe(174000);
  });

  it('needs no heading', () => {
    const parse = parseDailyRecordBatch(
      'nimenunua soda kreti 2 kwa 24000\nnimenunua maji kreti 1 kwa 9000', 'sw',
    );
    expect(parse.kind).toBe('parsed');
    if (parse.kind === 'parsed') expect(parse.records).toHaveLength(2);
  });

  // Half a restock is worse than none: the shop would believe the rest arrived.
  it('saves nothing and names the line it could not read', () => {
    const parse = parseDailyRecordBatch(
      'nimenunua viazi gunia 2 kwa 90000\nnimeingiza trei 3 na mayai 15 leo', 'sw',
    );
    expect(parse.kind).toBe('unreadable');
    if (parse.kind !== 'unreadable') return;
    expect(parse.unreadable).toEqual(['nimeingiza trei 3 na mayai 15 leo']);
    expect(parse.message).toContain('Hakuna rekodi iliyohifadhiwa');
  });

  it('leaves a single purchase to the single-record parser', () => {
    expect(parseDailyRecordBatch('nimenunua viazi gunia 2 kwa 90000', 'sw').kind).toBe('none');
  });

  it('leaves the sale-and-expense batch exactly as it was', () => {
    const parse = parseDailyRecordBatch('nimeuza daftari 5 kwa 7500\nmatumizi\numeme 20000', 'sw');
    expect(parse.kind).toBe('parsed');
    if (parse.kind !== 'parsed') return;
    expect(parse.records.map((record) => record.kind)).toEqual(['sale', 'expense']);
  });
});
