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
    // The final registration-confirmation handler delegates the interrupted
    // transaction to one helper, which consumes the stored direction.
    expect(webhook).toContain('resumeSaleAfterNewProductRegistration(');
    expect(webhook).toContain('newProductRegistrationPending.pendingDirection');
  });

  it('sends a purchase down the purchase road', () => {
    const helper = webhook.slice(webhook.indexOf('async function resumeSaleAfterNewProductRegistration('));
    expect(helper).toContain("if (pendingDirection === 'stock_purchase')");
    expect(helper).toContain('stockPurchaseNeedsPrices(');
  });

  it('checks the direction BEFORE the sale path, or it would never be reached', () => {
    const helper = webhook.slice(webhook.indexOf('async function resumeSaleAfterNewProductRegistration('));
    const purchase = helper.indexOf("pendingDirection === 'stock_purchase'");
    const sale = helper.indexOf('const priced = await priceQuantitySale(');
    expect(purchase).toBeGreaterThan(-1);
    expect(sale).toBeGreaterThan(purchase);
  });

  it('covers every product, not only the two that were registered', () => {
    // "manunuzi kwa bidhaa zote au hizo mpya?" — all of them. The parked sale
    // is the whole message, and it is what gets resumed.
    const helper = webhook.slice(webhook.indexOf('async function resumeSaleAfterNewProductRegistration('));
    expect(helper).toContain('pendingSale.items.map((item) => item.product)');
    expect(helper).toContain('pendingSale.expenses.map');
  });

  it('asks what he PAID rather than assuming the registered cost', () => {
    // A purchase must continue through the explicit purchase-price prompt,
    // rather than silently assuming the registered product cost.
    const helper = webhook.slice(webhook.indexOf('async function resumeSaleAfterNewProductRegistration('));
    expect(helper).toContain('stockPurchaseNeedsPrices(');
    expect(helper).toContain('kind: \'quantity_meaning_clarification\'');
  });

  it('confirms the registration before asking the next thing', () => {
    const helper = webhook.slice(webhook.indexOf('async function resumeSaleAfterNewProductRegistration('));
    expect(helper).toContain('newProductSaved(products, lang, true)');
  });
});

describe('what the sale path still does', () => {
  it('is untouched for anyone who did not choose a direction', () => {
    // Most registrations arrive from a plain sale that named an unknown
    // product. That path was correct and stays exactly as it was.
    const helper = webhook.slice(webhook.indexOf('async function resumeSaleAfterNewProductRegistration('));
    expect(helper).toContain('const priced = await priceQuantitySale(');
    expect(helper).toContain('createDailyRecordDraft');
  });
});
