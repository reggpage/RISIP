import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseNewProductPricing } from '../../../../supabase/functions/_shared/whatsappNewProduct';

// HE APPROVED ONE THING AND A DIFFERENT THING WAS WRITTEN.
//
// MEASURED, on the owner's screen, and it is the worst class of bug in this
// product. Risip asked him to register two new products in an exact shape. He
// sent it exactly:
//
//   kofia @4000 nauza 7000 jumla 6500
//   shuka @9000 nauza 15000 jumla ni 10000
//
// What came back:
//
//   "St. Ritha bookshop — kofia inakugharimu TSh 4,000. Ni sahihi? 1 / 2"
//   → 1
//   "Nimeandika: shuka TSh 9,000 (St. Ritha bookshop)."
//
// The confirmation named kofia. The row that saved was shuka. Neither product
// was registered; two buying costs were.
//
// parseNewProductPricing reads that message perfectly — both products, all
// three prices each, verified below. It is a deterministic outage fallback,
// never the normal route. The live path must send this sentence to the model,
// together with the parked registration context, so Claude can choose the
// correct proposal tool and preserve the whole message.
//
// THE RULE: an answer in the exact syntax Risip printed a moment earlier is not
// language. It is a form we handed them. Reinterpreting our own form is not
// intelligence, and here it cost a shopkeeper the difference between what he
// approved and what was written.

const webhook = readFileSync(
  resolve(process.cwd(), 'supabase/functions/whatsapp-webhook/index.ts'), 'utf8');

describe('the message he actually sent', () => {
  const sent = 'kofia @4000 nauza 7000 jumla 6500\nshuka @9000 nauza 15000 jumla ni 10000';
  const read = parseNewProductPricing(sent);

  it('is read as two products, not one cost', () => {
    expect(read).toHaveLength(2);
    expect(read.map((p) => p.product)).toEqual(['kofia', 'shuka']);
  });

  it('carries all three prices for each', () => {
    expect(read[0]).toMatchObject({ unitCost: 4000, retail: 7000, wholesale: 6500 });
    expect(read[1]).toMatchObject({ unitCost: 9000, retail: 15000, wholesale: 10000 });
  });

  it('survives "jumla ni 10000", with the stray word in the middle', () => {
    expect(read[1].wholesale).toBe(10000);
  });
});

describe('the gate sends the form to the model', () => {
  const gate = webhook.slice(
    webhook.indexOf('const aiEligible = messageGoesToModel'),
    webhook.indexOf('let messageRoute'),
  );

  it('has one AI-first eligibility decision', () => {
    expect(gate).toContain('const aiEligible = messageGoesToModel(convo, body, systemCommand)');
    expect(gate).not.toContain('parseNewProductPricing');
    expect(gate).not.toContain('readIncompletePriceLines');
  });

  it('does not let a parked registration state intercept a sentence', () => {
    expect(gate).not.toContain('registrationPending');
    expect(gate).not.toContain('answeringWithPrices');
  });

  it('keeps the deterministic parser available only below the AI attempt', () => {
    const ai = webhook.indexOf('const aiEligible = messageGoesToModel');
    const fallback = webhook.indexOf('const newProducts = parseNewProductPricing');
    expect(fallback).toBeGreaterThan(ai);
  });
});

describe('what still reaches the model', () => {
  it('anything that is not in the form', () => {
    // "hizi nimezinunua leo asubuhi" beside a pending question is language and
    // must still reach Claude — the parser reads nothing in it.
    expect(parseNewProductPricing('hizi nimezinunua leo asubuhi')).toHaveLength(0);
    expect(parseNewProductPricing('leo nimeuza shingapi')).toHaveLength(0);
  });

  it('a message with no prices in it at all', () => {
    expect(parseNewProductPricing('kofia na shuka')).toHaveLength(0);
  });
});
