import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// MONEY GOING OUT, RECORDED AS MONEY COMING IN.
//
// The owner found this by asking, not by being burned: "kama hapa nikijibu
// manunuzi je ai itajua manunuzi kwa bidhaa zote au hizo mpya?"
//
// The honest answer was: neither. It knew about all eleven and would have
// written every one of them down as a SALE. priceQuantitySale builds
// `kind: credit ? 'debt_issued' : 'sale'`, and the resume path had no idea a
// direction had ever been chosen — pendingDirection was stored one commit
// earlier and never read anywhere.
//
// So: answer MANUNUZI, give the prices for the two new products, and eleven
// products land in the ledger as today's takings. The figure is real, the
// arithmetic is right, and it is on the wrong side of the books.
//
// A registration is an interruption. Everything already decided has to survive
// it — and the decision that matters most is the one that says which way the
// money moved.

const webhook = readFileSync(
  resolve(process.cwd(), 'supabase/functions/whatsapp-webhook/index.ts'), 'utf8');

describe('the answer survives the interruption', () => {
  it('is carried into the pricing state, not just parked and forgotten', () => {
    const carry = webhook.slice(
      webhook.indexOf('// THE EXACT LINE WHERE NINE PRODUCTS FELL OUT.'),
      webhook.indexOf('// THE EXACT LINE WHERE NINE PRODUCTS FELL OUT.') + 2200,
    );
    expect(carry).toContain('pendingDirection: newProductOfferSetup.pendingDirection');
  });

  it('is actually read on the way out', () => {
    // It was written in one commit and read in none. A field nothing consumes
    // is a field that does not exist.
    const reads = webhook.match(/newProductPending\.pendingDirection/g) ?? [];
    expect(reads.length).toBeGreaterThanOrEqual(1);
  });

  it('sends a purchase down the purchase road', () => {
    const branch = webhook.slice(
      webhook.indexOf('// HE SAID MANUNUZI, SO IT IS MANUNUZI'),
      webhook.indexOf('} else if (pendingSale && pendingSourceMessageId) {'),
    );
    expect(branch).toContain('stockPurchaseNeedsPrices(');
    expect(branch).not.toContain('priceQuantitySale(');
  });

  it('checks the direction BEFORE the sale path, or it would never be reached', () => {
    const purchase = webhook.indexOf("newProductPending.pendingDirection === 'stock_purchase'");
    const sale = webhook.indexOf('} else if (pendingSale && pendingSourceMessageId) {');
    expect(purchase).toBeGreaterThan(-1);
    expect(sale).toBeGreaterThan(purchase);
  });

  it('covers every product, not only the two that were registered', () => {
    // "manunuzi kwa bidhaa zote au hizo mpya?" — all of them. The parked sale
    // is the whole message, and it is what gets priced.
    const branch = webhook.slice(
      webhook.indexOf('// HE SAID MANUNUZI, SO IT IS MANUNUZI'),
      webhook.indexOf('} else if (pendingSale && pendingSourceMessageId) {'),
    );
    expect(branch).toContain('sale: pendingSale,');
  });

  it('asks what he PAID rather than assuming the registered cost', () => {
    // A shop buying the same soap twice in a month rarely pays the same twice,
    // and a purchase recorded at last month's price is a wrong profit figure
    // that nothing will ever flag.
    const branch = webhook.slice(
      webhook.indexOf('// HE SAID MANUNUZI, SO IT IS MANUNUZI'),
      webhook.indexOf('} else if (pendingSale && pendingSourceMessageId) {'),
    );
    expect(branch).toContain('rarely');
    expect(branch).toContain('pays the same twice');
  });

  it('confirms the registration before asking the next thing', () => {
    const branch = webhook.slice(
      webhook.indexOf('// HE SAID MANUNUZI, SO IT IS MANUNUZI'),
      webhook.indexOf('} else if (pendingSale && pendingSourceMessageId) {'),
    );
    expect(branch).toContain('newProductSaved(pendingProducts, lang, true)');
  });
});

describe('what the sale path still does', () => {
  it('is untouched for anyone who did not choose a direction', () => {
    // Most registrations arrive from a plain sale that named an unknown
    // product. That path was correct and stays exactly as it was.
    expect(webhook).toContain('} else if (pendingSale && pendingSourceMessageId) {');
    expect(webhook).toContain('const priced = await priceQuantitySale(');
  });
});
