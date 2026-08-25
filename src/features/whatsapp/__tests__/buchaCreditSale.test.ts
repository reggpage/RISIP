import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { parseCreditQuantitySale } from '../../../../supabase/functions/_shared/whatsappCreditSale';

// PHASE 5 PART 4 — goods that walked out unpaid.
//
// A credit sale is a sale of the same goods at the same price off the same
// shelf. The only things that differ are whose name is on it and that the money
// has not arrived, so the wrapper is read here and the GOODS go through the
// ordinary quantity parser.
//
// Proven end to end against production, rolled back:
//
//   draft                  debt_issued | 6000.00 | Juma | pay=NULL | pending
//   line                   Chakula cha mbwa | 3.000 kifuko | base 3.000000 kilo
//   stock while pending    0 (was 0)
//   stock after confirm    -3.000000
//   Juma owes              6000.00
//   stock after void       0
//   Juma owes after void   0
//   audit rows             3 (created,confirmed,voided)

const src = (path: string) => readFileSync(resolve(process.cwd(), path), 'utf8');
const webhook = src('supabase/functions/whatsapp-webhook/index.ts');

const credit = (said: string) => {
  const reading = parseCreditQuantitySale(said);
  expect(reading, said).not.toBeNull();
  return reading!;
};

describe('reading who took what', () => {
  it('reads the alias wording with no measure stated', () => {
    const reading = credit('Juma kachukua za mbwa 3 hajalipa');
    expect(reading.party).toBe('Juma');
    expect(reading.sale.items[0]).toMatchObject({ product: 'za mbwa', quantity: 3 });
    expect(reading.sale.items[0].spokenUnit ?? null).toBeNull();
  });

  it('reads an explicit package the same way a paid sale does', () => {
    const reading = credit('Juma kachukua vifuko 3 vya mbwa hajalipa');
    expect(reading.party).toBe('Juma');
    expect(reading.sale.items[0]).toMatchObject({
      product: 'mbwa', quantity: 3, spokenUnit: 'kifuko',
    });
  });

  it.each([
    ['Juma kachukua nyama kilo 2 kwa deni', 'Juma', 'kwa deni'],
    ['Juma kachukua soseji 5 atalipa kesho', 'Juma', 'atalipa kesho'],
    ['Asha amechukua maziwa 4 hajalipa', 'Asha', 'hajalipa'],
  ])('reads %s', (said, party, tail) => {
    const reading = credit(said);
    expect(reading.party).toBe(party);
    expect(reading.said).toBe(tail);
  });
});

describe('what is not a customer taking goods on credit', () => {
  it.each([
    // A loan from a bank is not a customer's debt, and one word must not decide
    // that it is.
    'nimechukua mkopo benki 500000',
    // No unpaid words at all: this may be a sale, a movement, or nothing.
    'Juma kachukua nyama kilo 2',
    'nimeuza nyama kilo 2 cash',
    'nyama kilo 3 imeharibika',
  ])('refuses %s', (said) => {
    expect(parseCreditQuantitySale(said)).toBeNull();
  });

  it('will not invent a customer out of a sentence', () => {
    // The name must look like a name — one or two words, no digits.
    expect(parseCreditQuantitySale('leo asubuhi mteja mmoja kachukua nyama 2 hajalipa')).toBeNull();
  });
});

describe('one pricing engine, two ledger classifications', () => {
  it('prices credit through the same function as a paid sale', () => {
    expect(webhook).toContain('const creditSale = resumedQuantitySale ? null : parseCreditQuantitySale(writeBody);');
    expect(webhook).toContain('const quantityCredit = resumedQuantityCredit');
    expect(webhook).toContain('?? (creditSale ? { party: creditSale.party } : null);');
    expect(webhook).toContain('quantityCredit,');
    // priceQuantitySale is also called by the resume paths, after a band or
    // combination question has been answered. What matters is that there is no
    // SECOND pricing function, and that credit enters through the same one.
    expect(webhook).not.toContain('priceCreditSale');
    expect(webhook.split('creditSale ? { party: creditSale.party } : null').length - 1).toBe(1);
  });

  it('differs only in kind and party', () => {
    expect(webhook).toContain("kind: credit ? 'debt_issued' : 'sale',");
    expect(webhook).toContain('partyName: credit?.party ?? null,');
  });

  it('never turns credit into a payment method', () => {
    const payment = src('supabase/functions/_shared/whatsappPaymentMethod.ts');
    expect(payment).toContain('if (statesCredit(said)) return null;');
    const ledger = src('supabase/migrations/0121_bucha_ledger_functions.sql');
    expect(ledger).toContain("hint = 'deni_is_not_a_payment_method'");
  });
});

describe('goods that leave on credit still leave', () => {
  const migration = src('supabase/migrations/0129_goods_that_leave_on_credit_still_leave.sql');

  // MEASURED: three bags walked out and the shelf never moved. debt_issued was
  // not among the kinds wa_stock_on_hand counted.
  it('counts a credit sale as sold', () => {
    expect(migration).toContain("where r.kind in ('sale', 'debt_issued')");
    expect(migration).toContain("r.kind in ('sale', 'debt_issued', 'stock_purchase', 'stock_loss', 'owner_use')");
  });

  // The compounding cause: the trigger stored no base quantity for any kind
  // except sale and stock_purchase, so the stock functions fell back to the raw
  // number. Right by accident for a base unit; wrong for "3 kifuko", and phase
  // 2's stock_loss and owner_use had been relying on that accident.
  it('snapshots the base quantity for every kind that moves stock', () => {
    expect(migration).toContain(
      "v_moves_stock := v_kind in ('sale', 'debt_issued', 'stock_purchase', 'stock_loss', 'owner_use');");
    expect(migration).toContain("v_needs_sale_unit := v_kind in ('sale', 'debt_issued');");
  });

  it('lets a shop lose a measure it never intended to sell', () => {
    // A sack can spoil even where the shop only ever sells by the kilo.
    expect(migration).toContain('(not v_needs_sale_unit and not v_needs_purchase_unit)');
  });
});

describe('a void explains itself', () => {
  const migration = src('supabase/migrations/0128_a_void_explains_itself.sql');

  // The earlier functional failure was the TEST's fault: is_meaningful_reason
  // requires twenty characters and "functional test" is fifteen. But it exposed
  // a real gap — the WhatsApp path never checked, so a short reason from a real
  // trader came back as a raw constraint violation.
  it('keeps the trader’s words when they are usable, and never explodes', () => {
    expect(migration).toContain('when v_said is not null and private.is_meaningful_reason(v_said) then v_said');
    expect(migration).toContain("else 'Imefutwa na mwenye biashara kupitia WhatsApp'");
  });

  it('keeps the words even when they were too short to store', () => {
    expect(migration).toContain("'said', v_said");
  });

  it('writes the audit row the app path always wrote', () => {
    expect(migration).toContain('insert into public.daily_record_audit_log');
    expect(migration).toContain("'voided', v_record.status, 'voided', v_stored");
  });
});
