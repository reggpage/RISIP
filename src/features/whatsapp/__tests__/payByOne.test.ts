import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  MAX_CHARGE_TZS,
  providerForPhone,
  splitName,
} from '../../../../supabase/functions/_shared/snippePayment';
import { billingAskProvider } from '../../../../supabase/functions/_shared/billingMessages';

// "1" AGAINST A BILL, AND THE NETWORK IT HAS TO RING.
//
// MEASURED on the first live payment: a request with no provider was accepted,
// returned 201 and pending, and produced a USSD prompt the owner never saw.
// Silence in a payment flow does not read as a wrong guess, it reads as a
// broken product. So the network is required, guessed only where the guess is
// safe, and asked for otherwise.

const webhook = readFileSync(
  resolve(process.cwd(), 'supabase/functions/whatsapp-webhook/index.ts'), 'utf8');

describe('which network a number is on', () => {
  it('reads the four Tanzanian networks', () => {
    expect(providerForPhone('255754000000')).toBe('mpesa');
    expect(providerForPhone('255789000000')).toBe('airtel');
    expect(providerForPhone('255712000000')).toBe('mixx');
    expect(providerForPhone('255620000000')).toBe('halotel');
  });

  it('reads the same number however it is written', () => {
    for (const written of ['0624107354', '255624107354', '+255 624 107 354', '+255-624-107-354']) {
      expect(providerForPhone(written)).toBe('halotel');
    }
  });

  it('returns NULL rather than guessing at an unknown prefix', () => {
    // The whole point. A wrong guess is a prompt that rings nobody, which is
    // the exact failure this replaced.
    expect(providerForPhone('255990000000')).toBeNull();
    expect(providerForPhone('255110000000')).toBeNull();
  });

  it('returns null for anything that is not a Tanzanian number', () => {
    expect(providerForPhone('')).toBeNull();
    expect(providerForPhone('25575400')).toBeNull();
    expect(providerForPhone('2557540000001234')).toBeNull();
    expect(providerForPhone('not a phone')).toBeNull();
  });

  it('asks, with numbers, when it cannot tell', () => {
    const asked = billingAskProvider('sw');
    expect(asked).toContain('*1* M-Pesa');
    expect(asked).toContain('*4* Halopesa');
    expect(asked).toContain('*GHAIRI*');
  });
});

describe('the name on the payment', () => {
  it('splits at the last space', () => {
    expect(splitName('Angela Benedict Kessy'))
      .toEqual({ firstname: 'Angela Benedict', lastname: 'Kessy' });
  });

  it('lets one name fill both fields rather than failing the payment', () => {
    // One name is a real answer in Tanzania, and Snippe requires both.
    expect(splitName('Reagan')).toEqual({ firstname: 'Reagan', lastname: 'Reagan' });
  });

  it('hands back empty strings for nothing, instead of throwing mid-payment', () => {
    expect(splitName(null)).toEqual({ firstname: '', lastname: '' });
    expect(splitName('   ')).toEqual({ firstname: '', lastname: '' });
  });
});

describe('the branch that reads "1"', () => {
  const marker = '        // "1" AGAINST A BILL.';
  const branch = webhook.slice(webhook.indexOf(marker), webhook.indexOf(marker) + 4200);

  it('exists', () => {
    expect(webhook.indexOf(marker)).toBeGreaterThan(-1);
  });

  it('never steals a "1" that belongs to another question', () => {
    // MAUZO/ONGEZA/SAJILI and the two-name product choice both answer with
    // "1". Requiring no parked conversation is what keeps them apart.
    expect(branch).toContain('if (!convo && identity?.company_id && parseBillingAnswer(body) === \'pay\')');
  });

  it('does nothing without an OPEN invoice', () => {
    expect(branch).toContain(".eq('status', 'open')");
    expect(branch).toContain('if (openInvoice) {');
  });

  it('asks the network rather than guessing when the prefix is unknown', () => {
    expect(branch).toContain('const provider = providerForPhone(phone);');
    expect(branch).toContain('billingAskProvider(lang)');
  });

  it('starts a NEW payment on every repeat, because the last one expires', () => {
    expect(branch).toContain('attempt: Number(openInvoice.attempts ?? 0) + 1');
  });

  it('stores the reference Snippe returns, which is the only link back', () => {
    expect(branch).toContain('snippe_reference: result.reference');
  });

  it('marks NOTHING paid', () => {
    // Only the signed webhook may say a month was bought. If this branch could
    // do it, a shopkeeper typing "1" would be granting himself a month.
    expect(branch).not.toContain("status: 'paid'");
    expect(branch).not.toContain('paid_at');
    expect(branch).not.toContain("from('subscriptions').update");
  });

  it('tells him the prompt is coming, so silence is never a mystery', () => {
    expect(branch).toContain('billingPushSent(lang)');
    expect(branch).toContain('billingPushFailed(lang)');
  });
});

describe('the ceiling on any single charge', () => {
  it('is one number, in one place', () => {
    expect(MAX_CHARGE_TZS).toBe(200_000);
  });

  it('is above the dearest plan and far below a hundredfold slip', () => {
    expect(MAX_CHARGE_TZS).toBeGreaterThan(70_000);
    expect(MAX_CHARGE_TZS).toBeLessThan(70_000 * 100);
  });
});
