import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  extractPaymentMethod,
  parsePaymentMethodAnswer,
  paymentMethodLabel,
  statesCredit,
} from '../../../../supabase/functions/_shared/whatsappPaymentMethod';

// RISIP BUCHA, PHASE 5 — how the trader says they were paid.
//
// Manually recorded metadata and nothing else. No provider is contacted, no
// payment is verified, and no gateway exists to contact. Risip is writing down
// what somebody told it, exactly as a paper daftari would.

const webhook = readFileSync(
  resolve(process.cwd(), 'supabase/functions/whatsapp-webhook/index.ts'), 'utf8');

describe('reading a payment method out of a sale', () => {
  it.each([
    ['nimeuza nyama kilo 2 cash', 'cash'],
    ['nimeuza nyama kilo 2 mpesa', 'mobile_money'],
    ['nimeuza nyama kilo 2 M-Pesa', 'mobile_money'],
    ['nimeuza nyama kilo 2 mobile money', 'mobile_money'],
    ['nimeuza nyama kilo 2 airtel money', 'mobile_money'],
    ['nimeuza nyama kwa simu', 'mobile_money'],
    ['nimeuza nyama kilo 2 benki', 'bank'],
    ['nimeuza nyama kilo 2 bank transfer', 'bank'],
  ])('reads %s as %s', (said, method) => {
    expect(extractPaymentMethod(said)?.method).toBe(method);
  });

  it('leaves the rest of the sentence for the parsers that follow', () => {
    expect(extractPaymentMethod('nimeuza nyama kilo 2 cash')?.rest).toBe('nimeuza nyama kilo 2');
  });
});

describe('what the trader did not say stays unsaid', () => {
  // The safety property of this whole file. A shop that writes "nimeuza nyama
  // kilo 2" has said WHAT it sold and not HOW it was paid, and filling that in
  // would invent the one fact they chose to leave out.
  it('never defaults to cash', () => {
    expect(extractPaymentMethod('nimeuza nyama kilo 2')).toBeNull();
    expect(extractPaymentMethod('nimeuza soseji 8')).toBeNull();
    expect(extractPaymentMethod('maziwa 4')).toBeNull();
  });

  it('stores null rather than a guess', () => {
    expect(webhook).toContain('p_payment_method: withPayment.paymentMethod ?? null,');
  });
});

describe('credit is not a way of being paid', () => {
  // "Deni" already has an accounting meaning — debt_issued — and letting it in
  // here would give one fact two incompatible representations.
  it.each([
    'Juma kachukua za mbwa 3 hajalipa',
    'nimeuza nyama kilo 3 kwa deni',
    'Juma amechukua nyama kilo 2 atalipa kesho',
    'nimeuza soseji 5 kwa mkopo',
  ])('refuses to read a method from %s', (said) => {
    expect(statesCredit(said)).toBe(true);
    expect(extractPaymentMethod(said)).toBeNull();
  });

  it('is not an accepted answer to "how were you paid"', () => {
    expect(parsePaymentMethodAnswer('deni')).toBeNull();
  });

  it('is refused by the database itself, not only by this parser', () => {
    const migration = readFileSync(
      resolve(process.cwd(), 'supabase/migrations/0121_bucha_ledger_functions.sql'), 'utf8');
    expect(migration).toContain("hint = 'deni_is_not_a_payment_method'");
  });
});

describe('a bare answer to a question that was asked', () => {
  it.each([['cash', 'cash'], ['mpesa', 'mobile_money'], ['benki', 'bank']] as const)(
    'reads %s', (said, method) => {
      expect(parsePaymentMethodAnswer(said)).toBe(method);
    });

  it('is not mistaken for a sale when it stands alone in a sale parser', () => {
    // "cash" on its own is an answer, not a sale, so the extractor refuses it
    // and the flow that asked owns the reply.
    expect(extractPaymentMethod('cash')).toBeNull();
  });

  it('refuses a whole sentence', () => {
    expect(parsePaymentMethodAnswer('nimeuza nyama kilo 3 kesho')).toBeNull();
  });
});

describe('where it is applied', () => {
  it('uses one shared extractor for drafting and parked multi-product context', () => {
    expect(webhook).toContain('const stated = extractPaymentMethod(said);');
    expect(webhook).toContain('extractPaymentMethod(writeBody)?.method');
    // Import + the central drafting helper + the one pre-draft context capture.
    // Individual language parsers still never apply payment methods themselves.
    expect(webhook.split('extractPaymentMethod').length - 1).toBe(3);
  });

  it('never overrides a method the flow already established', () => {
    // A flow that asked "ulilipwaje?" and got an answer always wins.
    expect(webhook).toContain('canonical.paymentMethod === undefined || canonical.paymentMethod === null');
  });

  it('calls no payment provider anywhere', () => {
    const shared = readFileSync(
      resolve(process.cwd(), 'supabase/functions/_shared/whatsappPaymentMethod.ts'), 'utf8');
    expect(shared).not.toContain('fetch(');
    expect(shared).not.toContain('http');
  });
});

describe('how it reads back', () => {
  it('speaks the shop’s language', () => {
    expect(paymentMethodLabel('mobile_money', 'sw')).toBe('simu');
    expect(paymentMethodLabel('mobile_money', 'en')).toBe('mobile money');
    expect(paymentMethodLabel(null, 'sw')).toBe('');
  });
});
