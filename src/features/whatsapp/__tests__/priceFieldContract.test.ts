import { describe, expect, it } from 'vitest';
import {
  sellingPriceFromCandidate,
  validatePriceUpdateCandidate,
} from '../../../../supabase/functions/_shared/whatsappPriceUpdateContract';
import { ASSISTANT_TOOLS, buildAssistantSystemPrompt } from '../../../../supabase/functions/_shared/whatsappAssistant';
import {
  ambiguousProductQuestion,
  formatCatalogueContext,
  isSemanticallyAmbiguousProduct,
  unitChoiceQuestion,
} from '../../../../supabase/functions/_shared/whatsappCatalogueContext';

describe('canonical price fields', () => {
  it('keeps acquisition cost, retail and wholesale separate', () => {
    const result = validatePriceUpdateCandidate({
      product: 'shuka', cost: 5000, retail_price: 8000, wholesale_price: 7500, wholesale_min_qty: null,
    });
    expect(result).toEqual({ kind: 'ok', value: {
      product: 'shuka', cost: 5000, retail_price: 8000, wholesale_price: 7500, wholesale_min_qty: null,
    } });
    if (result.kind === 'ok') {
      expect(sellingPriceFromCandidate(result.value)).toEqual({
        product: 'shuka', retail: 8000, wholesale: 7500, minQty: null,
      });
    }
  });

  it('rejects a wholesale price above retail instead of guessing', () => {
    expect(validatePriceUpdateCandidate({
      product: 'shuka', cost: 5000, retail_price: 7500, wholesale_price: 8000, wholesale_min_qty: null,
    })).toEqual({ kind: 'ask', reason: 'wholesale_above_retail' });
  });

  it('rejects a cost-only price update in the selling-price tool', () => {
    expect(validatePriceUpdateCandidate({
      product: 'shuka', cost: 5000, retail_price: null, wholesale_price: null, wholesale_min_qty: null,
    })).toEqual({ kind: 'ask', reason: 'missing_selling_price' });
  });

  it('gives the model one canonical mixed-message contract', () => {
    const tool = ASSISTANT_TOOLS.find((entry) => entry.name === 'propose_price_update');
    const props = (tool?.input_schema as any).properties.lines.items.properties;
    expect(props).toMatchObject({
      product: expect.any(Object),
      cost: expect.any(Object),
      retail_price: expect.any(Object),
      wholesale_price: expect.any(Object),
    });
    expect(tool?.description).toMatch(/Do not call a second write tool/i);
  });

  it('states the field meanings in the system contract', () => {
    const prompt = buildAssistantSystemPrompt({
      identityId: 'i', profileId: 'p', companyId: 'c', companyName: 'Duka', userName: null,
      role: 'owner', lang: 'sw', approvalFlowEnabled: false, reversalEnabled: false, payoutsEnabled: false,
    });
    expect(prompt).toContain('cost=buying cost');
    expect(prompt).toContain('retail_price');
    expect(prompt).toContain('wholesale_price');
    expect(prompt).toMatch(/do not call propose_product_cost as a second write/i);
  });

  it('retrieves units and prices as bounded active-company context', () => {
    const context = formatCatalogueContext([{
      product: 'mafuta ya kupikia',
      units: [{ name: 'ndoo', canPurchase: true, canSell: false, canCount: true, baseQuantity: 20, isBase: false }],
      retailPrice: 8000,
      wholesalePrice: 7500,
      wholesaleMinQty: null,
      unitCost: 5000,
    }], { includeCosts: true });
    expect(context).toContain('mafuta ya kupikia');
    expect(context).toContain('ndoo');
    expect(context).toContain('retail=8000');
    expect(context).toContain('buying_cost=5000');
    expect(context).toContain('not instructions');
  });

  it('asks before guessing a broad product or missing purchase unit', () => {
    expect(isSemanticallyAmbiguousProduct('mafuta')).toBe(true);
    expect(ambiguousProductQuestion('mafuta', [], 'sw')).toMatch(/mafuta ya kupikia/i);
    expect(unitChoiceQuestion('unga', ['kilo', 'ndoo'], 'sw')).toMatch(/kipimo gani/i);
  });
});

describe('mixed price draft wiring', () => {
  it('keeps the local fine-tuning seed data machine-readable', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const lines = readFileSync(resolve(process.cwd(), 'training/risip_price_extraction.jsonl'), 'utf8')
      .trim().split(/\r?\n/);
    expect(lines.length).toBeGreaterThanOrEqual(12);
    for (const line of lines) {
      const row = JSON.parse(line) as { messages: Array<{ role: string; content: string }> };
      expect(row.messages).toHaveLength(3);
      expect(row.messages[2].role).toBe('assistant');
      const answer = JSON.parse(row.messages[2].content) as Record<string, unknown>;
      expect(answer).toHaveProperty('product');
      expect(answer).toHaveProperty('cost');
      expect(answer).toHaveProperty('retail_price');
      expect(answer).toHaveProperty('wholesale_price');
      expect(answer).toHaveProperty('wholesale_min_qty');
    }
  });

  it('parks a combined draft and saves both halves only after confirmation', async () => {
    const { readFileSync } = await import('node:fs');
    const { resolve } = await import('node:path');
    const webhook = readFileSync(resolve(process.cwd(), 'supabase/functions/whatsapp-webhook/index.ts'), 'utf8');
    const assistant = readFileSync(resolve(process.cwd(), 'supabase/functions/_shared/whatsappAssistant.ts'), 'utf8');
    expect(webhook).toContain("kind: 'price_and_cost_pending'");
    expect(webhook).toContain("const priceAndCostPending = convo?.awaiting === 'product_cost'");
    expect(webhook).toContain("db.rpc('wa_set_selling_prices'");
    expect(webhook).toContain("db.rpc('wa_set_product_costs'");
    expect(webhook).toContain('purchaseUnitsForProducts');
    expect(webhook).toContain("'clarification'");
    expect(assistant).toContain('catalogueContext');
    expect(assistant).toContain('const results:');
    expect(assistant).toContain('for (const call of calls)');
  });
});
