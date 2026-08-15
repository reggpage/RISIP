import { describe, expect, it } from 'vitest';
import { parseDailyRecord } from '../../../../supabase/functions/_shared/whatsappDailyRecords';

const sale = (text: string) => {
  const parsed = parseDailyRecord(text);
  return parsed?.kind === 'parsed' ? parsed.record : null;
};
const firstLine = (text: string) => sale(text)?.lines?.[0] ?? null;

describe('goods sold by weight and volume', () => {
  it('turns a total over a weight into a real line', () => {
    // This produced no line at all, so anything sold by the kilo never reached
    // the products page. A grain shop would have found it empty.
    const line = firstLine('nimeuza sukari 2.5 kilo kwa 7500');
    expect(line).toEqual({ description: 'sukari', quantity: 2.5, unit_amount: 3000, unit: 'kilo' });
    expect(sale('nimeuza sukari 2.5 kilo kwa 7500')?.amount).toBe(7500);
  });

  it('reads the unit before the quantity too, which is how people write litres', () => {
    expect(firstLine('nimeuza mafuta lita 3 kwa 21000'))
      .toEqual({ description: 'mafuta', quantity: 3, unit_amount: 7000, unit: 'lita' });
  });

  it('takes a price stated per unit without dividing anything', () => {
    expect(firstLine('nimeuza unga kilo 5 kila kilo 2600'))
      .toEqual({ description: 'unga', quantity: 5, unit_amount: 2600, unit: 'kilo' });
    expect(firstLine('nimeuza sukari 3 kilo kila moja 3000'))
      .toEqual({ description: 'sukari', quantity: 3, unit_amount: 3000, unit: 'kilo' });
  });

  it('handles the containers goods are really sold in', () => {
    expect(firstLine('nimeuza karatasi rimu 2 kwa 28000')?.unit).toBe('rimu');
    expect(firstLine('nimeuza mchele gunia 1 kwa 95000')?.unit).toBe('gunia');
    expect(firstLine('nimeuza maziwa ndoo 2 kwa 16000')?.unit).toBe('ndoo');
  });

  it('reads several measured items in one message', () => {
    const record = sale('nimeuza sukari 2.5 kilo kwa 7500 na mafuta lita 2 kwa 14000');
    expect(record?.lines).toHaveLength(2);
    expect(record?.amount).toBe(21500);
  });
});

describe('arithmetic that has to be exact', () => {
  it('divides a total by a weight only when it comes out cleanly', () => {
    // 7,500 over 2.5 kilos is 3,000 with nothing left over.
    expect(firstLine('nimeuza sukari 2.5 kilo kwa 7500')?.unit_amount).toBe(3000);
    expect(firstLine('nimeuza mchele 1.5 kilo kwa 4500')?.unit_amount).toBe(3000);
  });

  it('refuses to invent a unit price that does not add back up', () => {
    // 100 over 7 kilos is 14.285714…, and 7 x 14.29 is 100.03 — the draft RPC
    // rejects lines that miss the stated amount, and rightly so. Better to keep
    // the total with no line than to file an amount the trader never said.
    const record = sale('nimeuza sukari 7 kilo kwa 100');
    expect(record?.lines ?? []).toEqual([]);
    expect(record?.amount).toBe(100);
  });

  it('keeps every line total adding back to the record amount', () => {
    for (const text of [
      'nimeuza sukari 2.5 kilo kwa 7500',
      'nimeuza mafuta lita 3 kwa 21000',
      'nimeuza unga kilo 5 kila kilo 2600',
      'nimeuza mafuta 1.5 lita kwa 10500',
    ]) {
      const record = sale(text)!;
      const sum = record.lines.reduce((total, line) => total + line.quantity * line.unit_amount, 0);
      expect(Math.abs(sum - record.amount), text).toBeLessThanOrEqual(0.01);
    }
  });
});

describe('nothing that already worked may break', () => {
  it('still reads a plain counted sale, with no unit', () => {
    const line = firstLine('nimeuza daftari 10 kila moja 1500');
    expect(line?.description).toBe('daftari');
    expect(line?.quantity).toBe(10);
    expect(line?.unit_amount).toBe(1500);
    expect(line?.unit ?? null).toBeNull();
  });

  it('still reads several counted items in one message', () => {
    const record = sale('nimeuza daftari 20 kila moja 1500 na kalamu 30 kila moja 500');
    expect(record?.lines).toHaveLength(2);
    expect(record?.amount).toBe(45000);
  });

  it('does not treat an ordinary product name as a unit', () => {
    // "mkate 2 kwa 1000" names no unit, so it keeps its old behaviour.
    const record = sale('nimeuza mkate 2 kwa 1000');
    expect(record?.lines ?? []).toEqual([]);
  });

  it('does not mistake a sale for a buying price', () => {
    expect(parseDailyRecord('Bei ya kununua Sukari ni 2000')?.kind).not.toBe('parsed');
  });
});

describe('stock coming in, with quantities', () => {
  const stock = (text: string) => {
    const parsed = parseDailyRecord(text);
    return parsed?.kind === 'parsed' && parsed.record.kind === 'stock_purchase' ? parsed.record : null;
  };

  it('records what came in and how much of it', () => {
    // A stock purchase used to store only a total, which is why stock-on-hand
    // could not exist: you cannot subtract sales from a number nobody counted.
    const record = stock('nimenunua stock ya daftari 100 kila moja 900');
    expect(record?.lines).toEqual([{ description: 'daftari', quantity: 100, unit_amount: 900 }]);
    expect(record?.amount).toBe(90000);
  });

  it('takes stock by weight and volume too', () => {
    expect(stock('nimenunua stock sukari kilo 50 kwa 130000')?.lines[0])
      .toEqual({ description: 'sukari', quantity: 50, unit_amount: 2600, unit: 'kilo' });
    expect(stock('nimenunua stock ya mafuta lita 20 kwa 140000')?.lines[0]?.unit).toBe('lita');
  });

  it('reads several goods in one delivery', () => {
    const record = stock('nimenunua stock ya daftari 100 kila moja 900 na kalamu 200 kila moja 300');
    expect(record?.lines).toHaveLength(2);
    expect(record?.amount).toBe(150000);
  });

  it('still records a purchase that names no quantity', () => {
    // The money is real even when the count cannot use it. Refusing the record
    // would lose a genuine expense; the stock report names the gap instead.
    const record = stock('nimenunua stock ya sukari 500000');
    expect(record?.amount).toBe(500000);
    expect(record?.lines).toEqual([]);
  });

  it('does not claim a purchase that never said stock', () => {
    // Charcoal is stock in a charcoal shop and a cooking cost everywhere else.
    expect(stock('nimenunua mkaa 7000')).toBeNull();
  });
});
