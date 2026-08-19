import { describe, expect, it } from 'vitest';
import { splitSecondInstruction } from '../../../../supabase/functions/_shared/whatsappMixedTopics';
import { parseQuantityOnlySale } from '../../../../supabase/functions/_shared/whatsappQuantitySale';
import { parseStockCountBatch } from '../../../../supabase/functions/_shared/whatsappStockBatch';

describe('a sale and a restock in one breath', () => {
  it('cuts the owner’s own message at the second instruction', () => {
    // The screenshot: this was read as ONE daily record, and Risip asked
    // whether 100 was the price of each notebook.
    const split = splitSecondInstruction('nimeuza daftari kubwa 10 rejareja naongeza daftari 100 stoo');
    expect(split).not.toBeNull();
    expect(split!.action).toBe('nimeuza daftari kubwa 10 rejareja');
    expect(split!.leftover).toBe('naongeza daftari 100 stoo');
    // And the half that is acted on is a sale the pricing chain can read.
    const sale = parseQuantityOnlySale(split!.action)!;
    expect(sale.items).toEqual([{ product: 'daftari kubwa', quantity: 10, band: 'retail' }]);
  });

  it('cuts the other way round too', () => {
    const split = splitSecondInstruction('naongeza sukari 20 kisha nimeuza mkate 4');
    expect(split!.action).toBe('naongeza sukari 20');
    expect(split!.leftover).toBe('nimeuza mkate 4');
  });

  it('never cuts one till roll into two', () => {
    // MEASURED RISK: cutting here would silently drop 1,500 shillings.
    expect(splitSecondInstruction('nimeuza daftari 5 kwa 7500 na nimeuza kalamu 3 kwa 1500')).toBeNull();
    expect(splitSecondInstruction('nimeuza daftari 5, kalamu 3')).toBeNull();
  });

  it('leaves a single instruction alone, however long', () => {
    expect(splitSecondInstruction('naongeza bidhaa\ndaftari 100\nkalamu 50')).toBeNull();
    expect(splitSecondInstruction('nimeuza daftari kubwa 10 rejareja')).toBeNull();
    expect(splitSecondInstruction('')).toBeNull();
  });

  it('never leaves a fragment on either side', () => {
    expect(splitSecondInstruction('nimeuza naongeza')).toBeNull();
    expect(splitSecondInstruction('nimeuza daftari 10 naongeza')).toBeNull();
  });

  it('keeps a stock batch readable after the cut', () => {
    const split = splitSecondInstruction('naongeza bidhaa\ndaftari 100\nkalamu 50\nnimeuza mkate 4')!;
    expect(parseStockCountBatch(split.action)?.counts.length).toBe(2);
    expect(split.leftover).toBe('nimeuza mkate 4');
  });
});
