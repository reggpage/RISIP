import { describe, expect, it } from 'vitest';
import {
  parseStockCountBatch,
  parseStockCountLine,
  stockCountBatchConfirmation,
} from '../../../../supabase/functions/_shared/whatsappStockBatch';

const list = (body: string) => `Hesabu ya stock\n${body}`;

describe('counting the whole shelf in one message', () => {
  it('reads a plain list of products and numbers', () => {
    const batch = parseStockCountBatch(list('daftari 90\nkalamu 240\npenseli 130'));
    expect(batch?.counts).toEqual([
      { product: 'daftari', quantity: 90, unit: null },
      { product: 'kalamu', quantity: 240, unit: null },
      { product: 'penseli', quantity: 130, unit: null },
    ]);
    expect(batch?.unreadable).toEqual([]);
  });

  it('reads the shapes a person actually types', () => {
    const batch = parseStockCountBatch(list('1. daftari - 90\n• kalamu: 240\nrula = 18'));
    expect(batch?.counts.map((c) => c.product)).toEqual(['daftari', 'kalamu', 'rula']);
    expect(batch?.counts.map((c) => c.quantity)).toEqual([90, 240, 18]);
  });

  it('treats “jaza … ziwe …” as separate absolute stock counts', () => {
    const batch = parseStockCountBatch([
      'Jaza birika ziwe 100',
      'Daftari ziwe 400',
      'Dumu la maji ziwe 100',
    ].join('\n'));
    expect(batch?.counts).toEqual([
      { product: 'birika', quantity: 100, unit: null },
      { product: 'Daftari', quantity: 400, unit: null },
      { product: 'Dumu la maji', quantity: 100, unit: null },
    ]);
    expect(batch?.unreadable).toEqual([]);
  });

  it('accepts one explicit absolute correction but not a vague add instruction', () => {
    expect(parseStockCountBatch('weka birika iwe 100')?.counts)
      .toEqual([{ product: 'birika', quantity: 100, unit: null }]);
    expect(parseStockCountBatch('jaza birika 100')).toBeNull();
  });

  it('keeps a unit on either side of the number, and a fraction of one', () => {
    const batch = parseStockCountBatch(list('sukari kilo 12.5\nmafuta 20 lita'));
    expect(batch?.counts).toEqual([
      { product: 'sukari', quantity: 12.5, unit: 'kilo' },
      { product: 'mafuta', quantity: 20, unit: 'lita' },
    ]);
  });

  it('treats pcs as no unit at all, because counting is the default', () => {
    expect(parseStockCountLine('daftari 90 pcs')).toEqual({ product: 'daftari', quantity: 90, unit: null });
  });

  it('keeps names that are three words long', () => {
    // Half this shop's names are a phrase: nguvu ya sala, st rita wa kashia.
    const batch = parseStockCountBatch(list('nguvu ya sala 14\nst rita wa kashia 32'));
    expect(batch?.counts.map((c) => c.product)).toEqual(['nguvu ya sala', 'st rita wa kashia']);
  });

  it('takes zero, which is the count that matters most', () => {
    expect(parseStockCountLine('bibilia ndogo 0')).toEqual({ product: 'bibilia ndogo', quantity: 0, unit: null });
  });

  it('lets a correction further down the list win', () => {
    const batch = parseStockCountBatch(list('daftari 90\nkalamu 240\ndaftari 95'));
    expect(batch?.counts).toEqual([
      { product: 'daftari', quantity: 95, unit: null },
      { product: 'kalamu', quantity: 240, unit: null },
    ]);
  });

  it('names the lines it could not read instead of dropping them', () => {
    const batch = parseStockCountBatch(list('daftari 90\nkalamu nyingi sana\npenseli 130'));
    expect(batch?.counts).toHaveLength(2);
    expect(batch?.unreadable).toEqual(['kalamu nyingi sana']);
  });
});

describe('what it must never claim', () => {
  it('refuses a list that does not announce itself', () => {
    // Without the header this is indistinguishable from a price list, and
    // guessing wrong wipes a shelf.
    expect(parseStockCountBatch('daftari 90\nkalamu 240\npenseli 130')).toBeNull();
  });

  it('leaves a pasted price list alone', () => {
    expect(parseStockCountBatch('bei ya kununua\ndaftari 1200\nkalamu 300')).toBeNull();
  });

  it('leaves sales alone even under a count header', () => {
    const batch = parseStockCountBatch(list('nimeuza daftari 10\nnimeuza kalamu 5'));
    expect(batch).toBeNull();
  });

  it('will not act on a single line', () => {
    // One product is the ordinary single-count path, which asks its own question.
    expect(parseStockCountBatch(list('daftari 90'))).toBeNull();
  });

  it('never yields a negative count, because a dash is a separator here', () => {
    // "daftari - 90" is how half of these lists are written, so the minus sign
    // is not available as a sign. A shelf cannot hold less than nothing anyway.
    expect(parseStockCountLine('daftari -5')?.quantity).toBe(5);
    expect(parseStockCountLine('daftari: -5')?.quantity).toBe(5);
  });

  it('ignores a bare number with no product', () => {
    expect(parseStockCountLine('90')).toBeNull();
  });
});

describe('what the trader is shown before anything is saved', () => {
  it('lists every line back with its number', () => {
    const batch = parseStockCountBatch(list('daftari 90\nsukari kilo 12.5'))!;
    const reply = stockCountBatchConfirmation(batch, 'sw');
    expect(reply).toContain('1. daftari — 90');
    expect(reply).toContain('2. sukari — 12.5 kilo');
    expect(reply).toMatch(/NDIYO/);
  });

  it('says plainly that this becomes the new anchor', () => {
    const batch = parseStockCountBatch(list('daftari 90\nkalamu 240'))!;
    expect(stockCountBatchConfirmation(batch, 'sw')).toMatch(/idadi zilizopo sasa/);
    expect(stockCountBatchConfirmation(batch, 'sw')).not.toMatch(/Nimekumbuka|Kumbuka/);
  });

  it('shows the lines it could not read, before the question', () => {
    const batch = parseStockCountBatch(list('daftari 90\nkalamu 240\nnyingine kadhaa'))!;
    const reply = stockCountBatchConfirmation(batch, 'sw');
    expect(reply).toContain('nyingine kadhaa');
    expect(reply.indexOf('nyingine kadhaa')).toBeLessThan(reply.indexOf('NDIYO'));
  });
});

describe('a shelf correction that arrived without its line breaks', () => {
  const wanted = [
    { product: 'birika', quantity: 100, unit: null },
    { product: 'Daftari', quantity: 400, unit: null },
    { product: 'Dumu la maji', quantity: 100, unit: null },
  ];

  it('reads the owner’s message laid out in three lines', () => {
    const batch = parseStockCountBatch('Jaza birika ziwe 100\nDaftari ziwe 400\nDumu la maji ziwe 100');
    expect(batch?.counts).toEqual(wanted);
  });

  it('reads the same message flat, which is how it actually arrived', () => {
    // MEASURED FAILURE: read as one product it became a single item called
    // "birika ziwe 100 Daftari ziwe 400 Dumu la maji", a hundred of them.
    const batch = parseStockCountBatch('Jaza birika ziwe 100 Daftari ziwe 400 Dumu la maji ziwe 100');
    expect(batch?.counts).toEqual(wanted);
  });

  it('does not claim a single shelf correction, which belongs to the one-line reader', () => {
    expect(parseStockCountBatch('Daftari ziwe 400')).toBeNull();
  });

  it('does not turn an ordinary sentence into counts', () => {
    expect(parseStockCountBatch('nimeuza daftari 5 kwa 7500')).toBeNull();
    expect(parseStockCountBatch('habari za asubuhi')).toBeNull();
  });
});
