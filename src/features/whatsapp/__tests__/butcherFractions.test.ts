import { describe, expect, it } from 'vitest';
import { parseDailyRecord } from '../../../../supabase/functions/_shared/whatsappDailyRecords';
import { parsePortionSetupOffer } from '../../../../supabase/functions/_shared/whatsappPortions';

// MEASURED FAILURE, on a butcher's most ordinary sentence:
//
//   "nimeuza nyama nusu kilo kwa 12000"  -> TSh 12,000 recorded, NO product line
//   "nimeuza nyama robo kwa 6000"        -> TSh  6,000 recorded, NO product line
//
// The money went in and the meat never left the shelf. A shop cannot be robbed
// of something its own records say it never sold, so every fraction sale was
// invisible to the very count meant to catch theft.
//
// The shop's rule, in the owner's words: "nusu ni nusu kilo" — a fraction is a
// fraction of the product's own measure.

const line = (said: string) => {
  const reading = parseDailyRecord(said, 'sw');
  expect(reading.kind, said).toBe('parsed');
  if (reading.kind !== 'parsed') throw new Error('unreachable');
  return reading.record;
};

describe('a butcher selling by the fraction', () => {
  it('takes half a kilo off the shelf', () => {
    const record = line('nimeuza nyama nusu kilo kwa 12000');
    expect(record.amount).toBe(12000);
    expect(record.lines).toEqual([
      { description: 'nyama', quantity: 0.5, unit_amount: 24000, unit: 'kilo' },
    ]);
  });

  it('reads three quarters written as nusu na robo', () => {
    // "na" is also the list separator, so this must resolve before the message
    // is split into two different goods.
    expect(line('nimeuza nyama nusu na robo kilo kwa 18000').lines).toEqual([
      { description: 'nyama', quantity: 0.75, unit_amount: 24000, unit: 'kilo' },
    ]);
  });

  it('records a bare fraction as one of that measure', () => {
    expect(line('nimeuza nyama robo kwa 6000').lines).toEqual([
      { description: 'nyama', quantity: 1, unit_amount: 6000, unit: 'robo' },
    ]);
  });

  it('keeps the shapes that already worked', () => {
    expect(line('nimeuza nyama robo 2 kwa 12000').lines[0].quantity).toBe(2);
    expect(line('nimeuza nyama kilo moja na nusu kwa 30000').lines[0].quantity).toBe(1.5);
    expect(line('nimeuza nyama kilo 2 kwa 40000').lines[0].quantity).toBe(2);
  });
});

describe('the oil shop, whose measures are called robo and nusu', () => {
  // For a shop selling cooking oil by the scoop these words are the NAMES of
  // its portions, with prices of their own. Resolving them to 0.25 and 0.5
  // would wreck every sale it makes, so a fraction only resolves when a real
  // measure follows it.
  it('still reads a whole portion price list', () => {
    const setup = parsePortionSetupOffer('mafuta ndoo @20000 nauza robo 700 nusu 1200 lita 3000');
    expect(setup).not.toBeNull();
    expect(setup?.saleUnits.map((unit) => unit.unit)).toEqual(['robo', 'nusu', 'lita']);
    expect(setup?.saleUnits.map((unit) => unit.retail)).toEqual([700, 1200, 3000]);
  });

  it('leaves a counted portion exactly as written', () => {
    expect(line('nimeuza mafuta robo 3 kwa 2100').lines).toEqual([
      { description: 'mafuta', quantity: 3, unit_amount: 700, unit: 'robo' },
    ]);
  });
});
