import { describe, expect, it } from 'vitest';
import { parseDailyRecordBatch } from '../../../../supabase/functions/_shared/whatsappDailyRecordBatch';

// MEASURED FAILURE, from the shop's own products list:
//
//   "nimeingiza trei 3 60000 na mayai 15 leo 15000"
//   -> products: "Trei" and "Mayai", two separate goods.
//
// A trei is not something a shop sells. It is how the eggs arrived. The
// shopkeeper put it plainly: "trei na mayai si kitu kimoja ... kwani ai
// haelewi hata trei ni kitu gani?"
//
// The segment parser reads <name> <count> <total>, and with nothing before
// "trei" the measure itself became the name.

describe('a measure is not a product', () => {
  it('files the tray against the eggs, keeping the measure as the unit', () => {
    const parse = parseDailyRecordBatch('nimeingiza trei 3 60000 na mayai 15 leo 15000', 'sw');
    expect(parse.kind).toBe('parsed');
    if (parse.kind !== 'parsed') return;
    expect(parse.records[0].lines).toEqual([
      { description: 'mayai', quantity: 3, unit_amount: 20000, unit: 'trei' },
      { description: 'mayai', quantity: 15, unit_amount: 1000 },
    ]);
    // The whole point: no product called "trei" is ever created.
    expect(parse.records[0].lines.map((line) => line.description)).not.toContain('trei');
    expect(parse.records[0].amount).toBe(75000);
  });

  it('works the same for a sack of rice', () => {
    const parse = parseDailyRecordBatch('nimenunua gunia 2 kwa 90000 na mchele 5 kwa 30000', 'sw');
    expect(parse.kind).toBe('parsed');
    if (parse.kind !== 'parsed') return;
    expect(parse.records[0].lines.every((line) => line.description === 'mchele')).toBe(true);
    expect(parse.records[0].lines[0].unit).toBe('gunia');
  });

  // How many eggs fit a tray is the SHOP's declaration, never a constant here.
  // Nothing above needs that number, and nothing above invents it.
  it('asks rather than guessing when no product is named at all', () => {
    const parse = parseDailyRecordBatch('nimeingiza trei 3 kwa 60000 na kreti 2 kwa 24000', 'sw');
    expect(parse.kind).toBe('unreadable');
    if (parse.kind !== 'unreadable') return;
    expect(parse.unreadable).toEqual(['trei', 'kreti']);
    expect(parse.message).toContain('ni kipimo, si bidhaa');
    expect(parse.message).toContain('Hakuna rekodi iliyohifadhiwa');
  });

  it('leaves an ordinary list of real products alone', () => {
    const parse = parseDailyRecordBatch('nimeuza daftari 5 kwa 7500, kalamu 3 kwa 1500', 'sw');
    expect(parse.kind).toBe('parsed');
    if (parse.kind !== 'parsed') return;
    expect(parse.records[0].lines.map((line) => line.description)).toEqual(['daftari', 'kalamu']);
  });
});
