import { describe, expect, it } from 'vitest';
import {
  costAccepted,
  costQuestion,
  costSkipped,
  costUnclear,
  isSkip,
  parseCostAnswer,
  toCostPrompt,
  type CostPrompt,
} from '../../../../supabase/functions/_shared/whatsappCostPrompt';

const prompt: CostPrompt = {
  kind: 'cost_prompt',
  product: 'Kitabu cha Tenzi za Rohoni',
  productKey: 'kitabu cha tenzi za rohoni',
  sellingPrice: 3500,
};

describe('reading the answer', () => {
  it('takes a bare price however it is written', () => {
    expect(parseCostAnswer('2000')).toBe(2000);
    expect(parseCostAnswer(' 2,500 ')).toBe(2500);
    expect(parseCostAnswer('2500/=')).toBe(2500);
    expect(parseCostAnswer('TSh 2500')).toBe(2500);
    expect(parseCostAnswer('2500 shilingi')).toBe(2500);
  });

  it('reads a dot as a thousands separator when it is used as one', () => {
    // "12.500" is twelve and a half thousand here, not twelve and a half.
    expect(parseCostAnswer('12.500')).toBe(12500);
    // But real cents still work.
    expect(parseCostAnswer('12.50')).toBe(12.5);
  });

  it('refuses anything that is not just a price', () => {
    // A sentence is far more likely to be a new instruction than an answer, and
    // guessing would put a wrong price into the books.
    expect(parseCostAnswer('nimeuza sukari 5 kwa 12000')).toBeNull();
    expect(parseCostAnswer('nadhani ni 2000')).toBeNull();
    expect(parseCostAnswer('sijui')).toBeNull();
    expect(parseCostAnswer('')).toBeNull();
  });

  it('refuses nonsense amounts', () => {
    expect(parseCostAnswer('0')).toBeNull();
    expect(parseCostAnswer('-500')).toBeNull();
    expect(parseCostAnswer('999999999999')).toBeNull();
  });

  it('hears the ways people decline', () => {
    for (const said of ['ruka', 'RUKA', 'skip', 'baadaye', 'sijui', 'hapana']) {
      expect(isSkip(said), said).toBe(true);
    }
    expect(isSkip('2000')).toBe(false);
  });
});

describe('what the trader is told', () => {
  it('asks in plain words and gives the way out', () => {
    const sw = costQuestion(prompt, 'sw');
    expect(sw).toContain('Kitabu cha Tenzi za Rohoni');
    expect(sw).toContain('TSh 3,500');   // what they just sold it for
    expect(sw).toMatch(/RUKA/);
    expect(sw).toMatch(/7000/);          // an example, so the format is obvious
  });

  it('shows the margin straight away, which is the whole payoff', () => {
    const reply = costAccepted(prompt, 2000, 'sw');
    expect(reply).toContain('TSh 1,500');  // 3500 - 2000
    expect(reply).toContain('43%');
  });

  it('warns plainly when the product is being sold at a loss', () => {
    const reply = costAccepted(prompt, 4000, 'sw');
    expect(reply).toMatch(/hasara/);
    expect(reply).toContain('TSh 500');
    expect(reply).not.toMatch(/faida/);
  });

  it('says nothing about margin when the selling price is unknown', () => {
    const noPrice = { ...prompt, sellingPrice: null };
    const reply = costAccepted(noPrice, 2000, 'sw');
    expect(reply).toContain('TSh 2,000');
    expect(reply).not.toMatch(/faida|hasara|%/);
  });

  it('promises to stop asking, and means it', () => {
    expect(costSkipped('sw')).toMatch(/sitakuuliza tena/);
    expect(costSkipped('en')).toMatch(/not ask again/);
  });

  it('names the product again when the answer was unclear', () => {
    expect(costUnclear(prompt, 'sw')).toContain('Kitabu cha Tenzi za Rohoni');
  });
});

describe('reading what the database returned', () => {
  it('accepts a well-formed row', () => {
    const parsed = toCostPrompt({ product: 'Daftari', product_key: 'daftari', selling_price: 1500 });
    expect(parsed).toEqual({ kind: 'cost_prompt', product: 'Daftari', productKey: 'daftari', sellingPrice: 1500 });
  });

  it('returns null when there is nothing to ask about', () => {
    // wa_next_cost_prompt returns null whenever the product is priced, was asked
    // about recently, was skipped twice, or the person is a worker.
    expect(toCostPrompt(null)).toBeNull();
    expect(toCostPrompt({})).toBeNull();
    expect(toCostPrompt({ product: '   ', product_key: 'x' })).toBeNull();
  });

  it('treats a missing or silly selling price as unknown rather than zero', () => {
    expect(toCostPrompt({ product: 'D', product_key: 'd' })?.sellingPrice).toBeNull();
    expect(toCostPrompt({ product: 'D', product_key: 'd', selling_price: 0 })?.sellingPrice).toBeNull();
  });
});
