import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// NOTHING THE TRADER TYPED IS ALLOWED TO DISAPPEAR.
//
// MEASURED, and the owner found it by asking the right question rather than by
// being burned: "je itachukua bidhaa 9 na ambazo hazijulikani?"
//
// He sent eleven products — nine his shop already sells, two genuinely new —
// and answered MANUNUZI. What happened:
//
//   MAUZO      all eleven continue, and the two without prices stall the nine
//   STOCK      all eleven are counted, including two that do not exist
//   MANUNUZI   ONLY the two new ones continue. The nine vanish.
//
// The last is the one that loses work. Nothing refused it, nothing asked about
// it, nothing said so — the nine were simply gone, because the state that
// carries a registration had nowhere to keep them and no memory of what the
// person had asked for.
//
// The rule the owner gave twice, in his own words: "isikatishe bidhaa nyingine
// ifanye mahesabu then ndio isime hizi bidhaa zina bei mbili." Do the work that
// can be done, then stop for the part that needs him. Registration is a
// blockage being cleared, never the end of the road.

const webhook = readFileSync(
  resolve(process.cwd(), 'supabase/functions/whatsapp-webhook/index.ts'), 'utf8');

describe('the state that survives a registration', () => {
  const type = webhook.slice(
    webhook.indexOf('type NewProductOfferSetup = {'),
    webhook.indexOf('type NewProductOfferSetup = {') + 1400,
  );

  it('keeps every line he typed, not only the unknown names', () => {
    expect(type).toContain('pendingSale?: QuantitySale;');
  });

  it('remembers what he asked for, so it can be resumed', () => {
    expect(type).toContain("pendingDirection?: 'sale' | 'stock_purchase' | 'stock_count';");
  });

  it('records why both fields exist', () => {
    expect(type).toContain('The other nine were dropped in silence');
  });
});

describe('MANUNUZI carries the whole message forward', () => {
  const branch = webhook.slice(
    webhook.indexOf("} else if (meaning === 'stock_purchase') {"),
    webhook.indexOf("} else if (meaning === 'stock_purchase') {") + 1400,
  );

  it('parks the sale, not just the two new names', () => {
    expect(branch).toContain('pendingSale: quantityMeaningPending.sale,');
  });

  it('parks the direction he chose', () => {
    expect(branch).toContain("pendingDirection: 'stock_purchase',");
  });
});

describe('SAJILI before a direction is chosen', () => {
  const branch = webhook.slice(
    webhook.indexOf('// SAJILI answered before a direction was chosen'),
    webhook.indexOf('// SAJILI answered before a direction was chosen') + 900,
  );

  it('keeps the lines so he does not retype them', () => {
    expect(branch).toContain('pendingSale: quantityMeaningPending.sale,');
  });

  it('assumes no direction, because he has not given one', () => {
    // Registering is not choosing. Guessing here would be the original bug
    // wearing a different hat.
    expect(branch).not.toContain('pendingDirection:');
  });
});

describe('the exact line where the nine fell out', () => {
  const branch = webhook.slice(
    webhook.indexOf('// THE EXACT LINE WHERE NINE PRODUCTS FELL OUT.'),
    webhook.indexOf('// THE EXACT LINE WHERE NINE PRODUCTS FELL OUT.') + 1800,
  );

  it('now carries the sale from the offer path too', () => {
    // It was carried only from newProductSaleSetup. A bare list answered
    // MANUNUZI travels the OTHER path, and that one dropped it.
    expect(branch).toContain('newProductOfferSetup?.pendingSale');
    expect(branch).toContain('pendingSale: newProductOfferSetup.pendingSale,');
  });

  it('keeps the original path working exactly as before', () => {
    expect(branch).toContain('pendingSale: newProductSaleSetup.sale,');
    expect(branch).toContain('credit: newProductSaleSetup.credit ?? null,');
  });

  it('says plainly that registration is not the end of the road', () => {
    expect(branch).toContain('never the end of the road');
  });
});
