import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  ASSISTANT_TOOLS,
  runConversationalAssistant,
  type AssistantIdentityContext,
} from '../../../../supabase/functions/_shared/whatsappAssistant';
import {
  validateAiTransactionCandidate,
} from '../../../../supabase/functions/_shared/whatsappTransactionAi';
import { parseCreditQuantitySale } from '../../../../supabase/functions/_shared/whatsappCreditSale';
import { parseSaleMissingQuantity } from '../../../../supabase/functions/_shared/whatsappMissingQuantity';
import { parseQuantityOnlySale } from '../../../../supabase/functions/_shared/whatsappQuantitySale';
import {
  isDailyRecordCandidate,
  parseDailyRecord,
} from '../../../../supabase/functions/_shared/whatsappDailyRecords';

const src = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const webhook = src('supabase/functions/whatsapp-webhook/index.ts');

const context: AssistantIdentityContext = {
  identityId: 'identity-1', profileId: 'profile-1', companyId: 'company-1',
  companyName: 'Bucha Test', userName: 'Amina', role: 'owner', lang: 'sw',
  approvalFlowEnabled: false, reversalEnabled: false, payoutsEnabled: false,
};

afterEach(() => {
  vi.restoreAllMocks();
  delete (globalThis as { Deno?: unknown }).Deno;
});

describe('Phase 5 Part 8 structured transaction boundary', () => {
  it('accepts typo-tolerant language without accepting money from Claude', () => {
    const result = validateAiTransactionCandidate({
      kind: 'sale', party_name: null, payment_method: 'cash',
      lines: [{ product: 'nyama ya ngmbe', quantity: 2.5, unit: 'kilo' }],
      missing_fields: [], credit_wording: null, occurred_at_wording: null,
    });
    expect(result).toMatchObject({
      kind: 'transaction', paymentMethod: 'cash', credit: null,
      sale: { items: [{ productWithoutUnit: 'nyama ya ngmbe', spokenUnit: 'kilo', quantity: 2.5 }] },
    });
    expect(JSON.stringify(result)).not.toMatch(/unitPrice|total|amount|stock|cogs/i);
  });

  it('keeps credit, customer and null payment method intact', () => {
    expect(validateAiTransactionCandidate({
      kind: 'debt_issued', party_name: 'Juma', payment_method: null,
      lines: [{ product: 'nyama', quantity: 2, unit: 'kilo' }],
      missing_fields: [], credit_wording: 'hajalipa', occurred_at_wording: null,
    })).toMatchObject({
      kind: 'transaction', credit: { party: 'Juma' }, paymentMethod: null,
      sale: { items: [{ productWithoutUnit: 'nyama', spokenUnit: 'kilo', quantity: 2 }] },
    });
  });

  it.each([
    ['package wording', [{ product: 'mbwa', quantity: 4, unit: 'kifuko' }]],
    ['multi-product wording', [
      { product: 'nyama', quantity: 2, unit: 'kilo' },
      { product: 'soseji', quantity: 5, unit: null },
    ]],
  ])('preserves every language line for backend resolution: %s', (_label, lines) => {
    const result = validateAiTransactionCandidate({
      kind: 'sale', party_name: null, payment_method: 'cash', lines,
      missing_fields: [], credit_wording: null, occurred_at_wording: null,
    });
    expect(result?.kind).toBe('transaction');
    if (result?.kind === 'transaction') expect(result.sale.items).toHaveLength(lines.length);
  });

  it('reuses the Part 6 quantity state when quantity is genuinely missing', () => {
    expect(validateAiTransactionCandidate({
      kind: 'sale', party_name: null, payment_method: 'mobile_money',
      lines: [{ product: 'soseji', quantity: null, unit: null }],
      missing_fields: ['quantity'], credit_wording: null, occurred_at_wording: null,
    })).toEqual({
      kind: 'missing_quantity',
      wanted: {
        kind: 'quantity_wanted', ledger: 'sale', product: 'soseji',
        party: null, paymentMethod: 'mobile_money',
      },
    });
  });

  it.each([
    { kind: 'sale', party_name: null, payment_method: 'cash', lines: [{ product: 'nyama', quantity: -2, unit: 'kilo' }], missing_fields: [], credit_wording: null, occurred_at_wording: null },
    { kind: 'sale', party_name: null, payment_method: 'crypto', lines: [{ product: 'nyama', quantity: 2, unit: 'kilo' }], missing_fields: [], credit_wording: null, occurred_at_wording: null },
    { kind: 'refund', party_name: null, payment_method: null, lines: [{ product: 'nyama', quantity: 2, unit: 'kilo' }], missing_fields: [], credit_wording: null, occurred_at_wording: null },
    { kind: 'sale', party_name: null, payment_method: 'cash', lines: [{ product: 'nyama', quantity: 2, unit: 'kilo', price: 12000 }], missing_fields: [], credit_wording: null, occurred_at_wording: null },
    { kind: 'sale', party_name: null, payment_method: 'cash', lines: [{ product: 'nyama', quantity: 2, unit: 'kilo' }], total: 24000, missing_fields: [], credit_wording: null, occurred_at_wording: null },
  ])('rejects malicious or unsupported model output %#', (candidate) => {
    expect(validateAiTransactionCandidate(candidate)).toBeNull();
  });

  it('offers a strict schema with no price, amount, total or stock fields', () => {
    const definition = ASSISTANT_TOOLS.find((tool) => tool.name === 'propose_catalogue_transaction');
    expect(definition?.strict).toBe(true);
    const schema = JSON.stringify(definition?.input_schema);
    expect(schema).not.toMatch(/unit_price|unit_amount|total|amount|stock|cogs|product_id/i);
  });
});

describe('mocked Claude tool call and deterministic revalidation wiring', () => {
  it('accepts only structured language and terminates on the server preview', async () => {
    (globalThis as { Deno?: unknown }).Deno = {
      env: { get: (name: string) => name === 'ANTHROPIC_API_KEY' ? 'test-key' : undefined },
    };
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({ data: [{ id: 'claude-haiku-4-5-20251001' }] }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({
        stop_reason: 'tool_use',
        content: [{
          type: 'tool_use', id: 'tx-1', name: 'propose_catalogue_transaction',
          input: {
            kind: 'sale', party_name: null, payment_method: 'cash',
            lines: [{ product: 'nyama ya ngmbe', quantity: 2.5, unit: 'kilo' }],
            missing_fields: [], credit_wording: null, occurred_at_wording: null,
          },
        }],
      }), { status: 200 }));
    const executeTool = vi.fn(async (_name: string, input: Record<string, unknown>) => {
      expect(validateAiTransactionCandidate(input)?.kind).toBe('transaction');
      return { content: 'backend priced preview', terminalReply: 'Nimeelewa. Thibitisha mauzo.' };
    });
    const result = await runConversationalAssistant({
      context, history: [], userText: 'nimeuza nyama ya ngmbe kilo mbili na nusu cash', executeTool,
    });
    expect(executeTool).toHaveBeenCalledOnce();
    expect(result).toMatchObject({
      reply: 'Nimeelewa. Thibitisha mauzo.',
      toolNames: ['propose_catalogue_transaction'], usedSafeFallback: false,
    });
  });

  it('routes validated language through the existing catalogue resolver and pricing function', () => {
    const branch = webhook.slice(
      webhook.indexOf("if (name === 'propose_catalogue_transaction')"),
      webhook.indexOf("if (name === 'propose_daily_record')"),
    );
    expect(branch).toContain('validateAiTransactionCandidate(input)');
    expect(branch).toContain('resolveProductForRead(db, identity');
    expect(branch).toContain('await priceQuantitySale(');
    expect(branch).toContain('await createDailyRecordDraft(');
    expect(branch.indexOf('await priceQuantitySale(')).toBeLessThan(branch.indexOf('await createDailyRecordDraft('));
    expect(branch).toContain("if (priced.kind === 'unknown')");
    expect(branch).toContain("if (priced.kind === 'blocked')");
    expect(branch).toContain("awaiting: 'daily_record_quantity'");
  });

  it('keeps ordinary supported messages entirely deterministic', () => {
    expect(parseQuantityOnlySale('nimeuza nyama kilo 2 na soseji 5 cash')).not.toBeNull();
    expect(parseCreditQuantitySale('Juma kachukua nyama kilo 2 na za mbwa 3 hajalipa')).not.toBeNull();
    expect(parseSaleMissingQuantity('nimeuza soseji')).not.toBeNull();
    // These parsers are still here and still exact. They are no longer the
    // gatekeepers: the model reads first, and they catch what it cannot.
    expect(webhook).toContain('deterministicCatalogueTransaction');
    expect(webhook).toContain('parseSaleMissingQuantity(body)');
    expect(webhook).toContain('parseCreditQuantitySale(body)');
    expect(webhook).toContain('parseQuantityOnlySale(body)');
  });

  it.each([
    'Jana nimetoa ngombe kilo mbili na nusu cash',
    'nimetoa nyama kilo 2, soseji tano na maziwa lita 3 cash',
  ])('hands an actually unreadable transaction to Claude: %s', (said) => {
    const record = isDailyRecordCandidate(said) ? parseDailyRecord(said, 'sw') : null;
    const deterministicRecord = Boolean(record)
      && !(record?.kind === 'clarify' && record.reason === 'message');
    const deterministicCatalogue = Boolean(
      parseSaleMissingQuantity(said)
      || parseCreditQuantitySale(said)
      || parseQuantityOnlySale(said),
    );
    expect(deterministicRecord || deterministicCatalogue).toBe(false);
  });

  it.each([
    'Juma kachukua nyama kama kilo mbili hajalipa',
    'za mbwa nimeuza vifuko vinne',
  ])('does not spend AI budget when an existing parser understands it: %s', (said) => {
    const record = isDailyRecordCandidate(said) ? parseDailyRecord(said, 'sw') : null;
    const deterministicRecord = Boolean(record)
      && !(record?.kind === 'clarify' && record.reason === 'message');
    const deterministicCatalogue = Boolean(
      parseSaleMissingQuantity(said)
      || parseCreditQuantitySale(said)
      || parseQuantityOnlySale(said),
    );
    expect(deterministicRecord || deterministicCatalogue).toBe(true);
  });

  it('keeps vocabulary bounded and company scoped without exposing prices', () => {
    const loader = webhook.slice(
      webhook.indexOf('async function loadVocabularyContext'),
      webhook.indexOf('function assistantIdentityContext'),
    );
    expect(loader).toContain("db.rpc('wa_company_vocabulary', { p_company_id: identity.company_id })");
    expect(loader).toContain("db.rpc('company_product_names', { p_company_id: identity.company_id })");
    expect(loader).toContain('.slice(0, 60)');
    expect(loader).toContain('.slice(0, 6000)');
    expect(loader).not.toMatch(/unit_cost|unit_price|retail_price|wholesale_price/);
  });
});
