import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseCreditQuantitySale } from '../../../../supabase/functions/_shared/whatsappCreditSale';
import { parseQuantityOnlySale } from '../../../../supabase/functions/_shared/whatsappQuantitySale';

const src = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const webhook = src('supabase/functions/whatsapp-webhook/index.ts');

describe('Phase 5 Part 7 multi-product language path', () => {
  it('reads two products and leaves pricing to the backend pipeline', () => {
    const sale = parseQuantityOnlySale('nimeuza nyama kilo 2 na soseji 5 cash');
    expect(sale?.items).toMatchObject([
      { product: 'nyama kilo', productWithoutUnit: 'nyama', spokenUnit: 'kilo', quantity: 2 },
      { product: 'soseji', quantity: 5 },
    ]);
    expect(sale?.items.every((line) => !('unitPrice' in line) && !('total' in line))).toBe(true);
  });

  it('reads two products whose units are supplied by company configuration later', () => {
    expect(parseQuantityOnlySale('nimeuza maziwa 3 na soseji 4')?.items).toMatchObject([
      { product: 'maziwa', quantity: 3 },
      { product: 'soseji', quantity: 4 },
    ]);
  });

  it('keeps a leading measure attached to its own line in a multi-product sale', () => {
    expect(parseQuantityOnlySale('nimeuza vifuko 4 vya mbwa na soseji 2 cash')?.items).toMatchObject([
      { product: 'mbwa', productWithoutUnit: 'mbwa', spokenUnit: 'kifuko', quantity: 4 },
      { product: 'soseji', quantity: 2 },
    ]);
  });

  it('does not regress the ambiguous bare-list guard', () => {
    expect(parseQuantityOnlySale('nimeuza trei 3 na mayai 15')?.items).toMatchObject([
      { product: 'trei', quantity: 3 },
      { product: 'mayai', quantity: 15 },
    ]);
  });

  it('keeps every unresolved product in the parsed transaction', () => {
    expect(parseQuantityOnlySale('nimeuza nyama kilo 2 na bidhaa-isiyojulikana 4')?.items)
      .toMatchObject([
        { product: 'nyama kilo', quantity: 2 },
        { product: 'bidhaa-isiyojulikana', quantity: 4 },
      ]);
    expect(webhook).toContain("if (unknown.length > 0) {");
    expect(webhook).toContain('resolvedProducts: [...new Set(resolvedItems.map((item) => item.name))]');
  });

  it('parses generic product labels independently before unit validation', () => {
    expect(parseQuantityOnlySale('nimeuza product-A 2 na product-B 3')?.items)
      .toMatchObject([
        { product: 'product-A', quantity: 2 },
        { product: 'product-B', quantity: 3 },
      ]);
  });
});

describe('Phase 5 Part 7 multi-product credit language path', () => {
  it('keeps one debtor and every product in the same credit transaction', () => {
    const credit = parseCreditQuantitySale(
      'Juma kachukua nyama kilo 2 na za mbwa 3 hajalipa',
    );
    expect(credit?.party).toBe('Juma');
    expect(credit?.sale.items).toMatchObject([
      { product: 'nyama kilo', productWithoutUnit: 'nyama', spokenUnit: 'kilo', quantity: 2 },
      { product: 'za mbwa', quantity: 3 },
    ]);
  });

  it('continues to reject a paid sale and a sentence without credit words', () => {
    expect(parseCreditQuantitySale('nimeuza nyama kilo 2 na soseji 5 cash')).toBeNull();
    expect(parseCreditQuantitySale('Juma kachukua nyama kilo 2 na soseji 5')).toBeNull();
  });
});

describe('one backend pricing and one draft', () => {
  it('loops all lines through priceQuantitySale before one draft is created', () => {
    expect(webhook).toContain('for (const [at, item] of sale.items.entries())');
    expect(webhook).toContain("if (unknown.length > 0) {");
    expect(webhook).toContain('resolvedProducts: [...new Set(resolvedItems.map((item) => item.name))]');
    expect(webhook).toContain("kind: credit ? 'debt_issued' : 'sale',");
    expect(webhook).toContain('const amount = Math.round(lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0) * 100) / 100;');
    expect(webhook).not.toContain('priceMultiProductSale');
  });

  it('blocks a line whose configured unit is ambiguous instead of guessing', () => {
    expect(webhook).toContain('if (!item.spokenUnit && forProduct.length > 1)');
    expect(webhook).toContain('portionUnitRequired(');
  });

  it('preserves whole-transaction credit and payment context across clarification', () => {
    expect(webhook).toContain('credit: quantityCredit,');
    expect(webhook).toContain('paymentMethod: quantityPaymentMethod,');
    expect(webhook).toContain('resumedQuantityCredit = comboPending.credit ?? null;');
    expect(webhook).toContain('resumedQuantityCredit = bandPending.credit ?? null;');
    expect(webhook).toContain('credit: newProductSaleSetup.credit ?? null,');
    expect(webhook).toContain('const recordWithPayment = quantityPaymentMethod');
  });
});
