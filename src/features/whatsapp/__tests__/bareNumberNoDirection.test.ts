import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// A BARE NUMBER MUST NOT RE-TRIGGER THE DIRECTION QUESTION.
//
// MEASURED, telemetry 14:03. "Ongeza Nguvu ya Sala 10 stoo" was drafted as a
// stock_purchase and asked its cost. The owner answered "80000". The model
// understood it and re-drafted the purchase with the amount — but the server
// then re-derived the direction from the raw message "80000", found no
// direction word in it, and asked MAUZO/ONGEZA/SAJILI all over again.
//
// The direction was stated in the ORIGINAL message and the model carried it;
// an amount answer cannot un-state it. The MAUZO/ONGEZA/SAJILI question exists
// to disambiguate a FRESH product-quantity list, and a message that is only a
// number is never one.

const webhook = readFileSync(
  resolve(process.cwd(), 'supabase/functions/whatsapp-webhook/index.ts'), 'utf8');

// The exact predicate the guard uses, lifted so its behaviour is pinned.
const messageIsOnlyANumber = (said: string) => /^[\s]*[\d][\d.,\s]*$/.test(said);

describe('what counts as "only a number"', () => {
  it('is true for the amount answers a shopkeeper types', () => {
    for (const said of ['80000', '80,000', ' 80000 ', '1000', '5', '12.5', '80 000']) {
      expect(messageIsOnlyANumber(said)).toBe(true);
    }
  });

  it('is false for a real product-quantity list, which still needs the question', () => {
    for (const said of ['Nguvu ya Sala 10', 'daftari 10\nkalamu 5', 'nguvu 10 stoo', 'ongeza 10']) {
      expect(messageIsOnlyANumber(said)).toBe(false);
    }
  });

  it('is false for empty, so nothing odd happens on a blank', () => {
    expect(messageIsOnlyANumber('')).toBe(false);
    expect(messageIsOnlyANumber('   ')).toBe(false);
  });
});

describe('the guard is wired into the direction gate', () => {
  it('excludes a bare number from re-triggering the question', () => {
    expect(webhook).toContain('const messageIsOnlyANumber = /^[\s]*[\d][\d.,\s]*$/.test(String(said ?? \'\'));');
    expect(webhook).toContain('&& !messageIsOnlyANumber');
  });

  it('records why, so nobody removes it and reopens the loop', () => {
    expect(webhook).toContain('A BARE NUMBER IS NEVER AN AMBIGUOUS PRODUCT LIST.');
    expect(webhook).toContain('the amount answer cannot un-state it');
  });
});
