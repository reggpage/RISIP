import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ASSISTANT_TOOLS } from '../../../../supabase/functions/_shared/whatsappAssistant';
import { addPriceTier } from '../../../../supabase/functions/_shared/whatsappSellingPriceBatch';
import type { SellingPrice } from '../../../../supabase/functions/_shared/whatsappSellingPrice';

// SHUKA, TWICE.
//
// MEASURED, on his screen at 09:43. He sent:
//
//   "haya weka bei kwenye shuka nimenua kwa 5000 na uza kwa 8000 jumla ni 7500"
//
// and got back:
//
//   Bei za kuuza — bidhaa 2:
//    1. shuka — TSh 8,000
//    2. shuka — TSh 7,500
//
// He asked why the AI understood nothing. It understood him exactly. This shop
// trades at TWO prices — the entire REJAREJA/JUMLA question exists because of
// it — and propose_price_update had ONE price field. Two rows for one product
// was the only sentence the tool could form. A missing field, not a confused
// model, and the fix is the field.
//
// The buying price he also gave, 5,000, went nowhere for the same reason: it
// belongs to a different tool, and nothing told the model to call both.

const webhook = readFileSync(
  resolve(process.cwd(), 'supabase/functions/whatsapp-webhook/index.ts'), 'utf8');

describe('the tool can finally say what he said', () => {
  const tool = ASSISTANT_TOOLS.find((entry) => entry.name === 'propose_price_update');
  const schema = tool?.input_schema as {
    properties: { lines: { items: { properties: Record<string, unknown>; required: string[] } } };
  };

  it('carries the trade price beside the retail one', () => {
    expect(Object.keys(schema.properties.lines.items.properties))
      .toContain('wholesale_wording');
    expect(Object.keys(schema.properties.lines.items.properties))
      .toContain('wholesale_candidate');
  });

  it('holds the wholesale to the same wording rule as the retail', () => {
    // A figure the model invented is exactly as wrong here as anywhere else.
    const props = schema.properties.lines.items.properties as Record<string, { description: string }>;
    expect(props.wholesale_wording.description).toMatch(/exactly as said/i);
    expect(schema.properties.lines.items.required).toContain('wholesale_wording');
  });

  it('says out loud that one product is one line', () => {
    expect(tool?.description).toMatch(/Never two lines for the same product/i);
    expect(tool?.description).toMatch(/uza kwa 8000 jumla ni 7500/);
  });

  it('tells it not to drop the buying price in the same sentence', () => {
    expect(tool?.description).toMatch(/put 5000 in cost and 8000 in retail_price/i);
    expect(tool?.description).toMatch(/Do not call a second write tool/i);
  });
});

describe('a product that arrives twice is collapsed, not listed twice', () => {
  // Behaviour, not source text. The earlier version of this suite asserted on
  // the code that did the collapsing, and a deliberately broken build slipped
  // straight past it — so the assertions moved to what the shopkeeper is shown.
  const shuka = () => {
    const prices: SellingPrice[] = [];
    addPriceTier(prices, 'shuka', 8000, null);
    addPriceTier(prices, 'shuka', 7500, null);
    return prices;
  };

  it('shows one shuka, not two', () => {
    expect(shuka()).toHaveLength(1);
  });

  it('keeps both numbers — the higher sells, the lower is the trade price', () => {
    expect(shuka()[0]).toMatchObject({ product: 'shuka', retail: 8000, wholesale: 7500 });
  });

  it('does not care which order they arrive in', () => {
    const prices: SellingPrice[] = [];
    addPriceTier(prices, 'shuka', 7500, null);
    addPriceTier(prices, 'shuka', 8000, null);
    expect(prices[0]).toMatchObject({ retail: 8000, wholesale: 7500 });
  });

  it('takes both tiers from one line, which is the point of the new field', () => {
    const prices: SellingPrice[] = [];
    addPriceTier(prices, 'shuka', 8000, 7500);
    expect(prices).toEqual([{ product: 'shuka', retail: 8000, wholesale: 7500, minQty: null }]);
  });

  it('leaves a single price single', () => {
    // NEGATIVE CONTROL. Most products have one price and must not grow a
    // second one out of nothing.
    const prices: SellingPrice[] = [];
    addPriceTier(prices, 'daftari', 1000, null);
    expect(prices).toEqual([{ product: 'daftari', retail: 1000, wholesale: null, minQty: null }]);
  });

  it('keeps different products apart', () => {
    const prices: SellingPrice[] = [];
    addPriceTier(prices, 'shuka', 8000, null);
    addPriceTier(prices, 'kofia', 7000, null);
    expect(prices.map((p) => p.product)).toEqual(['shuka', 'kofia']);
  });

  it('matches the name however it was capitalised', () => {
    const prices: SellingPrice[] = [];
    addPriceTier(prices, 'Shuka', 8000, null);
    addPriceTier(prices, 'shuka', 7500, null);
    expect(prices).toHaveLength(1);
    expect(prices[0].product).toBe('Shuka');
  });

  it('is what the AI price path actually calls', () => {
    // Behaviour above proves the rule; this proves the rule is wired in. A
    // deliberately reverted webhook slipped past the suite without it.
    expect(webhook).toContain('addPriceTier(prices, exact, one.price, one.wholesale, one.minQty);');
    expect(webhook).not.toContain('prices.push({ product: resolved, retail: one.price');
  });

  it('ignores a zero, which is not a price', () => {
    const prices: SellingPrice[] = [];
    addPriceTier(prices, 'shuka', 8000, null);
    addPriceTier(prices, 'shuka', 0, null);
    expect(prices[0]).toMatchObject({ retail: 8000, wholesale: null });
  });
});

describe('every route that asks "which one?" now parks the answer', () => {
  it('has one helper rather than six copies of the same upsert', () => {
    expect(webhook).toContain('async function parkProductChoice(');
    expect(webhook).toContain('function choiceNames(');
  });

  it('parks from all six places the question is asked', () => {
    // MEASURED by counting: the clarification is printed from six routes and
    // only the sale path parked it, so the same question was deterministic in
    // one route and left to the model in the others.
    const parks = webhook.split('parkProductChoice(db, identity, waMessageId').length - 1;
    expect(parks).toBeGreaterThanOrEqual(6);
  });

  it('never lets a failed park stop the question being asked', () => {
    const at = webhook.indexOf('async function parkProductChoice(');
    const fn = webhook.slice(at, at + 1600);
    expect(fn).toContain('} catch {');
    expect(fn).toContain('still a question worth asking');
  });

  it('refuses to park an empty question', () => {
    const at = webhook.indexOf('async function parkProductChoice(');
    const fn = webhook.slice(at, at + 1600);
    expect(fn).toContain('if (!asked || candidates.length === 0 || !originalText) return;');
  });
});
