import { describe, expect, it } from 'vitest';
import {
  costBatchConfirmation,
  costBatchSaved,
  parseProductCostBatch,
} from '../../../../supabase/functions/_shared/whatsappCostBatch';

// The exact message that was pasted into the live number and saved nothing.
const REAL_PASTE = `Bei ya kununua St Rita wa Kashia ni 3000
Bei ya kununua Kitabu cha Tenzi za Rohoni ni 2300
Bei ya kununua Mkoba wa shule ni 17000
Bei ya kununua Nguvu ya Sala ni 8000
Bei ya kununua Rosali ya Maria ni 4500
Bei ya kununua Daftari ni 1000
Bei ya kununua Padre Pio ni 2200
Bei ya kununua Kitabu cha hesabu ni 5500
Bei ya kununua Biblia ni 14000
Bei ya kununua Kamusi ni 18000
Bei ya kununua Atlasi ni 10000
Bei ya kununua Kikokotoo ni 10500
Bei ya kununua Bilia kubwa ni 9500
Bei ya kununua Karatasi A4 rimu ni 11000
Bei ya kununua Kalamu ni 300
Bei ya kununua Manila ni 600
Bei ya kununua Chaki ni 1600
Bei ya kununua Jalada ni 900
Bei ya kununua Marker ni 1300
Bei ya kununua Daftari kubwa ni 1300
Bei ya kununua Daftari la graph ni 1700
Bei ya kununua Whiteboard marker ni 1700
Bei ya kununua Anton wa Padua ni 1600
Bei ya kununua Kalamu za rangi ni 3300
Bei ya kununua Punch ni 8500
Bei ya kununua Cellotape ni 900
Bei ya kununua Bahasha ni 120
Bei ya kununua Rula ni 450
Bei ya kununua Duster ni 1200
Bei ya kununua Penseli ni 180
Bei ya kununua Stapler ni 5500
Bei ya kununua Gundi ni 600
Bei ya kununua Kifutio ni 170
Bei ya kununua Mkasi ni 2300
Bei ya kununua Pini za stapler ni 900
Bei ya kununua Kichongeo ni 170`;

describe('the paste that saved nothing', () => {
  it('reads all 36 prices out of one message', () => {
    const batch = parseProductCostBatch(REAL_PASTE);
    expect(batch?.costs).toHaveLength(36);
    expect(batch?.unreadable).toEqual([]);
  });

  it('gets the products and the amounts right', () => {
    const batch = parseProductCostBatch(REAL_PASTE)!;
    const byName = new Map(batch.costs.map((cost) => [cost.product.toLowerCase(), cost.unitCost]));
    expect(byName.get('st rita wa kashia')).toBe(3000);
    expect(byName.get('kitabu cha tenzi za rohoni')).toBe(2300);
    expect(byName.get('bahasha')).toBe(120);
    expect(byName.get('kichongeo')).toBe(170);
  });

  it('lists every price back before saving any of them', () => {
    const reply = costBatchConfirmation(parseProductCostBatch(REAL_PASTE)!, 'sw');
    expect(reply).toContain('Bei za kununua 36');
    expect(reply).toContain('Kamusi — TSh 18,000');
    expect(reply).toMatch(/NDIYO/);
    // A price change must never look like it rewrote the past.
    expect(reply).toMatch(/Rekodi za nyuma hazitaguswa/);
  });
});

describe('how people really paste', () => {
  it('copes with numbering and bullets', () => {
    const batch = parseProductCostBatch([
      '1. Bei ya kununua Daftari ni 1000',
      '2. Bei ya kununua Kalamu ni 300',
      '- Bei ya kununua Rula ni 450',
    ].join('\n'));
    expect(batch?.costs).toHaveLength(3);
  });

  it('accepts the other phrasings mixed together', () => {
    const batch = parseProductCostBatch([
      'Bei ya kununua Daftari ni 1000',
      'Kalamu inanigharimu 300',
      'Ninanunua Rula kwa 450',
    ].join('\n'));
    expect(batch?.costs.map((c) => c.unitCost)).toEqual([1000, 300, 450]);
  });

  it('lets a corrected line win over the earlier one', () => {
    const batch = parseProductCostBatch([
      'Bei ya kununua Daftari ni 1000',
      'Bei ya kununua Kalamu ni 300',
      'Bei ya kununua Daftari ni 1200',
    ].join('\n'))!;
    expect(batch.costs).toHaveLength(2);
    expect(batch.costs.find((c) => c.product.toLowerCase() === 'daftari')?.unitCost).toBe(1200);
  });

  it('names the lines it could not read instead of dropping them quietly', () => {
    // A price that vanishes silently is worse than one refused loudly: every
    // profit figure afterwards is built on these numbers.
    const batch = parseProductCostBatch([
      'Bei ya kununua Daftari ni 1000',
      'Bei ya kununua Kalamu ni 300',
      'Bei ya kununua Rula',
    ].join('\n'))!;
    expect(batch.costs).toHaveLength(2);
    expect(batch.unreadable).toEqual(['Bei ya kununua Rula']);
    expect(costBatchConfirmation(batch, 'sw')).toContain('Bei ya kununua Rula');
  });
});

describe('what it must not claim', () => {
  it('leaves a single price to the existing one-at-a-time path', () => {
    // That path shows the previous price, which is the better answer for one.
    expect(parseProductCostBatch('Bei ya kununua Daftari ni 1000')).toBeNull();
  });

  it('does not read a list of sales as a list of prices', () => {
    const sales = [
      'nimeuza daftari 20 kila moja 1500',
      'nimeuza kalamu 30 kila moja 500',
      'nimeuza penseli 10 kila moja 300',
    ].join('\n');
    expect(parseProductCostBatch(sales)).toBeNull();
  });

  it('ignores ordinary conversation', () => {
    expect(parseProductCostBatch('habari\nmambo vipi\nnataka kujua faida')).toBeNull();
    expect(parseProductCostBatch('')).toBeNull();
  });

  it('tells the trader what changed and what to try next', () => {
    const reply = costBatchSaved(36, 'St. Ritha bookshop', 'sw');
    expect(reply).toContain('36');
    expect(reply).toContain('St. Ritha bookshop');
    expect(reply).toMatch(/faida/);
  });
});
