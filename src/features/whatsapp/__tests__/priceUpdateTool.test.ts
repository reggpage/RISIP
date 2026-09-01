import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ASSISTANT_TOOLS } from '../../../../supabase/functions/_shared/whatsappAssistant';
import { parseSellingPriceBatch } from '../../../../supabase/functions/_shared/whatsappSellingPriceBatch';
import { readNumber } from '../../../../supabase/functions/_shared/whatsappBusinessEvent';

// SETTING PRICES, however the sentence happens to come out.
//
// MEASURED. The batch parser reads exactly one shape — "bei ya X iwe 4000 na Y
// iwe 2000" — and returns null for everything else a shopkeeper actually
// types. All four of these were dead:
//
//   "weka bei birika 5000 sodaa 2000 daftari 1500"
//   "nataka kuweka bei za bidhaa zote: birika 5000, sodaa 2000"
//   "panga bei mpya: birika elfu tano na sodaa elfu mbili"
//   a pasted list under a "bei" heading
//
// The model splits the sentence now. It does NOT state the prices: price_wording
// is the trader's own words and price_candidate is the model's reading of those
// same words, and the server re-reads them and refuses a disagreement. That is
// the contract propose_business_event already runs on, for the same reason.

const webhook = readFileSync(
  resolve(process.cwd(), 'supabase/functions/whatsapp-webhook/index.ts'), 'utf8');

describe('the shapes the parser alone could not read', () => {
  it('still cannot read them, which is why the tool exists', () => {
    // Kept as a live record of the gap rather than a claim in a commit
    // message. If the parser ever grows to cover these, this test says so.
    for (const said of [
      'weka bei birika 5000 sodaa 2000 daftari 1500',
      'nataka kuweka bei za bidhaa zote: birika 5000, sodaa 2000, daftari 1500',
      'panga bei mpya: birika elfu tano na sodaa elfu mbili',
    ]) {
      expect(parseSellingPriceBatch(said), said).toBeNull();
    }
  });

  it('reads the one shape it was built for', () => {
    const batch = parseSellingPriceBatch('bei ya velvet napkin iwe 4000 na sodaa iwe 2000');
    expect(batch?.prices).toHaveLength(2);
  });
});

describe('the server reads every number, not the model', () => {
  it('accepts a candidate that agrees with the words', () => {
    expect(readNumber('5000', 5000, { min: 0, max: 100_000_000 }))
      .toMatchObject({ kind: 'value', value: 5000 });
    expect(readNumber('elfu tano', 5000, { min: 0, max: 100_000_000 }))
      .toMatchObject({ kind: 'value', value: 5000 });
  });

  it('refuses a candidate that disagrees with them', () => {
    // One of the two misread the sentence, and guessing which is not a
    // decision a ledger should make.
    expect(readNumber('elfu tano', 50_000, { min: 0, max: 100_000_000 }))
      .toMatchObject({ kind: 'ask', reason: 'disagreement' });
  });

  it('refuses a number nobody said', () => {
    // A bare candidate is the model asserting a price out of nothing, which is
    // the one thing this contract exists to stop.
    expect(readNumber(null, 5000, { min: 0, max: 100_000_000 }))
      .toMatchObject({ kind: 'ask' });
  });
});

describe('the tool, and the authority it does not have', () => {
  const tool = ASSISTANT_TOOLS.find((entry) => entry.name === 'propose_price_update');

  it('takes the wording and the model’s reading of it, never a bare figure', () => {
    const schema = tool?.input_schema as {
      properties: { lines: { items: { properties: Record<string, unknown> } } };
    };
    expect(Object.keys(schema.properties.lines.items.properties))
      .toEqual(['product_wording', 'price_wording', 'price_candidate',
        // This shop trades at two prices. Until the tool carried the second
        // one, the model's only way to say "uza kwa 8000 jumla ni 7500" was
        // two lines — and the owner was shown shuka twice.
        'wholesale_wording', 'wholesale_candidate',
         'product', 'cost_wording', 'cost', 'cost_unit_wording', 'purchase_unit', 'retail_wording', 'retail_price',
        'wholesale_price', 'wholesale_min_qty_wording', 'wholesale_min_qty']);
    // The words are compulsory; the candidate may be null. A price cannot
    // arrive without the sentence it came from.
    const required = (schema.properties.lines.items as unknown as { required: string[] }).required;
    expect(required).toContain('price_wording');
  });

  it('says which of the three price questions it answers', () => {
    expect(tool?.description).toMatch(/ordinary price the shop charges/i);
    expect(tool?.description).toMatch(/cost means what the shop paid/i);
    expect(tool?.description).toMatch(/a till roll headed "Mauzo" is never a price list/i);
  });

  it('carries the phrasings the parser could not', () => {
    expect(tool?.description).toMatch(/weka bei birika 5000 sodaa 2000/);
    expect(tool?.description).toMatch(/elfu tano/);
  });

  it('saves nothing by itself', () => {
    expect(tool?.description).toMatch(/Nothing is saved by this call/i);
    const at = webhook.indexOf("if (name === 'propose_price_update')");
    const branch = webhook.slice(at, webhook.indexOf("if (name === 'propose_record_void')", at));
    // It parks the same pending state the deterministic path parks, and the
    // write stays in the confirmation branch where NDIYO reaches it.
    expect(branch).toContain("kind: 'selling_price_batch'");
    expect(branch).not.toContain('wa_set_selling_prices');
  });

  it('resolves names before asking, so one typo cannot cost the certain ones', () => {
    const at = webhook.indexOf("if (name === 'propose_price_update')");
    const branch = webhook.slice(at, webhook.indexOf("if (name === 'propose_record_void')", at));
    expect(branch).toContain("db.rpc('company_product_names'");
    // An unresolvable name is listed back, never dropped: a price that
    // vanishes quietly is worse than one refused loudly.
    expect(branch).toContain('unreadable.push(one.asked);');
    expect(branch).not.toContain('const partial = known.filter');
    expect(branch).toContain("product: one.asked");
    expect(branch).toContain("kind: 'new_product_pricing'");
    expect(branch).toContain('Do not answer yet. Call propose_price_update again');
  });
});
