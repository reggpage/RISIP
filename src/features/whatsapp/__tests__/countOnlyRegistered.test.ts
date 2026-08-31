import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { stockCountBatchConfirmation } from '../../../../supabase/functions/_shared/whatsappStockBatch';
import { newProductOffer } from '../../../../supabase/functions/_shared/whatsappNewProduct';

// A8 · A COUNT ONLY MEANS SOMETHING FOR A REGISTERED PRODUCT.
//
// MEASURED in the code rather than on a screen, which is the only reason it
// had not bitten yet. wa_record_stock_counts (migration 0099) does this:
//
//   insert into stock_counts (company_id, product_key, product_name, ...)
//   values (v_company, v_key, v_product, ...)
//
// Whatever name it is handed. So answering STOCK on a list containing two
// products the shop never registered creates two shelf entries with no buying
// cost and no selling price. They then appear in "what is on hand" as a
// quantity that cannot be valued, cannot be sold, and that nobody remembers
// creating.
//
// A7 · And the sibling case, which turned out NOT to be a bug. A catalogue miss
// holds a sale, registration follows, and the whole sale resumes afterwards —
// the code says so and means it. Nothing is lost. What was missing is that a
// person who types eleven products and is asked about two has no way to know
// the other nine survived, and being asked about a fraction of your work reads
// exactly like losing the rest of it.

const webhook = readFileSync(
  resolve(process.cwd(), 'supabase/functions/whatsapp-webhook/index.ts'), 'utf8');

describe('the count skips what was never registered, and says so', () => {
  const said = stockCountBatchConfirmation({
    kind: 'stock_count_batch',
    counts: [
      { product: 'Nguvu ya sala', quantity: 9, unit: null },
      { product: 'punch', quantity: 17, unit: null },
      { product: 'biblia', quantity: 30, unit: null },
    ],
    unreadable: [],
    notRegistered: ['kofia', 'shuka'],
  }, 'sw');

  it('counts the ones the shop actually sells', () => {
    expect(said).toContain('bidhaa 3');
    expect(said).toContain('1. Nguvu ya sala — *9*');
  });

  it('names the ones it skipped', () => {
    expect(said).toContain('*kofia*');
    expect(said).toContain('*shuka*');
  });

  it('says WHY, which is the difference between skipped and lost', () => {
    expect(said).toContain('hazijasajiliwa bado, kwa hiyo sitazihesabu');
    expect(said).toContain('Zisajili kwanza na bei zake');
  });

  it('says nothing about registration when everything was registered', () => {
    const clean = stockCountBatchConfirmation({
      kind: 'stock_count_batch',
      counts: [{ product: 'chaki', quantity: 60, unit: null }],
      unreadable: [],
    }, 'sw');
    expect(clean).not.toContain('hazijasajiliwa');
  });

  it('keeps unreadable lines a separate thing from unregistered ones', () => {
    // A typing accident and a product the shop may genuinely want are different
    // problems with different answers.
    const both = stockCountBatchConfirmation({
      kind: 'stock_count_batch',
      counts: [{ product: 'chaki', quantity: 60, unit: null }],
      unreadable: ['nyingine kadhaa'],
      notRegistered: ['kofia'],
    }, 'sw');
    expect(both).toContain('sikuisoma');
    expect(both).toContain('hazijasajiliwa bado');
  });
});

describe('the branch that builds it', () => {
  const branch = webhook.slice(
    webhook.indexOf('// A COUNT ONLY MEANS SOMETHING FOR A REGISTERED PRODUCT.'),
    webhook.indexOf('// A COUNT ONLY MEANS SOMETHING FOR A REGISTERED PRODUCT.') + 3600,
  );

  it('filters the unregistered names out of the counted list', () => {
    expect(branch).toContain('const countable = quantityMeaningPending.sale.items');
    expect(branch).toContain('.filter((item) => !unregistered.has(productKey(item.product)));');
  });

  it('still hands the skipped names to the confirmation', () => {
    expect(branch).toContain('notRegistered: quantityMeaningPending.missingProducts ?? [],');
  });

  it('goes straight to registration when nothing at all can be counted', () => {
    // Showing an empty list and asking about it is worse than saying what the
    // only open door is.
    expect(branch).toContain('if (countable.length === 0)');
    expect(branch).toContain('Registration is the only door');
  });

  it('records why the database made this necessary', () => {
    expect(branch).toContain('inserts whatever product_key it is handed');
  });
});

describe('the offer says what survived', () => {
  it('counts the products already found, before naming the missing ones', () => {
    const said = newProductOffer(['kofia', 'shuka'], 'sw', 9);
    expect(said).toContain('Bidhaa 9 nimezipata na zinasubiri');
    expect(said.indexOf('nimezipata')).toBeLessThan(said.indexOf('kofia'));
  });

  it('says nothing about survivors when there are none', () => {
    const said = newProductOffer(['kofia'], 'sw', 0);
    expect(said).not.toContain('nimezipata');
  });

  it('is passed the real number from the parked sale', () => {
    expect(webhook).toContain(
      'Math.max(0, (state.pendingSale?.items.length ?? 0) - state.missingProducts.length),',
    );
  });
});
