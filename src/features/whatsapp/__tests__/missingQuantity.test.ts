import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  parseQuantityAnswer,
  parseSaleMissingQuantity,
  quantityQuestion,
  quantityUnitQuestion,
} from '../../../../supabase/functions/_shared/whatsappMissingQuantity';

const src = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const webhook = src('supabase/functions/whatsapp-webhook/index.ts');
const migration = src('supabase/migrations/0132_a_question_about_how_many.sql');

describe('a sale that names goods but omits quantity', () => {
  it('remembers the sale intent without inventing money', () => {
    expect(parseSaleMissingQuantity('nimeuza soseji')).toEqual({
      kind: 'quantity_wanted',
      ledger: 'sale',
      product: 'soseji',
      party: null,
      paymentMethod: null,
    });
  });

  it.each([
    ['nimeuza soseji cash', 'cash'],
    ['nimeuza nyama mpesa', 'mobile_money'],
  ] as const)('preserves the payment method in %s', (said, method) => {
    expect(parseSaleMissingQuantity(said)?.paymentMethod).toBe(method);
  });

  it('keeps a credit sale and its customer distinct from a paid sale', () => {
    expect(parseSaleMissingQuantity('Juma kachukua za mbwa hajalipa')).toEqual({
      kind: 'quantity_wanted',
      ledger: 'debt_issued',
      product: 'za mbwa',
      party: 'Juma',
      paymentMethod: null,
    });
  });

  it.each([
    'nimeuza soseji 5',
    'nimeuza kilo',
    'Juma kachukua nyama kilo 2 hajalipa',
    'leo nimeuza kiasi gani',
  ])('does not claim an ordinary or incomplete unrelated message: %s', (said) => {
    expect(parseSaleMissingQuantity(said)).toBeNull();
  });
});

describe('the quantity follow-up', () => {
  it.each([
    ['5', { quantity: 5, unit: null }],
    ['kilo mbili', { quantity: 2, unit: 'kilo' }],
    ['2 kilo', { quantity: 2, unit: 'kilo' }],
  ] as const)('reads %s as quantity, not money', (said, expected) => {
    expect(parseQuantityAnswer(said)).toEqual(expected);
  });

  it.each(['0', '-2', '100001', 'abc', 'leo nimeuza kiasi gani'])
    ('refuses an unsafe or unrelated follow-up: %s', (said) => {
      expect(parseQuantityAnswer(said)).toBeNull();
    });

  it('asks the single configured unit concisely and shows the escape', () => {
    expect(quantityQuestion('Nyama', 'kilo', 'sw')).toBe('*Nyama* kilo ngapi? Ukiamua kuacha, andika *GHAIRI*.');
  });

  it('asks for the unit when the catalogue has several valid choices', () => {
    const question = quantityUnitQuestion('Mafuta', ['robo', 'nusu', 'lita'], 'sw');
    expect(question).toContain('robo, nusu, lita');
    expect(question).toContain('kipimo kipi');
  });
});

describe('conversation-state safety and normal pipeline reuse', () => {
  const quantityBlock = webhook.slice(
    webhook.indexOf('if (quantityPending) {'),
    webhook.indexOf('if (productSetupPending) {'),
  );

  it('adds one explicit awaiting state to the existing conversation table', () => {
    expect(migration).toContain("'daily_record_quantity'");
    expect(webhook).toContain("convo?.awaiting === 'daily_record_quantity'");
    expect(webhook).toContain("awaiting: 'daily_record_quantity'");
  });

  it('stores canonical product wording and no financial result', () => {
    expect(webhook).toContain('...wantsQuantity, product: match.productName, occurredAt: wantedDate.occurredAt');
    expect(quantityBlock).not.toContain('amount:');
    expect(quantityBlock).not.toContain('price:');
    expect(quantityBlock).not.toContain('createDailyRecordDraft');
  });

  it('re-enters the shared product, unit and pricing pipeline', () => {
    expect(quantityBlock).toContain('resumedQuantitySale = {');
    expect(webhook).toContain('const quantitySale = resumedQuantitySale ?? creditSale?.sale');
    expect(webhook).toContain('const priced = await priceQuantitySale(');
    expect(webhook).toContain('const quantityCredit = resumedQuantityCredit');
    expect(webhook).toContain('?? (creditSale ? { party: creditSale.party } : null);');
    expect(webhook).toContain('const quantityPaymentMethod = resumedQuantityPaymentMethod');
    expect(webhook).toContain('const recordWithPayment = quantityPaymentMethod');
  });

  it('only reads a bare number inside a live quantity conversation', () => {
    expect(webhook.split('parseQuantityAnswer(body ??').length - 1).toBe(1);
    expect(webhook).toContain("if (new Date(data.expires_at as string).getTime() < Date.now())");
    expect(webhook).toContain("if (startsAnotherTopic(body ?? ''))");
    expect(webhook).toContain("'quantity_wanted', 'topic_change', 'skipped'");
  });

  it('does not let the generic amount parser steal the resumed bare number', () => {
    expect(webhook).toContain('const namesNoMoney = resumedQuantitySale !== null');
  });
});
