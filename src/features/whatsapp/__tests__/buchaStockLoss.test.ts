import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  ownerUseConfirmation,
  parseStockLoss,
  spoilageClarification,
  stockLossConfirmation,
} from '../../../../supabase/functions/_shared/whatsappStockLoss';

// RISIP BUCHA, PHASE 2 — goods that left the shelf without being sold.
//
// Two facts, and folding them together loses the shop real information: a
// butcher who cannot tell "I threw it away" from "I took it home" cannot tell
// waste from wages.

const loss = (said: string) => {
  const reading = parseStockLoss(said);
  expect(reading, said).not.toBeNull();
  return reading!;
};

describe('spoilage, in the words a shop actually uses', () => {
  it.each([
    ['nyama kilo 3 imeharibika', 'nyama', 3, 'kilo'],
    ['nyama kilo mbili imeharibika', 'nyama', 2, 'kilo'],
    ['maini kilo 2 yameoza', 'maini', 2, 'kilo'],
    ['nyama kilo 1.5 haifai tena', 'nyama', 1.5, 'kilo'],
    ['kilo 4 za nyama zimeharibika', 'nyama', 4, 'kilo'],
    ['nimepoteza kilo 2 za nyama', 'nyama', 2, 'kilo'],
  ])('reads %s', (said, product, quantity, unit) => {
    const reading = loss(said);
    expect(reading.kind).toBe('stock_loss');
    if (reading.kind !== 'stock_loss') return;
    expect(reading.product).toBe(product);
    expect(reading.quantity).toBe(quantity);
    expect(reading.unit).toBe(unit);
    // The trader's own word, kept: "imeoza" and "imeibiwa" are different facts.
    expect(reading.reason.length).toBeGreaterThan(3);
  });

  it('reads a count with no measure at all', () => {
    const reading = loss('soseji 5 zimeharibika');
    expect(reading.kind).toBe('stock_loss');
    if (reading.kind === 'stock_loss') expect(reading.unit).toBeNull();
  });
});

describe('goods taken home', () => {
  it.each([
    ['nimechukua nyama kilo 2 nyumbani', 'nyama', 2, 'kilo'],
    ['nimepeleka kilo 3 nyama nyumbani', 'nyama', 3, 'kilo'],
    ['nimechukua soseji 5 kwa matumizi ya nyumbani', 'soseji', 5, null],
    ['nimechukua maini kilo moja kwa ajili yangu', 'maini', 1, 'kilo'],
  ])('reads %s', (said, product, quantity, unit) => {
    const reading = loss(said);
    expect(reading.kind).toBe('owner_use');
    if (reading.kind !== 'owner_use') return;
    expect(reading.product).toBe(product);
    expect(reading.quantity).toBe(quantity);
    expect(reading.unit).toBe(unit);
  });
});

describe('a word that is not ours to decide', () => {
  // "Mzoga" means rotten meat in this butcher's yard and a fresh carcass in the
  // dictionary. Reading it as a loss deletes stock the shop just bought;
  // reading it as an arrival creates stock that is rotting in a bin.
  it.each(['mzoga kilo 2', 'mzoga 4', 'mizoga kilo 3'])('asks about %s instead of guessing', (said) => {
    const reading = loss(said);
    expect(reading.kind).toBe('clarify_spoilage');
  });

  it('never produces a financial draft from the ambiguous word', () => {
    const reading = loss('mzoga kilo 2');
    expect(reading.kind).not.toBe('stock_loss');
    expect(reading.kind).not.toBe('owner_use');
  });

  it('names both readings in the question and offers neither as a default', () => {
    const reading = loss('mzoga kilo 2');
    if (reading.kind !== 'clarify_spoilage') return;
    const question = spoilageClarification(reading, 'sw');
    expect(question).toContain('mzoga');
    expect(question).toContain('sitakisia');
    expect(question).toContain('zimeharibika');
  });

  it('is not in any shipped dictionary', () => {
    // Business vocabulary belongs to phase 3 and to the shop, not to a global
    // spelling table that would decide it for every butcher in the country.
    const spelling = readFileSync(
      resolve(process.cwd(), 'supabase/functions/_shared/whatsappSpelling.ts'), 'utf8');
    expect(spelling.toLowerCase()).not.toContain('mzoga');
  });
});

describe('what must never be read as a loss', () => {
  it.each([
    // Butcher scraps sold on purpose are a product, not spoilage.
    'za mbwa kilo 3',
    'nimeuza nyama kilo 3 cash',
    'nimenunua nyama kilo 80 kwa 720000',
    'nimeuza kavu 3 na zege 2',
    // A broken phone is not stock: no quantity, no product, no record.
    'simu yangu imeharibika',
  ])('refuses %s', (said) => {
    expect(parseStockLoss(said)).toBeNull();
  });
});

describe('the preview a trader confirms', () => {
  const reading = { kind: 'stock_loss' as const, product: 'nyama', quantity: 3, unit: 'kilo', reason: 'imeharibika' };

  it('shows the value only when the backend resolved one', () => {
    const priced = stockLossConfirmation(reading, 'Nyama ya ng’ombe', 27000, 'sw');
    expect(priced).toContain('TSh 27,000');
    expect(priced).toContain('*1*');
  });

  it('says plainly that it will not guess a missing cost', () => {
    const unpriced = stockLossConfirmation(reading, 'Nyama ya ng’ombe', null, 'sw');
    expect(unpriced).toContain('Sina gharama ya uhakika');
    // A silent zero would read as "this cost the shop nothing".
    expect(unpriced).not.toContain('TSh 0');
    expect(unpriced).toContain('bila kukisia');
  });

  it('refuses to call goods taken home a loss or a sale', () => {
    const owner = ownerUseConfirmation(
      { kind: 'owner_use', product: 'nyama', quantity: 2, unit: 'kilo' },
      'Nyama ya ng’ombe', 18000, 'sw');
    expect(owner).toContain('nyumbani');
    expect(owner).toContain('Sitaihesabu kama mauzo wala kama hasara');
  });
});

describe('where the arithmetic lives', () => {
  const webhook = readFileSync(
    resolve(process.cwd(), 'supabase/functions/whatsapp-webhook/index.ts'), 'utf8');

  it('takes the cost from the existing pricing RPC, never from the model', () => {
    expect(webhook).toContain("const parsedLoss = parseStockLoss(writeBody);");
    expect(webhook).toContain("await db.rpc('wa_product_pricing'");
    expect(webhook).toContain('Math.round(unitCost * lossReading.quantity * 100) / 100');
  });

  it('treats a non-positive cost as no cost at all', () => {
    // product_costs enforces unit_cost > 0, so anything else means the shop has
    // never said what this product costs.
    expect(webhook).toContain('Number.isFinite(rawCost) && rawCost > 0 ? rawCost : null');
  });

  it('resolves the product from this company only, and asks when unsure', () => {
    expect(webhook).toContain('await resolveProductForRead(db, identity, lossReading.product)');
    expect(webhook).toContain("found.resolution.kind === 'ambiguous'");
  });

  it('creates a pending draft and waits, like every other financial mutation', () => {
    expect(webhook).toContain("kind: 'daily_record_confirmation',");
    expect(webhook).toContain('stockLossConfirmation(lossReading, match.productName, value, lang)');
  });
});

describe('an unvalued loss is not a zero loss', () => {
  const report = readFileSync(
    resolve(process.cwd(), 'supabase/migrations/0123_an_unvalued_loss_is_not_a_zero_loss.sql'), 'utf8');

  it('counts the losses it could not value', () => {
    expect(report).toContain("count(*) filter (where kind = 'stock_loss' and amount = 0)");
    expect(report).toContain("'unvalued_stock_losses', v_unvalued_losses");
  });

  it('says outright when the valuation is incomplete', () => {
    expect(report).toContain("'stock_loss_valuation_complete', v_unvalued_losses = 0");
  });

  it('subtracts what is known and invents nothing', () => {
    expect(report).toContain('round(v_sales - v_cogs - v_expenses - v_losses, 2)');
  });
});
